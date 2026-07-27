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
  if [[ "${PHASE18_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
    return 1
  fi
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

search_lines() {
  local pattern="$1"
  shift
  if has_rg; then
    rg -n --glob '*.js' -- "$pattern" "$@" || true
    return
  fi
  grep -R -nE --include='*.js' -- "$pattern" "$@" || true
}

REQUIRED_FILES=(
  "$ROOT/.gitignore"
  "$ROOT/config/agent-spawner.json"
  "$ROOT/config/mission-templates.json"
  "$ROOT/security/skill-registry.lock.json"
  "$ROOT/openclaw-bridge/core/mission-envelope-schema.js"
  "$ROOT/openclaw-bridge/core/agent-spawner.js"
  "$ROOT/openclaw-bridge/core/spawn-planner.js"
  "$ROOT/openclaw-bridge/core/spawn-orchestrator.js"
  "$ROOT/openclaw-bridge/core/skill-provider.js"
  "$ROOT/openclaw-bridge/core/skill-providers/openclaw-skill-provider.js"
  "$ROOT/openclaw-bridge/core/skill-providers/openai-skill-provider.js"
  "$ROOT/scripts/_research-runtime.js"
  "$ROOT/scripts/run-research-task.js"
  "$ROOT/scripts/verify-phase18-policy.sh"
  "$ROOT/tests/core/phase18-agent-spawner.test.js"
  "$ROOT/tests/core/phase18-skill-provider.test.js"
  "$ROOT/tests/core/phase18-runtime-compat.test.js"
  "$ROOT/tests/security/phase18-policy-gate.test.js"
  "$ROOT/docs/phase18-agent-spawner.md"
  "$ROOT/docs/supervisor-architecture.md"
  "$ROOT/audit/evidence/mission-orchestration/mission-sample.json"
  "$ROOT/audit/evidence/mission-orchestration/hash-manifest.json"
  "$ROOT/workspace/missions/.gitkeep"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 18 file: $file"
done

SCAN_TARGETS=(
  "$ROOT/scripts/_research-runtime.js"
  "$ROOT/scripts/run-research-task.js"
)

# Scan EVERY core module. Nothing is skipped wholesale — see NETWORK_EXEMPTIONS.
while IFS= read -r file; do
  SCAN_TARGETS+=("$file")
done < <(find "$ROOT/openclaw-bridge/core" -type f -name '*.js' | sort)

# `\bfetch\(` not `fetch\(`: the unanchored form false-matched `createToolPrefetch(`,
# which is why tool-prefetch.js used to need a blanket exclusion. The word boundary
# removes the false positive at the source, so that exclusion is gone.
#
# SHELL clause (widened 2026-07-27). It previously read `child_process\.exec|child_process\.spawn`,
# which matched LITERAL member access only and therefore detected NOTHING — every real caller
# imports destructured or aliased (`const { spawn: spawnChild } = …`, `const childProcess = …`),
# so the shell half of this policy had never once fired while four core modules spawned
# subprocesses. Now keyed on the require (capability, regardless of alias) AND on the dangerous
# call forms, so a module that switches from array-args spawn() to string-command exec() moves
# its pin and gets re-reviewed.
# Deliberately NOT matched: bare `.exec(`. In JS that is overwhelmingly RegExp.prototype.exec
# (e.g. citation-extractor.js:65 `regex.exec(text)`); matching it would be a false positive, and
# shell capability is already caught by the require.
#
# RAW SOCKETS (added 2026-07-27): node:net / node:dgram / node:tls were absent from the pattern
# entirely — a module could open a raw TCP/UDP socket and pass. Currently zero usages, so this
# is free hardening rather than a new exemption.
NETWORK_PATTERN='\bfetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|WebSocket|browser\.launch|playwright|puppeteer|selenium|docker run|require\(["'"'"'](node:)?child_process["'"'"']\)|require\(["'"'"'](node:)?(net|dgram|tls)["'"'"']\)|\bspawnSync\(|\bexecSync\(|\bexecFileSync\(|\bexecFile\(|\bspawn\(|\bfork\('

# --- Documented network exemptions (a RATCHET, not a hole) --------------------
# A blanket file skip lets an exempt file acquire ANY new network path unnoticed —
# that is exactly how llm-adapter.js sat unscanned. Each entry below is instead
# PINNED to the exact set of matching lines (trimmed, sorted, sha256), so the gate
# still fails if an exempt file GAINS a network path, and also fails if it LOSES
# one (a stale exemption must be removed rather than left widening the surface).
# The only way to broaden an exemption is a deliberate, reviewed edit to this list.
#
# Regenerate a pin with:
#   grep -hE "$NETWORK_PATTERN" <file> | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
#     | LC_ALL=C sort | shasum -a 256
#
# format: <path relative to ROOT>|<sha256 pin>|<why this is not an egress path>
# Shared safety property of every subprocess exemption below: each uses spawn / spawnSync /
# execFileSync with an ARGUMENT ARRAY and a constant binary — never exec() with a concatenated
# command string — so none carries a shell-injection surface. If one of them ever switches to a
# string-command form, that line changes and the pin fails.
NETWORK_EXEMPTIONS=(
  "openclaw-bridge/core/llm-adapter.js|2751bdc02d223b8a46799e663606fc961a05c582d20a4fb8c5f73e583a045f9a|Primary LLM lane: 4 fetch() calls to the Anthropic API, plus spawn of the Claude Code CLI (array args). Was a BLANKET skip before 2026-07-27, i.e. wholly unscanned; now pinned."
  "openclaw-bridge/core/https-client.js|d1f1af1cafd8dc1b75fed2d87d2397401435f0962f3734c70beeb3db1a0ea3b6|The engine's canonical HTTPS client. Banning node:https here would contradict the monorepo HTTPS-only invariant, which requires precisely this module to exist."
  "openclaw-bridge/core/prompt-guard.js|a3b51ffd8367695e44347a544ecef33644f8df34a25030c2d3b2d69770b9ae41|LLM Guard prompt-firewall: one https.request to the local guard endpoint, fail-open by design."
  "openclaw-bridge/core/scrape-sidecar-lifecycle.js|a7c0f7f2a02627c496787a078776bd2f9079a570ab0f61c8644848e0d0c9206a|Local scrape sidecar: loopback https.request health probe (rejectUnauthorized:true, mkcert CA) plus spawn(\"bash\", [START_SCRIPT]) where START_SCRIPT is a constant path. No egress; a no-op when the sidecar is absent."
  "openclaw-bridge/core/operator-approve-gate.js|2bbcc1cb6554da1222a3793109157bdba47152f930e1c36d840538e2cbe06de9|YubiKey operator-approval ceremony — itself a SECURITY control. execFileSync (never exec) of the gpg binary with array args, so no shell is involved."
  "openclaw-bridge/core/tls-diagnostic.js|26f3767b7d93a0d950e9e1931ef0900755be5b730f94878b07ebd0c368507760|TLS cert diagnostics: safeRun() wraps spawnSync(cmd, args) with array args and a 2s timeout, over constant mkcert paths. Read-only diagnostics, no network egress."
)

pin_for_file() {
  grep -hE "$NETWORK_PATTERN" "$1" 2>/dev/null \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | LC_ALL=C sort \
    | shasum -a 256 \
    | awk '{print $1}'
}

UNSAFE_NETWORK="$(search_lines "$NETWORK_PATTERN" "${SCAN_TARGETS[@]}")"

for entry in "${NETWORK_EXEMPTIONS[@]}"; do
  rel="${entry%%|*}"; rest="${entry#*|}"
  want="${rest%%|*}"; why="${rest#*|}"
  abs="$ROOT/$rel"

  # Absent from the tree under scan (e.g. the subset fixture in
  # tests/security/phase18-policy-gate.test.js): nothing to exempt, so skip. This
  # costs no strictness — if a file ever reappears at this path carrying network
  # code, its lines will not match the pin and the mismatch check below fails.
  [[ -f "$abs" ]] || continue

  if ! grep -qE "$NETWORK_PATTERN" "$abs" 2>/dev/null; then
    fail "Phase 18 network exemption is STALE: $rel no longer contains any network path. Remove its NETWORK_EXEMPTIONS entry so the exemption surface stays minimal."
  fi

  got="$(pin_for_file "$abs")"
  if [[ "$got" != "$want" ]]; then
    echo "Phase 18 exemption PIN MISMATCH — $rel" >&2
    echo "  expected pin: $want" >&2
    echo "  actual pin:   $got" >&2
    echo "  on record:    $why" >&2
    grep -nE "$NETWORK_PATTERN" "$abs" >&2 || true
    fail "The network-touching lines in $rel changed. Re-review them; update the pin ONLY if every line above is still a non-egress path."
  fi

  UNSAFE_NETWORK="$(printf '%s\n' "$UNSAFE_NETWORK" | grep -vF "$abs:" || true)"
done

UNSAFE_NETWORK="$(printf '%s\n' "$UNSAFE_NETWORK" | grep -v '^[[:space:]]*$' || true)"
if [[ -n "$UNSAFE_NETWORK" ]]; then
  echo "$UNSAFE_NETWORK" >&2
  fail "Phase 18 modules must remain free of direct network, browser, shell, or container execution paths"
fi

search_quiet 'executeOrchestratedTask' "$ROOT/openclaw-bridge/core/agent-engine.js" || fail "agent-engine missing orchestrated task wrapper"
search_quiet 'roleRouter\.dispatch' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must route work through role-router"
search_quiet 'Promise\.race' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must provide bounded concurrent dispatch scheduling"
search_quiet 'laneInflight' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must track lane bounded concurrency"
search_quiet 'PHASE18_MISSION_TIMEOUT' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must enforce mission runtime timeout guard"
search_quiet 'PHASE18_MISSION_STALLED' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must enforce mission stall detection guard"
search_quiet 'checkpoint_artifacts' "$ROOT/openclaw-bridge/core/spawn-orchestrator.js" || fail "spawn-orchestrator must emit checkpoint artifact metadata"
search_quiet 'validateTemplateStructure' "$ROOT/openclaw-bridge/core/spawn-planner.js" || fail "spawn-planner must validate template structure before planning"
search_quiet 'agentSpawner\.spawnMission' "$ROOT/scripts/run-research-task.js" || fail "run-research-task missing mission spawn path"
search_quiet 'resumeMission\(' "$ROOT/scripts/run-research-task.js" || fail "run-research-task missing mission resume path"
search_quiet 'supervisor_approved' "$ROOT/openclaw-bridge/core/agent-spawner.js" || fail "agent-spawner must persist supervisor_approved mission status"
search_quiet '^workspace/missions/\*$' "$ROOT/.gitignore" || fail "workspace/missions/* must be gitignored"
search_quiet '^!workspace/missions/\.gitkeep$' "$ROOT/.gitignore" || fail "workspace/missions/.gitkeep exception missing"
search_quiet 'Phase 18 runtime authority remains in-repo \(`supervisor-authority` \+ governance path\)\.' "$ROOT/docs/phase18-agent-spawner.md" || fail "Phase 18 doc must preserve in-repo runtime authority wording"
search_quiet 'mission runtime remains tool-agnostic and does not depend on Cline programmatically\.' "$ROOT/docs/phase18-agent-spawner.md" || fail "Phase 18 doc must preserve tool-agnostic runtime wording"
search_quiet 'canonical runtime supervisor/governance authority remains in-repo' "$ROOT/docs/supervisor-architecture.md" || fail "supervisor architecture must preserve in-repo runtime authority wording"
if search_quiet 'is the supervisor interface for this repository' "$ROOT/docs/supervisor-architecture.md"; then
  fail "supervisor architecture must not describe Cline as the embedded runtime supervisor interface"
fi

ROOT_DIR="$ROOT" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.ROOT_DIR;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

const spawnerConfig = readJson("config/agent-spawner.json");
const missionTemplates = readJson("config/mission-templates.json");
const skillLock = readJson("security/skill-registry.lock.json");
const allowedTaskTypes = new Set(["summarize", "extract", "analyze", "synthesize", "freeform"]);
const allowedInputStrategies = new Set(["mission_inputs", "mission_and_dependency_outputs", "dependency_outputs"]);

if (spawnerConfig.missionWorkspaceDir !== "workspace/missions") {
  fail("Phase 18 mission workspace dir must remain workspace/missions");
}
if (spawnerConfig.runtimeStatePath !== "state/runtime/state.json") {
  fail("Phase 18 runtime state path must remain state/runtime/state.json");
}
if (spawnerConfig.finalSynthesisMode !== "orchestrator_aggregation") {
  fail("Phase 18 final synthesis ownership must remain orchestrator_aggregation");
}
if (!spawnerConfig.missionExecution || typeof spawnerConfig.missionExecution !== "object") {
  fail("Phase 18 missionExecution config must exist");
}
if (!spawnerConfig.checkpointing || typeof spawnerConfig.checkpointing !== "object") {
  fail("Phase 18 checkpointing config must exist");
}
if (!spawnerConfig.laneScaling || typeof spawnerConfig.laneScaling !== "object") {
  fail("Phase 18 laneScaling config must exist");
}
for (const key of ["maxRuntimeMs", "defaultSubtaskTimeoutMs", "stallIntervalMs", "schedulerTickMs"]) {
  const value = Number(spawnerConfig.missionExecution[key]);
  if (!Number.isFinite(value) || value < 0) {
    fail(`Phase 18 missionExecution.${key} must be a non-negative number`);
  }
}
if (!spawnerConfig.skillConfig || spawnerConfig.skillConfig.hostedSkillsEnabled !== false) {
  fail("Hosted skill refs must remain disabled by default in config/agent-spawner.json");
}
if (skillLock.hostedSkillsEnabled !== false) {
  fail("Hosted skill refs must remain disabled by default in security/skill-registry.lock.json");
}

const templates = missionTemplates.templates || {};
for (const [templateId, template] of Object.entries(templates)) {
  if (template.safety_class === "external_action" && template.enabled !== false) {
    fail(`External action template '${templateId}' must remain disabled`);
  }
  if (template.enabled === true && !["research_only", "draft_artifact"].includes(template.safety_class)) {
    fail(`Enabled template '${templateId}' must be research_only or draft_artifact`);
  }
  const roles = Array.isArray(template.spawned_roles) ? template.spawned_roles : [];
  const steps = Array.isArray(template.steps) ? template.steps : [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] || {};
    if (!roles.includes(step.role)) {
      fail(`Template '${templateId}' step ${index + 1} uses undeclared role '${step.role || ""}'`);
    }
    if (!step.action_type || typeof step.action_type !== "string") {
      fail(`Template '${templateId}' step ${index + 1} must declare a non-empty action_type`);
    }
    if (!allowedTaskTypes.has(step.task_type)) {
      fail(`Template '${templateId}' step ${index + 1} uses unsupported task_type '${step.task_type || ""}'`);
    }
    if (!allowedInputStrategies.has(step.input_strategy)) {
      fail(`Template '${templateId}' step ${index + 1} uses unsupported input_strategy '${step.input_strategy || ""}'`);
    }
    const dependsOn = Array.isArray(step.depends_on) ? step.depends_on : [];
    for (const dependency of dependsOn) {
      if (!Number.isInteger(dependency) || dependency < 1 || dependency >= index + 1) {
        fail(`Template '${templateId}' step ${index + 1} has invalid dependency '${dependency}'`);
      }
    }
  }
}

if (spawnerConfig.enabled === true) {
  const llmSummaryPath = path.join(root, spawnerConfig.liveEvidence.llmSummaryPath);
  const mcpSummaryPath = path.join(root, spawnerConfig.liveEvidence.mcpSummaryPath);
  if (!fs.existsSync(llmSummaryPath) || !fs.existsSync(mcpSummaryPath)) {
    fail("Phase 18 cannot be enabled before live evidence summaries exist");
  }
  const llmSummary = JSON.parse(fs.readFileSync(llmSummaryPath, "utf8"));
  const mcpSummary = JSON.parse(fs.readFileSync(mcpSummaryPath, "utf8"));
  const llmSuccess = Array.isArray(llmSummary.results) && llmSummary.results.some((entry) => entry && entry.status === "success" && entry.provider !== "mock");
  const mcpSuccess = Array.isArray(mcpSummary.results) && mcpSummary.results.some((entry) => entry && entry.mcp_service_live && entry.mcp_service_live.status === "success");
  if (!llmSuccess) {
    fail("Phase 18 cannot be enabled before a non-mock live LLM success is recorded");
  }
  if (!mcpSuccess) {
    fail("Phase 18 cannot be enabled before a live MCP service-path success is recorded");
  }
}
NODE

echo "Phase 18 policy verification passed"
