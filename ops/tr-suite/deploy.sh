#!/usr/bin/env bash
#
# deploy.sh — the ONE production deploy path for every TR-suite Obsidian plugin.
# Reads ops/tr-suite/manifest.json; copies each plugin's "deploy_files" (and
# "extra_deploy") from its repo source into "$VAULT/.obsidian/plugins/<id>/".
#
#   bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh <id>... | --all     # dry run (default)
#   bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --build --apply <id>
#
# Flags:
#   --apply   actually copy (without it, nothing on disk changes)
#   --build   run the plugin's `npm run build` first (only for sources with a build script)
#   --all     every plugin in the registry that is not external and not "deployed": false
#
# What --apply does, per plugin:
#   1. refuses a target that holds a .git (a dev repo is not a deploy target)
#   2. backs the live deploy files up to ~/.claude/backups/tr-suite/<UTC stamp>/<id>/
#   3. a target that is a SYMLINK is replaced by a real folder (its data.json carried over)
#   4. copies only the registry's deploy files — data.json (plugin settings) is never written
#   5. re-reads every copied file and checks its sha256 against the source
#
# Every protected plugin (copilot, command-center, trinc-viz-studio, obsidian-bridge-launcher,
# vault-zettelkasten, contextual-wiki-definitions, ...) raises a CRITICAL obsidianwatch
# `protected_plugin_changed` after a real change. That is expected; clearing it is the
# operator's baseline decision (commands are printed at the end). Batch fixes into one deploy.
#
# Env overrides: VAULT (default "$HOME/My Digital Garden").

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export REPO
export VAULT="${VAULT:-$HOME/My Digital Garden}"
export PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"

exec python3 - "$@" <<'PY'
import datetime, hashlib, json, os, shutil, subprocess, sys

repo, vault = os.environ["REPO"], os.environ["VAULT"]
home = os.path.expanduser("~")
args = sys.argv[1:]
apply, build, want_all = "--apply" in args, "--build" in args, "--all" in args
ids = [a for a in args if not a.startswith("--")]

m = json.load(open(os.path.join(repo, "ops/tr-suite/manifest.json")))
plugins = {p["id"]: p for p in m["obsidian_plugins"]}
plugins_dir = os.path.join(vault, ".obsidian/plugins")

def sha(p):
    with open(p, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()

def deployable(p):
    return "external" not in p and p.get("deployed") is not False

if want_all:
    ids = [i for i, p in plugins.items() if deployable(p)]
if not ids:
    print("usage: deploy.sh [--apply] [--build] <plugin-id>... | --all")
    print("known ids: " + ", ".join(i for i, p in plugins.items() if deployable(p)))
    sys.exit(2)
if not os.path.isdir(plugins_dir):
    sys.exit(f"vault plugins dir not reachable: {plugins_dir}")

stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
backup_root = os.path.join(home, ".claude/backups/tr-suite", stamp)
mode = "APPLY" if apply else "DRY RUN (nothing on disk changes; add --apply)"
print(f"== deploy.sh — {mode}")
errors, changed = 0, []

for pid in ids:
    p = plugins.get(pid)
    if p is None:
        print(f"[FAIL] {pid}: not in ops/tr-suite/manifest.json"); errors += 1; continue
    if not deployable(p):
        print(f"[SKIP] {pid}: " + ("external by design" if "external" in p else 'registry says "deployed": false — install deliberately, then flip that flag'))
        continue
    src = os.path.join(repo, p["source"])
    dep = os.path.join(plugins_dir, pid)
    print(f"-- {pid}  ({p['source']} -> {dep})")

    if build and os.path.isfile(os.path.join(src, "package.json")):
        scripts = json.load(open(os.path.join(src, "package.json"))).get("scripts", {})
        if "build" in scripts:
            print(f"   build: npm run build")
            r = subprocess.run(["npm", "--prefix", src, "run", "build"], capture_output=True, text=True)
            if r.returncode != 0:
                print(f"[FAIL] {pid}: build failed\n{r.stderr[-1500:]}"); errors += 1; continue

    pairs = [(os.path.join(src, f), f) for f in p["deploy_files"]]
    pairs += [(os.path.join(repo, x["from"]), x["to"]) for x in p.get("extra_deploy", [])]
    missing = [rel for a, rel in pairs if not os.path.isfile(a)]
    if missing:
        print(f"[FAIL] {pid}: source missing {missing} (build first, or pass --build)"); errors += 1; continue

    if os.path.isdir(os.path.join(dep, ".git")):
        print(f"[FAIL] {pid}: target holds a dev .git — move it out first; history belongs in the monorepo"); errors += 1; continue
    is_link = os.path.islink(dep)
    todo = [(a, rel) for a, rel in pairs if is_link or not os.path.isfile(os.path.join(dep, rel)) or sha(a) != sha(os.path.join(dep, rel))]
    if is_link:
        print(f"   target is a SYMLINK to {os.path.realpath(dep)} — will become a real folder")
    if not todo:
        print(f"[PASS] {pid}: already identical to source"); continue
    for a, rel in todo:
        print(f"   {'copy' if apply else 'would copy'} {rel}  ({os.path.getsize(a):,} bytes, sha {sha(a)[:12]})")
    if not apply:
        changed.append(pid); continue

    # 2. back up whatever is live now
    bdir = os.path.join(backup_root, pid)
    os.makedirs(bdir, exist_ok=True)
    for _, rel in pairs + [(None, "data.json")]:
        live = os.path.join(dep, rel)
        if os.path.isfile(live):
            shutil.copy2(live, os.path.join(bdir, rel))
    # 3. a symlinked target becomes a real folder; settings travel with it
    if is_link:
        data = os.path.join(dep, "data.json")
        keep = open(data, "rb").read() if os.path.isfile(data) else None
        os.unlink(dep)
        os.makedirs(dep)
        if keep is not None:
            with open(data, "wb") as f:
                f.write(keep)
            os.chmod(data, 0o600)
    else:
        os.makedirs(dep, exist_ok=True)
    # 4 + 5. copy, then prove it
    bad = []
    for a, rel in todo:
        out = os.path.join(dep, rel)
        shutil.copyfile(a, out)
        os.chmod(out, 0o644)
        if sha(out) != sha(a):
            bad.append(rel)
    if bad:
        print(f"[FAIL] {pid}: sha256 mismatch after copy: {bad} — backup at {bdir}"); errors += 1
    else:
        print(f"[DONE] {pid}: {len(todo)} file(s) deployed and verified; backup at {bdir}")
        changed.append(pid)

if changed and apply:
    print("\nNext (operator):")
    print("  reload each plugin in Obsidian, e.g.:  obsidian plugin:reload id=<id>")
    print('  then review obsidianwatch:  /usr/bin/python3 -B "$HOME/Security Everything/obsidianwatch/obsidianwatch.py" --status')
    print('  and bless the new baseline (Obsidian must be open):  ... --bless   then   ... --bless --confirm')
elif changed:
    print(f"\n{len(changed)} plugin(s) would change: {', '.join(changed)}. Re-run with --apply to deploy.")
sys.exit(1 if errors else 0)
PY
