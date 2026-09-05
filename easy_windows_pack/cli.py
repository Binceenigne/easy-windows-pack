from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Sequence


class BuildError(RuntimeError):
    """Raised when a build command cannot produce its requested artifact."""


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = "easy-windows-pack"
BUNDLE_SOURCES = (
    "easy_windows_pack",
    "frontend",
    "examples",
    "tests",
    "docs",
    "build.ps1",
    "README.md",
    "README.en.md",
    "LICENSE",
    "pyproject.toml",
    "requirements.txt",
)


def _read_project_version(project_root: Path = PROJECT_ROOT) -> str:
    pyproject = (project_root / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'^version\s*=\s*["\']([^"\']+)["\']', pyproject, re.MULTILINE)
    if not match:
        raise BuildError(f"Could not read project version from {pyproject}")
    return match.group(1)


def _resolve_path(value: str | Path | None, project_root: Path) -> Path:
    path = Path(value) if value is not None else project_root / "dist"
    return path if path.is_absolute() else project_root / path


def _run(command: Sequence[str], *, cwd: Path) -> None:
    printable = " ".join(f'"{part}"' if " " in part else part for part in command)
    print(f"[run] {printable}")
    completed = subprocess.run(command, cwd=cwd)
    if completed.returncode:
        raise BuildError(f"Command failed with exit code {completed.returncode}: {printable}")


def run_tests(project_root: Path = PROJECT_ROOT, python: str = sys.executable) -> None:
    _run(
        [python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"],
        cwd=project_root,
    )


def build_wheel(
    project_root: Path = PROJECT_ROOT,
    output_dir: Path | None = None,
    python: str = sys.executable,
) -> Path:
    output = output_dir or project_root / "dist"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="easy-windows-pack-wheel-") as temporary:
        wheelhouse = Path(temporary)
        _run(
            [
                python,
                "-m",
                "pip",
                "wheel",
                "--no-deps",
                "--no-build-isolation",
                "--wheel-dir",
                str(wheelhouse),
                str(project_root),
            ],
            cwd=project_root,
        )
        wheels = sorted(wheelhouse.glob("*.whl"))
        if len(wheels) != 1:
            raise BuildError(f"Expected one wheel, found {len(wheels)} in {wheelhouse}")
        destination = output / wheels[0].name
        shutil.copy2(wheels[0], destination)
    print(f"[ok] wheel: {destination}")
    return destination


def _copy_bundle_source(project_root: Path, staging: Path, relative_name: str) -> None:
    source = project_root / relative_name
    destination = staging / relative_name
    if source.is_dir():
        shutil.copytree(
            source,
            destination,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__", "*.py[cod]", "*.egg-info"),
        )
    elif source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    else:
        raise BuildError(f"Bundle source does not exist: {source}")


def build_bundle(project_root: Path = PROJECT_ROOT, output_dir: Path | None = None) -> Path:
    output = output_dir or project_root / "dist"
    output.mkdir(parents=True, exist_ok=True)
    version = _read_project_version(project_root)
    bundle_name = f"{PACKAGE_NAME}-{version}-bundle"
    staging = output / bundle_name
    archive = output / f"{bundle_name}.zip"
    if staging.exists():
        shutil.rmtree(staging)
    if archive.exists():
        archive.unlink()

    for source in BUNDLE_SOURCES:
        _copy_bundle_source(project_root, staging, source)

    manifest = {
        "name": PACKAGE_NAME,
        "version": version,
        "artifact": "source-bundle",
        "entrypoints": {
            "python": "easy_windows_pack",
            "frontend": "frontend/window-frame.js",
            "example": "examples/demo.py",
        },
        "files": sorted(
            str(path.relative_to(staging)).replace("\\", "/")
            for path in staging.rglob("*")
            if path.is_file()
        ),
    }
    (staging / "easy-windows-pack.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                zip_file.write(path, f"{bundle_name}/{path.relative_to(staging)}")
    print(f"[ok] bundle directory: {staging}")
    print(f"[ok] bundle archive: {archive}")
    return archive


def clean_project(project_root: Path = PROJECT_ROOT) -> None:
    targets = [project_root / "build", project_root / "dist"]
    targets.extend(project_root.glob("*.egg-info"))
    targets.extend(project_root.rglob("__pycache__"))
    removed = 0
    for target in sorted(set(targets), key=lambda item: len(item.parts), reverse=True):
        if target.exists() and target != project_root:
            shutil.rmtree(target)
            removed += 1
            print(f"[clean] removed {target.relative_to(project_root)}")
    print(f"[ok] removed {removed} generated directories")


def print_info(project_root: Path = PROJECT_ROOT) -> None:
    print(
        json.dumps(
            {
                "name": PACKAGE_NAME,
                "version": _read_project_version(project_root),
                "projectRoot": str(project_root),
                "python": sys.executable,
                "commands": ["build", "bundle", "clean", "info", "test"],
                "artifacts": ["wheel", "source-bundle.zip"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="easy-windows-pack",
        description="Build and inspect the reusable Windows WebView window pack.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="Run tests and build wheel plus source bundle")
    build.add_argument("--output-dir", help="Artifact output directory")
    build.add_argument("--python", default=sys.executable, help="Python executable used for tests and wheel")
    build.add_argument("--skip-tests", action="store_true", help="Skip the unittest phase")
    build.add_argument("--skip-wheel", action="store_true", help="Skip wheel creation")
    build.add_argument("--skip-bundle", action="store_true", help="Skip source bundle creation")

    bundle = subparsers.add_parser("bundle", help="Build only the source bundle")
    bundle.add_argument("--output-dir", help="Artifact output directory")

    test = subparsers.add_parser("test", help="Run the package unittest suite")
    test.add_argument("--python", default=sys.executable, help="Python executable used for tests")

    clean = subparsers.add_parser("clean", help="Remove generated build, dist and cache directories")
    clean.add_argument("--project-root", help=argparse.SUPPRESS)

    subparsers.add_parser("info", help="Print project and artifact metadata")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "test":
            run_tests(PROJECT_ROOT, args.python)
        elif args.command == "bundle":
            build_bundle(PROJECT_ROOT, _resolve_path(args.output_dir, PROJECT_ROOT))
        elif args.command == "clean":
            clean_project(PROJECT_ROOT)
        elif args.command == "info":
            print_info(PROJECT_ROOT)
        elif args.command == "build":
            output_dir = _resolve_path(args.output_dir, PROJECT_ROOT)
            if not args.skip_tests:
                run_tests(PROJECT_ROOT, args.python)
            output_dir.mkdir(parents=True, exist_ok=True)
            if not args.skip_wheel:
                build_wheel(PROJECT_ROOT, output_dir, args.python)
            if not args.skip_bundle:
                build_bundle(PROJECT_ROOT, output_dir)
            print(f"[ok] build complete: {output_dir}")
        return 0
    except (BuildError, OSError, subprocess.SubprocessError) as error:
        print(f"[error] {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
