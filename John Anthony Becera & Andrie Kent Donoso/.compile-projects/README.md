# Compile section projects

One Python script that takes a CSV roster and pushes every project as an isolated folder inside the aggregate GitHub repo. Re-runnable, idempotent, no manual cloning.

**Aggregate repo**: https://github.com/Inosuke-py/ProgrammingLanguage3A2

## What you get on github.com

```
ProgrammingLanguage3A2/
├── README.md             (master index, generated, alphabetical, with status)
├── _MISSING.md           (chase list, generated, only when projects are pending)
├── Kino/                 (snapshot of your local Kino, no .git, no node_modules)
├── Some-Other-Project/   (snapshot of teammate's repo at sync time)
├── Yet-Another/
└── ...
```

Each project folder is a flat snapshot of the team's repository at sync time. `.git` directories are stripped so the aggregate is single-rooted and browsable on github.com without nested submodule headaches.

## Setup (once)

### 1. Fill the roster

Open `projects.csv` next to this README. One row per pair. Columns:

| Column | What goes here |
|---|---|
| `student_a` | First pair member's full name. Becomes part of the folder name. |
| `student_b` | Second pair member's full name. Blank if solo. |
| `repo_url` | GitHub/GitLab clone URL. Blank if not yet submitted. Use `LOCAL` for the entry that copies your local working tree. |
| `branch` | Optional. Override default branch. |
| `notes` | Optional. Free-form note that lands in the master README. |

The folder name in the aggregate is `<student_a> & <student_b>` (or just `<student_a>` for solo projects). Spaces and `&` are kept; only Windows-forbidden characters get stripped. Paste straight from a Google Sheet if you keep the roster there.

### 2. Make sure your git can push the aggregate

If `git push` to `Inosuke-py/ProgrammingLanguage3A2` works from any clone on this machine, the script will work. If you haven't pushed there before, do it once manually so credentials get cached.

## Run

From the Kino folder:

```powershell
python .compile-projects/compile.py
```

That single command:

1. Clones (or pulls) `ProgrammingLanguage3A2` into `D:/School Activities/Programming Languages/ProgrammingLanguage3A2/`.
2. For every row with a `repo_url`: shallow-clones the source, strips `.git`, places the contents inside the aggregate as `<Project-Title>/`.
3. For the `LOCAL` row: copies the Kino working tree (respecting `.gitignore`).
4. Regenerates `README.md` and `_MISSING.md` inside the aggregate.
5. `git add -A`, commits with a timestamp, pushes to GitHub.

### Variants

```powershell
# Preview without cloning, copying, committing, or pushing
python .compile-projects/compile.py --dry-run

# Stop short of pushing, so you can review locally first
python .compile-projects/compile.py --no-push

# Use a different aggregate repo
python .compile-projects/compile.py --repo https://github.com/you/other-repo.git

# Use a different roster CSV
python .compile-projects/compile.py --csv "D:/somewhere/roster.csv"
```

## When to re-run

- A student finally submits their repo: paste the URL into the CSV, run the script. New folder appears in the aggregate, commit and push happen automatically.
- A team pushes new commits: re-run, that project's folder gets refreshed with the latest snapshot.
- You changed your local Kino: re-run, the LOCAL copy refreshes.

Re-running with no real changes is a no-op: `git status` shows clean, the script reports "no changes to commit" and exits.

## Things to know

- **Re-runs are safe**: existing project folders get fully replaced with the latest snapshot, so removed files in the source repo also disappear from the aggregate. No drift.
- **Diverged aggregate**: if the aggregate has commits the local clone doesn't, the script refuses to fast-forward and asks you to resolve manually. It won't silently overwrite work.
- **Private source repos**: cloning uses your local git credentials. If a teammate's private repo can't be reached, the script reports the error, skips that project, and continues with the rest.
- **`LOCAL` source respects `.gitignore`**: tracked files plus untracked-not-ignored files are copied. Your `.env`, `node_modules`, `venv`, `secret.py`, etc. stay out of the aggregate (they're already gitignored in Kino).
- **First run is slow**, especially with many repos. Subsequent runs only re-fetch what changed.
- **Shallow clones** (`--depth 1`) keep the script fast and disk usage low. The aggregate doesn't carry source repo history, just the latest snapshot.

## What lives where

| Path | Purpose |
|---|---|
| `Kino/.compile-projects/compile.py` | The script. Lives inside Kino so it's version-controlled with your work. |
| `Kino/.compile-projects/projects.csv` | The roster. Edit this. |
| `Kino/.compile-projects/README.md` | This file. |
| `Programming Languages/ProgrammingLanguage3A2/` | The clone of the aggregate repo. Auto-managed. Don't hand-edit; re-runs will overwrite. |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot fast-forward` | Someone pushed to the aggregate while you had local commits | `cd ../ProgrammingLanguage3A2 && git pull --rebase`, then re-run |
| `Authentication failed` on a teammate's clone | Their repo is private and your git isn't logged in for it | Either ask them to make it public, or `gh auth login` and retry |
| `No changes to commit` | Re-run and nothing actually changed since the last sync | Working as designed, exit cleanly |
| Bundle missing a project that's in the CSV | Sync errored for that project | Check the script's output, fix the issue (URL typo? branch missing?), re-run |
