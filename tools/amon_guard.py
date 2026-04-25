#!/usr/bin/env python3
"""
AMON Guard CLI
Local safety gate for tbb-amon-delivery-dev.

Default:
  Scan staged files only.

Usage:
  python3 tools/amon_guard.py
  python3 tools/amon_guard.py --all
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SECRET_PATTERNS = [
    re.compile(r"postgres(?:ql)?://[^\s\"']+", re.IGNORECASE),
    re.compile(r"napi_[A-Za-z0-9]{20,}"),
    re.compile(r"npg_[A-Za-z0-9]{8,}"),
    re.compile(r"-----BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY-----"),
    re.compile(r"FIREBASE_PRIVATE_KEY", re.IGNORECASE),
    re.compile(r"PRIVATE_KEY\s*=", re.IGNORECASE),
]

BLOCKED_PATH_PARTS = [
    ".secrets/",
]

BLOCKED_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "serviceAccountKey.json",
}

IGNORED_SUFFIXES = (
    "package-lock.json",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".tsbuildinfo",
)


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if result.returncode != 0:
        print(result.stderr.strip(), file=sys.stderr)
        sys.exit(result.returncode)

    return result.stdout


def get_files(scan_all: bool) -> list[str]:
    if scan_all:
        output = run_git(["ls-files"])
    else:
        output = run_git(["diff", "--cached", "--name-only"])

    return [line.strip() for line in output.splitlines() if line.strip()]


def read_file(path: str) -> str:
    full_path = ROOT / path

    if not full_path.exists() or full_path.is_dir():
        return ""

    try:
        return full_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def check_blocked_paths(files: list[str]) -> list[str]:
    findings: list[str] = []

    for file in files:
        normalized = file.replace("\\", "/")
        file_name = Path(normalized).name

        if file_name in BLOCKED_FILE_NAMES:
            findings.append(f"Blocked env/secret file staged: {file}")

        for blocked in BLOCKED_PATH_PARTS:
            if normalized.startswith(blocked):
                findings.append(f"Blocked risky path staged: {file}")

        if "firebase-adminsdk" in normalized.lower():
            findings.append(f"Firebase admin SDK key must not be committed: {file}")

        if "service-account" in normalized.lower():
            findings.append(f"Service account file must not be committed: {file}")

    return findings


def check_secret_patterns(files: list[str]) -> list[str]:
    findings: list[str] = []

    for file in files:
        normalized = file.replace("\\", "/")

        if normalized.endswith(IGNORED_SUFFIXES):
            continue

        content = read_file(file)
        if not content:
            continue

        for idx, line in enumerate(content.splitlines(), start=1):
            for pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append(f"{file}:{idx} matches high-risk secret pattern")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="AMON local repo safety gate")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan all tracked files. Use for manual audits only.",
    )

    args = parser.parse_args()

    files = get_files(scan_all=args.all)

    print("AMON Guard — scanning repository")
    print(f"Mode: {'all tracked files' if args.all else 'staged files only'}")
    print(f"Files scanned: {len(files)}")

    if not files:
        print("\nOK: no files to scan.")
        return 0

    findings = []
    findings.extend(check_blocked_paths(files))
    findings.extend(check_secret_patterns(files))

    if findings:
        print("\nBLOCKED:")
        for finding in findings:
            print(f" - {finding}")

        print("\nFix the findings before commit/push.")
        return 1

    print("\nOK: no high-risk repo hygiene issues found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())