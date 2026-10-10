"""Standard-library, current-user Windows setup and ownership-aware uninstall.

``install(payload, destination, features=None, options=None, progress=None)`` and
``uninstall(destination, progress=None)`` raise InstallerError on failure and
return a JSON-compatible result. Progress receives dictionaries with stage,
message and percent (and bytes/total for downloads). Explicit empty selections
disable optional defaults; required features are always included. A prerequisite
with feature IDs is used if ANY of those features is selected. ``check`` is
relative to installDir; a successful check skips download and commands.

Commands are argv arrays, shell=False, with literal placeholder replacement:
{installDir}, {runtimeDir}, {download}, {executable}. runtimeDir/download describe
the current prerequisite; otherwise runtimeDir is installDir/runtime. EXE
prerequisites are only executed by explicitly configured commands. Batch files
are refused because Windows may implicitly invoke a shell. Defaults: 20 second
network timeout, two attempts per URL, 512 MiB per download, 2 GiB per archive,
300 second command timeout. File ownership includes SHA-256; changed files stay.

Installation uses an ownership journal and refuses upgrades/nonempty unowned
directories. Rollback removes only files created by this transaction and restores
its registry writes. Arbitrary command side effects, including newly created
files, external runtime installations, and running processes cannot be rolled
back. Interrupted installs retain incomplete/unhashed files; a process crash
can leave a lock marker requiring removal after confirming setup has stopped.
Only unfinished uninstall hook phases are retried; authors must make them
idempotent. afterUninstall runs after application cleanup, retaining directly
referenced hook files until the hook finishes. Launch runs after commit; failure
is reported as a warning while the completed installation remains installed.

The journal and log live in the target directory. Concurrent hostile mutation
by the same Windows user is outside this local filesystem trust boundary.
No elevation, recursive destination deletion, or third-party dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import queue
import re
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path
from typing import Any, Callable, Iterable

MANIFEST = "ewp-installer.json"
STATE = ".ewp-install-state.json"
LOG = ".ewp-installer.log"
LOCK = ".ewp-installer.lock"
MAX_DOWNLOAD = 512 * 1024 * 1024
MAX_ARCHIVE = 2 * 1024 * 1024 * 1024
MAX_JSON = 2 * 1024 * 1024
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
Progress = Callable[[dict[str, Any]], None]
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\Z")
_HASH = re.compile(r"[0-9a-fA-F]{64}\Z")
_DEVICE = re.compile(r"(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?\Z", re.I)
_RESERVED = {MANIFEST.casefold(), STATE.casefold(), LOG.casefold(), LOCK.casefold()}


class InstallerError(RuntimeError):
    """A setup failure suitable for GUI/CLI reporting."""


def _emit(progress: Progress | None, stage: str, message: str, percent: float,
          **details: Any) -> None:
    if progress:
        try:
            progress({"stage": stage, "message": message,
                      "percent": min(100, max(0, percent)), **details})
        except Exception:
            # A display callback must not change the filesystem transaction.
            pass


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or any(ord(c) < 32 for c in value):
        raise InstallerError(f"Invalid {label}")
    return value


def _identifier(value: Any) -> str:
    value = _text(value, "ID")
    if not _ID.fullmatch(value) or value.endswith(".") or _DEVICE.fullmatch(value):
        raise InstallerError(f"Unsafe ID: {value}")
    return value


def _relative(value: Any) -> str:
    value = _text(value, "relative path")
    parts = value.split("/")
    if any(p in ("", ".", "..") or p.endswith((".", " ")) or _DEVICE.fullmatch(p)
           or any(ord(c) < 32 or c in '\\:<>"|?*' for c in p) for p in parts):
        raise InstallerError(f"Unsafe relative path: {value}")
    return value


def _no_links(path: Path) -> None:
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise InstallerError(f"Links/reparse points are not allowed: {item}")


def _root(value: str | Path) -> Path:
    path = Path(value).expanduser().absolute()
    _no_links(path)
    path = path.resolve()
    if path == Path(path.anchor):
        raise InstallerError("A filesystem root is not an installation directory")
    return path


def _target(root: Path, relative: str) -> Path:
    path = root.joinpath(*_relative(relative).split("/"))
    _no_links(path)
    if not path.resolve().is_relative_to(root):
        raise InstallerError("Path escapes the installation directory")
    return path


def _digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > MAX_JSON:
        raise InstallerError(f"Missing or oversized metadata: {path.name}")
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise InstallerError("Metadata must be a JSON object")
    return value


def _commands(value: Any) -> list[list[str]]:
    if not isinstance(value, list):
        raise InstallerError("Commands must be an array of argv arrays")
    for argv in value:
        if not isinstance(argv, list) or not argv or any(
                not isinstance(arg, str) or "\0" in arg for arg in argv) or not argv[0]:
            raise InstallerError("Each command must be a nonempty string argv array")
        if Path(argv[0]).suffix.lower() in (".bat", ".cmd"):
            raise InstallerError("Batch commands are not supported; configure an executable argv")
    return value


def _urls(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise InstallerError("urls/mirrors must be arrays")
    for url in value:
        parsed = urllib.parse.urlsplit(_text(url, "URL"))
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise InstallerError("Downloads require HTTP(S) URLs without embedded credentials")
    return value


def validate_manifest(manifest: Any) -> dict[str, Any]:
    """Validate the shared builder contract without importing packaging.py."""
    if not isinstance(manifest, dict) or not isinstance(manifest.get("application"), dict):
        raise InstallerError("application metadata is required")
    app = manifest["application"]
    _identifier(app.get("id"))
    _text(app.get("name"), "application.name")
    _text(app.get("version"), "application.version")
    executable = _relative(manifest.get("applicationPath"))
    if not executable.lower().endswith(".exe") or executable.split("/")[0].casefold() in (
            "features", "runtime", *_RESERVED) or executable.casefold() == "uninstall.exe":
        raise InstallerError("applicationPath must identify the real application EXE")
    collections: dict[str, list[dict[str, Any]]] = {}
    for name in ("features", "prerequisites", "postInstall"):
        items = manifest.get(name, [])
        if not isinstance(items, list):
            raise InstallerError(f"{name} must be an array")
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                raise InstallerError(f"Invalid {name} entry")
            identifier = _identifier(item.get("id"))
            if identifier.casefold() in seen:
                raise InstallerError(f"Duplicate {name} ID: {identifier}")
            seen.add(identifier.casefold())
            _text(item.get("name", identifier), f"{name}.name")
            for flag in ("default", "required"):
                if flag in item and not isinstance(item[flag], bool):
                    raise InstallerError(f"{flag} must be a boolean")
        collections[name] = items
    feature_ids = {item["id"] for item in collections["features"]}
    for item in collections["features"]:
        if item.get("payload") != f"features/{item['id']}":
            raise InstallerError("Feature payload must be features/<id>")
        if "description" in item and not isinstance(item["description"], str):
            raise InstallerError("Feature description must be a string")
    for item in collections["prerequisites"]:
        if not isinstance(item.get("sha256"), str) or not _HASH.fullmatch(item["sha256"]):
            raise InstallerError("Every prerequisite requires a SHA-256 digest")
        if item.get("type") not in ("zip", "file", "exe"):
            raise InstallerError("Prerequisite type must be zip, file or exe")
        if item.get("destination") != f"runtime/{item['id']}":
            raise InstallerError("Prerequisite destination must be runtime/<id>")
        urls = _urls(item.get("urls", [])) + _urls(item.get("mirrors", []))
        if item.get("mirrorApi"):
            _urls([item["mirrorApi"]])
        elif not urls:
            raise InstallerError("Prerequisite requires download URLs or mirrorApi")
        if "filename" in item and "/" in _relative(item["filename"]):
            raise InstallerError("filename must be a single safe filename")
        if "check" in item:
            _relative(item["check"])
        enabled = item.get("features", [])
        if not isinstance(enabled, list) or any(identifier not in feature_ids for identifier in enabled):
            raise InstallerError("Prerequisite refers to an unknown feature")
        _commands(item.get("commands", []))
    setting_keys: set[str] = set()
    types: set[str] = set()
    for item in collections["postInstall"]:
        kind = item.get("type")
        if kind not in ("startup", "launch", "setting"):
            raise InstallerError("postInstall type must be startup, launch or setting")
        if kind == "setting":
            key = _text(item.get("key", item["id"]), "setting.key")
            if key in setting_keys:
                raise InstallerError("Duplicate setting key")
            setting_keys.add(key)
            _json_bytes(item.get("value"))
        elif kind in types:
            raise InstallerError(f"Duplicate {kind} option")
        types.add(kind)
    hooks = manifest.get("hooks", {})
    if not isinstance(hooks, dict) or set(hooks) - {
            "beforeInstall", "afterInstall", "beforeUninstall", "afterUninstall"}:
        raise InstallerError("Invalid hooks object")
    for commands in hooks.values():
        _commands(commands)
    installer = manifest.get("installer", {})
    if not isinstance(installer, dict) or installer.get("language", "zh-CN") not in ("zh-CN", "en"):
        raise InstallerError("installer.language must be zh-CN or en")
    for field in ("defaultDirectory", "welcome"):
        if field in installer:
            _text(installer[field], f"installer.{field}")
    return manifest


def _archive_entries(archive: zipfile.ZipFile, limit: int) -> list[tuple[zipfile.ZipInfo, str]]:
    entries = []
    seen: dict[str, bool] = {}
    total = 0
    if len(archive.infolist()) > 100000:
        raise InstallerError("Archive contains too many entries")
    for info in archive.infolist():
        # ZipInfo normalizes backslashes on Windows and truncates at NUL.
        # Validate the original central-directory name before trusting either.
        _relative(info.orig_filename[:-1] if info.is_dir() else info.orig_filename)
        if info.orig_filename != info.filename:
            raise InstallerError("Archive filename was normalized or truncated")
        name = _relative(info.filename[:-1] if info.is_dir() else info.filename)
        mode = info.external_attr >> 16
        if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR) or info.flag_bits & 1:
            raise InstallerError("Archive links, special files and encryption are not allowed")
        folded = name.casefold()
        if folded in seen:
            raise InstallerError(f"Duplicate/case-colliding archive path: {name}")
        seen[folded] = info.is_dir()
        total += info.file_size
        if total > limit:
            raise InstallerError("Archive exceeds the expanded byte limit")
        entries.append((info, name))
    for name in seen:
        parts = name.split("/")
        if any(seen.get("/".join(parts[:i])) is False for i in range(1, len(parts))):
            raise InstallerError("Archive file/directory collision")
    return entries


def read_manifest(payload: str | Path, *, max_archive_bytes: int = MAX_ARCHIVE) -> dict[str, Any]:
    with zipfile.ZipFile(payload) as archive:
        _archive_entries(archive, max_archive_bytes)
        info = archive.getinfo(MANIFEST)
        if info.file_size > MAX_JSON:
            raise InstallerError("Installer manifest is too large")
        return validate_manifest(json.loads(archive.read(info).decode("utf-8-sig")))


def _selections(items: list[dict[str, Any]], selected: Iterable[str] | None,
                *, default: bool = False) -> set[str]:
    known = {item["id"] for item in items}
    if isinstance(selected, str):
        selected = selected.split(",") if selected else []
    result = ({item["id"] for item in items if item.get("default", default)}
              if selected is None else set(selected))
    if result - known:
        raise InstallerError(f"Unknown selection: {', '.join(sorted(result - known))}")
    result.update(item["id"] for item in items if item.get("required", False))
    return result


def default_directory(manifest: dict[str, Any]) -> Path:
    configured = manifest.get("installer", {}).get("defaultDirectory")
    if configured:
        expanded = os.path.expanduser(os.path.expandvars(configured))
        if re.search(r"%[^%]+%|\$[A-Za-z_{]", expanded) or not Path(expanded).is_absolute():
            raise InstallerError("defaultDirectory must expand to an absolute path")
        return _root(expanded)
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    return _root(local / "Programs" / manifest["application"]["id"])


def _unowned_destination(root: Path) -> None:
    _no_links(root)
    if root.exists():
        if not root.is_dir():
            raise InstallerError("Installation destination is not a directory")
        if (root / STATE).exists():
            raise InstallerError("An installation already exists; uninstall it before installing again")
        if any(root.iterdir()):
            raise InstallerError("Refusing a nonempty directory without installation ownership metadata")


def _extract(archive: zipfile.ZipFile, entries: list[tuple[zipfile.ZipInfo, str]],
             destination: Path, limit: int) -> None:
    total = 0
    for info, name in entries:
        target = _target(destination, name)
        if info.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, target.open("xb") as output:
            size = 0
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                size += len(chunk)
                total += len(chunk)
                if total > limit or size > info.file_size:
                    raise InstallerError("Archive stream exceeds the expanded byte limit")
                output.write(chunk)


def _payload_stage(payload: Path, manifest: dict[str, Any], selected: set[str],
                   stage: Path, limit: int) -> None:
    feature_roots = {item["id"].casefold(): item["id"] for item in manifest.get("features", [])}
    mapped: list[tuple[zipfile.ZipInfo, str]] = []
    with zipfile.ZipFile(payload) as archive:
        for info, name in _archive_entries(archive, limit):
            if name == MANIFEST:
                continue
            parts = name.split("/")
            if parts[0].casefold() == "features":
                if len(parts) == 1 and info.is_dir():
                    continue
                if len(parts) < 2 or parts[1].casefold() not in feature_roots:
                    raise InstallerError("Payload refers to an undeclared feature")
                identifier = feature_roots[parts[1].casefold()]
                if parts[1] != identifier:
                    raise InstallerError("Feature payload ID case mismatch")
                if len(parts) == 2 and info.is_dir():
                    continue
                if len(parts) < 3:
                    raise InstallerError("Feature payload must be a directory")
                name = "/".join(parts[2:])
                if identifier not in selected:
                    continue
            if name.split("/")[0].casefold() in _RESERVED or name.casefold() == "ewp-options.json":
                raise InstallerError("Payload collides with installer metadata/options")
            mapped.append((info, name))
        names: dict[str, bool] = {}
        for info, name in mapped:
            folded = name.casefold()
            if folded in names and not (info.is_dir() and names[folded]):
                raise InstallerError(f"Selected payload collision: {name}")
            names[folded] = info.is_dir()
        for name in names:
            if any(names.get("/".join(name.split("/")[:i])) is False
                   for i in range(1, len(name.split("/")))):
                raise InstallerError("Selected payload file/directory collision")
        _extract(archive, mapped, stage, limit)
    for filename in (manifest["applicationPath"], "uninstall.exe"):
        if not _target(stage, filename).is_file():
            raise InstallerError(f"Payload is missing {filename}")


def _download_urls(item: dict[str, Any], timeout: float) -> list[str]:
    result: list[str] = []
    if item.get("mirrorApi"):
        try:
            with urllib.request.urlopen(item["mirrorApi"], timeout=timeout) as response:
                data = response.read(MAX_JSON + 1)
            if len(data) > MAX_JSON:
                raise InstallerError("Mirror API response is too large")
            parsed = json.loads(data)
            result.extend(_urls(parsed["urls"]))
        except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException, InstallerError):
            pass  # A broken mirror discovery service must not prevent static fallback.
    result.extend(item.get("urls", []))
    result.extend(item.get("mirrors", []))
    return list(dict.fromkeys(result))


def _download(item: dict[str, Any], directory: Path, progress: Progress | None,
              timeout: float, retries: int, limit: int) -> Path:
    target = directory / (item.get("filename") or (item["id"] + (
        ".zip" if item["type"] == "zip" else ".exe" if item["type"] == "exe" else ".bin")))
    partial = target.with_name(target.name + ".partial")
    urls = _download_urls(item, timeout)
    last_error: Exception | None = None
    for index, url in enumerate(urls):
        for attempt in range(retries):
            try:
                digest = hashlib.sha256()
                size = 0
                with urllib.request.urlopen(url, timeout=timeout) as response, partial.open("xb") as output:
                    length = response.headers.get("Content-Length")
                    total = int(length) if length else 0
                    if total < 0 or total > limit:
                        raise InstallerError("Download exceeds the byte limit")
                    for chunk in iter(lambda: response.read(128 * 1024), b""):
                        size += len(chunk)
                        if size > limit:
                            raise InstallerError("Download exceeds the byte limit")
                        digest.update(chunk)
                        output.write(chunk)
                        _emit(progress, "download", item.get("name", item["id"]), 35,
                              bytes=size, total=total, mirror=index + 1, attempt=attempt + 1)
                    if total and size != total:
                        raise InstallerError("Download was truncated")
                if digest.hexdigest().lower() != item["sha256"].lower():
                    raise InstallerError("Download SHA-256 mismatch")
                partial.replace(target)
                return target
            except (OSError, ValueError, http.client.HTTPException, InstallerError) as error:
                last_error = error
            finally:
                partial.unlink(missing_ok=True)
    raise InstallerError(f"Could not download {item['id']}: {last_error or 'no usable URLs'}")


def _registry() -> Any:
    if sys.platform != "win32":
        return None
    import winreg
    return winreg


def _registry_value(registry: Any, key: str, name: str) -> list[Any] | None:
    try:
        with registry.OpenKey(registry.HKEY_CURRENT_USER, key, 0, registry.KEY_READ) as handle:
            data, kind = registry.QueryValueEx(handle, name)
            return [data, kind]
    except FileNotFoundError:
        return None


def _registry_restore(registry: Any, records: list[dict[str, Any]]) -> None:
    if registry is None:
        return
    uninstall_keys = {record["key"] for record in records
                      if record["key"].startswith(UNINSTALL_KEY + "\\")}
    for record in reversed(records):
        if _registry_value(registry, record["key"], record["name"]) != record["value"]:
            continue
        previous = record["previous"]
        with registry.CreateKeyEx(registry.HKEY_CURRENT_USER, record["key"], 0, registry.KEY_SET_VALUE) as handle:
            if previous is None:
                registry.DeleteValue(handle, record["name"])
            else:
                registry.SetValueEx(handle, record["name"], 0, previous[1], previous[0])
    # DeleteKey also deletes values on Windows; finish all value restores first.
    for key in uninstall_keys:
        try:
            with registry.OpenKey(registry.HKEY_CURRENT_USER, key, 0, registry.KEY_READ) as handle:
                subkeys, values, _ = registry.QueryInfoKey(handle)
            if subkeys == 0 and values == 0:
                registry.DeleteKey(registry.HKEY_CURRENT_USER, key)
        except OSError:
            pass


def _atomic_state(root: Path, state: dict[str, Any]) -> None:
    _no_links(root / STATE)
    data = _json_bytes(state)
    if len(data) > MAX_JSON:
        raise InstallerError("Installation ownership metadata is too large")
    with tempfile.NamedTemporaryFile(dir=root, prefix=".ewp-state-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(root / STATE)
    finally:
        temporary.unlink(missing_ok=True)


class _Transaction:
    def __init__(self, root: Path, manifest: dict[str, Any], features: set[str], options: set[str]):
        self.root = root
        self.registry = _registry()
        self.created: list[str] = []
        self.log: Any = None
        self.state: dict[str, Any] = {
            "schemaVersion": 1, "installId": uuid.uuid4().hex, "phase": "installing",
            "root": str(root), "application": manifest["application"], "manifest": manifest,
            "features": sorted(features), "options": sorted(options), "files": [],
            "directories": [], "registry": [],
        }

    def save(self) -> None:
        _atomic_state(self.root, self.state)

    def directory(self, path: Path) -> None:
        _no_links(path)
        if path == self.root or path.is_dir():
            return
        self.directory(path.parent)
        path.mkdir()
        self.state["directories"].append(path.relative_to(self.root).as_posix())
        self.save()

    def write(self, source: Path, relative: str) -> None:
        target = _target(self.root, relative)
        self.directory(target.parent)
        with target.open("xb") as output:
            self.created.append(relative)
            entry = {"path": relative, "sha256": None, "size": 0}
            self.state["files"].append(entry)
            self.save()
            digest = hashlib.sha256()
            with source.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    output.write(block)
                    digest.update(block)
                    entry["size"] += len(block)
            output.flush()
            entry["sha256"] = digest.hexdigest()
        self.save()

    def open_log(self) -> None:
        self.log = (self.root / LOG).open("x", encoding="utf-8")
        self.created.append(LOG)
        self.state["files"].append({"path": LOG, "sha256": None, "size": 0})
        self.save()

    def note(self, message: str) -> None:
        self.log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
        self.log.flush()

    def put_registry(self, key: str, name: str, value: str) -> None:
        if self.registry is None:
            raise InstallerError("Windows registry integration requires Windows")
        previous = _registry_value(self.registry, key, name)
        record = {"key": key, "name": name, "value": [value, self.registry.REG_SZ], "previous": previous}
        self.state["registry"].append(record)
        self.save()
        with self.registry.CreateKeyEx(self.registry.HKEY_CURRENT_USER, key, 0,
                                       self.registry.KEY_SET_VALUE) as handle:
            self.registry.SetValueEx(handle, name, 0, self.registry.REG_SZ, value)

    def finish(self) -> None:
        for relative in (self.state["manifest"]["applicationPath"], "uninstall.exe"):
            if not _target(self.root, relative).is_file():
                raise InstallerError(f"A command removed a required installed executable: {relative}")
        self.note("Installation committed")
        self.log.close()
        self.log = None
        # Hooks may legitimately modify owned payload files; fingerprint the final content.
        for entry in self.state["files"]:
            path = _target(self.root, entry["path"])
            if path.is_file():
                entry.update(sha256=_digest(path), size=path.stat().st_size)
        self.state["phase"] = "installed"
        self.save()

    def rollback(self) -> list[str]:
        if self.log:
            self.log.close()
            self.log = None
        failures = []
        try:
            _registry_restore(self.registry, self.state["registry"])
        except OSError as error:
            failures.append(str(error))
        for relative in reversed(self.created):
            try:
                path = _target(self.root, relative)
                if path.is_file():
                    path.unlink()
            except (OSError, InstallerError) as error:
                failures.append(str(error))
        for relative in reversed(self.state["directories"]):
            try:
                _target(self.root, relative).rmdir()
            except OSError:
                pass
        if not failures:
            (self.root / STATE).unlink(missing_ok=True)
        return failures


def _context(root: Path, manifest: dict[str, Any], runtime: Path | None = None,
             download: Path | None = None) -> dict[str, str]:
    return {"installDir": str(root), "runtimeDir": str(runtime or root / "runtime"),
            "download": str(download) if download else "",
            "executable": str(_target(root, manifest["applicationPath"]))}


def _argv(argv: list[str], context: dict[str, str]) -> list[str]:
    expanded = [re.sub(r"\{(installDir|runtimeDir|download|executable)\}",
                       lambda match: context[match[1]], arg) for arg in argv]
    if Path(expanded[0]).suffix.lower() in (".bat", ".cmd"):
        raise InstallerError("Batch commands are not supported")
    return expanded


def _run_commands(commands: list[list[str]], root: Path, context: dict[str, str],
                  log: Any, timeout: float) -> None:
    environment = os.environ.copy()
    environment.pop("PYTHONHOME", None)
    environment.pop("PYTHONPATH", None)
    for argv in commands:
        expanded = _argv(argv, context)
        log.write(f"Running executable: {expanded[0]}\n")
        log.flush()
        completed = subprocess.run(expanded, cwd=root, env=environment, shell=False,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                   timeout=timeout, creationflags=(0x08000000 if sys.platform == "win32" else 0))
        if completed.returncode:
            raise InstallerError(f"Command failed with exit code {completed.returncode}: {expanded[0]}")


def _register(transaction: _Transaction, manifest: dict[str, Any], selected: set[str]) -> None:
    root = transaction.root
    app = manifest["application"]
    quoted_exe = '"' + str(_target(root, manifest["applicationPath"])) + '"'
    if any(item["id"] in selected and item["type"] == "startup" for item in manifest.get("postInstall", [])):
        transaction.put_registry(RUN_KEY, app["id"], quoted_exe)
    if transaction.registry is None:
        return
    key = UNINSTALL_KEY + "\\" + app["id"]
    values = {
        "DisplayName": app["name"], "DisplayVersion": app["version"],
        "InstallLocation": str(root), "DisplayIcon": quoted_exe,
        "UninstallString": f'"{root / "uninstall.exe"}" --uninstall --install-dir "{root}"',
        "QuietUninstallString": f'"{root / "uninstall.exe"}" --uninstall --silent --install-dir "{root}"',
    }
    for name, value in values.items():
        transaction.put_registry(key, name, value)


def install(payload: str | Path, destination: str | Path, features: Iterable[str] | None = None,
            options: Iterable[str] | None = None, progress: Progress | None = None, *,
            timeout: float = 20, retries: int = 2, max_download_bytes: int = MAX_DOWNLOAD,
            max_archive_bytes: int = MAX_ARCHIVE, command_timeout: float = 300) -> dict[str, Any]:
    """Install a builder payload, returning ownership metadata and launch warnings."""
    root = _root(destination)
    transaction: _Transaction | None = None
    locked = False
    try:
        if timeout <= 0 or retries < 1 or max_download_bytes < 1 or max_archive_bytes < 1 or command_timeout <= 0:
            raise InstallerError("Timeouts, retries and byte limits must be positive")
        _unowned_destination(root)
        manifest = read_manifest(payload, max_archive_bytes=max_archive_bytes)
        chosen = _selections(manifest.get("features", []), features, default=True)
        choices = _selections(manifest.get("postInstall", []), options)
        registry = _registry()
        if registry is not None:
            try:
                with registry.OpenKey(registry.HKEY_CURRENT_USER,
                                      UNINSTALL_KEY + "\\" + manifest["application"]["id"], 0, registry.KEY_READ):
                    raise InstallerError("This application ID is already registered; uninstall it first")
            except FileNotFoundError:
                pass
        _emit(progress, "validate", "Validating payload", 5)
        with tempfile.TemporaryDirectory(prefix="ewp-setup-") as temporary:
            staging = Path(temporary) / "payload"
            staging.mkdir()
            _payload_stage(Path(payload), manifest, chosen, staging, max_archive_bytes)
            _unowned_destination(root)
            root.mkdir(parents=True, exist_ok=True)
            with (root / LOCK).open("x", encoding="ascii") as lock:
                lock.write(str(os.getpid()))
            locked = True
            transaction = _Transaction(root, manifest, chosen, choices)
            transaction.save()
            transaction.open_log()
            transaction.note("Installing " + manifest["application"]["id"])
            _emit(progress, "copy", "Copying selected application files", 15)
            for path in sorted(staging.rglob("*")):
                relative = path.relative_to(staging).as_posix()
                if path.is_dir():
                    transaction.directory(_target(root, relative))
                elif path.is_file():
                    transaction.write(path, relative)
            context = _context(root, manifest)
            _emit(progress, "beforeInstall", "Running installation preparation", 25)
            _run_commands(manifest.get("hooks", {}).get("beforeInstall", []), root,
                          context, transaction.log, command_timeout)
            prerequisites = [item for item in manifest.get("prerequisites", [])
                             if not item.get("features") or chosen.intersection(item["features"])]
            for index, item in enumerate(prerequisites):
                if item.get("check") and _target(root, item["check"]).is_file():
                    transaction.note("Prerequisite check satisfied: " + item["id"])
                    continue
                download_dir = Path(temporary) / ("download-" + item["id"])
                download_dir.mkdir()
                downloaded = _download(item, download_dir, progress, timeout, retries, max_download_bytes)
                runtime = _target(root, item["destination"])
                transaction.directory(runtime)
                if item["type"] == "zip":
                    extracted = download_dir / "expanded"
                    extracted.mkdir()
                    with zipfile.ZipFile(downloaded) as archive:
                        _extract(archive, _archive_entries(archive, max_archive_bytes), extracted, max_archive_bytes)
                    for path in sorted(extracted.rglob("*")):
                        relative = item["destination"] + "/" + path.relative_to(extracted).as_posix()
                        if path.is_dir():
                            transaction.directory(_target(root, relative))
                        elif path.is_file():
                            transaction.write(path, relative)
                else:
                    transaction.write(downloaded, item["destination"] + "/" + downloaded.name)
                _emit(progress, "configure", "Configuring " + item.get("name", item["id"]),
                      40 + 35 * (index + 1) / max(1, len(prerequisites)))
                _run_commands(item.get("commands", []), root, _context(root, manifest, runtime, downloaded),
                              transaction.log, command_timeout)
            settings = {item.get("key", item["id"]): item.get("value")
                        for item in manifest.get("postInstall", [])
                        if item["id"] in choices and item["type"] == "setting"}
            if settings:
                settings_path = Path(temporary) / "options.json"
                settings_path.write_bytes(_json_bytes(settings))
                transaction.write(settings_path, "ewp-options.json")
            _emit(progress, "afterInstall", "Finishing application configuration", 85)
            _run_commands(manifest.get("hooks", {}).get("afterInstall", []), root,
                          context, transaction.log, command_timeout)
            _register(transaction, manifest, choices)
            transaction.finish()
        warnings = []
        for item in manifest.get("postInstall", []):
            if item["id"] in choices and item["type"] == "launch":
                try:
                    subprocess.Popen([context["executable"]], cwd=root, shell=False,
                                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL)
                except OSError as error:
                    warnings.append(f"Application launch failed: {error}")
        _emit(progress, "complete", "Installation completed", 100, warnings=warnings)
        return {"destination": str(root), "features": sorted(chosen), "options": sorted(choices),
                "state": transaction.state, "warnings": warnings}
    except Exception as error:
        failures = transaction.rollback() if transaction else []
        _emit(progress, "error", str(error), 0)
        suffix = "; rollback incomplete: " + "; ".join(failures) if failures else ""
        raise InstallerError(str(error) + suffix) from error
    finally:
        if locked:
            (root / LOCK).unlink(missing_ok=True)
            try:
                root.rmdir()
            except OSError:
                pass


def _load_state(root: Path) -> dict[str, Any]:
    _no_links(root / STATE)
    state = _read_json(root / STATE)
    if state.get("schemaVersion") != 1 or state.get("phase") not in (
            "installing", "installed", "uninstalling", "pending-delete"):
        raise InstallerError("Invalid installation state")
    if not isinstance(state.get("root"), str) or os.path.normcase(state["root"]) != os.path.normcase(str(root)):
        raise InstallerError("Ownership metadata belongs to a different directory")
    manifest = validate_manifest(state.get("manifest"))
    if state.get("application") != manifest["application"] or not re.fullmatch(
            r"[0-9a-f]{32}", str(state.get("installId", ""))):
        raise InstallerError("Invalid application ownership metadata")
    files = state.get("files")
    directories = state.get("directories")
    records = state.get("registry")
    if not isinstance(files, list) or not isinstance(directories, list) or not isinstance(records, list):
        raise InstallerError("Invalid ownership records")
    seen = set()
    for entry in files:
        if not isinstance(entry, dict):
            raise InstallerError("Invalid file ownership record")
        name = _relative(entry.get("path"))
        if name.casefold() in seen or name.split("/")[0].casefold() in _RESERVED - {LOG.casefold()}:
            raise InstallerError("Invalid/duplicate owned file")
        seen.add(name.casefold())
        digest = entry.get("sha256")
        if digest is not None and (not isinstance(digest, str) or not _HASH.fullmatch(digest)):
            raise InstallerError("Invalid ownership digest")
        _target(root, name)
    for name in directories:
        _target(root, _relative(name))
    app_id = manifest["application"]["id"]
    allowed_names = {"DisplayName", "DisplayVersion", "InstallLocation", "DisplayIcon",
                     "UninstallString", "QuietUninstallString"}
    for record in records:
        if not isinstance(record, dict) or not (
                record.get("key") == RUN_KEY and record.get("name") == app_id or
                record.get("key") == UNINSTALL_KEY + "\\" + app_id and record.get("name") in allowed_names):
            raise InstallerError("Registry record escapes application ownership")
        for field in ("value", "previous"):
            value = record.get(field)
            if value is None and field == "previous":
                continue
            if not isinstance(value, list) or len(value) != 2 or not isinstance(value[1], int):
                raise InstallerError("Invalid registry ownership value")
    return state


def _owned(path: Path, entry: dict[str, Any]) -> bool:
    _no_links(path)
    return path.is_file() and bool(entry["sha256"]) and _digest(path) == entry["sha256"]


def _schedule_delete(root: Path, files: list[dict[str, str]],
                     directories: list[str]) -> subprocess.Popen:
    """Wait for this frozen uninstaller, then delete only hash-matching files.

    A private temporary script and hash-pinned JSON manifest keep the Windows
    command line independent of the number/length of owned paths. Both use a
    UTF-8 BOM for Windows PowerShell 5.1 and are removed even on helper failure.
    Directory.Delete(path, false) only removes empty recorded directories.
    """
    if sys.platform != "win32":
        raise InstallerError("Delayed self-deletion requires Windows")
    root = _root(root)
    state = _load_state(root)
    if state["phase"] != "pending-delete":
        raise InstallerError("Delayed deletion requires pending uninstall metadata")
    recorded = {entry["path"]: entry["sha256"] for entry in state["files"]}
    for entry in files:
        if entry["path"] == STATE:
            expected = _digest(root / STATE)
        elif entry["path"] == "uninstall.exe":
            expected = recorded.get("uninstall.exe")
        else:
            raise InstallerError("Delayed deletion only owns uninstall.exe and its state")
        if entry["sha256"] != expected:
            raise InstallerError("Delayed deletion does not match the ownership journal")
    if set(directories) - set(state["directories"]):
        raise InstallerError("Delayed cleanup contains an unowned directory")

    owned_files = []
    for entry in sorted(files, key=lambda value: value["path"] == STATE):
        _target(root, entry["path"])
        if not _HASH.fullmatch(entry["sha256"]):
            raise InstallerError("Invalid delayed deletion digest")
        owned_files.append({"path": entry["path"], "sha256": entry["sha256"]})
    owned_directories = sorted(set(directories), key=lambda value: value.count("/"), reverse=True)
    for name in owned_directories:
        _target(root, name)
    process_ids = [os.getpid()]
    if getattr(sys, "frozen", False):
        process_ids.append(os.getppid())  # PyInstaller onefile bootloader also locks the EXE.
    manifest = {"root": str(root), "processIds": process_ids,
                "files": owned_files, "directories": owned_directories}
    manifest_bytes = _json_bytes(manifest).decode("utf-8").encode("utf-8-sig")
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    script = r"""param([string]$ManifestHash)
$ProgressPreference='SilentlyContinue'
$ErrorActionPreference='Stop'
$cleanupSucceeded=$true
$manifestPath=Join-Path $PSScriptRoot 'manifest.json'
function Test-SafePath($p) {
    $q=$p
    while ($q) {
        if (Test-Path -LiteralPath $q) {
            $a=Get-Item -LiteralPath $q -Force
            if (($a.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
        }
        $q=[IO.Path]::GetDirectoryName($q)
    }
    return $true
}
try {
    if (-not (Test-SafePath $manifestPath) -or
        (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ne $ManifestHash) {
        throw 'Invalid cleanup manifest'
    }
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($processId in $manifest.processIds) {
        try { $parent=[Diagnostics.Process]::GetProcessById($processId) }
        catch [ArgumentException] { continue }
        try {
            $parent.WaitForExit()
            if (-not $parent.HasExited) { throw 'Uninstaller is still running' }
        } finally { $parent.Dispose() }
    }
    foreach ($entry in $manifest.files) {
        if ($entry.path -eq '.ewp-install-state.json' -and -not $cleanupSucceeded) { continue }
        $p=Join-Path $manifest.root $entry.path
        if (Test-Path -LiteralPath $p -PathType Leaf) {
            if ((Test-SafePath $p) -and
                (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash -eq $entry.sha256) {
                try { Remove-Item -LiteralPath $p -Force -ErrorAction Stop }
                catch { $cleanupSucceeded=$false }
            } else { $cleanupSucceeded=$false }
        }
    }
    foreach ($name in $manifest.directories) {
        $p=Join-Path $manifest.root $name
        try { if (Test-SafePath $p) { [IO.Directory]::Delete($p, $false) } } catch {}
    }
    try { if (Test-SafePath $manifest.root) { [IO.Directory]::Delete($manifest.root, $false) } } catch {}
} catch { $cleanupSucceeded=$false }
finally {
    foreach ($p in @($manifestPath, $PSCommandPath)) {
        try { if (Test-SafePath $p) { Remove-Item -LiteralPath $p -Force -ErrorAction Stop } } catch {}
    }
    try { if (Test-SafePath $PSScriptRoot) { [IO.Directory]::Delete($PSScriptRoot, $false) } } catch {}
}
if ($cleanupSucceeded) { exit 0 } else { exit 1 }
"""
    system = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    powershell = system / "System32/WindowsPowerShell/v1.0/powershell.exe"
    helper_directory = Path(tempfile.mkdtemp(prefix="ewp-delete-"))
    script_path = helper_directory / "cleanup.ps1"
    manifest_path = helper_directory / "manifest.json"
    try:
        _no_links(helper_directory)
        with manifest_path.open("xb") as stream:
            stream.write(manifest_bytes)
        with script_path.open("x", encoding="utf-8-sig") as stream:
            stream.write(script)
        return subprocess.Popen([str(powershell), "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                                 "Bypass", "-File", str(script_path), manifest_hash],
                                shell=False, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, creationflags=0x08000000, close_fds=True)
    except BaseException:
        for path in (manifest_path, script_path):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        try:
            helper_directory.rmdir()
        except OSError:
            pass
        raise


def uninstall(destination: str | Path, progress: Progress | None = None, *,
              command_timeout: float = 300) -> dict[str, Any]:
    """Remove only hash-matching owned files; preserve unrecorded/changed files."""
    root = _root(destination)
    locked = False
    log: Any = None
    persistent_log = False
    log_entry: dict[str, Any] | None = None
    state: dict[str, Any] | None = None

    def close_log() -> None:
        nonlocal log
        if log:
            log.close()
            log = None
            if persistent_log and log_entry is not None and state is not None:
                path = _target(root, LOG)
                log_entry.update(sha256=_digest(path), size=path.stat().st_size)
                _atomic_state(root, state)

    try:
        state = _load_state(root)  # Validate every path/registry record before any mutation.
        with (root / LOCK).open("x", encoding="ascii") as stream:
            stream.write(str(os.getpid()))
        locked = True
        incomplete_install = state["phase"] == "installing" or state.get("skipUninstallHooks", False)
        state["skipUninstallHooks"] = incomplete_install
        state["phase"] = "uninstalling"
        _atomic_state(root, state)
        manifest = state["manifest"]
        context = _context(root, manifest)
        hooks = {} if incomplete_install else manifest.get("hooks", {})
        # Do not execute scripts if an owned script/executable was changed by a user.
        retained_hook_files = set()
        owned_map = {(entry["path"].casefold() if sys.platform == "win32" else entry["path"]): entry
                     for entry in state["files"]}
        for phase in ("beforeUninstall", "afterUninstall"):
            if state.get(phase + "Done"):
                continue
            for argv in hooks.get(phase, []):
                for index, argument in enumerate(_argv(argv, context)):
                    path = Path(argument)
                    if not path.is_absolute():
                        path = root / path
                    path = Path(os.path.abspath(path))
                    if path.is_relative_to(root):
                        relative = path.relative_to(root).as_posix()
                        entry = owned_map.get(relative.casefold() if sys.platform == "win32" else relative)
                        if entry is not None:
                            if not _owned(_target(root, entry["path"]), entry):
                                raise InstallerError("An uninstall hook resource was changed or removed")
                            if phase == "afterUninstall" and (index == 0 or "{executable}" not in argv[index]):
                                retained_hook_files.add(entry["path"])
        # Only append to a hash-matching setup log. A changed log is preserved.
        log_entry = owned_map.get(LOG)
        if log_entry and _owned(root / LOG, log_entry):
            log = (root / LOG).open("a", encoding="utf-8")
            persistent_log = True
        else:
            log = tempfile.TemporaryFile(mode="w+", encoding="utf-8", dir=root)
        _emit(progress, "beforeUninstall", "Preparing uninstall", 10)
        if not state.get("beforeUninstallDone"):
            _run_commands(hooks.get("beforeUninstall", []), root, context, log, command_timeout)
            state["beforeUninstallDone"] = True
            _atomic_state(root, state)
        _registry_restore(_registry(), state["registry"])
        retained = []
        delayed = []

        def remove(entry: dict[str, Any]) -> None:
            path = _target(root, entry["path"])
            if not path.exists():
                return
            if not _owned(path, entry):
                retained.append(entry["path"])
                return
            try:
                path.unlink()
            except PermissionError:
                if (sys.platform == "win32" and getattr(sys, "frozen", False)
                        and path == Path(sys.executable).resolve() and entry["path"] == "uninstall.exe"):
                    delayed.append({"path": entry["path"], "sha256": entry["sha256"]})
                else:
                    raise

        _emit(progress, "remove", "Removing installed files", 35)
        for entry in reversed(state["files"]):
            if entry["path"] not in retained_hook_files and entry["path"] != LOG:
                remove(entry)
        _emit(progress, "afterUninstall", "Finishing uninstall", 80)
        if not state.get("afterUninstallDone"):
            _run_commands(hooks.get("afterUninstall", []), root, context, log, command_timeout)
            state["afterUninstallDone"] = True
            _atomic_state(root, state)
        close_log()
        for entry in reversed(state["files"]):
            if entry["path"] in retained_hook_files or entry["path"] == LOG:
                remove(entry)
        for name in sorted(set(state["directories"]), key=lambda value: value.count("/"), reverse=True):
            try:
                _target(root, name).rmdir()
            except OSError:
                pass
        if delayed:
            state["phase"] = "pending-delete"
            _atomic_state(root, state)
            delayed.append({"path": STATE, "sha256": _digest(root / STATE)})
            _schedule_delete(root, delayed, state["directories"])
        else:
            (root / STATE).unlink()
        _emit(progress, "complete", "Uninstall completed", 100, retained=retained, pending=bool(delayed))
        return {"destination": str(root), "retained": retained, "pending": bool(delayed)}
    except Exception as error:
        if log:
            log.write(f"Uninstall failed: {error}\n")
            log.flush()
        close_log()
        _emit(progress, "error", str(error), 0)
        raise InstallerError(str(error)) from error
    finally:
        close_log()
        if locked:
            (root / LOCK).unlink(missing_ok=True)
            try:
                root.rmdir()
            except OSError:
                pass


_UI = {
    "zh-CN": {
        "setup": "安装向导", "uninstall": "卸载", "directory": "安装位置", "browse": "浏览…",
        "features": "安装功能", "prerequisites": "运行库说明", "options": "安装后选项",
        "confirm": "确认安装", "progress": "执行进度", "complete": "完成", "install": "安装",
        "back": "上一步", "next": "下一步", "cancel": "取消", "finish": "完成", "retry": "重试",
        "review": "返回确认", "step": "第 {current} / {total} 步 · {title}",
        "location_help": "请选择新目录或空目录。开始安装前不会创建目录或修改文件。",
        "invalid_directory": "请检查安装位置",
        "absolute_directory": "请输入完整的绝对目录路径。",
        "unsafe_directory": "目录名包含不支持的字符或 Windows 保留名称。",
        "unwritable_directory": "请选择当前用户可写的目录。",
        "features_help": "选择需要安装的功能。必选功能始终安装。",
        "options_help": "选择安装完成后需要应用的选项。",
        "prerequisites_help": "以下运行库与所选功能有关，将在安装过程中按需下载和配置。",
        "size": "下载大小：下载时确定", "sources": "下载来源：{hosts}",
        "dynamic_sources": "下载来源：安装时由镜像服务提供",
        "mirror_api": "镜像服务：{host}（安装时查询下载来源）",
        "runtime_zip": "下载后解压到运行库目录。",
        "runtime_file": "下载后保存到运行库目录。",
        "runtime_exe": "下载后保存到运行库目录；仅配置了命令时才执行。",
        "runtime_commands": "下载后执行 {count} 条配置命令。",
        "runtime_check": "若安装目录下已有文件 {path}，则跳过此运行库的下载和配置。",
        "startup": "为当前用户设置开机启动。", "launch": "安装完成后启动应用。",
        "setting": "保存此选项供应用使用。", "none": "无", "required": "（必选）",
        "confirm_help": "请核对以下选择。点击“安装”后开始执行。",
        "uninstall_help": "将移除该目录中记录的安装文件；新增文件和已修改的文件会保留。",
        "working": "正在处理，请稍候…", "success": "操作完成", "failure": "操作失败",
        "busy": "操作正在进行，请等待完成后关闭窗口。", "bytes": "字节",
        "failure_help": "可返回确认页检查选择，或重试本次操作。",
        "install_success": "安装完成。点击“完成”关闭向导。",
        "uninstall_success": "卸载完成。点击“完成”关闭向导。",
        "warnings": "提示", "retained": "已保留修改过的文件：{files}",
        "pending": "卸载程序将在此窗口关闭后清理。",
    },
    "en": {
        "setup": "Setup", "uninstall": "Uninstall", "directory": "Install location", "browse": "Browse…",
        "features": "Features", "prerequisites": "Runtime prerequisites", "options": "After installation",
        "confirm": "Confirm installation", "progress": "Progress", "complete": "Complete", "install": "Install",
        "back": "Back", "next": "Next", "cancel": "Cancel", "finish": "Finish", "retry": "Retry",
        "review": "Review choices", "step": "Step {current} of {total} · {title}",
        "location_help": "Choose a new or empty directory. No directories or files are changed before installation.",
        "invalid_directory": "Check the install location",
        "absolute_directory": "Enter a full absolute directory path.",
        "unsafe_directory": "The directory contains unsupported characters or a reserved Windows name.",
        "unwritable_directory": "Choose a directory writable by the current user.",
        "features_help": "Choose the features to install. Required features are always installed.",
        "options_help": "Choose the options to apply after installation.",
        "prerequisites_help": "These runtimes support your selected features and are downloaded and configured as needed during installation.",
        "size": "Download size: determined during download", "sources": "Download sources: {hosts}",
        "dynamic_sources": "Download sources: supplied by the mirror service during installation",
        "mirror_api": "Mirror service: {host} (download sources are resolved during installation)",
        "runtime_zip": "Extracted to the runtime directory after download.",
        "runtime_file": "Saved to the runtime directory after download.",
        "runtime_exe": "Saved to the runtime directory; executed only through configured commands.",
        "runtime_commands": "Runs {count} configured commands after download.",
        "runtime_check": "If the file {path} exists under the install directory, download and configuration of this runtime are skipped.",
        "startup": "Start with Windows for the current user.", "launch": "Launch the app after installation.",
        "setting": "Save this option for the app to use.", "none": "None", "required": " (required)",
        "confirm_help": "Review your choices below. Click Install to begin.",
        "uninstall_help": "Remove recorded installation files from this directory. New and modified files are preserved.",
        "working": "Working, please wait…", "success": "Completed", "failure": "Failed",
        "busy": "Please wait for the operation to finish before closing.", "bytes": "bytes",
        "failure_help": "Review your choices on the confirmation page, or retry this operation.",
        "install_success": "Installation completed. Click Finish to close setup.",
        "uninstall_success": "Uninstall completed. Click Finish to close setup.",
        "warnings": "Notes", "retained": "Preserved changed files: {files}",
        "pending": "The uninstaller will be cleaned up after this window closes.",
    },
}

_CHINESE_STAGES = {
    "validate": "正在校验安装文件", "copy": "正在复制所选功能和应用文件",
    "beforeInstall": "正在执行安装准备", "download": "正在下载运行库",
    "configure": "正在配置运行库", "afterInstall": "正在完成应用配置",
    "beforeUninstall": "正在准备卸载", "remove": "正在移除安装文件",
    "afterUninstall": "正在完成卸载", "complete": "操作完成", "error": "操作失败",
}


def _gui(payload: Path | None, destination: Path, manifest: dict[str, Any],
         features: Iterable[str] | None, options: Iterable[str] | None, removing: bool, *,
         _observer: Callable[[dict[str, Any]], None] | None = None) -> int:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from tkinter.scrolledtext import ScrolledText

    language = manifest.get("installer", {}).get("language", "zh-CN")
    words = _UI[language]
    root = tk.Tk()
    root.title(manifest["application"]["name"] + " · " + words["uninstall" if removing else "setup"])
    root.geometry(f"700x{min(620, max(540, root.winfo_screenheight() - 100))}")
    root.minsize(600, 540)
    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")
    style.configure("Title.TLabel", font=("Segoe UI", 20, "bold"))
    style.configure("Step.TLabel", font=("Segoe UI", 13, "bold"))
    style.configure("TLabel", font=("Segoe UI", 10))
    frame = ttk.Frame(root, padding=20)
    frame.pack(fill="both", expand=True)

    def label(parent: Any, text: str, **kwargs: Any) -> Any:
        widget = ttk.Label(parent, text=text, wraplength=540, **kwargs)
        widget.pack(fill="x", anchor="w", pady=(0, 8))
        widget.bind("<Configure>", lambda event: widget.configure(wraplength=max(160, event.width)))
        return widget

    ttk.Label(frame, text=manifest["application"]["name"], style="Title.TLabel").pack(anchor="w")
    label(frame, manifest.get("installer", {}).get("welcome") or manifest["application"]["version"])
    indicator = tk.StringVar(master=root)
    ttk.Label(frame, textvariable=indicator, style="Step.TLabel").pack(anchor="w", pady=(4, 12))
    host = ttk.Frame(frame)
    host.pack(fill="both", expand=True)
    pages: dict[str, Any] = {}
    contents: dict[str, Any] = {}
    canvases: dict[str, Any] = {}
    state: dict[str, Any] = {"page": "", "running": False, "succeeded": False, "steps": []}

    def page(name: str, *, scroll: bool = False) -> Any:
        panel = ttk.Frame(host)
        pages[name] = panel
        if scroll:
            canvas = tk.Canvas(panel, highlightthickness=0, borderwidth=0)
            scrollbar = ttk.Scrollbar(panel, orient="vertical", command=canvas.yview)
            canvas.configure(yscrollcommand=scrollbar.set)
            scrollbar.pack(side="right", fill="y")
            canvas.pack(side="left", fill="both", expand=True)
            body = ttk.Frame(canvas, padding=(0, 0, 12, 0))
            window = canvas.create_window((0, 0), window=body, anchor="nw")
            body.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
            canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
            canvases[name] = canvas
        else:
            body = panel
        contents[name] = body
        return body

    directory = tk.StringVar(master=root, value=str(destination))
    location = page("directory")
    label(location, words["location_help"])
    path_frame = ttk.LabelFrame(location, text=words["directory"], padding=12)
    path_frame.pack(fill="x", pady=(4, 12))
    entry = ttk.Entry(path_frame, textvariable=directory)
    entry.pack(side="left", fill="x", expand=True)

    def browse() -> None:
        value = filedialog.askdirectory(parent=root, initialdir=directory.get(), mustexist=False)
        if value:
            directory.set(value)

    browse_button = ttk.Button(path_frame, text=words["browse"], command=browse)
    browse_button.pack(side="left", padx=(8, 0))
    selections: dict[str, dict[str, Any]] = {"features": {}, "postInstall": {}}
    controls: dict[str, dict[str, Any]] = {"features": {}, "postInstall": {}}
    if not removing:
        selected = _selections(manifest.get("features", []), features, default=True)
        chosen_options = _selections(manifest.get("postInstall", []), options)
        for collection, name, values in (("features", "features", selected),
                                         ("postInstall", "options", chosen_options)):
            body = page(name, scroll=True)
            label(body, words[name + "_help"])
            for item in manifest.get(collection, []):
                required = bool(item.get("required", False))
                variable = tk.BooleanVar(master=root, value=item["id"] in values)
                selections[collection][item["id"]] = variable
                text = item.get("name", item["id"]) + (words["required"] if required else "")
                group = ttk.Frame(body, padding=(0, 4, 0, 8))
                group.pack(fill="x")
                control = ttk.Checkbutton(group, text=text, variable=variable)
                control.pack(anchor="w")
                controls[collection][item["id"]] = control
                if required:
                    control.configure(state="disabled")
                if collection == "features" and item.get("description"):
                    label(group, item["description"])
                elif collection == "postInstall":
                    label(group, words[item["type"]])
    runtime_body = page("prerequisites", scroll=True)
    runtime_rows: dict[str, Any] = {}
    summary = page("confirm", scroll=True)
    progress_page = page("progress")
    status = tk.StringVar(master=root, value=words["working"])
    ttk.Label(progress_page, textvariable=status, wraplength=540).pack(fill="x", pady=(0, 12))
    bar = ttk.Progressbar(progress_page, maximum=100)
    bar.pack(fill="x")
    details = ScrolledText(progress_page, height=8, wrap="word", state="disabled", font=("Segoe UI", 9))
    details.pack(fill="both", expand=True, pady=(12, 0))
    completion = page("complete", scroll=True)
    ttk.Separator(frame).pack(fill="x", pady=(16, 12))
    buttons = ttk.Frame(frame)
    buttons.pack(fill="x")
    messages: queue.Queue[dict[str, Any]] = queue.Queue()
    result = 0
    closed = False
    poll_id: str | None = None

    def chosen(collection: str) -> list[str]:
        return sorted(_selections(manifest.get(collection, []),
                                  [key for key, value in selections[collection].items() if value.get()]))

    def dependencies() -> list[dict[str, Any]]:
        selected_features = set(chosen("features"))
        return [item for item in manifest.get("prerequisites", [])
                if not item.get("features") or selected_features.intersection(item["features"])]

    def steps() -> list[str]:
        if removing:
            return ["confirm", "progress", "complete"]
        return ["directory", *(["features"] if manifest.get("features") else []),
                *(["prerequisites"] if dependencies() else []),
                *(["options"] if manifest.get("postInstall") else []), "confirm", "progress", "complete"]

    def validate_directory() -> str | None:
        # Read-only preflight. The engine repeats its authoritative checks at install time.
        try:
            value = directory.get()
            candidate = Path(value).expanduser()
            if not value.strip() or not candidate.is_absolute():
                raise InstallerError(words["absolute_directory"])
            for part in candidate.parts[1:]:
                if (part in (".", "..") or part.endswith((".", " ")) or _DEVICE.fullmatch(part)
                        or any(ord(c) < 32 or c in '\\:<>"|?*' for c in part)):
                    raise InstallerError(words["unsafe_directory"])
            target = _root(candidate)
            _unowned_destination(target)
            ancestor = target
            while not ancestor.exists():
                ancestor = ancestor.parent
            if not ancestor.is_dir() or not os.access(ancestor, os.W_OK):
                raise InstallerError(words["unwritable_directory"])
            directory.set(str(target))
            return str(target)
        except (InstallerError, OSError, ValueError) as error:
            messagebox.showerror(words["invalid_directory"], str(error), parent=root)
            return None

    def clear(body: Any) -> None:
        for child in body.winfo_children():
            child.destroy()

    def runtime_info() -> None:
        clear(runtime_body)
        runtime_rows.clear()
        label(runtime_body, words["prerequisites_help"])
        for item in dependencies():
            group = ttk.LabelFrame(runtime_body, text=item.get("name", item["id"]), padding=12)
            group.pack(fill="x", pady=(0, 12))
            runtime_rows[item["id"]] = group
            # The schema supplies neither byte sizes nor descriptions. Do not fetch URLs in the UI.
            label(group, words["size"])
            hosts = list(dict.fromkeys(urllib.parse.urlsplit(url).hostname or ""
                                      for url in item.get("urls", []) + item.get("mirrors", [])))
            label(group, words["sources"].format(hosts=", ".join(hosts)) if hosts else words["dynamic_sources"])
            if item.get("mirrorApi"):
                label(group, words["mirror_api"].format(host=urllib.parse.urlsplit(item["mirrorApi"]).hostname))
            label(group, words["runtime_" + item["type"]])
            if item.get("commands"):
                label(group, words["runtime_commands"].format(count=len(item["commands"])))
            if item.get("check"):
                label(group, words["runtime_check"].format(path=item["check"]))

    def confirm_info() -> None:
        clear(summary)
        label(summary, words["uninstall_help" if removing else "confirm_help"])
        group = ttk.LabelFrame(summary, text=words["directory"], padding=12)
        group.pack(fill="x", pady=(0, 12))
        label(group, directory.get())
        if not removing:
            for title, items in (("features", [item for item in manifest.get("features", [])
                                              if item["id"] in chosen("features")]),
                                 ("prerequisites", dependencies()),
                                 ("options", [item for item in manifest.get("postInstall", [])
                                             if item["id"] in chosen("postInstall")])):
                group = ttk.LabelFrame(summary, text=words[title], padding=12)
                group.pack(fill="x", pady=(0, 12))
                label(group, "\n".join(item.get("name", item["id"]) for item in items) or words["none"])

    def show_page(name: str) -> None:
        for panel in pages.values():
            panel.pack_forget()
        state["page"] = name
        state["steps"] = steps()
        title = words["uninstall"] if removing and name == "confirm" else words[name]
        if name == "complete":
            title = words["success" if state["succeeded"] else "failure"]
        indicator.set(words["step"].format(current=state["steps"].index(name) + 1,
                                           total=len(state["steps"]), title=title))
        if name == "prerequisites":
            runtime_info()
        elif name == "confirm":
            confirm_info()
        pages[name].pack(fill="both", expand=True)
        if name in canvases:
            canvases[name].yview_moveto(0)
        back.pack_forget()
        action.pack_forget()
        cancel.pack_forget()
        if name == "complete" and state["succeeded"]:
            action.configure(text=words["finish"], state="normal")
            action.pack(side="right")
        elif name == "progress":
            cancel.configure(state="disabled")
            cancel.pack(side="right")
        else:
            back.configure(text=words["review" if name == "complete" else "back"],
                           state="disabled" if name == state["steps"][0] else "normal")
            back.pack(side="left")
            action.configure(text=words["retry" if name == "complete" else
                                        ("uninstall" if removing else "install") if name == "confirm" else "next"],
                             state="normal")
            action.pack(side="right")
            cancel.configure(state="normal")
            cancel.pack(side="right", padx=8)
        if name == "directory":
            entry.focus_set()
        else:
            action.focus_set() if name != "progress" else details.focus_set()

    def scroll_page(event: Any) -> str | None:
        canvas = canvases.get(state["page"])
        if canvas is not None:
            bounds = canvas.bbox("all")
            if bounds and bounds[3] > canvas.winfo_height():
                canvas.yview_scroll(-int(event.delta / 120), "units")
            return "break"
        return None

    root.bind("<MouseWheel>", scroll_page)

    def close() -> None:
        nonlocal closed
        if state["running"]:
            messagebox.showinfo(words["setup"], words["busy"], parent=root)
        else:
            closed = True
            if poll_id is not None:
                root.after_cancel(poll_id)
            root.destroy()

    def start() -> None:
        if state["running"] or state["succeeded"] or state["page"] not in ("confirm", "complete"):
            return
        target = directory.get() if removing else validate_directory()
        if target is None:
            show_page("directory")
            return
        selected_features = chosen("features") if not removing else []
        selected_options = chosen("postInstall") if not removing else []
        state["running"] = True
        clear(completion)
        bar["value"] = 0
        details.configure(state="normal")
        details.delete("1.0", "end")
        details.configure(state="disabled")
        status.set(words["working"])
        show_page("progress")

        def worker() -> None:
            try:
                if removing:
                    outcome = uninstall(target, messages.put)
                else:
                    outcome = install(payload, target, selected_features, selected_options, messages.put)
                messages.put({"done": True, "outcome": outcome})
            except Exception as error:
                messages.put({"done": True, "error": str(error) or type(error).__name__})

        threading.Thread(target=worker, name="ewp-installer", daemon=False).start()

    def forward() -> None:
        if state["running"]:
            return
        if state["succeeded"]:
            close()
        elif state["page"] in ("confirm", "complete"):
            start()
        else:
            if state["page"] == "directory" and validate_directory() is None:
                return
            order = steps()
            show_page(order[order.index(state["page"]) + 1])

    def backward() -> None:
        if state["running"] or state["succeeded"]:
            return
        if state["page"] == "complete":
            show_page("confirm")
        else:
            order = steps()
            index = order.index(state["page"])
            if index:
                show_page(order[index - 1])

    back = ttk.Button(buttons, command=backward)
    action = ttk.Button(buttons, command=forward)
    cancel = ttk.Button(buttons, text=words["cancel"], command=close)
    root.protocol("WM_DELETE_WINDOW", close)

    def poll() -> None:
        nonlocal result, poll_id
        while True:
            try:
                event = messages.get_nowait()
            except queue.Empty:
                break
            if event.get("done"):
                state["running"] = False
                result = 1 if "error" in event else 0
                state["succeeded"] = not result
                status.set(words["failure"] if result else words["success"])
                clear(completion)
                if result:
                    label(completion, words["failure_help"])
                    label(completion, event["error"])
                    show_page("complete")
                    messagebox.showerror(words["failure"], event["error"], parent=root)
                else:
                    bar["value"] = 100
                    outcome = event["outcome"]
                    label(completion, words["uninstall_success" if removing else "install_success"])
                    extra = list(outcome.get("warnings", []))
                    if outcome.get("retained"):
                        extra.append(words["retained"].format(files=", ".join(outcome["retained"])))
                    if outcome.get("pending"):
                        extra.append(words["pending"])
                    if extra:
                        label(completion, words["warnings"], style="Step.TLabel")
                        label(completion, "\n".join(extra))
                    show_page("complete")
            else:
                bar["value"] = event.get("percent", 0)
                message = event.get("message", "")
                localized = _CHINESE_STAGES.get(event.get("stage"), message) if language == "zh-CN" else message
                if event.get("stage") == "download":
                    localized += f" · {event.get('bytes', 0):,} / {event.get('total', 0):,} {words['bytes']}"
                status.set(localized)
                detail = localized
                if language == "zh-CN" and event.get("stage") == "error" and message:
                    detail += ": " + message
                details.configure(state="normal")
                details.insert("end", detail + "\n")
                details.see("end")
                details.configure(state="disabled")
        if not closed:
            poll_id = root.after(80, poll)

    show_page("confirm" if removing else "directory")
    poll_id = root.after(80, poll)
    if _observer is not None:
        # Private in-process test seam; no CLI/debug entry or alternative execution path.
        _observer({"root": root, "state": state, "pages": pages, "canvases": canvases,
                   "contents": contents, "directory": directory, "selections": selections,
                   "controls": controls, "runtime_rows": runtime_rows, "indicator": indicator,
                   "entry": entry, "browse": browse_button, "back": back, "action": action,
                   "cancel": cancel, "details": details, "bar": bar, "status": status})
    root.mainloop()
    return result


def main(argv: list[str] | None = None) -> int:
    """GUI by default, including windowed frozen builds; never read stdin."""
    parser = argparse.ArgumentParser(description="Easy Windows Pack current-user setup")
    parser.add_argument("--silent", action="store_true")
    parser.add_argument("--install-dir", type=Path)
    parser.add_argument("--features", help="Comma-separated feature IDs; empty disables optional features")
    parser.add_argument("--options", help="Comma-separated postInstall IDs; empty disables defaults")
    parser.add_argument("--uninstall", nargs="?", const="", metavar="DIRECTORY")
    parser.add_argument("--payload", type=Path, help="Test/external payload ZIP")
    args = parser.parse_args(argv)
    try:
        removing = args.uninstall is not None or (
            getattr(sys, "frozen", False) and Path(sys.executable).name.casefold() == "uninstall.exe")
        if removing:
            destination = _root(args.uninstall or args.install_dir or Path(sys.executable).parent)
            manifest = _load_state(destination)["manifest"]
            payload = None
        else:
            payload = args.payload or Path(getattr(sys, "_MEIPASS", Path(__file__).parent)) / "payload.zip"
            manifest = read_manifest(payload)
            destination = _root(args.install_dir or os.environ.get("EWP_INSTALL_DIR") or default_directory(manifest))
        features = None if args.features is None else [item for item in args.features.split(",") if item]
        options = None if args.options is None else [item for item in args.options.split(",") if item]
        if not args.silent:
            return _gui(payload, destination, manifest, features, options, removing)
        if removing:
            uninstall(destination)
        else:
            install(payload, destination, features, options)
        return 0
    except Exception as error:
        if args.silent:
            if sys.stderr is not None:
                print(f"Setup failed: {error}", file=sys.stderr)
        else:
            try:
                import tkinter as tk
                from tkinter import messagebox
                window = tk.Tk()
                window.withdraw()
                messagebox.showerror("Setup / 安装", str(error), parent=window)
                window.destroy()
            except Exception:
                if sys.stderr is not None:
                    print(f"Setup failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
