# Phase-Based Git Workflow

This repository keeps `main` stable and production-ready by doing all feature work on one phase branch at a time.

## Ground Rules
- Never commit directly to `main`.
- Use one branch per phase, named `codex/phaseNN-slug`.
- Keep working on the existing phase branch until that phase is merged; do not start a second branch for the same phase.
- Merge phase PRs into `main` with merge commits to preserve the existing project history pattern.
- Use required CI checks plus auto-merge; self-approval is not required for your own work unless explicitly needed.

## Start A New Phase
1. Make sure the previous phase PR is merged into `main`.
2. Make sure your working tree is clean:
   - tracked changes count as dirty
   - untracked files count as dirty
   - `.ci/npm-cache` artifacts count as dirty until removed or committed intentionally
3. Run a non-mutating preflight if you want to confirm the branch name and repo state first:

```bash
bash scripts/start-phase-branch.sh --dry-run <phase-number> <phase-slug>
```

4. Create the actual branch only after the dry run passes:

```bash
bash scripts/start-phase-branch.sh <phase-number> <phase-slug>
```

Example:

```bash
bash scripts/start-phase-branch.sh 25 credential-broker-session-governance
```

The starter script will:
- fail if the tree is dirty
- fetch `origin`
- fast-forward local `main` with `git pull --ff-only`
- reject reused local or remote `codex/phaseNN-slug` names
- create the new branch and print the exact next steps

## Open The PR
After the branch exists, push it and open a PR to `main`:

```bash
git push -u origin codex/phaseNN-slug
gh pr create --base main --head codex/phaseNN-slug --fill
```

Keep all work, fixes, and follow-up commits on that phase branch until the PR is merged.

## If Required CI Fails
`gh-fix-ci` is an operator triage workflow for GitHub Actions failures. It is not part of CI itself.

1. Verify GitHub CLI auth:

```bash
gh auth status
```

2. Resolve the current branch PR:

```bash
gh pr view --json number,url
```

If there is no PR yet, open the PR first and wait for checks to run before using `gh-fix-ci`.

3. For failing GitHub Actions required checks, use the installed `gh-fix-ci` inspector first:

```bash
python3 /Users/trevorrobey/.codex/skills/gh-fix-ci/scripts/inspect_pr_checks.py --repo . --pr <number-or-url> --json
```

4. Use the failure summary to choose the smallest local reproduction path:
- `trevor-robey-inc-agents-CI / policy-and-tests`: start with `npm run phase2:gates`
- `trevor-robey-inc-agents-CI / deterministic-build-verify`: start with `npm run build:verify`
- If the failing logs identify a narrower phase verifier, use that narrower command before rerunning the full gate

5. If `gh` auth is missing or Actions log access fails, re-authenticate with the needed GitHub CLI scopes and retry.

6. If the failing provider is an external provider or the log is unavailable, report the details URL and fall back to local repro commands plus manual log inspection.

## Local `main` Commit Guard
To enable the local hook for this clone:

```bash
bash scripts/setup-git-hooks.sh
```

Once enabled, commits on `main` are blocked locally unless you explicitly bypass the guard with:

```bash
OPENCLAW_ALLOW_MAIN_COMMIT=1 git commit ...
```

Use that bypass only for true emergencies.

## Merge And Continue
After the required checks pass:
1. Merge the phase PR into `main`.
2. Sync local `main`:

```bash
git switch main
git pull --ff-only origin main
```

3. Start the next phase with the starter script and repeat the loop.
