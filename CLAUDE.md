# TRINC — rules for agents working in this repo

> **Renamed 2026-10-23** from `TrevClaw-Obsidianodus` (TRINC = Trevor Robey Intelligence Network
> Citations). The old-path compatibility symlink `/Users/myhome/TrevClaw-Obsidianodus` was **removed on
> 2026-11-12**, after the Raycast fork's bridge-config path (`~/Code/raycast-obsidian-bridge-fork`) was
> repointed to `/Users/myhome/TRINC` and rebuilt. If something still names the old path (the Desktop
> folder preset "TrevClaw-Obsidianodus", a Raycast MCP entry), repoint it in that app rather than
> recreating the symlink. The Falcon Custom-IOA exfiltration rule that matched `.*TrevClaw-Obsidianodus.*`
> (rule 25, disabled, Detect-only) was deleted on 2026-11-12, and no live Falcon rule names the old path
> (record: Security Everything's browser-session log, 2026-11-12). Runtime names that still say
> `trevclaw` are kept on purpose, because launchd units, watchers and a secret depend on them:
> `~/.local/share/trevclaw-tls-proxies/`, `~/Library/Logs/trevclaw/audit.jsonl` with `TREVCLAW_AUDIT_LOG`
> and the `trevclaw_audit` event kind, and `~/.config/trevclaw/brevilabs-key`. Do not rename them.
> **This file holds current facts only** (slimmed 2026-10-23);
> dated history lives in [`docs/history/`](docs/history/), and the full previous text is
> `git show 2077e79:CLAUDE.md`.

The monorepo for **Trevor Robey, INC.**: the citation-traced research engine, the business canon, and the
Obsidian tooling that runs them. Plain-language story: [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md). Verified
technical record: [`ARCHITECTURE.md`](ARCHITECTURE.md). Where the business stands:
[`STATUS.md`](STATUS.md). Folder map: [`README.md`](README.md). **Live config beats prose**, this file
included: check `Trevor Robey Intelligence Network Citations/config/role-provider-map.json` and the code
before asserting how the engine behaves.

## Read first

- **The continuity board** — [`_continuity/CONTINUITY.md`](_continuity/CONTINUITY.md). Read **Current
  focus** and the top few **Log** entries at session start; prepend one Log entry on meaningful progress
  or handoff. It is business-scoped: infra work gets one brief entry with a `SCOPE NOTE`, and Current
  focus stays untouched unless the business focus changed. Protocol and write-safety:
  [`_continuity/README.md`](_continuity/README.md). Four Claude surfaces share it: CLI Claude Code, Desktop
  Claude Code, Cowork, and Claude Chat (Desktop), which reaches this repo through a Filesystem connector
  (roots `/Users/myhome`, `/Volumes/ExtraCurricular`; its writes to the external volume have hung before,
  so probe first).
- **Business memory goes to `perseus-business`** (`mcp__perseus-business__*`, declared in this repo's
  [`.mcp.json`](.mcp.json), its own key, DB outside the repo). The global `perseus-vault` is machine-wide
  and is **not** business memory; never write business facts there. Neither replaces the board: the
  board is the chronological story, a vault is a similarity-ranked fact store.
- **Plugin bindings** — the installed Claude plugins are templates full of `~~category` placeholders.
  [`PLUGIN-BINDINGS.md`](Trevor%20Robey%20Intelligence%20Network%20Citations/PLUGIN-BINDINGS.md) and
  `config/plugin-bindings.json` say which real tool fills each one. **An unbound category means say so;
  never invent a substitute** (no CRM, no analytics, no ticket tracker exists here). Hardest cases:
  `sales:forecast` / `pipeline-review` (pre-revenue, no CRM), `marketing:performance-report` /
  `seo-audit`, `product-management:metrics-review`. Check with `node scripts/audit-connector-coverage.js`
  from the engine folder; its plugin section must show zero ⚠.

## Hosting, pushes and backups

- `origin` = `ssh://git@ssh.github.com:443/trevorrobeyinc/TRINC.git`, **private** (confirmed: the
  unauthenticated API answers 404 while an authenticated push succeeds).
- **Pushes are the operator's, in a real terminal:** `git -C /Users/myhome/TRINC push origin main`. The
  only GitHub key is a PIN-protected YubiKey FIDO2 `ecdsa-sk` resident key, and an agent's Bash tool is not
  a TTY, so ssh cannot ask for the PIN and reports the misleading `Permission denied (publickey)`.
  **Never conclude "key not registered" from that message**: run `ssh -vvv` and look for
  `Server accepts key`. Port 443 because outbound 22 is blocked; `core.sshCommand` pins the sk-capable
  `/opt/homebrew/bin/ssh` (`/usr/bin/ssh` has no FIDO provider).
- **Backups:** one verified `git bundle --all` in `~/Documents/` plus a byte-identical copy in
  `/Volumes/ExtraCurricular/Backups/`; the offsite leg is the unpacked, `.git`-less copy in the business
  Drive at `My Drive/TRINC/Monorepo/` (with `TRINC/Backups/{README-RESTORE.md,SHA256SUMS.txt}`). The
  bundle itself never goes to cloud storage. Cut a fresh one after any substantial batch of commits with
  `bash /Users/myhome/TRINC/scripts/trinc-backup.sh --prune` (rewritten 2026-11-05: it writes both copies,
  verifies, compares them byte for byte, and moves superseded bundles to the Trash; the Drive snapshot and
  this line stay manual). A bundle carries no gitignored files.
  **Current (2026-11-16):** `TRINC-FULL-backup-20261116-0229.bundle`, HEAD `0132d36`, sha256 `03d70f8f…9567`
  (79,779,964 bytes), "records a complete history", 25 refs, byte-identical in both places. The 11-06 pair
  (`…-20261106-0042`, HEAD `bd9abf2`) is in the Trash. **Drive:** `TRINC/Monorepo/` is the one snapshot, of the
  same commit `0132d36` (3,226 files + 4 symlinks, exported with `git archive` into a new folder; compared entry
  by entry with the commit, content by SHA-256, 138 executable bits and symlink targets, with 0 differences;
  every file accepted by Google before the `bd9abf2` snapshot was trashed with one `mv`), and
  `Backups/README-RESTORE.md` + `SHA256SUMS.txt` were rewritten as new files naming the new bundle. Prove
  acceptance on NEW files: a file rewritten in place can upload and still lack Google's item id locally
  (`stillPending:xattrs`). The Drive's `TRINC/` also holds `Skills-Integrations/trinc-local/`, the offsite copy
  of `~/.claude/local-plugins/` (the nine `trinc-*` plugins live outside the repo, so no bundle covers them;
  refreshed by hand after skill changes, last on 2026-11-16), `Plans/`, the strategy and development plan as a
  Google Doc built from `STATUS.md` and `OFFERINGS.md` on 2026-11-06 (the repo wins), and `NotebookLM/`, the
  operator's self-teaching manual for NotebookLM (seven Word chapters plus `Source-documents/`, Word copies of
  six canon files; written from `c4db018` on 2026-11-16). **Refresh `NotebookLM/` in place**, overwriting each
  file at its own path: NotebookLM binds a source to one Drive file, so a trashed-and-recreated file leaves a
  dead source in the operator's notebook. Keep one bundle version only (two copies of it):
  superseded bundles go to the Trash once the new one is verified and mirrored. A superseded Drive snapshot is
  trashed from the mount with ONE literal `mv <folder> ~/.Trash/<unique name>`. DriveFS's database then shows
  the folder `trashed=1` from a single client operation, as one trash item. Never `rm -rf`, which trashes file
  by file.
- **One repo.** Do not split it back into sub-repos. The only submodule is
  `Trevor Robey Intelligence Network Citations/vendor/tooluniverse`; vendor anything else with an
  `UPSTREAM.md` instead of adding a submodule.

## Repo map

| Path | What it is | Its own rules |
|---|---|---|
| `Trevor Robey Intelligence Network Citations/` | The engine and the business canon, in one folder | its `CLAUDE.md` |
| `Claude/` | Obsidian plugins and MCP servers built here | its `CLAUDE.md` |
| `Copilot-Everything/` | Vendored Copilot fork, the `:8798` bridge, the stdio adapter, the TLS proxies | its `CLAUDE.md` |
| `Xcode/` | Xcode project "Trevor Robey Intelligence Network Citations": the offline buyer app `TRINCReader` and its `TRINCKit` package (added 2026-11-05) | its `CLAUDE.md` |
| `ops/` | `tr-suite/` (registry, `verify.sh`, `deploy.sh`), `xcode/` (the buyer app's Xcode decision record) and the 2026-10 reorg record | — |
| `docs/history/` | Retired and dated documents | — |

Each workspace's `CLAUDE.md` is authoritative for its own domain. **The `:8798` bridge is the canonical
vault access point; do not create another vault bridge** (new client needs are met by an adapter profile,
below). Session artifacts (exploration reports, scratch scripts, snapshots) go in a gitignored `.archive/`
folder, never a workspace root. The vendored fork
(`Copilot-Everything/repos/obsidian-copilot-mcp-v4/`, upstream 4.0.0 + the MCP module) pins its manifest to
`99.4.0`, above any plausible upstream; a pin **equal** to upstream let Obsidian overwrite the fork on
2026-08-12.

**Plugin IDs are frozen**: `command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
`trinc-viz-studio`, `contextual-wiki-definitions`. Copilot's `mcp_command-center_*` / `mcp_viz-studio_*`
tool ids and server ids, the 0600 token paths, cross-plugin api lookups and the folders under
`.obsidian/plugins/` all key on them. Display names (the "TR-Obsidian Intelligence Network Citations"
suite) may change.

## Ports

Coordinated here; do not reassign one without updating this table.

| Port | Service | Owner |
|---|---|---|
| 8798 | Canonical vault bridge (HTTPS) | `obsidian-bridge-launcher` plugin (child process) |
| 27124 | Obsidian Local REST API (the vault engine under `:8798`) | Local REST API plugin |
| 8799 | Command Center bridge (HTTPS) | `command-center` plugin |
| 8800 | Viz Studio bridge (HTTPS) | `trinc-viz-studio` plugin |
| 8801 | Security Bridge (HTTPS) | `trinc-security-bridge` plugin (source in `~/Security Everything`) |
| 8743 → 8742 | Miyo semantic search: HTTPS proxy → plaintext upstream | launchd `com.trevorrobey.miyo-tls-proxy` / Miyo.app |
| 6433 → 6333 | Qdrant: HTTPS proxy → plaintext upstream | launchd `com.trevorrobey.qdrant-tls-proxy` / Miyo's child |
| 8891 → 8890 | SearXNG: HTTPS proxy → plaintext upstream | launchd `com.trevorrobey.searxng-tls-proxy` / `com.trevorrobey.searxng` |
| 4096 | `opencode serve` of the Copilot agent (password-locked by the operator) | Copilot plugin |

All four Obsidian bridges die when Obsidian quits, so vault tools answer "not running" while it is
closed. Only the HTTPS proxy should ever reach a plaintext upstream. `:1234` (LM Studio) is gone and stays
in the transport lint's forbidden list, as does `:11434`.

## Claude's one door, and everyone else's

- **Claude reaches Obsidian through one door**: the stdio adapter
  (`Copilot-Everything/bridges/obsidian-stdio-adapter/`) with profile `openclaw`, registered in
  `.mcp.json` as **`openclaw-obsidian`** (v0.5.0, 27 tools). On `:8799`: run dispatch, status, results,
  history, artifacts, cancel, citation integrity, delivery evidence, memory search, engine health, a
  restricted publish, and read-only `obsidian_search_notes` / `obsidian_read_note`. On `:8800`: the 12
  `viz_*` renders, with `folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote` and
  `overwrite` stripped and refused, so renders land only in `Visualizations/`. No create, append or command
  execution. It never loads the `:8798` token. Runbook: the `openclaw-dispatch` skill. Regression guard:
  `npm run test:profiles` in the adapter.
- **Keep the server key `openclaw-obsidian`**: the Security Everything gate hook matches that prefix (it bars
  sub-agents from the whole door, and bars run/cancel/publish during Ralph loops). A new or renamed MCP
  server is ungated until the hook knows it, so wire the gate before registering anything new. A session
  sees new tools only after it restarts.
- **A real run** needs the operator's freshly armed one-shot token (`operator-approved-gate arm openclaw`);
  `dry_run: true` proves the door without spending it. `status.post_run_done` is the only reliable
  "everything finished" signal. Never re-send `run_workflow` after a timeout; check status.
- **Raycast has no door (retired 2026-11-21, operator decision).** The adapter's `raycast` profile,
  `raycast-launch.sh` and Command Center's Raycast dispatch are gone, and both video workflows run from the
  Copilot agent: the `copilot-video-download` skill downloads a link, then `video_pipeline_run` takes the
  file or folder. Do not add a Raycast door, a video tool on the adapter or a deeplink dispatch back.
  **Copilot** calls `:8798`, `:8799` and `:8800` itself, and its agent mode reaches the bridges through
  `bridges/openclaw-stdio-proxy`. That is its door, not Claude's. The adapter's `claude` profile was
  retired 2026-10-23; the profile variable is required, and `openclaw` is its only value.
- **Aggregate at the client edge, never by merging daemons.** Each bridge stays owned by its own plugin,
  with its own lifecycle, token and port. Merging them was declined on 2026-08-20 and again on 2026-10-23,
  as was "one plugin owns one port". Also declined, do not re-propose without new evidence: a TTL cache for
  the per-call token read, and a homegrown rotating log file in the adapter.
- **Xcode (2026-11-05, `ops/xcode/README.md`).**
  - **The Xcode lane is TRINC's alone** (operator, 2026-11-05: "entirely for TRINC and not security everything").
    Claude Code builds `Xcode/` from its shell (`xcodebuild`, `swift test`), and a session started in
    `/Users/myhome/TRINC` can also drive Xcode through `xcode`: registered at local scope for this folder only (in
    `~/.claude.json`, never `.mcp.json`, so Xcode's built-in agent cannot see it) and started by Security Everything's
    gated launcher. Open it with `operator-approved-gate arm xcode` (touch), allow the connection once in Xcode, and
    `close xcode` after. Read, build and test tools only (25); no sub-agents. Security Everything sessions cannot load
    an Xcode server: `~/.claude/settings.json` rejects `xcode` from every `.mcp.json`.
  - The Xcode setup's security side lives in `~/Security Everything/xcode-agent/` (moved 2026-11-05; security stays
    out of this repo). That covers the rules for Xcode's built-in Claude Agent and its checks. Two couplings remain:
    - a new server in either `.mcp.json` must also go into that agent's rules there, and its checker FAILs until it does;
    - this repo's machine-local `.claude/settings.local.json` keeps `enableAllProjectMcpServers` false.
- **There is no channel from Claude into the Copilot agent, on purpose**: `:4096` is password-locked, ACP
  stdio belongs to the Obsidian renderer, and the `:8801` bridge has no text-carrying operation. If one is
  ever built, the route chosen is a schema-validated vault inbox, never `:4096`.
- **opencode.** The Claude → opencode free-model delegation lane was **retired 2026-10-23**; do not
  re-register it. `~/.config/opencode/` stays: it is the Copilot agent's opencode configuration (the fork
  sets `OPENCODE_CONFIG_CONTENT` but no separate config folder, so opencode also loads the global one).

## Obsidian pipeline lifecycle

Which parts work with Obsidian **closed** (headless or terminal runs) and which need it **open**.

| Touchpoint | Obsidian closed? | Owner | Depends on |
|---|---|---|---|
| Engine run (`run-workflow.js`) | ✅ headless | engine | YubiKey `operator-approve` for a non-mock run |
| Run notes into `OpenClaw/<template>/<date> <inputs>/` | ✅ headless, completed + citation-PASS + non-mock only; never a `--customer-run` | engine (`workflow-vault-publisher.js`) | vault folder allow-listed in `config/vault-publish.json` |
| Deliverables copied into the run folder | ✅ with the note write | engine | the sealed bundle |
| `Graph Analysis.md` (deterministic) | ✅ in-process | engine | `Claude/Medical-Zettelkasten-MCP` |
| Prior-research read-back (`obsidian_prior_research`) | ✅ via Miyo `:8743` | engine adapter | Miyo running; context only, never evidence |
| Full-text read-back fallback | ❌ | `:8798` → `:27124` | Local REST API plugin |
| Research-memory ingest and priors | ✅ (`researchMemory.enabled`) | engine → pack store CLI | Qdrant `:6433`; embedder offline, a cache miss fails loudly |
| Chat bubble (`research_notify`) | ❌ | Command Center | `:8798` |
| Miyo indexing of new notes | ✅ | Miyo's own watcher | Miyo running |
| Zettelkasten linking | ❌, with a catch-up sweep on load | Command Center + `vault-zettelkasten` | hosted `copilot-plus-flash` |
| Backfill of runs finished while closed | ✅ `scripts/publish-workflow-to-vault.js --all` | engine CLI | idempotent on `workflow_id` |
| Claude's door (`openclaw-obsidian`) | ❌ (tools answer `obsidian_not_running`) | adapter + Command Center + Viz Studio | operator's token for a real run |
| Viz Studio renders | ❌, on request only | `trinc-viz-studio` | no run produces visuals automatically |
| Business-context note refresh | ✅ `scripts/render-business-context.js --apply`, **operator-run only** | engine script | `--check` is the drift tripwire |
| Scheduled workflows (Phase 31) | disabled, not deployed | — | — |

One writer per vault write and one folder scheme: the plugin never rewrites a run the engine already wrote
(it checks `artifacts.vault_notes`). Failed, UNVERIFIED and mock runs never reach the vault. Read-back and
memory priors are `context_only` and never count as citations.

## The engine, in brief

The deep dive is `Trevor Robey Intelligence Network Citations/CLAUDE.md`.

- **Run:** `node scripts/run-workflow.js --template <id> --inputs '<json>' --operator-approve --confirm`.
  `--operator-approve` is YubiKey-gated (`operator-approve-gate arm`, one-shot, 300 s). The runner has no
  `--provider` flag and the role map pins the research roles to `claude-code`, so every workflow run is real;
  the ungated mock lane is `run-research-task.js --provider mock`, which never reaches the citation gate.
  From Claude Code, prefer the door: a plugin-dispatched run also gets the post-run chain.
  **A paying client's run is the exception (2026-11-06):** CLI only, with `--customer-run`, so no prior-run
  context goes in and nothing is published or ingested out. Deliver it with `scripts/build-buyer-zip.js`.
- **100% Claude:** scout, analyst and synthesizer on `claude-opus-4-8`, everything else on
  `claude-sonnet-4-6`, every fallback empty. Ollama is not an engine provider.
- **Ten templates** (seven biomedical, three business with `research_profile: business`), one pipeline:
  research → quality check → dataset → package → approve → export. The business lane has **zero live
  runs**; its five tiers are priced in `OFFERINGS.md` (approved 2026-10-23), and booking opens only after
  the first live business run passes the gate.
- **Citation integrity** is the product: every cited id must have been retrieved during the run (floor
  0.75, fail-closed), cited works are retraction-screened (Crossref + PubMed), and every cited PMID, PMCID,
  NCT, ISRCTN, EudraCT and DOI (and PubChem, UniProt and ChEMBL id), with every NCT number the graveyard
  memo and the design benchmark list, is re-resolved against its registry when the report is assembled
  (any UNRESOLVED blocks; 2026-11-16, Tier 2a). Ground truth for copy is
  `SYSTEM-REALITY.md` → "GAP CLOSED"; **never soften this to "grounding only"**.
- **Bundles** also ship deterministic `citation-integrity.md`, `graveyard-memo.md`, `search-coverage.md`
  and the reproducibility manifest. The graveyard memo's amendment-risk band reads "Not available" while
  ClinicalTrials.gov refuses the history endpoint (HTTP 403 since 2026-10-08).
- **Engine role calls are isolated** from the operator's setup (`--strict-mcp-config`,
  `--setting-sources ""`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`); re-probe after a Claude CLI upgrade.

## Business identity and customer-facing copy

- **Entity:** Trevor Robey Intelligence Network Citations LLC, a California LLC (filed 2026-05-06,
  approved 2026-06-18, **CA SOS Entity No. B20260217250**). Filing record:
  `Trevor Robey Intelligence Network Citations/00-business-formation/llc/certificate-of-formation.md`.
- **Wordmark:** "Trevor Robey, INC.", where INC = Intelligence Network Citations, a backronym, not a
  corporate suffix. Customer-facing material carries: *"Trevor Robey, INC. is the wordmark of Trevor Robey
  Intelligence Network Citations LLC, a California limited liability company."* (Cal. Corp. Code
  §17701.08(e) bars "Inc." in an LLC's name; Cal. Bus. & Prof. Code §17910.5(a) is why the disclosure is
  required.) Domain `trevorobeyinc.com`, contact `trevor@trevorobeyinc.com`, slug `trevor-robey-inc`.
- **Tagline:** *Every citation, checked. Every risk, named. In days, not weeks.* **Elevator** (canonical,
  `OFFERINGS.md:5`): *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five
  days. Every cited paper and trial checked twice, against the evidence retrieved and at its registry,
  with retractions screened and anything unconfirmed flagged. Audit trail included.* Both chosen by the
  operator on 2026-11-15. "Zero hallucinations" (retired 2026-07-13) and "Every claim, sourced." (false
  as worded: no sentence-level support check exists) must not come back.
- **Prices and offers come only from `OFFERINGS.md`.** Never compute, round or invent one.
- **Engine credit:** "Powered by OpenClaw", the open-source agent framework, not a brand the operator owns.
  The homebrew `openclaw.ai` consumer assistant is unrelated.
- **Posture:** research artifacts only, not clinical decision support; no PHI; no autonomous publishing,
  posting, logging in or purchasing. Full disclaimers in `NOTICE.md`.
- **Never shipped:** Qwen2.5-7B-Instruct, OpenBioLLM-Llama3-8B, any downloaded model weights.
- **AWS seller account `833390816446`** is reached through IAM Identity Center SSO with a YubiKey. The AWS
  API MCP server is `ReadOnlyAccess` and cannot change anything; consequential seller work is the
  operator's, with explicit per-action approval
  (`03-platforms/aws-data-exchange/account-access.md`).

## Security

Security work goes through the global `security-orchestration` skill, with CrowdStrike Falcon as one
coordinated unit and the offline docs at `~/Security Everything/crowdstrike-docs/` first.

- **Read-only recon first, then strict propose-only:** every console-changing Falcon action needs an
  explicitly typed, per-item authorization. "Go" never authorizes a mutation.
- **Never weaken Falcon Custom-IOA rule 1.** Infra security only; no PHI anywhere.
- Restricting the plaintext loopback upstreams to the proxy's UID is **closed as unbuildable** (everything
  runs as UID 501 and pf skips `lo0`); the compensating control is the Monitor-only Falcon group
  "Mac - Loopback Upstream Watch". Do not re-propose pf/UID vehicles.
- **Bridges refuse browser traffic before auth** (2026-10-24; ARCHITECTURE.md §5 "Browser guard"). Never
  add CORS headers back to `:8798`/`:8799`/`:8800`, and never make a bridge client a page-level `fetch`.
  Never refuse on `Sec-Fetch-Mode`/`-Dest` either: Node's `fetch` sends `sec-fetch-mode: cors`, and
  Obsidian's `requestUrl` (Copilot) may send `Sec-Fetch-Site: none`. The three guard copies must stay
  byte-identical (`verify.sh` checks). Merging the bridges onto one port to "shrink the attack surface" was
  assessed the same day and gains nothing: they are loopback-only and token-gated.

### Argv hygiene

Falcon rules match the command line, and with `zsh -c` a heredoc body is part of it, so writing *about*
a forbidden pattern looks the same as running it (a doc write was killed for exactly this on 2026-08-14).
The fix is always on the writer's side; never weaken or exclude a Falcon rule.

- File contents go through the Write/Edit tools, never a Bash heredoc, `echo` or `printf`.
- Commit messages go through `git commit -F <file>` (written with Write), never inline `-m`.
- Search patterns that quote trigger tokens go in `grep -f <patternfile>`.
- Anything a watcher must say goes through stdin, never argv.
- On a collision, fix the caller; never add an exclusion for `git`, `zsh` or an agent binary.

## HTTPS-only invariant (non-negotiable)

Every TCP listener owned by code in this repo is **HTTPS**, with no plaintext fallback of any kind: no
env-var escape hatch, no "try TLS then degrade", no `tls ? https : http` ternary, no silent `null` on a
certificate read. **When a certificate or key fails to load, fix the configuration** (regenerate the mkcert
pair, fix env propagation or paths); the code must throw a useful error and refuse to listen.

- **Forbidden shapes** (caught by `scripts/lint-transport-monorepo.sh`): `http.createServer(` binding a TCP
  host:port (Unix sockets and named pipes are exempt via its `LEGITIMATE_NON_TCP` list), any
  `*_TLS_DISABLE` check, TLS-or-plaintext ternaries, `if (!tls) return null`.
- **Copy this pattern** for a new listener:
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts` (throws without TLS,
  reads the mkcert pair, asserts `instanceof https.Server`).
- **Guards:** `npm run lint:transport` in `Copilot-Everything/bridges/obsidian-copilot-bridge` and
  `Claude/obsidian-command-center` before committing a bridge change; `bash scripts/lint-transport-monorepo.sh
  --strict` across the repo.
- **The only plaintext carve-out** is the Claude Browser pane (`mcp__Claude_Browser__*`, `cb` gate), the
  only browser surface on this machine, which talks to its own local browser over loopback. Computer-use is
  disabled; if it is ever re-enabled, add it here in the same change.
- **Third-party loopback services** are wrapped by single-file proxies in `Copilot-Everything/scripts/`
  (`miyo-`, `qdrant-`, `searxng-tls-proxy.mjs`; Ollama and its `:11435` proxy were removed 2026-11-12, as were
  LM Studio, Goose, Mistral Vibe and the local "Trevor" model: opencode is the only non-Claude agent platform), each owned by a launchd unit, each throwing on a
  certificate failure. Every consumer points at the HTTPS port. launchd runs **staged copies** in
  `~/.local/share/trevclaw-tls-proxies/`, so re-run `Copilot-Everything/scripts/install-tls-proxies.sh`
  after editing any proxy script.

## TLS

mkcert certificates at `~/.local/share/mkcert/localhost.pem` (valid for `localhost` and `127.0.0.1` until
2028-07-07); the CA root is `~/Library/Application Support/mkcert/rootCA.pem`, trusted in the System
Keychain. Every Node process needs `NODE_EXTRA_CA_CERTS` pointing at that root.

## Health checks

```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8800/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
cd "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations" && bash scripts/verify-phase29-policy.sh
```

## Retired

What must not come back is the "Retired" table in [`ARCHITECTURE.md`](ARCHITECTURE.md). The old deletion
log is [`docs/history/claude-md-deletion-log.md`](docs/history/claude-md-deletion-log.md); every path removed
in the 2026-10 reorganization, with its restore command, is in
[`ops/reorg/2026-10-cleanup-manifest.md`](ops/reorg/2026-10-cleanup-manifest.md).

## Browser Session History

Entries live in [`docs/history/browser-sessions.md`](docs/history/browser-sessions.md) (newest at top,
format and rules at its head). Per the global `~/.claude/CLAUDE.md` rule, a session that uses the Claude
Browser pane non-trivially prepends one entry there. Security-console sessions log in
`~/Security Everything/docs/browser-session-history/`.
