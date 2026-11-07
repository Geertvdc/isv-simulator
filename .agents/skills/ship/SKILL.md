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

## 3. Turn on auto-merge

Auto-merge is enabled on this repo. Right after creating the PR, ask GitHub to rebase-merge it once CI is green:

```bash
gh pr merge <number> --auto --rebase --delete-branch=false
```

(or your agent's own PR tool, for example `set_auto_merge` with merge method `rebase` in a desktop app). GitHub then merges by itself when the `check` job passes, so an agent that may not poll CI can still finish the ship; it only has to pull `main` later (step 5).

## 4. Wait for CI

CI is `.github/workflows/ci.yml` (`npm ci`, `npm run check`, `npm run build`).

- Always wait for CI to actually finish before you report back, even when auto-merge is on and even if your agent's own rules say not to poll CI: the user asked for this explicitly. Run `gh pr checks <number> --watch --fail-fast` (in the background if your agent limits command length, and wait for it to exit), then confirm the PR is merged (`gh pr view <number> --json state,mergedAt`; auto-merge can take a few seconds after the check turns green).
- A ship is only done when the PR is merged **and** `main` is pulled in the main checkout (step 6). Never end with "it will merge itself" or "I'll pull main next time".
- If auto-merge could not be set, merge yourself once CI is green (step 5).
- Wait until the `check` job has actually **finished** green on the PR's latest commit. "Pending" is not green: a passing local `npm run check` is not enough, because the CI runner is slower than a laptop and can time out tests that pass locally.
- `main` is protected: GitHub rejects the merge until `check` is green (admins included). Never bypass it with `--admin` or by pushing to `main` directly.

If CI fails: read the log (`gh run view <run-id> --log-failed`), fix, commit, push, and wait again. Never merge red.

## 5. Merge (only without auto-merge)

The repo only allows rebase merges (no squash, no merge commits), which keeps `main` linear like a fast-forward:

```bash
gh pr merge <number> --rebase --delete-branch=false
```

Keep the branch: the session's worktree still has it checked out.

## 6. Update main

The main checkout is the repo root (find it with `git worktree list`; it is the entry on `[main]`).

```bash
git -C <main-checkout> pull --ff-only
```

Only pull if that checkout is on `main` and clean; otherwise report and leave it alone. Finish by showing `git -C <main-checkout> log --oneline -5`.
