#!/usr/bin/env bash
#
# verify.sh — checks that every TR-suite component in ops/tr-suite/manifest.json
# is wired to this monorepo: source present, deployed build == source build,
# MCP registrations resolve, no nested repos, no secrets tracked.
#
# Read-only. Safe to run any time, from any directory:
#   bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
#
# Env overrides: VAULT (default "$HOME/My Digital Garden").
# Exit 0 = no FAIL (WARN/SKIP allowed), 1 = at least one FAIL.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export REPO
export VAULT="${VAULT:-$HOME/My Digital Garden}"

exec python3 - "$@" <<'PY'
import hashlib, json, os, re, subprocess, sys

repo = os.environ["REPO"]
vault = os.environ["VAULT"]
home = os.path.expanduser("~")
fails = warns = 0

def say(level, msg):
    global fails, warns
    if level == "FAIL": fails += 1
    if level == "WARN": warns += 1
    print(f"[{level}] {msg}")

def expand(p):
    return p.replace("$HOME", home).replace("${HOME}", home).replace("$VAULT", vault)

def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def git(*args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)

CANON_REPO = "/Users/myhome/TRINC"
on_mac = sys.platform == "darwin"
m = json.load(open(os.path.join(repo, "ops/tr-suite/manifest.json")))
plugins_dir = os.path.join(vault, ".obsidian/plugins")
vault_ok = os.path.isdir(plugins_dir)
if not vault_ok:
    say("SKIP", f"vault plugins dir not reachable ({plugins_dir}); deploy-drift checks skipped")

print("== Obsidian plugins")
for p in m["obsidian_plugins"]:
    pid = p["id"]
    if "external" in p:
        loc = expand(p["external"])
        say("PASS" if os.path.isdir(loc) else "WARN", f"{pid}: external by design at {loc}")
        continue
    src = os.path.join(repo, p["source"])
    if not os.path.isdir(src):
        hint = p.get("external_until_absorbed")
        say("WARN" if hint else "FAIL", f"{pid}: source missing at {p['source']}" + (f" (still at {expand(hint)})" if hint else ""))
        continue
    try:
        mid = json.load(open(os.path.join(src, "manifest.json")))["id"]
        say("PASS" if mid == pid else "FAIL", f"{pid}: manifest id = {mid}")
    except Exception as e:
        say("FAIL", f"{pid}: unreadable manifest.json ({e})")
    if not vault_ok or p.get("deployed") is False:
        continue
    dep = os.path.join(plugins_dir, pid)
    if not os.path.exists(dep):
        say("WARN", f"{pid}: not installed in vault")
        continue
    # Production deploy model (manifest.json "deploy_model"): a deploy target is a real copy,
    # or at most a link back INTO this repo. A link anywhere else is a second source of truth.
    if os.path.islink(dep) and not os.path.realpath(dep).startswith(os.path.realpath(repo) + os.sep):
        say("FAIL", f"{pid}: vault entry is a symlink OUTSIDE the repo ({os.path.realpath(dep)}) — redeploy from source")
    if os.path.isdir(os.path.join(dep, ".git")):
        say("FAIL", f"{pid}: deploy target holds a dev .git — history belongs in the monorepo")
    build = os.path.join(src, p["build"])
    live = os.path.join(dep, p["build"])
    if not os.path.isfile(build):
        say("WARN", f"{pid}: no local build at {p['source']}/{p['build']} (run npm run build)")
    elif os.path.realpath(build) == os.path.realpath(live):
        say("PASS", f"{pid}: vault entry links to repo source")
    elif os.path.isfile(live) and sha(build) == sha(live):
        say("PASS", f"{pid}: deployed build matches source build")
    else:
        say("FAIL", f"{pid}: deployed build DRIFTED from source — redeploy")
    for f in p.get("deploy_files", []):
        if f == p["build"]:
            continue
        a, b = os.path.join(src, f), os.path.join(dep, f)
        if os.path.isfile(a) and os.path.isfile(b) and sha(a) != sha(b):
            say("FAIL", f"{pid}: deployed {f} DRIFTED from source — redeploy")
    for x in p.get("extra_deploy", []):
        a, b = os.path.join(repo, x["from"]), os.path.join(dep, x["to"])
        if os.path.isfile(a) and os.path.isfile(b):
            say("PASS" if sha(a) == sha(b) else "FAIL", f"{pid}: {x['to']} {'matches' if sha(a) == sha(b) else 'DRIFTED from'} {x['from']}")

print("== Bridges")
for b in m["bridges"]:
    src = os.path.join(repo, b["source"])
    ok = os.path.isdir(src) and (not b.get("entry") or os.path.isfile(os.path.join(src, b["entry"])))
    say("PASS" if ok else "FAIL", f"{b['id']}: {b['source']}")
    for lo in b.get("local_only", []):
        r = git("check-ignore", "-q", os.path.join(b["source"], lo))
        say("PASS" if r.returncode == 0 else "FAIL", f"{b['id']}: {lo} is git-ignored")

print("== Bridge browser guard")
# The :8798, :8799 and :8800 bridges refuse browser-originated requests before auth with one helper,
# kept as three byte-identical copies (each bridge is its own deployable). Added 2026-10-24.
guards = [
    "Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/browserGuard.ts",
    "Claude/obsidian-command-center/src/bridge/browser-guard.ts",
    "Claude/obsidian-viz-studio/src/bridge/browser-guard.ts",
]
missing = [g for g in guards if not os.path.isfile(os.path.join(repo, g))]
for g in missing:
    say("FAIL", f"browser guard missing: {g}")
if not missing:
    same = len({sha(os.path.join(repo, g)) for g in guards}) == 1
    say("PASS" if same else "FAIL",
        "browser guard copies are byte-identical" if same else "browser guard copies DIFFER — keep the three in step")
for path_, port in [
    ("Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpCommon.ts", ":8798"),
    ("Claude/obsidian-command-center/src/bridge/mcp-bridge-server.ts", ":8799"),
    ("Claude/obsidian-viz-studio/src/bridge/bridge-server.ts", ":8800"),
]:
    full = os.path.join(repo, path_)
    text = open(full).read() if os.path.isfile(full) else ""
    wired = "refuseBrowserRequest(req.headers" in text and "Access-Control-Allow-Origin" not in text
    say("PASS" if wired else "FAIL", f"{port} bridge runs the browser guard and sends no CORS headers")

print("== MCP registrations")
for cfg in [".mcp.json", "Copilot-Everything/.mcp.json"]:
    try:
        servers = json.load(open(os.path.join(repo, cfg)))["mcpServers"]
    except Exception as e:
        say("FAIL", f"{cfg}: unreadable ({e})"); continue
    for name, s in servers.items():
        paths = [s.get("command", "")] + [a for a in s.get("args", []) if a.startswith(("/", "$"))]
        for raw in paths:
            if raw.startswith(CANON_REPO + "/"):
                rel = raw[len(CANON_REPO) + 1:]
                say("PASS" if os.path.exists(os.path.join(repo, rel)) else "FAIL", f"{cfg}:{name}: <repo>/{rel}")
                continue
            if not on_mac:
                say("SKIP", f"{cfg}:{name}: {raw} (machine path; run on the Mac)"); continue
            pth = expand(raw)
            if pth.startswith("/"):
                say("PASS" if os.path.exists(pth) else "FAIL", f"{cfg}:{name}: {pth}")

print("== MCP server sources and staged copies")
for s in m["mcp_servers"]:
    if "external" in s:
        say("PASS" if os.path.exists(expand(s["external"])) else "WARN", f"{s['id']}: external by design at {expand(s['external'])}")
        continue
    src = os.path.join(repo, s["source"])
    say("PASS" if os.path.isdir(src) else "FAIL", f"{s['id']}: source at {s['source']}")
    if "staged_copy" not in s or not os.path.isdir(src):
        continue
    staged = expand(s["staged_copy"])
    if not os.path.isdir(staged):
        say("WARN" if not on_mac else "FAIL", f"{s['id']}: staged copy missing at {staged} (run {s.get('install', 'the installer')})")
        continue
    if os.path.isdir(os.path.join(staged, ".git")):
        say("FAIL", f"{s['id']}: staged copy holds a dev .git — history belongs in the monorepo")
    drift = []
    for d, _, files in os.walk(os.path.join(src, "src")):
        for fn in files:
            a = os.path.join(d, fn)
            b = os.path.join(staged, os.path.relpath(a, src))
            if not os.path.isfile(b) or sha(a) != sha(b):
                drift.append(os.path.relpath(a, src))
    say("FAIL" if drift else "PASS",
        f"{s['id']}: staged src/ " + (f"DRIFTED ({', '.join(drift[:5])}) — re-run {s.get('install')}" if drift else "matches repo source"))

print("== Raycast")
rc = m["raycast"]
rc_base = expand(rc["external"]) if "external" in rc else repo
ext = os.path.normpath(os.path.join(rc_base, rc["extension"]["source"]))
say("PASS" if os.path.isfile(os.path.join(ext, "package.json")) else "FAIL", f"raycast extension source: {ext}")
tpl = os.path.join(rc_base, rc["ai_providers"]["template"])
if os.path.isfile(tpl):
    t = open(tpl).read()
    say("PASS" if "PASTE_COPILOT_PLUS_LICENSE_KEY_HERE" in t else "FAIL", "providers template carries a placeholder, not a key")
live = expand(rc["ai_providers"]["live"])
if os.path.isfile(live):
    mode = oct(os.stat(live).st_mode & 0o777)
    say("PASS" if mode == "0o600" else "WARN", f"live providers.yaml mode {mode} (want 0o600)")
    strip = lambda s: re.sub(r"(?m)^#.*\n", "", re.sub(r"(copilot-plus:)\s*\S+$", r"\1 X", s, flags=re.M))
    if os.path.isfile(tpl):
        say("PASS" if strip(open(live).read()) == strip(t) else "WARN", "live providers.yaml matches the repo template (apart from the key)")

print("== Xcode")
# Added 2026-11-05 (ops/xcode/README.md). Xcode's built-in Claude Agent runs its own Claude Code with its
# own config folder, so ~/.claude and every Security Everything hook stay out of its reach: the deployed
# rules file and the empty MCP registrations below are what stands in for them.
import plistlib
xc = m.get("xcode")
if not xc:
    say("FAIL", "manifest.json has no xcode entry")
else:
    say("PASS" if os.path.isfile(os.path.join(repo, xc["project"], "project.pbxproj")) else "FAIL",
        f"Xcode project: {xc['project']}")
    say("PASS" if os.path.isfile(os.path.join(repo, xc["package"], "Package.swift")) else "FAIL",
        f"Swift package: {xc['package']}")
    ent = os.path.join(repo, xc["entitlements_macos"])
    if os.path.isfile(ent):
        e = plistlib.load(open(ent, "rb"))
        net = sorted(k for k in e if k.startswith("com.apple.security.network."))
        say("FAIL" if net else "PASS",
            f"buyer app requests network access ({', '.join(net)}): it must stay offline" if net
            else "buyer app requests no network entitlement")
        say("PASS" if e.get("com.apple.security.app-sandbox") is True else "FAIL", "buyer app runs in the App Sandbox")
    else:
        say("FAIL", f"entitlements missing: {xc['entitlements_macos']}")
    a = xc["agent_settings"]
    src, dep = os.path.join(repo, a["source"]), expand(a["deploy_target"])
    if not os.path.isfile(src):
        say("FAIL", f"Xcode agent rules source missing: {a['source']}")
    elif not on_mac:
        say("SKIP", "Xcode agent rules deploy check (run on the Mac)")
    elif not os.path.isdir(os.path.dirname(dep)):
        say("WARN", f"Xcode's Claude Agent is not set up ({os.path.dirname(dep)} absent); nothing to protect yet")
    elif os.path.islink(dep):
        say("FAIL", f"Xcode agent rules are a symlink ({os.path.realpath(dep)}); run {a['install']}")
    elif not os.path.isfile(dep):
        say("FAIL", f"Xcode's Claude Agent runs WITHOUT the TRINC rules; run {a['install']}")
    else:
        same = sha(src) == sha(dep)
        say("PASS" if same else "FAIL", "Xcode agent rules match ops/xcode source" if same
            else f"Xcode agent rules DRIFTED from source; run {a['install']}")
    if on_mac:
        for reg in xc["agent_mcp_registrations"]:
            p = expand(reg)
            if not os.path.isfile(p):
                say("SKIP", f"{reg}: absent")
                continue
            try:
                d = json.load(open(p))
            except Exception as ex:
                say("WARN", f"{reg}: unreadable ({ex})")
                continue
            names = list((d.get("mcpServers") or {}).keys())
            for proj_path, v in (d.get("projects") or {}).items():
                names += [f"{n} (project {proj_path})" for n in ((v or {}).get("mcpServers") or {})]
            say("FAIL" if names else "PASS",
                f"{os.path.basename(p)}: MCP server(s) added for Xcode's agents, outside every gate: {', '.join(names)}"
                if names else f"{os.path.basename(p)}: no MCP servers registered for Xcode's agents")
        prefs = expand(xc["xcode_prefs"])
        if os.path.isfile(prefs):
            try:
                unsafe = plistlib.load(open(prefs, "rb")).get("IDEAllowUnauthenticatedAgents")
            except Exception:
                unsafe = None
            say("WARN" if unsafe else "PASS",
                "Xcode lets ANY local agent drive its tools without approval (IDEAllowUnauthenticatedAgents): "
                "turn the unsafe all-agents mode off in Xcode > Settings > Intelligence > Model Context Protocol"
                if unsafe else "Xcode's unsafe all-agents mode is off")

print("== Repo hygiene")
nested = [d for d, subs, _ in os.walk(repo) if ".git" in subs and d != repo
          and "/node_modules" not in d and "/vendor/" not in d + "/"]
for d in nested:
    say("FAIL", f"nested git repo: {os.path.relpath(d, repo)}")
if not nested:
    say("PASS", "no nested git repos outside vendor/")
tracked = git("ls-files").stdout.splitlines()
bad = [f for f in tracked if re.search(r"(^|/)(\.env(\.local)?|providers\.yaml|.*\.pem|.*\.key|obsidian-cli-mcp\.local\.json)$", f)]
for f in bad:
    say("FAIL", f"secret-shaped file is tracked: {f}")
if not bad:
    say("PASS", "no secret-shaped files tracked")
r = git("check-ignore", "-q", "Copilot-Everything/CLAUDE.md")
say("PASS" if r.returncode != 0 else "FAIL", "Copilot-Everything is tracked by the monorepo (not ignored)")

print(f"\n{fails} FAIL, {warns} WARN")
sys.exit(1 if fails else 0)
PY
