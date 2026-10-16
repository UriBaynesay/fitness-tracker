---
name: git-workflow
description: This project's git branching, merging, and push conventions. Use whenever starting feature/fix work, committing, merging to main, or pushing to GitHub in this repo.
---

# Git workflow

- Do all work for a feature or fix on its own branch — never commit directly to `main`.
- Branch off `main` with a descriptive name (e.g. `feature/x`, `fix/y`).
- Commits in this repo carry no `Co-Authored-By` trailer or other authorship/credit line — write plain commit messages.
- When the work on a branch is complete and verified, commit it.
- Before asking to merge, run `npm test` (needs the dev Postgres up: `docker compose up -d postgres`). All tests must pass — a failing or red suite blocks the merge request; fix the underlying issue rather than skipping or deleting tests to get past this gate.
- Ask for confirmation before merging into `main` — do not merge automatically.
- Once confirmed, merge with a regular merge commit (no squash) and delete the feature branch (local, and remote if it was pushed).
- After merging into `main`, push `main` to GitHub automatically — no separate confirmation needed for the push itself.
