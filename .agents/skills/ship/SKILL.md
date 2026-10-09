---
name: ship
description: Ship the current branch - open a PR, wait for CI to pass, rebase-merge it into main (fast-forward, linear history) and pull main in the main checkout. Use when the user says "ship it", "create a PR and merge it", "merge to main", or asks to finish a phase.
---

# Ship the current branch

Run these steps in order. Stop and report if any step fails; never force anything.

## 1. Pre-flight

- `git status` must be clean (commit leftover work first, or ask).
- `npm run check` must pass locally.
- If the branch is behind `origin/main`, bring it up to date first (`git fetch origin && git rebase origin/main`, or your agent's own sync tool if it has one), then re-run `npm run check`.

## 2. Create the PR

```bash
git push -u origin HEAD
gh pr create --base main --title "<Phase N: short title>" --body "<summary, tests, manual checks>"
```

- Title: for phase work use `Phase N: <name>` (matches earlier PRs).
- Body: what changed, how it was tested, which "Done when" boxes are ticked.

## 3. Wait for CI

CI is `.github/workflows/ci.yml` (`npm ci`, `npm run check`, `npm run build`).

- Default: `gh pr checks <number> --watch --fail-fast`.
- If your agent has its own PR/CI integration (for example a PR status tool in a desktop app) and its rules say not to poll CI, use that instead.
- Auto-merge is disabled on this repo, so you have to merge yourself once CI is green.

If CI fails: read the log (`gh run view <run-id> --log-failed`), fix, commit, push, and wait again. Never merge red.

## 4. Merge

The repo only allows rebase merges (no squash, no merge commits), which keeps `main` linear like a fast-forward:

```bash
gh pr merge <number> --rebase --delete-branch=false
```

Keep the branch: the session's worktree still has it checked out.

## 5. Update main

The main checkout is the repo root (find it with `git worktree list`; it is the entry on `[main]`).

```bash
git -C <main-checkout> pull --ff-only
```

Only pull if that checkout is on `main` and clean; otherwise report and leave it alone. Finish by showing `git -C <main-checkout> log --oneline -5`.
