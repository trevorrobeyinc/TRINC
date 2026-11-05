#!/usr/bin/env bash
#
# install-claude-agent-settings.sh — deploy the rules for Xcode's built-in Claude Agent.
#
# Xcode 27 runs its own copy of Claude Code with CLAUDE_CONFIG_DIR pointed at
#   ~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig
# so it never reads ~/.claude/settings.json and none of the Security Everything hooks reach it.
# This script copies the repo source ops/xcode/claude-agent-settings.json to
#   ~/Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig/settings.json
# (Claude Code's user-scope settings file for that config folder).
#
#   bash /Users/myhome/TRINC/ops/xcode/install-claude-agent-settings.sh            # dry run (default)
#   bash /Users/myhome/TRINC/ops/xcode/install-claude-agent-settings.sh --check    # exit 1 on drift
#   bash /Users/myhome/TRINC/ops/xcode/install-claude-agent-settings.sh --apply    # deploy
#
# What --apply does:
#   1. validates the source (JSON, ask-by-default mode, bypass mode disabled, a non-empty deny list)
#   2. refuses when Xcode's agent folder does not exist (enable Claude Agent in Xcode first)
#   3. backs the live copy up to ~/.claude/backups/xcode-agent/<UTC stamp>/settings.json
#   4. writes a REAL file (a symlink target is replaced, never followed), mode 0600, atomically
#   5. re-reads the deployed file and checks its sha256 against the source
#
# The repo is the only source (ops/tr-suite/manifest.json "deploy_model"). Edit the source,
# then re-run with --apply; ops/tr-suite/verify.sh reports drift. Xcode's agent picks the
# new rules up at its next conversation.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export REPO

exec /usr/bin/python3 -I - "$@" <<'PY'
import datetime, hashlib, json, os, sys, tempfile

repo = os.environ["REPO"]
home = os.path.expanduser("~")
src = os.path.join(repo, "ops/xcode/claude-agent-settings.json")
agent_dir = os.path.join(home, "Library/Developer/Xcode/CodingAssistant/ClaudeAgentConfig")
dest = os.path.join(agent_dir, "settings.json")
args = sys.argv[1:]
apply, check = "--apply" in args, "--check" in args
unknown = [a for a in args if a not in ("--apply", "--check")]
if unknown or (apply and check):
    print("usage: install-claude-agent-settings.sh [--apply | --check]")
    sys.exit(2)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def fail(msg):
    print(f"[FAIL] {msg}")
    sys.exit(1)

# 1. validate the source before anything else
try:
    raw = open(src, "rb").read()
    cfg = json.loads(raw)
except Exception as e:
    fail(f"source unreadable or not JSON: {src} ({e})")
perm = cfg.get("permissions") or {}
problems = []
if perm.get("defaultMode") != "default":
    problems.append("permissions.defaultMode must be 'default' (ask before acting)")
if perm.get("disableBypassPermissionsMode") != "disable":
    problems.append("permissions.disableBypassPermissionsMode must be 'disable'")
if perm.get("disableAutoMode") != "disable":
    problems.append("permissions.disableAutoMode must be 'disable' (no hooks back Xcode's agent up)")
if cfg.get("disableClaudeAiConnectors") is not True:
    problems.append("disableClaudeAiConnectors must be true (account connectors would load ungated)")
if cfg.get("syncClaudeAiPlugins") is not False:
    problems.append("syncClaudeAiPlugins must be false (a plugin can declare its own MCP servers)")
if not perm.get("deny"):
    problems.append("permissions.deny is empty")
if perm.get("allow"):
    problems.append("permissions.allow must stay absent: Xcode's agent asks for everything not denied")
if "hooks" in cfg:
    problems.append("hooks are a Security Everything decision (mcp-gates/XCODE-LANE.md §7), not set from TRINC")
if problems:
    fail("source rejected: " + "; ".join(problems))
src_sha = sha(raw)
print(f"source  {src}")
print(f"        sha256 {src_sha}  ({len(perm['deny'])} deny rules)")

# 2. the target folder is Xcode's to create
if not os.path.isdir(agent_dir):
    msg = f"{agent_dir} does not exist: enable Claude Agent in Xcode > Settings > Intelligence first"
    if apply or check:
        fail(msg)
    print(f"[WARN] {msg}")
    sys.exit(0)

state = "missing"
if os.path.islink(dest):
    state = f"SYMLINK -> {os.path.realpath(dest)} (will be replaced by a real file)"
elif os.path.isfile(dest):
    live_sha = sha(open(dest, "rb").read())
    state = "matches source" if live_sha == src_sha else f"DRIFTED (sha256 {live_sha})"
print(f"target  {dest}")
print(f"        {state}")

if check:
    sys.exit(0 if state == "matches source" else 1)
if not apply:
    print("\nDRY RUN: nothing on disk changed. Re-run with --apply to deploy." if state != "matches source"
          else "\nNothing to do.")
    sys.exit(0)
if state == "matches source":
    print("\nNothing to do: the deployed copy already matches the source.")
    sys.exit(0)

# 3. back up whatever is live (a symlink is recorded, not followed)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
backup_dir = os.path.join(home, ".claude/backups/xcode-agent", stamp)
if os.path.lexists(dest):
    os.makedirs(backup_dir, mode=0o700, exist_ok=True)
    if os.path.islink(dest):
        with open(os.path.join(backup_dir, "settings.json.symlink-target"), "w") as f:
            f.write(os.readlink(dest) + "\n")
    else:
        with open(dest, "rb") as f_in, open(os.path.join(backup_dir, "settings.json"), "wb") as f_out:
            f_out.write(f_in.read())
    print(f"backup  {backup_dir}")

# 4. atomic write of a real file, 0600
fd, tmp = tempfile.mkstemp(prefix=".settings.", dir=agent_dir)
try:
    with os.fdopen(fd, "wb") as f:
        f.write(raw)
    os.chmod(tmp, 0o600)
    os.replace(tmp, dest)
except Exception as e:
    if os.path.exists(tmp):
        os.unlink(tmp)
    fail(f"write failed: {e}")

# 5. verify
if os.path.islink(dest) or sha(open(dest, "rb").read()) != src_sha:
    fail("deployed file does not match the source after writing")
print(f"[PASS] deployed; sha256 {src_sha}, mode {oct(os.stat(dest).st_mode & 0o777)}")
print("Xcode's Claude Agent applies the rules from its next conversation.")
PY
