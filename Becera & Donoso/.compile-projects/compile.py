"""
Compile every section project into one GitHub aggregate repo.

Workflow:
  1. Clone (or pull) the aggregate repo into a working folder.
  2. For each row in `projects.csv`, place the project as a plain folder
     inside that working folder. Source repos are shallow-cloned, .git is
     stripped so the aggregate stays single-rooted and viewable on github.com.
     `LOCAL` rows copy the parent project's working tree, respecting .gitignore.
  3. Regenerate the aggregate's README.md (master index) and _MISSING.md
     (chase list).
  4. git add -A, commit if there are changes, push (unless --no-push).

Re-runs are idempotent. New submissions get added, existing folders get
refreshed with the latest code, missing rows stay listed.

Usage:
    python compile.py                    # the lazy default: clone, sync, push
    python compile.py --no-push          # do everything except push (review locally)
    python compile.py --dry-run          # don't touch any files
    python compile.py --repo <url>       # override aggregate repo
    python compile.py --output <path>    # override working folder
    python compile.py --csv <path>       # different CSV

Requirements: Python 3.10+, git on PATH, git credentials configured for the
aggregate repo (HTTPS PAT or SSH).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = SCRIPT_DIR / "projects.csv"

# Aggregate repo. Change this once if the URL changes.
REPO_URL = "https://github.com/Inosuke-py/ProgrammingLanguage3A2.git"

# Filename of the script-owned manifest stored INSIDE the aggregate. Tracks
# which folders the script has placed there, so pruning only ever touches
# our own folders. Anything else (folders you added manually, etc.) is
# untouched.
MANIFEST_FILE = ".compile-manifest.json"

# `LOCAL` rows pull from this source. Default = the Kino root (parent of this
# script's folder), so the script can include the in-progress Kino app without
# needing it pushed first.
LOCAL_SOURCE = SCRIPT_DIR.parent


def _derive_output(repo_url: str) -> Path:
    """`https://.../FooBar.git` → `<workspace-parent>/FooBar/`."""
    name = repo_url.rstrip("/").rsplit("/", 1)[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return SCRIPT_DIR.parent.parent / name


DEFAULT_OUTPUT = _derive_output(REPO_URL)


# ─── Data ──────────────────────────────────────────────────────────────────────
@dataclass
class Project:
    student_a: str
    student_b: str
    repo_url: str
    branch: str
    notes: str

    @property
    def pair_label(self) -> str:
        """Human-friendly identifier for logs and the master README."""
        if self.student_a and self.student_b:
            return f"{self.student_a} & {self.student_b}"
        if self.student_a:
            return self.student_a
        if self.student_b:
            return self.student_b
        return "Unnamed pair"

    @property
    def folder_name(self) -> str:
        # Filesystem-safe version of the pair label. Strips Windows-forbidden
        # filename characters (`< > : " / \ | ? *` and control chars).
        # Spaces and `&` survive since both git and github.com handle them.
        cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", self.pair_label)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
        return cleaned or "Unnamed pair"

    @property
    def has_repo(self) -> bool:
        return bool(self.repo_url.strip())

    @property
    def is_local(self) -> bool:
        return self.repo_url.strip().upper() == "LOCAL"


# ─── CSV ───────────────────────────────────────────────────────────────────────
def load_projects(csv_path: Path) -> list[Project]:
    if not csv_path.exists():
        die(f"CSV not found: {csv_path}")

    out: list[Project] = []
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"student_a", "student_b", "repo_url"}
        if not required.issubset(reader.fieldnames or []):
            die(
                f"CSV missing required columns. Need at least: {sorted(required)}\n"
                f"Got: {reader.fieldnames}"
            )
        for row in reader:
            student_a = (row.get("student_a") or "").strip()
            student_b = (row.get("student_b") or "").strip()
            # Skip rows that have nothing useful in them.
            if not student_a and not student_b and not (row.get("repo_url") or "").strip():
                continue
            out.append(Project(
                student_a=student_a,
                student_b=student_b,
                repo_url=(row.get("repo_url") or "").strip(),
                branch=(row.get("branch") or "").strip(),
                notes=(row.get("notes") or "").strip(),
            ))
    return out


# ─── Git helpers ───────────────────────────────────────────────────────────────
def run_git(args: list[str], cwd: Path | None = None, check: bool = True) -> tuple[int, str, str]:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed in {cwd or '.'}:\n{proc.stderr.strip() or proc.stdout.strip()}"
        )
    return proc.returncode, proc.stdout, proc.stderr


def load_manifest(output: Path) -> set[str]:
    """Read the script-owned manifest. Returns the set of folder names the
    script previously placed in the aggregate. Missing or malformed manifest
    means an empty set, so first runs and recovery scenarios both behave."""
    path = output / MANIFEST_FILE
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return set(data.get("script_managed_folders", []))
    except Exception:
        return set()


def write_manifest(output: Path, managed_folders: set[str]) -> None:
    """Persist the manifest. Sorted for stable diffs."""
    payload = {
        "_doc": (
            "Auto-generated by .compile-projects/compile.py. Do not edit by hand. "
            "Lists folders the script manages so it never deletes anything you added manually."
        ),
        "script_managed_folders": sorted(managed_folders),
    }
    (output / MANIFEST_FILE).write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def prune_orphans(
    projects: list[Project],
    output: Path,
    previously_managed: set[str],
) -> list[str]:
    """Remove folders the script previously placed but no longer should.

    Only deletes a folder if BOTH:
      - It's in the script's manifest (i.e., we placed it on a previous run).
      - It's no longer in the current CSV.

    Anything you added manually is never in the manifest, so it's never touched.
    """
    expected = {p.folder_name for p in projects if p.has_repo}
    removed: list[str] = []
    for name in previously_managed:
        if name in expected:
            continue
        target = output / name
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            removed.append(name)
    return removed


def init_aggregate(repo_url: str, output: Path) -> None:
    """Ensure `output` is a clean clone of the aggregate repo, fast-forwarded."""
    git_dir = output / ".git"
    if git_dir.is_dir():
        # Existing clone. Pull the latest before we start placing projects so
        # we don't accidentally orphan changes someone else pushed.
        run_git(["fetch", "--all", "--prune"], cwd=output)
        code, _, err = run_git(["pull", "--ff-only"], cwd=output, check=False)
        if code != 0 and "Already up to date" not in err:
            # Diverged or local edits exist. Bail rather than silently overwrite.
            die(
                f"Cannot fast-forward {output} (output dir).\n"
                f"git output:\n{err.strip()}\n"
                "Resolve manually (commit/stash/reset), then re-run."
            )
        return

    if output.exists() and any(output.iterdir()):
        die(f"{output} exists and is not empty, but isn't a git repo. Move it aside or pick a different --output.")

    output.parent.mkdir(parents=True, exist_ok=True)
    run_git(["clone", repo_url, str(output)])


def commit_and_push(output: Path, push: bool) -> str:
    """Stage changes, commit if any, optionally push. Returns the action taken."""
    run_git(["add", "-A"], cwd=output)
    code, out, _ = run_git(["status", "--porcelain"], cwd=output, check=False)
    if not out.strip():
        return "no-changes"

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    run_git(["commit", "-m", f"Update section bundle ({timestamp})"], cwd=output)
    if not push:
        return "committed"

    # Try a plain push first; if upstream isn't set (fresh repo), use HEAD.
    code, _, err = run_git(["push"], cwd=output, check=False)
    if code != 0:
        run_git(["push", "-u", "origin", "HEAD"], cwd=output)
    return "pushed"


# ─── Per-project sync ──────────────────────────────────────────────────────────
def sync_project(p: Project, target: Path, dry_run: bool) -> tuple[str, str | None]:
    """Place a fresh snapshot of p's source tree at `target`.

    Returns (status, error). status:
      "synced" — folder was placed/refreshed
      "skipped-no-repo" — empty repo_url, nothing to do
      "skipped-dry" — dry run
      "error" — exception raised
    """
    if not p.has_repo:
        return "skipped-no-repo", None
    if dry_run:
        return "skipped-dry", None

    if p.is_local:
        return _sync_local(target)
    return _sync_remote(p, target)


def _sync_remote(p: Project, target: Path) -> tuple[str, str | None]:
    """Shallow-clone p.repo_url into target, then strip .git."""
    # Sibling temp dir avoids leaving target half-populated on failure.
    temp = target.with_name(f".{target.name}.syncing")
    for path in (temp, target):
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)

    args = ["clone", "--depth", "1"]
    if p.branch:
        args += ["--branch", p.branch]
    args += [p.repo_url, str(temp)]
    try:
        run_git(args)
    except RuntimeError as e:
        shutil.rmtree(temp, ignore_errors=True)
        return "error", str(e)

    # Strip .git so the aggregate stays single-rooted and viewable on github.com.
    git_dir = temp / ".git"
    if git_dir.exists():
        shutil.rmtree(git_dir, ignore_errors=True)

    target.parent.mkdir(parents=True, exist_ok=True)
    temp.rename(target)
    return "synced", None


def _sync_local(target: Path) -> tuple[str, str | None]:
    """Copy LOCAL_SOURCE into target, respecting its .gitignore if it's a git repo."""
    src = LOCAL_SOURCE.resolve()
    if not src.is_dir():
        return "error", f"LOCAL source not found: {src}"

    if target.exists():
        shutil.rmtree(target, ignore_errors=True)

    git_dir = src / ".git"
    if git_dir.is_dir():
        # Use git to enumerate files. Captures tracked + untracked-not-ignored,
        # which is exactly the working set the user expects to ship.
        try:
            _, out, _ = run_git(
                ["ls-files", "--cached", "--others", "--exclude-standard"],
                cwd=src,
                check=True,
            )
            files = [line.strip() for line in out.splitlines() if line.strip()]
            target.mkdir(parents=True, exist_ok=True)
            for rel in files:
                # Defensive: skip anything that resolves outside src (no symlink shenanigans).
                src_file = (src / rel).resolve()
                if src.resolve() not in src_file.parents and src_file != src:
                    continue
                if not src_file.is_file():
                    continue
                dst_file = target / rel
                dst_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_file, dst_file)
            return "synced", None
        except RuntimeError as e:
            return "error", str(e)

    # Non-git LOCAL source: hand-rolled ignore list as fallback.
    ignore = shutil.ignore_patterns(
        ".git", "node_modules", "venv", ".venv", "env",
        "__pycache__", ".pytest_cache", ".mypy_cache",
        ".next", "dist", "build", ".vite",
        ".idea", ".vscode", ".kiro", ".agents",
        "*.pyc", "*.pyo", "*.log",
        ".env", ".env.local", ".env.production",
        "*.pem", "*.key", "secret.py", "github token.txt",
    )
    try:
        shutil.copytree(src, target, ignore=ignore)
        return "synced", None
    except Exception as e:
        return "error", str(e)


# ─── Reports ───────────────────────────────────────────────────────────────────
def write_master_readme(projects: list[Project], output: Path, results: dict[str, tuple[str, str | None]]) -> None:
    sorted_projects = sorted(projects, key=lambda x: x.pair_label.lower())
    submitted = [p for p in sorted_projects if p.has_repo]
    pending = [p for p in sorted_projects if not p.has_repo]

    lines: list[str] = [
        "# Programming Language 3A2 Section Projects",
        "",
        f"Compiled on {datetime.now().strftime('%Y-%m-%d %H:%M')}.",
        f"{len(submitted)} of {len(projects)} pairs have a repository linked.",
        "",
        "Each pair has its own folder. Folders are plain snapshots of the team's",
        "repository at sync time, no nested git history.",
        "",
        "## Submitted",
        "",
    ]
    if not submitted:
        lines.append("_None yet._")
    else:
        for p in submitted:
            link = "_(local checkout)_" if p.is_local else f"[{p.repo_url}]({p.repo_url})"
            lines.append(f"### [{p.pair_label}](./{p.folder_name}/)")
            lines.append("")
            lines.append(f"- Source: {link}")
            if p.branch:
                lines.append(f"- Branch: `{p.branch}`")
            if p.notes:
                lines.append(f"- Notes: {p.notes}")
            lines.append("")

    if pending:
        lines.append("## Pending submission")
        lines.append("")
        for p in pending:
            note = f" ({p.notes})" if p.notes else ""
            lines.append(f"- {p.pair_label}{note}")
        lines.append("")

    (output / "README.md").write_text("\n".join(lines), encoding="utf-8")


def write_missing_report(projects: list[Project], output: Path) -> None:
    pending = [p for p in projects if not p.has_repo]
    target = output / "_MISSING.md"
    if not pending:
        if target.exists():
            target.unlink()
        return

    lines = [
        "# Pending submissions",
        "",
        f"As of {datetime.now().strftime('%Y-%m-%d %H:%M')}, these pairs have no repository link in `.compile-projects/projects.csv`.",
        "",
        "| Pair | Notes |",
        "|---|---|",
    ]
    for p in pending:
        lines.append(f"| {p.pair_label} | {p.notes or ''} |")
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ─── Main ──────────────────────────────────────────────────────────────────────
def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--repo", default=REPO_URL, help=f"Aggregate repo URL (default: {REPO_URL})")
    parser.add_argument("--output", default=None, help="Working folder (default: derived from --repo)")
    parser.add_argument("--no-push", action="store_true", help="Stage and commit only; don't push")
    parser.add_argument("--dry-run", action="store_true", help="Don't touch any files; show what would happen")
    args = parser.parse_args()

    csv_path = Path(args.csv).expanduser().resolve()
    output = Path(args.output).expanduser().resolve() if args.output else _derive_output(args.repo)

    print(f"Aggregate repo : {args.repo}")
    print(f"Working folder : {output}")
    print(f"CSV roster     : {csv_path}")
    if args.dry_run:
        print("(dry run: no clone, no copy, no commit, no push)")
    if args.no_push and not args.dry_run:
        print("(no-push: changes will be committed locally only)")
    print()

    projects = load_projects(csv_path)
    if not projects:
        die("No projects found in CSV.")

    if not args.dry_run:
        try:
            init_aggregate(args.repo, output)
        except RuntimeError as e:
            die(f"Failed to prepare aggregate repo:\n{e}")

    output.mkdir(parents=True, exist_ok=True)
    previously_managed = load_manifest(output) if not args.dry_run else set()
    results: dict[str, tuple[str, str | None]] = {}

    for p in projects:
        target = output / p.folder_name
        label = f"{p.pair_label:50s}"
        if not p.has_repo:
            print(f"  [skip ] {label} (no repo yet)")
            results[p.folder_name] = ("skipped-no-repo", None)
            continue

        status, err = sync_project(p, target, args.dry_run)
        results[p.folder_name] = (status, err)
        marker = {
            "synced": "[sync ]",
            "skipped-dry": "[dry  ]",
            "error": "[ERROR]",
        }.get(status, "[?    ]")
        source = "(local)" if p.is_local else p.repo_url
        print(f"  {marker} {label} {source}")
        if err:
            for line in err.splitlines():
                print(f"          {line}")

    print()
    if not args.dry_run:
        # Drop folders the script placed before but that no longer have a CSV row.
        # Folders you added manually are never in the manifest, so they survive.
        removed = prune_orphans(projects, output, previously_managed)
        for name in removed:
            print(f"  [prune] {name}")
        if removed:
            print()

        # Update manifest with the current set of script-managed folders.
        currently_managed = {p.folder_name for p in projects if p.has_repo and results.get(p.folder_name, ("", None))[0] == "synced"}
        # Keep folders that already exist on disk and were managed before, even if
        # this run skipped them (e.g. a teammate's repo briefly errored out).
        for name in previously_managed:
            if (output / name).is_dir() and name not in removed:
                currently_managed.add(name)
        write_manifest(output, currently_managed)

        write_master_readme(projects, output, results)
        write_missing_report(projects, output)
        print(f"Wrote {output / 'README.md'}")
        if (output / "_MISSING.md").exists():
            print(f"Wrote {output / '_MISSING.md'}")

        try:
            action = commit_and_push(output, push=not args.no_push)
        except RuntimeError as e:
            die(f"Commit/push failed:\n{e}")
        if action == "no-changes":
            print("\nNo changes to commit. Aggregate is already up to date.")
        elif action == "committed":
            print(f"\nCommitted locally (use `git push` from {output} to publish).")
        else:
            print(f"\nPushed to {args.repo}")

    errors = [k for k, (s, _) in results.items() if s == "error"]
    if errors:
        print(f"\nWARNING: {len(errors)} project(s) failed to sync. They are not in the bundle.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
