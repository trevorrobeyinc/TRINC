#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SELF_DIR}/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "ERROR: --root requires a path argument" >&2; exit 1; }
      ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

fail() {
  echo "$1" >&2
  exit 1
}

has_rg() {
  command -v rg >/dev/null 2>&1
}

search_quiet() {
  local pattern="$1"
  local file_path="$2"
  if has_rg; then
    rg -q -- "$pattern" "$file_path"
    return
  fi
  grep -Eq -- "$pattern" "$file_path"
}

REQUIRED_FILES=(
  "$ROOT/README.md"
  "$ROOT/docs/phase-git-workflow.md"
  "$ROOT/scripts/start-phase-branch.sh"
  "$ROOT/scripts/setup-git-hooks.sh"
  "$ROOT/scripts/verify-phase-workflow-policy.sh"
  "$ROOT/.githooks/pre-commit"
  "$ROOT/.github/pull_request_template.md"
  "$ROOT/package.json"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing workflow guardrail file: $file"
done

if search_quiet 'minimum 1 approval' "$ROOT/README.md"; then
  fail "README must not claim minimum 1 approval for main"
fi

search_quiet 'docs/phase-git-workflow\.md' "$ROOT/README.md" || fail "README must link the phase Git workflow guide"
search_quiet 'pull request required' "$ROOT/README.md" || fail "README must keep pull request required wording"
search_quiet 'Do not commit directly to `main`' "$ROOT/README.md" || fail "README must document no direct commits to main"
search_quiet '[Ss]elf-approval is not required for your own work' "$ROOT/README.md" || fail "README must document no self-approval requirement for your own work"
search_quiet 'Auto-merge may be used after the required checks pass' "$ROOT/README.md" || fail "README must document auto-merge guidance"
search_quiet 'bash scripts/setup-git-hooks\.sh' "$ROOT/README.md" || fail "README must document local hook setup"

GUIDE="$ROOT/docs/phase-git-workflow.md"
search_quiet 'bash scripts/start-phase-branch\.sh --dry-run <phase-number> <phase-slug>' "$GUIDE" || fail "Workflow guide must document start-phase-branch dry run"
search_quiet 'bash scripts/start-phase-branch\.sh <phase-number> <phase-slug>' "$GUIDE" || fail "Workflow guide must document start-phase-branch real run"
search_quiet '\.ci/npm-cache' "$GUIDE" || fail "Workflow guide must explain .ci/npm-cache dirty-tree blockers"
search_quiet 'gh auth status' "$GUIDE" || fail "Workflow guide must document gh auth status"
search_quiet 'gh pr view --json number,url' "$GUIDE" || fail "Workflow guide must document gh pr view"
search_quiet 'inspect_pr_checks\.py --repo \. --pr <number-or-url> --json' "$GUIDE" || fail "Workflow guide must document gh-fix-ci inspector usage"
search_quiet 'policy-and-tests' "$GUIDE" || fail "Workflow guide must document policy-and-tests repro path"
search_quiet 'build:verify' "$GUIDE" || fail "Workflow guide must document deterministic-build-verify repro path"
search_quiet 'If there is no PR yet, open the PR first' "$GUIDE" || fail "Workflow guide must document the no-PR fallback"
search_quiet 'external provider' "$GUIDE" || fail "Workflow guide must document external-provider fallback"
search_quiet 'OPENCLAW_ALLOW_MAIN_COMMIT=1' "$GUIDE" || fail "Workflow guide must document the emergency bypass"

TEMPLATE="$ROOT/.github/pull_request_template.md"
search_quiet '^## Phase$' "$TEMPLATE" || fail "PR template must include Phase section"
search_quiet '^## Summary$' "$TEMPLATE" || fail "PR template must include Summary section"
search_quiet '^## Constraints Preserved$' "$TEMPLATE" || fail "PR template must include Constraints Preserved section"
search_quiet '^## Tests Run$' "$TEMPLATE" || fail "PR template must include Tests Run section"
search_quiet '^## Post-Merge Checklist$' "$TEMPLATE" || fail "PR template must include Post-Merge Checklist section"
search_quiet 'gh-fix-ci' "$TEMPLATE" || fail "PR template must document gh-fix-ci CI triage guidance"

HOOK="$ROOT/.githooks/pre-commit"
search_quiet 'OPENCLAW_ALLOW_MAIN_COMMIT=1' "$HOOK" || fail "Pre-commit hook must support OPENCLAW_ALLOW_MAIN_COMMIT=1"
search_quiet 'bash scripts/start-phase-branch\.sh <phase-number> <phase-slug>' "$HOOK" || fail "Pre-commit hook must point operators to start-phase-branch.sh"

ROOT_DIR="$ROOT" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.ROOT_DIR;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const phase2Gates = String(packageJson.scripts && packageJson.scripts["phase2:gates"] || "");

if (!phase2Gates.includes("verify-phase-workflow-policy.sh")) {
  fail("phase2:gates must execute verify-phase-workflow-policy.sh");
}
NODE

TMP_WORKTREE="$(mktemp -d)"
TMP_RUN_DIR="$(mktemp -d)"
cleanup() {
  git -C "$ROOT" worktree remove --force "$TMP_WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TMP_WORKTREE"
  rm -rf "$TMP_RUN_DIR"
}
trap cleanup EXIT

git -C "$ROOT" worktree add --quiet --detach "$TMP_WORKTREE" HEAD
cp "$ROOT/scripts/start-phase-branch.sh" "$TMP_RUN_DIR/start-phase-branch.sh"
chmod +x "$TMP_RUN_DIR/start-phase-branch.sh"
SHORT_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
RANDOM_SUFFIX="${RANDOM:-$$}"

(
  cd "$TMP_WORKTREE"
  START_PHASE_BRANCH_ROOT="$TMP_WORKTREE" bash "$TMP_RUN_DIR/start-phase-branch.sh" --dry-run 999 "workflow-policy-smoke-${SHORT_SHA}-${RANDOM_SUFFIX}" >/dev/null
)

echo "Phase-based Git workflow policy verification passed"
