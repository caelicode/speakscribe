#!/usr/bin/env python3

import json
import subprocess
import sys
import argparse
import re
from pathlib import Path

def get_current_version(manifest_path: str) -> str:
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    version = data.get("version", "0.0.0")
    return version

def set_version(manifest_path: str, new_version: str) -> None:
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["version"] = new_version
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

def parse_version(version_str: str) -> tuple:
    parts = version_str.split(".")
    if len(parts) != 3:
        print(f"ERROR: Invalid version format '{version_str}'. Expected MAJOR.MINOR.PATCH", file=sys.stderr)
        sys.exit(1)
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError:
        print(f"ERROR: Version components must be integers: '{version_str}'", file=sys.stderr)
        sys.exit(1)

def bump_version(major: int, minor: int, patch: int, bump_type: str) -> str:
    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    elif bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    else:
        print(f"ERROR: Unknown bump type '{bump_type}'", file=sys.stderr)
        sys.exit(1)

def get_last_tag() -> str:
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0", "--match", "v*"],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""

def get_commits_since(tag: str) -> list:
    if tag:
        range_spec = f"{tag}..HEAD"
    else:
        range_spec = "HEAD"

    try:
        result = subprocess.run(
            ["git", "log", range_spec, "--pretty=format:%s"],
            capture_output=True, text=True, check=True
        )
        if not result.stdout.strip():
            return []
        return result.stdout.strip().split("\n")
    except subprocess.CalledProcessError:
        return []

def detect_bump_type(commits: list) -> str:
    has_breaking = False
    has_feat = False
    has_fix = False

    conventional_pattern = re.compile(
        r"^(?P<type>[a-z]+)(?:\([^)]*\))?(?P<breaking>!)?\s*:\s*(?P<desc>.+)$",
        re.IGNORECASE
    )

    for msg in commits:
        match = conventional_pattern.match(msg)
        if match:
            commit_type = match.group("type").lower()
            is_breaking = match.group("breaking") == "!"

            if is_breaking or "BREAKING CHANGE" in msg.upper():
                has_breaking = True
            elif commit_type == "feat":
                has_feat = True
            elif commit_type == "fix":
                has_fix = True
        else:
            if "BREAKING CHANGE" in msg.upper():
                has_breaking = True

    if has_breaking:
        return "major"
    elif has_feat:
        return "minor"
    elif has_fix:
        return "patch"
    else:
        return "patch"

def generate_changelog_section(commits: list, new_version: str) -> str:
    from datetime import date

    breaking = []
    features = []
    fixes = []
    other = []

    conventional_pattern = re.compile(
        r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]*)\))?(?P<breaking>!)?\s*:\s*(?P<desc>.+)$",
        re.IGNORECASE
    )

    for msg in commits:
        match = conventional_pattern.match(msg)
        if match:
            commit_type = match.group("type").lower()
            scope = match.group("scope") or ""
            is_breaking = match.group("breaking") == "!"
            desc = match.group("desc").strip()

            prefix = f"**{scope}:** " if scope else ""
            entry = f"{prefix}{desc}"

            if is_breaking or "BREAKING CHANGE" in msg.upper():
                breaking.append(entry)
            elif commit_type == "feat":
                features.append(entry)
            elif commit_type == "fix":
                fixes.append(entry)
            else:
                other.append(entry)
        else:
            other.append(msg.strip())

    lines = [f"## [{new_version}] - {date.today().isoformat()}", ""]

    if breaking:
        lines.append("### BREAKING CHANGES")
        lines.append("")
        for item in breaking:
            lines.append(f"- {item}")
        lines.append("")

    if features:
        lines.append("### Features")
        lines.append("")
        for item in features:
            lines.append(f"- {item}")
        lines.append("")

    if fixes:
        lines.append("### Bug Fixes")
        lines.append("")
        for item in fixes:
            lines.append(f"- {item}")
        lines.append("")

    if other:
        lines.append("### Other Changes")
        lines.append("")
        for item in other:
            lines.append(f"- {item}")
        lines.append("")

    return "\n".join(lines)

def update_changelog(changelog_path: str, new_section: str) -> None:
    path = Path(changelog_path)
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing.startswith("# Changelog"):
            header_end = existing.index("\n") + 1
            updated = existing[:header_end] + "\n" + new_section + "\n" + existing[header_end:]
        else:
            updated = new_section + "\n" + existing
    else:
        updated = "# Changelog\n\n" + new_section + "\n"

    path.write_text(updated, encoding="utf-8")

def main():
    parser = argparse.ArgumentParser(description="Bump SpeakScribe version using semantic versioning")
    parser.add_argument(
        "--bump", choices=["major", "minor", "patch"],
        help="Force a specific bump type instead of auto-detecting from commits"
    )
    parser.add_argument(
        "--manifest", default="manifest.json",
        help="Path to manifest.json (default: manifest.json)"
    )
    parser.add_argument(
        "--changelog", default="CHANGELOG.md",
        help="Path to CHANGELOG.md (default: CHANGELOG.md)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would happen without making changes"
    )
    args = parser.parse_args()

    current = get_current_version(args.manifest)
    major, minor, patch = parse_version(current)
    print(f"Current version: {current}")

    last_tag = get_last_tag()
    if last_tag:
        print(f"Last tag: {last_tag}")
    else:
        print("No previous tags found; analyzing all commits")

    commits = get_commits_since(last_tag)
    if not commits:
        print("No new commits since last tag. Nothing to bump.")
        sys.exit(0)

    print(f"Found {len(commits)} commit(s) since last tag")

    if args.bump:
        bump_type = args.bump
        print(f"Forced bump type: {bump_type}")
    else:
        bump_type = detect_bump_type(commits)
        print(f"Auto-detected bump type: {bump_type}")

    new_version = bump_version(major, minor, patch, bump_type)
    print(f"New version: {current} -> {new_version}")

    if args.dry_run:
        print("[DRY RUN] No changes written.")
        print(f"::set-output name=new_version::{new_version}")
        print(f"::set-output name=bump_type::{bump_type}")
        return

    set_version(args.manifest, new_version)
    print(f"Updated {args.manifest} to version {new_version}")

    changelog_section = generate_changelog_section(commits, new_version)
    update_changelog(args.changelog, changelog_section)
    print(f"Updated {args.changelog}")

    import os
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"new_version={new_version}\n")
            f.write(f"bump_type={bump_type}\n")
            f.write(f"changelog<<EOF\n{changelog_section}\nEOF\n")

if __name__ == "__main__":
    main()
