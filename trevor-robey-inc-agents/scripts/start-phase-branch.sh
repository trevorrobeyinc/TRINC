#!/usr/bin/env bash
set -euo pipefail

ROOT="${START_PHASE_BRANCH_ROOT:-}"
if [[ -n "$ROOT" ]]; then
  ROOT="$(cd "$ROOT" && pwd)"
else
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/start-phase-branch.sh [--dry-run] <phase-number> <phase-slug>

Examples:
  bash scripts/start-phase-branch.sh --dry-run 25 credential-broker-session-governance
  bash scripts/start-phase-branch.sh 25 credential-broker-session-governance
EOF
}

fail() {
  echo "$1" >&2
  exit 1
}

print_next_steps() {
  local branch_name="$1"

  cat <<EOF
Next steps:
1. Push the branch:
   git push -u origin ${branch_name}
2. Open the PR into main:
   gh pr create --base main --head ${branch_name} --fill
3. Wait for the required checks:
   - trevor-robey-inc-agents-CI / policy-and-tests
   - trevor-robey-inc-agents-CI / deterministic-build-verify
4. If a GitHub Actions required check fails after the PR exists, triage it with:
   gh auth status
   gh pr view --json number,url
   python3 /Users/trevorrobey/.codex/skills/gh-fix-ci/scripts/inspect_pr_checks.py --repo . --pr <number-or-url> --json
EOF
}

DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

[[ $# -eq 2 ]] || {
  usage >&2
  exit 1
}

PHASE_NUMBER_RAW="$1"
PHASE_SLUG="$2"

[[ "$PHASE_NUMBER_RAW" =~ ^[0-9]+$ ]] || fail "Phase number must be digits only."
[[ "$PHASE_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "Phase slug must use lowercase letters, digits, and hyphens."

PHASE_NUMBER_PADDED="$(printf '%02d' "$((10#$PHASE_NUMBER_RAW))")"
BRANCH_NAME="codex/phase${PHASE_NUMBER_PADDED}-${PHASE_SLUG}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "This command must be run inside a Git worktree."
git remote get-url origin >/dev/null 2>&1 || fail "The Git remote 'origin' is required."

DIRTY_STATUS="$(git status --short --untracked-files=all)"
if [[ -n "$DIRTY_STATUS" ]]; then
  echo "Working tree is dirty. Resolve these entries before starting a new phase branch:" >&2
  echo "$DIRTY_STATUS" >&2
  if printf '%s\n' "$DIRTY_STATUS" | grep -q '\.ci/npm-cache'; then
    echo "Note: .ci/npm-cache artifacts count as dirty-tree blockers for phase branch creation." >&2
  fi
  fail "Phase branch creation requires a clean working tree."
fi

git fetch origin main --prune
git show-ref --verify --quiet refs/remotes/origin/main || fail "Remote tracking branch 'origin/main' is required."

HAS_LOCAL_MAIN=0
if git show-ref --verify --quiet refs/heads/main; then
  HAS_LOCAL_MAIN=1
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  fail "Local branch already exists: ${BRANCH_NAME}"
fi

if git ls-remote --exit-code --heads origin "${BRANCH_NAME}" >/dev/null 2>&1; then
  fail "Remote branch already exists: ${BRANCH_NAME}"
fi

if [[ "$HAS_LOCAL_MAIN" == "1" ]]; then
  if git merge-base --is-ancestor refs/heads/main refs/remotes/origin/main; then
    :
  elif git merge-base --is-ancestor refs/remotes/origin/main refs/heads/main; then
    :
  else
    fail "Local main and origin/main have diverged. Repair main before starting a new phase branch."
  fi
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run passed for ${BRANCH_NAME}"
  echo "To create the branch for real, rerun without --dry-run:"
  echo "  bash scripts/start-phase-branch.sh ${PHASE_NUMBER_RAW} ${PHASE_SLUG}"
  print_next_steps "$BRANCH_NAME"
  exit 0
fi

if [[ "$HAS_LOCAL_MAIN" == "1" ]]; then
  git switch main >/dev/null
  git pull --ff-only origin main
else
  git switch --create main --track origin/main >/dev/null
fi

git switch -c "$BRANCH_NAME" >/dev/null

echo "Created branch ${BRANCH_NAME}"
print_next_steps "$BRANCH_NAME"
