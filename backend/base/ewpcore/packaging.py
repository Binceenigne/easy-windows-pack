"""Build Windows applications and standalone setup/uninstall executables.

Config sources are project-relative paths. Feature destinations describe the
installed tree; only their staged ``features/<id>`` payload is published in the
manifest. All feature combinations must be collision-free. PyInstaller is the
only subprocess boundary: staging, validation and publication are performed here.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import zipfile
from pathlib import Path
from typing import Any, Iterable

CONFIG_NAME = "ewp.pack.json"
MANIFEST_NAME = "ewp-installer.json"
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\Z")
_HASH = re.compile(r"[0-9a-fA-F]{64}\Z")
_DEVICE = re.compile(r"(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?\Z", re.I)
_RESERVED = {MANIFEST_NAME, ".ewp-install-state.json", ".ewp-installer.log",
             ".ewp-installer.lock", "ewp-options.json", "uninstall.exe", "features", "runtime"}
_HOOKS = {"beforeInstall", "afterInstall", "beforeUninstall", "afterUninstall"}


def _object(value: Any, label: str, fields: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) - fields:
        raise ValueError(f"{label} must be an object with supported fields: {', '.join(sorted(fields))}")
    return value


def _text(value: Any, label: str, *, empty: bool = False) -> str:
    if not isinstance(value, str) or (not empty and not value.strip()) or any(ord(c) < 32 for c in value):
        raise ValueError(f"Invalid {label}")
    return value


def _identifier(value: Any) -> str:
    value = _text(value, "ID")
    if not _ID.fullmatch(value) or value.endswith(".") or _DEVICE.fullmatch(value):
        raise ValueError(f"Unsafe ID: {value}")
    return value


def _relative(value: Any) -> str:
    value = _text(value, "relative path")
    if any(part in ("", ".", "..") or part.endswith((".", " ")) or _DEVICE.fullmatch(part)
           or any(c in '\\:<>"|?*' for c in part) for part in value.split("/")):
        raise ValueError(f"Unsafe relative path: {value}")
    return value


def _no_links(path: Path) -> None:
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError(f"Links/reparse points are not allowed: {item}")


def _root(value: Path) -> Path:
    path = Path(value).absolute()
    _no_links(path)
    if not path.is_dir():
        raise ValueError(f"Project root is not a directory: {path}")
    return path.resolve()


def _inside(root: Path, path: Path) -> Path:
    _no_links(path)
    path = path.resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Path escapes project root: {path}")
    return path


def _tree(source: Path) -> Iterable[tuple[Path, str, bool]]:
    """Walk without following symlinks, junctions or other reparse points."""
    _no_links(source)
    if not source.is_dir():
        raise ValueError(f"Not a directory: {source}")
    for child in sorted(source.iterdir()):
        _no_links(child)
        name = _relative(child.name)
        mode = child.lstat().st_mode
        if stat.S_ISDIR(mode):
            yield child, name, True
            for path, relative, directory in _tree(child):
                yield path, f"{name}/{relative}", directory
        elif stat.S_ISREG(mode):
            yield child, name, False
        else:
            raise ValueError(f"Special files are not allowed: {child}")


def _destination(value: Any) -> str:
    relative = _relative(value)
    if relative.split("/")[0].casefold() in _RESERVED:
        raise ValueError(f"Destination collides with a reserved installer path: {relative}")
    return relative


def _commands(value: Any) -> list[list[str]]:
    if not isinstance(value, list):
        raise ValueError("Commands must be an array of argv arrays")
    for argv in value:
        if not isinstance(argv, list) or not argv or any(
                not isinstance(arg, str) or "\0" in arg for arg in argv) or not argv[0]:
            raise ValueError("Each command must be a nonempty string argv array")
        if Path(argv[0]).suffix.lower() in (".bat", ".cmd"):
            raise ValueError("Batch commands are not supported; use executable argv arrays")
    return value


def _urls(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("urls/mirrors must be arrays")
    for url in value:
        parsed = urllib.parse.urlsplit(_text(url, "URL"))
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Downloads require HTTP(S) URLs without embedded credentials")
        # Force parsing of invalid/out-of-range ports too.
        _ = parsed.port
    return value


class _Paths:
    """Windows case-insensitive installed paths, including implicit parents."""

    def __init__(self) -> None:
        self.paths: dict[str, tuple[str, bool]] = {}

    def add(self, relative: str, directory: bool) -> None:
        parts = _relative(relative).split("/")
        for index in range(1, len(parts) + 1):
            name = "/".join(parts[:index])
            is_dir = index < len(parts) or directory
            folded = name.casefold()
            previous = self.paths.get(folded)
            if previous and (previous != (name, True) or not is_dir):
                raise ValueError(f"Payload path collision: {name}")
            self.paths[folded] = (name, is_dir)


def _file_entries(root: Path, files: Any) -> list[tuple[Path, str, bool]]:
    if not isinstance(files, list):
        raise ValueError("files must be an array")
    entries = []
    for item in files:
        item = _object(item, "file", {"source", "destination"})
        source = _inside(root, root / _relative(item.get("source")))
        destination = _destination(item.get("destination"))
        if source.is_dir():
            entries.append((source, destination, True))
            for path, relative, directory in _tree(source):
                entries.append((path, f"{destination}/{relative}", directory))
        elif source.is_file():
            entries.append((source, destination, False))
        else:
            raise ValueError(f"Missing source file/directory: {source}")
    return entries


def _default_id(root: Path) -> str:
    identifier = re.sub(r"[^a-z0-9_.-]+", "-", root.name.lower()).strip(".-")[:80].rstrip(".")
    if not identifier or not identifier[0].isalnum() or _DEVICE.fullmatch(identifier) or identifier == "uninstall":
        return "ewp-app"
    return identifier


def validate_pack_config(config: Any, project_root: Path) -> dict[str, Any]:
    """Return a normalized copy; reject unsafe paths and malformed shared schema."""
    root = _root(project_root)
    data = copy.deepcopy(_object(config, "config", {
        "schemaVersion", "application", "build", "features", "prerequisites", "postInstall", "hooks", "installer"}))
    schema = data.setdefault("schemaVersion", 1)
    if type(schema) is not int or schema != 1:
        raise ValueError("schemaVersion must be 1")
    app = _object(data.setdefault("application", {}), "application", {"id", "name", "version"})
    app.setdefault("id", _default_id(root))
    app.setdefault("name", root.name)
    app.setdefault("version", "0.1.0")
    _identifier(app["id"])
    if app["id"].casefold() == "uninstall":
        raise ValueError("application.id collides with uninstall.exe")
    _text(app["name"], "application.name")
    _text(app["version"], "application.version")
    build = _object(data.setdefault("build", {}), "build", {"mode", "installer"})
    if build.setdefault("mode", "onefile") not in ("onefile", "onedir"):
        raise ValueError("build.mode must be onefile or onedir")
    if not isinstance(build.setdefault("installer", False), bool):
        raise ValueError("build.installer must be a boolean")
    fields = {
        "features": {"id", "name", "description", "default", "required", "files"},
        "prerequisites": {"id", "name", "urls", "mirrors", "mirrorApi", "sha256", "type", "destination",
                          "filename", "features", "commands", "check"},
        "postInstall": {"id", "name", "type", "default", "key", "value"},
    }
    for name, allowed in fields.items():
        items = data.setdefault(name, [])
        if not isinstance(items, list):
            raise ValueError(f"{name} must be an array")
        seen: set[str] = set()
        for item in items:
            _object(item, name, allowed)
            identifier = _identifier(item.get("id"))
            if identifier.casefold() in seen:
                raise ValueError(f"Duplicate {name} ID: {identifier}")
            seen.add(identifier.casefold())
            _text(item.setdefault("name", identifier), f"{name}.name")
            for flag in ("default", "required"):
                if flag in allowed and not isinstance(item.setdefault(flag, False), bool):
                    raise ValueError(f"{name}.{flag} must be a boolean")
    installed_paths = _Paths()
    for item in data["features"]:
        _text(item.setdefault("description", ""), "feature.description", empty=True)
        for _, destination, directory in _file_entries(root, item.setdefault("files", [])):
            installed_paths.add(destination, directory)
    feature_ids = {item["id"] for item in data["features"]}
    for item in data["prerequisites"]:
        if not isinstance(item.get("sha256"), str) or not _HASH.fullmatch(item["sha256"]):
            raise ValueError("Every prerequisite requires a 64-hex SHA-256 digest")
        if item.get("type") not in ("zip", "file", "exe"):
            raise ValueError("Prerequisite type must be zip, file or exe")
        if item.setdefault("destination", f"runtime/{item['id']}") != f"runtime/{item['id']}":
            raise ValueError("Prerequisite destination must be runtime/<id>")
        urls = _urls(item.setdefault("urls", [])) + _urls(item.setdefault("mirrors", []))
        if "mirrorApi" in item:
            _urls([item["mirrorApi"]])
        elif not urls:
            raise ValueError("Prerequisite requires URLs or mirrorApi")
        if "filename" in item and "/" in _relative(item["filename"]):
            raise ValueError("filename must be a single safe filename")
        if "check" in item:
            _relative(item["check"])
        enabled = item.setdefault("features", [])
        if not isinstance(enabled, list) or any(not isinstance(value, str) or value not in feature_ids for value in enabled):
            raise ValueError("Prerequisite refers to an unknown feature")
        if len(enabled) != len(set(enabled)):
            raise ValueError("Duplicate prerequisite feature ID")
        _commands(item.setdefault("commands", []))
    kinds: set[str] = set()
    keys: set[str] = set()
    for item in data["postInstall"]:
        kind = item.get("type")
        if kind not in ("startup", "launch", "setting"):
            raise ValueError("postInstall type must be startup, launch or setting")
        if kind == "setting":
            key = _text(item.setdefault("key", item["id"]), "setting.key")
            if key in keys:
                raise ValueError("Duplicate setting key")
            keys.add(key)
            try:
                json.dumps(item.setdefault("value", None), allow_nan=False)
            except (TypeError, ValueError) as error:
                raise ValueError("setting.value must be a finite JSON value") from error
        elif kind in kinds:
            raise ValueError(f"Duplicate {kind} option")
        kinds.add(kind)
    hooks = _object(data.setdefault("hooks", {}), "hooks", _HOOKS)
    for commands in hooks.values():
        _commands(commands)
    installer = _object(data.setdefault("installer", {}), "installer", {"language", "defaultDirectory", "welcome", "files"})
    if installer.setdefault("language", "zh-CN") not in ("zh-CN", "en"):
        raise ValueError("installer.language must be zh-CN or en")
    for field in ("defaultDirectory", "welcome"):
        if field in installer:
            _text(installer[field], f"installer.{field}")
    for _, destination, directory in _file_entries(root, installer.setdefault("files", [])):
        installed_paths.add(destination, directory)
    return data


def load_pack_config(project_root: Path, config_path: Path | None = None) -> dict[str, Any]:
    """Resolve relative config paths against the project, never the caller's cwd."""
    root = _root(project_root)
    path = Path(config_path) if config_path is not None else Path(CONFIG_NAME)
    path = _inside(root, path if path.is_absolute() else root / path)
    if not path.exists() and config_path is None:
        return validate_pack_config({}, root)
    if not path.is_file():
        raise ValueError(f"Configuration file does not exist: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        raise ValueError(f"Invalid {path.name}: {error}") from error
    return validate_pack_config(data, root)


def selected_features(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Return all configured installer choices (selection happens at install time)."""
    items = config.get("features", [])
    if not isinstance(items, list):
        raise ValueError("features must be an array")
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid feature")
        identifier = _identifier(item.get("id"))
        if identifier.casefold() in seen:
            raise ValueError(f"Duplicate feature ID: {identifier}")
        seen.add(identifier.casefold())
    return copy.deepcopy(items)


def _run(command: list[str], root: Path) -> None:
    environment = os.environ.copy()
    environment.pop("PYTHONHOME", None)
    environment.pop("PYTHONPATH", None)
    completed = subprocess.run(command, cwd=root, env=environment, shell=False)
    if completed.returncode:
        raise RuntimeError(f"command failed with exit code {completed.returncode}: {command[0]}")


def _pyinstaller_command(root: Path, output: Path, name: str, mode: str, script: Path,
                         *, role: str = "application", data: list[tuple[Path, str]] | None = None) -> list[str]:
    command = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed",
               "--name", name, "--specpath", str(root / "build/spec" / role / name),
               "--workpath", str(root / "build/pyinstaller" / role / name), "--distpath", str(output),
               "--onefile" if mode == "onefile" else "--onedir"]
    if role == "application":
        command.extend(["--paths", str(root / "build/exe-src")])
        data = [(root / "output/frontend", "output/frontend"), *(data or [])]
    for source, destination in data or []:
        command.extend(["--add-data", f"{source}{os.pathsep}{destination}"])
    command.append(str(script))
    return command


def prepare_sources(root: Path) -> None:
    """Stage the project core, or the loaded package, under its public name."""
    root = _root(root)
    source = _inside(root, root / "backend/base/ewpcore")
    if not (source / "__init__.py").is_file():
        # Wheels carry the core beside this module, outside the app project.
        # Use only that package tree; never copy its site-packages parent or a
        # potentially stale project directory named easy_windows_pack.
        source = Path(__file__).resolve().parent
        _no_links(source)
    if not (source / "__init__.py").is_file():
        raise ValueError(f"Core package __init__.py is missing: {source}")
    entries = list(_tree(source))
    destination = _inside(root, root / "build/exe-src/easy_windows_pack")
    if destination.exists():
        list(_tree(destination))
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for path, relative, directory in entries:
        if any(part == "__pycache__" for part in relative.split("/")) or path.suffix in (".pyc", ".pyo"):
            continue
        target = destination / relative
        if directory:
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)


def validate_pe(path: Path) -> Path:
    """Require a readable Windows executable with DOS, COFF and PE headers."""
    path = Path(path)
    _no_links(path)
    if path.suffix.lower() != ".exe" or not path.is_file():
        raise ValueError(f"Missing Windows EXE output: {path}")
    with path.open("rb") as stream:
        size = path.stat().st_size
        dos = stream.read(64)
        if len(dos) != 64 or dos[:2] != b"MZ":
            raise ValueError(f"Invalid PE executable: {path}")
        offset = struct.unpack_from("<I", dos, 60)[0]
        if offset < 64 or offset + 24 > size:
            raise ValueError(f"Invalid PE header offset: {path}")
        stream.seek(offset)
        header = stream.read(24)
        machine, sections, _, _, _, optional_size, flags = struct.unpack("<HHIIIHH", header[4:])
        if (header[:4] != b"PE\0\0" or machine not in (0x14C, 0x8664, 0xAA64)
                or not 1 <= sections <= 96 or not flags & 2 or flags & 0x2000
                or optional_size < 64 or offset + 24 + optional_size + sections * 40 > size):
            raise ValueError(f"Invalid PE/COFF executable header: {path}")
        magic = stream.read(2)
        if magic not in (b"\x0b\x01", b"\x0b\x02"):
            raise ValueError(f"Invalid PE optional header: {path}")
    return path


def _build_dirs(root: Path, role: str, name: str) -> None:
    _inside(root, root / "build").mkdir(parents=True, exist_ok=True)
    for relative in (f"build/spec/{role}/{name}", f"build/pyinstaller/{role}/{name}"):
        path = _inside(root, root / relative)
        # PyInstaller may clean its cache; validate existing descendants first.
        if path.exists():
            list(_tree(path))
        path.mkdir(parents=True, exist_ok=True)


def _publish(root: Path, source: Path, relative: str) -> Path:
    destination = _inside(root, root / relative)
    destination.parent.mkdir(parents=True, exist_ok=True)
    directory = source.is_dir()
    if directory:
        list(_tree(source))
    if destination.exists():
        if destination.is_dir():
            list(_tree(destination))
            shutil.rmtree(destination)
        elif directory:
            destination.unlink()
    if directory:
        # Scanner handles may allow reading DLLs while denying a directory move.
        # Claim the new destination before copying so failure cleanup owns it.
        destination.mkdir()
        try:
            shutil.copytree(source, destination, dirs_exist_ok=True)
            validate_pe(destination / f"{destination.name}.exe")
        except Exception:
            list(_tree(destination))
            shutil.rmtree(destination)
            raise
    else:
        if source.is_dir():
            # Windows scanners can hold files open without permitting their parent
            # directory to be renamed. Reading/copying remains possible.
            try:
                shutil.copytree(source, destination)
            except Exception:
                if destination.is_dir():
                    shutil.rmtree(destination)
                raise
        else:
            source.replace(destination)
    return destination


def build_application(root: Path, config: dict[str, Any], mode: str | None = None) -> Path:
    root = _root(root)
    config = validate_pack_config(config, root)
    effective_mode = config["build"]["mode"] if mode is None else mode
    if effective_mode not in ("onefile", "onedir"):
        raise ValueError("mode must be onefile or onedir")
    name = config["application"]["id"]
    script = _inside(root, root / "backend/src/demo.py")
    frontend = _inside(root, root / "output/frontend")
    if not script.is_file():
        raise ValueError("backend/src/demo.py is missing")
    if not (frontend / "index.html").is_file():
        raise ValueError("Build the frontend first: output/frontend/index.html is missing")
    list(_tree(frontend))
    prepare_sources(root)
    _build_dirs(root, "application", name)
    # Directory publication leaves staged DLLs behind. A scanner can delay their
    # deletion without invalidating the validated, copied application output.
    with tempfile.TemporaryDirectory(prefix="ewp-application-", dir=root / "build",
                                     ignore_cleanup_errors=True) as temporary:
        output = Path(temporary)
        _run(_pyinstaller_command(root, output, name, effective_mode, script), root)
        result = output / (name if effective_mode == "onedir" else f"{name}.exe")
        validate_pe(result / f"{name}.exe" if effective_mode == "onedir" else result)
        if result.is_dir():
            list(_tree(result))
        return _publish(root, result, f"output/apps/{result.name}")


def _copy_entries(entries: Iterable[tuple[Path, str, bool]], staging: Path,
                  installed: _Paths, *, prefix: str = "") -> None:
    for source, relative, directory in entries:
        _destination(relative)
        installed.add(relative, directory)
        _no_links(source)
        target = staging / prefix / relative
        _no_links(target)
        if directory:
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation also catches physical collisions in staging.
            with source.open("rb") as incoming, target.open("xb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)


def _zip_payload(source: Path, destination: Path, manifest: dict[str, Any]) -> None:
    with zipfile.ZipFile(destination, "x", zipfile.ZIP_DEFLATED) as archive:
        for path, relative, directory in _tree(source):
            archive.write(path, relative + "/" if directory else relative)
        archive.writestr(MANIFEST_NAME, json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False))


def build_installer(root: Path, config: dict[str, Any], application: Path) -> Path:
    """Flatten onedir, stage optional files, freeze the same standalone installer twice."""
    root = _root(root)
    config = validate_pack_config(config, root)
    application = Path(application)
    application = _inside(root, application if application.is_absolute() else root / application)
    name = config["application"]["id"]
    app_path = f"{name}.exe"
    onedir = application.is_dir()
    if application.name != (name if onedir else app_path):
        raise ValueError("Application output must match application.id and contain its real EXE")
    validate_pe(application / app_path if onedir else application)
    entries = list(_tree(application)) if onedir else [(application, app_path, False)]
    installer = Path(__file__).with_name("installer.py")
    _no_links(installer)
    if not installer.is_file():
        raise ValueError("Standalone installer.py is missing")
    for role, executable in (("uninstall", "uninstall"), ("setup", f"{name}-setup")):
        _build_dirs(root, role, executable)
    with tempfile.TemporaryDirectory(prefix="ewp-installer-", dir=root / "build") as temporary:
        temporary_root = Path(temporary)
        staging = temporary_root / "payload"
        staging.mkdir()
        installed = _Paths()
        _copy_entries(entries, staging, installed)
        _copy_entries(_file_entries(root, config["installer"]["files"]), staging, installed)
        manifest = copy.deepcopy(config)
        manifest["build"]["mode"] = "onedir" if onedir else "onefile"
        manifest["build"]["installer"] = True
        # applicationPath is the current runtime spelling; appPath is the shared
        # contract spelling. Both refer to the flattened EXE, never its directory.
        manifest["appPath"] = manifest["applicationPath"] = app_path
        manifest["installer"].pop("files")
        for item in manifest["features"]:
            files = item.pop("files")
            prefix = f"features/{item['id']}"
            (staging / prefix).mkdir(parents=True)
            _copy_entries(_file_entries(root, files), staging, installed, prefix=prefix)
            item["payload"] = prefix
        uninstall_output = temporary_root / "uninstall-dist"
        _run(_pyinstaller_command(root, uninstall_output, "uninstall", "onefile", installer, role="uninstall"), root)
        uninstaller = validate_pe(uninstall_output / "uninstall.exe")
        shutil.copy2(uninstaller, staging / "uninstall.exe")
        payload = temporary_root / "payload.zip"
        _zip_payload(staging, payload, manifest)
        setup_output = temporary_root / "setup-dist"
        _run(_pyinstaller_command(root, setup_output, f"{name}-setup", "onefile", installer,
                                 role="setup", data=[(payload, ".")]), root)
        setup = validate_pe(setup_output / f"{name}-setup.exe")
        return _publish(root, setup, f"output/installers/{setup.name}")


def build_package(root: Path, config_path: Path | None = None, installer: bool | None = None,
                  mode: str | None = None) -> dict[str, Path]:
    root = _root(root)
    config = load_pack_config(root, config_path)
    if mode is not None:
        config["build"]["mode"] = mode
    if installer is not None:
        config["build"]["installer"] = installer
    config = validate_pack_config(config, root)
    application = build_application(root, config)
    result = {"application": application}
    if config["build"]["installer"]:
        result["installer"] = build_installer(root, config, application)
    return result


def verify_sha256(path: Path, expected: str | None) -> bool:
    """Missing/malformed checksums fail closed, including helper callers."""
    if not isinstance(expected, str) or not _HASH.fullmatch(expected):
        return False
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower() == expected.lower()


def mirror_urls(item: dict[str, Any]) -> Iterable[str]:
    """Validated, deduplicated static fallbacks; mirrorApi discovery is runtime I/O."""
    return list(dict.fromkeys(_urls(item.get("urls", [])) + _urls(item.get("mirrors", []))))
