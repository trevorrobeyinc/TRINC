# The three bridges move from loopback TCP and mkcert TLS to Unix sockets (bridges-uds, 2026-11-24)

**Status: APPROVED by the operator on 2026-11-25.** Decided by: **the operator**, who approved every row under
[Approvals needed](#approvals-needed) in chat with "Approve all as written"; the record lands with the operator's
signed commit, and the change is live from the flag day (until then TRINC runs the TCP bridges). Drafted on 2026-11-24 by Claude Code sessions of the bridges-uds workflow (design v2, three adversarial
reviews, ten implementation units) on branch `claude/bridges-uds`, worktree `/Users/myhome/Worktrees/TRINC/bridges-uds`,
cut from TRINC main `577f8f4`. The design's working files lived in a session scratch folder, which is emptied when a
session reloads, so everything a later session needs is written here.

## The decision

The canonical vault bridge (TCP `:8798` until now), the Command Center bridge (`:8799`) and the Viz Studio bridge
(`:8800`) stop listening on loopback TCP with mkcert TLS. Each serves the **same HTTP/1.1 routes, bodies, headers and
auth** on its own Unix socket, and every client moves in the same flag day. **No TCP listener, no TCP fallback and no
client code path that can dial TCP remains for these three links.**

| Socket | Bridge | Served by | Clients |
|---|---|---|---|
| `vault-bridge.sock` | Canonical vault bridge (`Copilot-Everything/bridges/obsidian-copilot-bridge`) | the `obsidian-bridge-launcher` plugin's child, `dist/index.js --transport=uds`; pidfile `vault-bridge.pid` beside the socket | the Copilot fork (tools and the `research` SSE stream), Command Center's `research_notify`, the engine's read-back fallback, `Copilot-Everything/scripts/mcp-health-check.js`, `ops/tr-suite/uds-health.mjs` |
| `command-center.sock` | Command Center (`Claude/obsidian-command-center`) | the `command-center` plugin, in Obsidian's renderer | the stdio adapter (Claude's door), the Copilot agent's proxy, the Copilot fork, `uds-health.mjs` |
| `viz-studio.sock` | Viz Studio (`Claude/obsidian-viz-studio`) | the `trinc-viz-studio` plugin, in Obsidian's renderer | the stdio adapter, the Copilot agent's proxy, the Copilot fork, `uds-health.mjs` |

- **Where:** `<home>/.local/state/trinc/run/`, with `<home>` = `os.homedir()` (never `~` for derivation, never an XDG
  variable: Obsidian started from Finder does not inherit the shell environment). The run directory is **0700** and
  each socket **0600**, both owned by the operator's uid. Every level from home down must be a real directory owned
  by the uid that group and others cannot write, with no ACL allow entry; a looser chain is **refused, never
  repaired** (`RUN_DIR_MODE`, `RUN_DIR_UNSAFE`, `RUN_DIR_ACL`).
- **How a server publishes:** it binds a hidden name `.<name>.<pid>.<8 hex>.tmp`, chmods it 0600, checks it, and
  hard-links it onto the published name with an exclusive `link()`. The kernel keeps the hidden name as the bound
  address, so `lsof`, `getsockname` and `server.address()` show the hidden name with the owner's pid in it, never the
  published name; logs and health payloads use the published path. A socket path, hidden name included, must fit
  103 bytes, so a home of at most about 38 bytes works (`/Users/myhome` is 13).
- **One helper, three byte-identical copies** (`ops/tr-suite/verify.sh` compares them):
  `Claude/obsidian-command-center/src/bridge/uds-listener.ts`, `Claude/obsidian-viz-studio/src/bridge/uds-listener.ts`,
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsListener.ts`. It is the only file in each package
  that calls `http.createServer`, and it is on the transport lint's `LEGITIMATE_NON_TCP` list. Refusals carry a
  stable `UdsListenerError` code (`BAD_SOCKET_PATH`, `BAD_SOCKET_NAME`, `SOCKET_PATH_TOO_LONG`, `RUN_DIR_UNSAFE`,
  `RUN_DIR_MODE`, `RUN_DIR_ACL`, `NOT_A_SOCKET`, `FOREIGN_SOCKET`, `ALREADY_SERVED`, `PROBE_FAILED`, `SOCKET_MODE`,
  `LOST_RACE`, `SUPERSEDED`, `SOCKET_UNTRUSTED`, `ENOENT`, `UNSUPPORTED_PLATFORM`).
- **One client rule set:** the JavaScript clients carry a byte-identical `bridges-uds client v1` block (the stdio
  proxy, the stdio adapter, the engine's `openclaw-bridge/mcp/base-mcp.js`, `Copilot-Everything/scripts/mcp-health-check.js`;
  `verify.sh` compares the text between its BEGIN and END lines); the Copilot fork implements the same rules in
  `src/mcp/udsClient.ts`. Every bridge request goes through one wrapper that validates the exact path it sends,
  checks the directory chain and the socket's mode and owner before any token is written, refuses a missing socket
  as `ENOENT` without connecting, and pins the connection with `createConnection: () => net.connect({ path })`,
  never with an `agent` option. Each client binds the socket name it expects (server id `local-obsidian-mcp` to
  `vault-bridge.sock`, `command-center` to `command-center.sock`, `viz-studio` to `viz-studio.sock`) and refuses any
  other.
- **The browser guard stays**, byte-identical in its three copies and untouched: on a socket it skips its Host
  check (the connection has no local port; Node sends `Host: localhost`, or `localhost:80` with the pinned
  connection) and still refuses any `Origin`, any `Referer` and a `Sec-Fetch-Site` other than `none`.

**Unchanged on purpose:** the Local REST API `:27124`, the Security Bridge `:8801` (Security Everything), Miyo `:8743`,
Qdrant `:6433`, SearXNG `:8891`, LLM Guard `:8000`, `opencode serve` `:4096`, the registry proxy `:8893` and the engine's
dormant `:18789` gateway all stay TCP. `NODE_EXTRA_CA_CERTS` and the mkcert pair stay wherever those services are
reached (the launcher's env for the vault bridge's own Miyo call, the engine, the searxng registration); the mkcert
leaf pair is never deleted, because Security Everything's registry proxy on `:8893` loads it. ACP between Copilot and
opencode stays on stdio. The YubiKey gates (`enforceOperatorGate`, `operator-approved-gate`, `--operator-approve`) and
the env passed to engine children are untouched. Payloads, routes, the `X-MCP-Token` / Bearer headers and the replay
headers, MCP tool input schemas, tool names, server ids (`local-obsidian-mcp`, `command-center`, `viz-studio`,
`openclaw-obsidian`), runtime tool ids `mcp_<id>_<tool>` and CLI arguments are the same. The vault bridge's launch
argv keeps a `--transport=` flag, because Falcon Custom-IOA rule 176 finds the bridge by
ParentCommandLine `.*dist/index.js.*--transport.*`.

## Why

- **Reach.** A loopback TCP port answers every local process of every uid and any sandboxed app allowed to open
  network connections. A socket in a 0700 directory answers only the operator's uid and root, and no browser can dial
  one, so cross-site requests and DNS rebinding are gone at the transport; the browser guard becomes defence in depth.
- **TLS bought nothing against the processes that matter.** The server certificate's keys
  (`~/.local/share/mkcert/localhost-key.pem` 0600, `rootCA-key.pem` 0400) are readable by the same uid, as are both
  bridge-token files, so TLS never stopped a same-uid process. Against other accounts, the private directory chain
  does the job TLS did.
- **Confidentiality improves.** `/dev/bpf0` is `root:access_bpf` 0660 and the operator's account is in `access_bpf`,
  so uid 501 could capture loopback TCP without root (TLS 1.3 kept it confidential). Unix-socket traffic never
  appears on `lo0`.
- **No CA for bridge clients.** Every bridge client needed `NODE_EXTRA_CA_CERTS` or the system trust of the mkcert
  root; the adapter refused to start without it. On a socket there is nothing to trust.
- **One door per bridge, as decided.** One socket per bridge, each owned by its own plugin or daemon, keeps the
  2026-08-20 and 2026-10-23 declines intact (no daemon merge, no "one plugin owns one port"; aggregation stays at the
  client edge, in the adapter).
- **A measured hazard shaped the client rules.** Node turns an empty or undefined `socketPath` into plaintext TCP to
  `localhost:80`, trying `::1` and then `127.0.0.1`. Root's OpenCanary decoy listens there, so such a request would
  have carried a bearer token to it. `agent: false` silently ignores a `createConnection` pin. Hence one validating
  wrapper per client and no `agent` option anywhere.

## Approvals needed

Each row needs the operator's typed approval; the exact text is in the appendix named in the row.

| # | Approval | Why it needs the operator | Exact change, and where | State |
|---|---|---|---|---|
| (a) | Rule text rewritten under a NON-NEGOTIABLE principle (HTTPS-only) | `Claude/CLAUDE.md` said "HTTPS-only for every bridge here"; `Copilot-Everything/CLAUDE.md` held the `:8798` contract (CA for every caller, the 421 Host rule, `requestUrl` as a sanctioned caller) and "keep every listener HTTPS-only". The new text scopes HTTPS-only to TCP listeners and adds a no-TCP rule for the bridges. | Appendix A1 and A2 (before and after) | edited in the branch; approved 2026-11-25 |
| (b) | Retire `Copilot-Everything/scripts/official-plugin-direct-mcp-cutover.sh` and `official-plugin-enable-write-mcp.sh` (both now exit 1 with an explanation) | Reverses the 2026-10-23 reorg's KEEP ("Checked and KEPT": `official-plugin-*`, `ops/reorg/2026-10-cleanup-manifest.md`). Both wrote a single `http://<host>:<port>` server plus the bearer token into Copilot's `data.json` through `obsidian eval`, clobbering the three-server configuration, breaking "secrets never live in plugin `data.json`", and printing the token; after bridges-uds they have nothing valid to write. | The tombstone line under [Tombstones](#tombstones); the ARCHITECTURE.md Retired row (Appendix B3.8); an optional pointer in the reorg record (Appendix B6) | script edits in the branch; tombstone here; approved 2026-11-25 |
| (c) | The Copilot fork's settings migration writes its own `data.json` | Plugin settings are operator-owned: `deploy.sh` never writes `data.json`, and the launcher treats it as the operator's. The migration converts the bridge entries in `mcp.servers` to transport `uds` on load (idempotent, saved with the normal settings save, never logging a token, keeping `authToken`, `httpEndpoint` and every other field), and lists each change in Diagnostics. Precedent: the bridge-token scrub. Command Center and Viz Studio deliberately do **not** scrub a stored `bridgePort`; it is ignored. | `src/mcp/socketMigration.ts` in the fork; rollback source: the flag-day `deploy.sh --apply`'s backup at `~/.claude/backups/tr-suite/<UTC>/copilot/data.json`, the folder noted at rollout step 4 (never the newest one) | in the branch; approved 2026-11-25 |
| (d) | The repo `.mcp.json` env edit | `.mcp.json` is the operator's registration surface, and the Security Everything hook bars sub-agents from it. `openclaw-obsidian` loses `NODE_EXTRA_CA_CERTS` (the adapter has no HTTPS target left) and keeps `NODE_OPTIONS` with `--require /Users/myhome/.claude/mcp/loopback-listen.cjs` as its first token (Security Everything standing rule, `lanes/mcp-loopback.md`). The server key, `command` and `args` are unchanged; `searxng-search` keeps its CA. | the diff below this table | applied in the branch by the main session; approved 2026-11-25 |
| (e) | Operator config outside both repos that still describes the bridges as HTTPS TCP services | The auto-mode classifier reads `~/.claude/settings.json` `autoMode.environment`, which names `https://127.0.0.1:8798`/`8799`/`8800` as key services and curl health checks against those ports as routine; the security-orchestration skill's stack profile names the three ports as HTTPS bridges. Claude does not write the operator's global settings or user skills. | Appendix C1 (four `autoMode.environment` entries) and C2 (the stack profile) | approved and applied 2026-11-25 01:53Z at the operator's request, verified; backups in `~/.claude/backups/bridges-uds-appendix-c/20261125T015329Z/` |
| (f) | `LEGITIMATE_NON_TCP` gains the three helper files; `udsTransport.ts` leaves it | The lint's header requires an explicit security review for every entry, and a listed file escapes **every** lint bucket. The review is summarized under [How it was verified](#how-it-was-verified); the listed files are minimal, byte-identical and listen only on a path inside the run directory. `windowsPipeTransport.ts` stays. | `scripts/lint-transport-monorepo.sh` (comment: "security review 2026-11-24; operator approved 2026-11-25") | in the branch; approved 2026-11-25 |
| (g) | Constitution Principle I (NON-NEGOTIABLE) amended, version 2.1.0 | Principle I names `httpTransport.ts` as the canonical pattern (deleted by bridges-uds), forbids `http.request(` outright and requires `NODE_EXTRA_CA_CERTS` of every Node process. The amendment sanctions Unix-socket listeners and clients under their own rules. TRINC main's working copy carries an uncommitted v2.0.1 (the branch base is 2.0.0); the bump is to 2.1.0 either way. | Appendix B2 | approved 2026-11-25; applied after landing (the file is dirty in main) |
| (h) | The engine's egress-wrapper exception | The engine's read-back reaches `vault-bridge.sock` through a local-IPC-only helper, `bridgeSocketRequest`, in `openclaw-bridge/mcp/base-mcp.js`: the one file `scripts/verify-mcp-policy.sh` exempts, because it is the governed egress wrapper. This helper runs outside `validateEgressPolicy`, `preparePinnedEgressTarget` and `logOutboundAttempt`. It accepts only `<os.homedir()>/.local/state/trinc/run/vault-bridge.sock`, checks the chain before writing a header, and is fail-soft (`{ok:false, error:"bridge socket untrusted"}`). `x-mcp-nonce` and `x-mcp-timestamp` keep coming from `index.js` through the entropy and time providers (`globals:lint`). | comments in `base-mcp.js` and next to the exemption in `verify-mcp-policy.sh` | in the branch; approved 2026-11-25 |
| (i) | `socketRefusalCode` in the stdio adapter | A socket refusal (`SOCKET_UNTRUSTED`, `SOCKET_PATH_TOO_LONG`, `EACCES`, `EPERM`, `ENOTSOCK`) goes through one function that returns `adapter_error` for now and writes one distinct stderr line. The operator decides: keep `adapter_error`, or give socket refusals their own error code in Claude's door (a tool-output change). `ENOENT`, `ECONNREFUSED`, `EHOSTUNREACH` and a missing token file map to `obsidian_not_running` either way. | `Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs` | approved 2026-11-25: `adapter_error` kept for every refusal code |

The `.mcp.json` diff of row (d):

```diff
     "openclaw-obsidian": {
       "type": "stdio",
       "command": "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
       "args": [
         "/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs"
       ],
       "env": {
         "OBSIDIAN_STDIO_PROFILE": "openclaw",
-        "NODE_EXTRA_CA_CERTS": "/Users/myhome/Library/Application Support/mkcert/rootCA.pem",
         "NODE_OPTIONS": "--require /Users/myhome/.claude/mcp/loopback-listen.cjs"
       }
     }
```

### Visible changes to report with the landing

- `viz_health` returns `socket` (the socket's file name) in place of `port`: a tool-output change. No consumer reads
  the old field (checked in the fork, the adapter, the tests and Security Everything).
- The adapter's `obsidian_health` description says "(Command Center socket)" in place of "(:8799)", the Viz stub's
  says "(Viz Studio socket)" in place of "(:8800)", and the per-call stderr label is `upstream=command-center|viz-studio`.
  Tool names and input schemas are byte-identical.
- `obsidian_health` on the vault bridge reports transport `uds`. Command Center logs
  `MCP bridge started on unix:<path>`; the Command Center and Viz Studio settings show a read-only socket path and
  "Running on unix:<path>" / "Stopped" in place of the port field; a lost socket raises the Notice
  "Bridge stopped: <reason>". The launcher's status text, settings and manifest description stop naming a port, and
  it refuses to spawn a bridge `dist/` that predates bridges-uds.
- New audit events on the vault bridge: `SOCKET_LOST` and `SOCKET_REFUSED` (with `errorCode`).
- `ops/tr-suite/deploy.sh` keeps a copied file's executable bit (the Copilot agent's proxy stays 0755);
  `ops/tr-suite/manifest.json` records sockets in place of ports for the three bridges.
- Deferred until applied (Appendix B7): `content_draft`'s thumbnail note names "the Viz Studio bridge" in place of
  "the :8800 bridge".

## Residual risks, accepted with the decision

1. **A same-uid process can take over a published name with no key material.** Before, a bound TCP port could not be
   taken from a live server, and a squatter on a free port also needed a certificate for the mkcert pair. Now any
   process of the operator's uid can unlink or rename the published name while the real server runs, and clients
   hand their tokens to the new holder until the real server notices: within one watch tick (`fs.watch` on the run
   directory plus a 30 s poll). Then `onLost` fires: the vault bridge writes `SOCKET_LOST` and exits 1, and the
   plugins close their listener and show a Notice. This gives a same-uid process nothing it could not already read
   (both key files and both token files are readable by the uid), which is why it is accepted. The exception would be
   a same-uid principal that can write `~/.local/state` but cannot read the token files; none exists today.
2. **ACLs are checked by `/bin/ls`.** `fs.Stats` carries no ACL information, so the helper runs `/bin/ls -lde` on each
   level and refuses an entry line containing ` allow ` (deny entries are fine). This cost about 7 ms per call and
   36 to 38 ms per server start when measured, and it depends on `ls`'s output format. Clients memoize the check per
   process, so an ACL added after a long-running client's first check is seen only when that client restarts; the
   servers check on every start.
3. **"Stale" is a heuristic on macOS.** A live server whose accept queue is full also answers `ECONNREFUSED`, the
   stale signature. The helper confirms stale with two more probes 100 ms apart before it moves a socket aside, and
   it only ever replaces the exact inode it probed. A long-stalled live holder can still be replaced; it notices within
   one watch tick and closes.
4. **Peer credentials are out of reach from Node.** Node's built-ins expose neither `LOCAL_PEERPID` nor `getpeereid`,
   so neither side can check who is on the other end of a connection. Trust rests on the directory chain and the
   socket mode, plus the bearer tokens.
5. **The Host check is off on the sockets.** A TCP-to-socket forwarder (`ssh -L`, `socat TCP-LISTEN … UNIX-CONNECT`)
   in front of a bridge would bring DNS rebinding back for browsers that send no `Sec-Fetch-*`. Never add one; if one
   is ever unavoidable, add a helper-level 421 for any Host other than `localhost` and `localhost:80` in the same change.
6. **The freed ports.** Any local account can now bind `127.0.0.1:8798-8800`. A leftover client that verifies TLS fails
   the handshake against such a squatter; a plaintext leftover would hand it its token. The live check's TCP tripwire
   probes `127.0.0.1` and `[::1]`, the Copilot fork never dials an unconverted `http` entry, and the Security
   Everything follow-ups make any listener there a finding.
7. **Shutdown.** On SIGTERM the vault bridge removes its published socket name at once, gives connections still open
   up to 2 s, drains its scheduler for at most 2 s, then closes the ledger and exits: 4 s at most, inside the 5 s the
   launcher waits before SIGKILL (`shutdownTimeoutMs`). A `shutdownTimeoutMs` set below 4 s brings the cut back for a
   slow in-flight call. SIGKILL on unload, the normal stop (462 starts against 8 graceful stops in the logs), still
   cuts everything, so a stale `vault-bridge.sock` is the normal case at the next start and stale recovery is the
   real guarantee. Stale recovery confirms "stale" twice (before the bind and again when the publishing link finds
   the file), about 0.5 s in all, so on a cold start or a reload it can make the launcher's first readiness probe
   (at 0.8 s) miss. The status then stays "starting" until a later probe answers: the layout-ready probe can only
   promote it to running, and only the 4 s probe can report an error.
8. **Path length.** Node 22.13.1 silently truncates a socket path longer than macOS's 104-byte `sun_path`; the helper
   refuses anything over 103 bytes, hidden name included (`SOCKET_PATH_TOO_LONG`). A home longer than about 38
   bytes cannot host the bridges.
9. **Holder lookups by the published path find nothing.** `lsof <published path>` exits 1. Every audit that wants
   the holder uses the hidden-name pattern `^<runDir>/\.<name>\.(\d+)\.[0-9a-f]{8}\.tmp$` and keeps only entries
   whose embedded pid equals lsof's pid.

## Alternatives considered and rejected

- **A shared socket, broker or multiplexer for the three bridges.** It re-proposes the daemon merge and "one plugin
  owns one port", declined on 2026-08-20 and again on 2026-10-23 (`ops/reorg/2026-10-cleanup-manifest.md`, Phase 5).
  One socket per bridge keeps each bridge's lifecycle, token and owner its own.
- **A TCP fallback** (try the socket, then the port). A client that dials TCP hands its bearer token to whatever
  holds the freed port, and the empty-`socketPath` behaviour above shows how silently that happens. Refused at every
  layer: servers, clients, the fork's migration, the docs.
- **A dual-stack period** (TCP+TLS and sockets side by side for some weeks). It keeps the old surface, doubles the
  code paths, and needs a client selection rule that can fall back, which is the fallback above. A flag day with a
  cold rollback is simpler and testable.
- **Keeping TLS on the sockets.** TLS server authentication rested on keys the same uid can read, the directory
  chain already stops other accounts, and TLS would keep the CA distribution problem (every client, including
  Obsidian's renderer, needs the mkcert root) for no gain.
- **undici in the engine** (a socket-capable `fetch` through an undici dispatcher). The engine's only dependency is
  zod. undici would bring a second HTTP stack under the supply-chain gates (npm cache checksum, hash manifests), while
  the byte-identical `node:http` client block in `base-mcp.js` is small and shared with three other clients.
- **Smaller variants, also rejected:** binding the published name directly (it exposes a umask-mode socket and lets
  two starters both publish; `rename()` is not exclusive, `link()` is); a socket in `/tmp` (the old `udsTransport`
  default, world-writable); a path from `XDG_*` or `~` (differs between Finder-started Obsidian and a shell); a socket
  path passed in `.mcp.json` args (`verify.sh` stats every absolute arg and would fail whenever Obsidian is closed);
  repairing a loose run directory in code (an invariant of this kind means prevention: refuse, and let the operator
  fix the mode).

## How it was verified

**Design phase (2026-11-24, before any repo edit).**
- Ten component maps of today's code: the Copilot fork, the agent's stdio proxy, the stdio adapter, Command Center,
  Viz Studio, the canonical bridge and its launcher, every other TRINC consumer, every Security Everything consumer,
  the loopback preload runtime, and the repo's rules and gates.
- Measured facts: the preload `loopback-listen.cjs` never touches socket listens or any connect (43/43 probe cases
  with it loaded) and cannot load in Obsidian (Electron 43.8.9 / Node 24.22.1, `NODE_OPTIONS` fuse off). macOS needs
  write permission on the socket and search permission on every directory to connect (`EACCES` otherwise); bind
  creates the socket `0777 & ~umask`, so the chmod must follow. libuv unlinks the bound path at close, and `rename()`
  does not change a socket's bound name. A SIGKILLed server leaves its socket (`ECONNREFUSED` on connect,
  `EADDRINUSE` on listen), a missing socket gives `ENOENT`. Node `http` over `socketPath` sends `Host: localhost`, and
  the server sees `localPort` and `remoteAddress` undefined; the three guards already skip Host when `localPort` is
  undefined. Obsidian `requestUrl`, Chromium `fetch` and Node's global `fetch` cannot dial a socket. Obsidian 1.15.1's
  `plugin:reload` awaits disable then enable, `unload()` never awaits, and queued `onLayoutReady` callbacks run with
  no still-loaded check.
- Three adversarial reviews (security; lifecycle and runtime; compatibility and completeness), each with its own
  experiments, each "sound with fixes". Every fix is in design v2: the exclusive `link()` publish, an in-process
  registry so a plugin reload supersedes the older listener, the ACL check, the sweep of dead hidden names, stale
  confirmed by two extra probes, one validating client wrapper with the `createConnection` pin and no agent, the
  launcher's wait for the child's exit and its stale-holder identity check (hidden-name pid, cwd, parent pid), the
  dist guard, the cold rollback and the flag-day order.
- Helper tests: the review's suite of 32 cases failed 3 on the first canonical helper on Node 22.13.1 and on Node
  26.13.0 (two concurrent starts could both publish) and passed 32 of 32 on both runtimes with the fix; the v2
  canonical helper then passed a 14 of 14 smoke test on Node 22.

**Implementation (2026-11-24, in the worktree).** Each unit ran its own gates; the main session records the exact
results in the landing commit messages and the board entry (Appendix B8). The gates are: Command Center
`npm test` (237 existing tests plus `test/uds-listener.test.ts`), `npx tsc --noEmit` (only the 4 known
`workflow-modal.ts` errors) and `npm run lint:transport`; Viz Studio `npm test`, `npm run check` and
`npm run lint:transport`; the vault bridge `npx vitest run --cache=false` and `npm run lint:transport`; the Copilot fork
jest (69 existing plus the new suites), `npx tsc --noEmit -skipLibCheck`, `npm run build`, `npm run test:mobile-load` and
`npm run lint`; the proxy's `test/proxy.test.mjs`; the adapter's `TEST_PROFILES_SKIP_LIVE=1 npm run test:profiles`; the
engine's `npm test` (2 known Phase 29 vendor failures in a worktree), `npm run globals:lint` and
`bash scripts/verify-mcp-policy.sh`; at the root `bash scripts/lint-transport-monorepo.sh --strict` and
`bash ops/tr-suite/verify.sh`. This record's own unit checked that all 32 JSON files under the engine's `config/` load
after its edits, with no change in their count of non-ASCII characters or `\u` escapes, and that none of the
documents it edited still gives a bridge an `https://127.0.0.1` address, a `--cacert` health check or a CA requirement,
except where a line describes history.

**After the flag day.** The live checks in step 7 of the rollout below, then the obsidianwatch re-bless.

### Review round 2 (2026-11-24)

A second review read the implemented branch through three lenses (correctness, security, completeness), and a skeptic
re-checked every finding. It confirmed 15 findings: one medium, four low and ten nits. What changed after it:

- **The timeout pin.** The helper's `requestOverSocket` and the client block's `bridgesUdsRequest` pass the request's
  `timeout` to `net.connect`, and only when one is set: with none set, the connect options are exactly `{ path }`.
  Node calls a custom `createConnection` with the request's options, `timeout` included (checked on Node 22.13.1 and
  26), but the pin connected to the checked path on its own and ignored them. So the `timeout` option never armed,
  and a bridge that accepted a connection and then said nothing hung the request. New tests guard the pin in the
  helper and in the block.
- **Command Center.** A Start clicked after a Stop, while a start is still in flight, now opens a new listener instead
  of joining the start that the Stop cancelled. Its fire-and-forget `close()` calls get a `.catch` that logs the
  failure, as Viz Studio's already did.
- **Server error listeners.** Viz Studio and the vault bridge keep a permanent `error` listener on their server after
  listen, as Command Center does, so an accept error (`EMFILE`, `ENFILE`, `ENOBUFS`) is logged, never thrown (the
  vault bridge logs `uds_server_error`).
- **Launcher readiness.** The layout-ready probe can only promote the status to running, and only the 4 s probe can
  report an error (residual risk 7). On a plugin reload the layout is already ready, so that probe ran at once and
  could show a false "did not answer /healthz after 4s" while stale recovery was still running.
- **`bridge-restart.sh`'s cwd check fails closed.** The bridge package must resolve, and a holder passes only when its
  cwd resolves to the same directory; before, a cwd and a package that both failed to resolve compared equal. The
  hidden-name check and the parent-pid check (read twice) are unchanged.
- **`official-plugin-miyo-check.sh` no longer copies tokens** (pre-existing). It copied Copilot's whole `mcp` block,
  every `mcp.servers[].authToken` included, into `window.__officialPluginMiyoRun` and a validation file: the same leak
  class as the two scripts retired under approval (b). It now keeps only `mcp.enabled` and `mcp.confirmationPolicy`,
  the two fields its checks read, and writes `Copilot-Everything/configs/validation/official-plugin-miyo-runtime.json`
  0600. `Copilot-Everything/docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md` gives the script's real path.
- **The transport lint walks `ops/`**, so `ops/tr-suite/uds-health.mjs` and `ops/tr-suite/bridge-guard-live-check.mjs`
  are linted like every other bridge client.
- **This record.** The cold rollback restores `transport.tls`, makes the deployed proxy 0755 again after the reverted
  deploy, and restores the mcp block from the flag-day backup that rollout step 4 writes down, never the newest; the
  TRINC follow-up keeps `transport.tls` until the rollback window closes; residual risk 7 describes the new probe
  semantics.
- **A last read of these changes** (correctness and security lenses, then a skeptic) confirmed four nits, all
  addressed here: the reason the `timeout` option never armed (above), the purpose of the Start, Stop, Start, Stop
  test, the warning that the rollback restores the whole `mcp` block, and the miyo check's limits below.

**Open for the operator** (no change made):

- **The stdio proxy retries a `tools/list` timeout up to 5 more times.** A timeout counts as retryable, with delays of
  250, 500, 1000, 2000 and 4000 ms, so a bridge that accepts and never answers gets 6 attempts, and the error frame
  comes after about 56 s (`tools/call` is never retried and answers after about 8 s). It did the same before
  bridges-uds. About 56 s is close to the common 60 s MCP request timeout; whether to retry a timeout only once is the
  operator's call.
- **The engine's `scripts/verify-mcp-policy.sh` passes its literal patterns on the `rg`/`grep` argv inside `|| true`**
  (pre-existing). A child killed by an endpoint rule would make that check pass silently. It ran clean in the review.
- **`official-plugin-miyo-check.sh` cannot run on this Mac as written** (pre-existing). It uses `${SAMPLE_PDF_PATH@Q}`,
  which needs bash 4.4 or later; its `/usr/bin/env bash` finds only macOS's `/bin/bash` 3.2, which stops with "bad
  substitution" before the first `obsidian eval`. Its autonomous-agent check also expects tool ids of the server
  `shared-obsidian-mcp`, which only the retired cutover script ever created. Repair it or retire it with its two
  siblings (approval (b)); until then the doc's validation step does not run.

## What would reverse it

- A client that must reach a bridge but cannot dial a Unix socket (a browser-hosted tool, another device). Meet it at
  the client edge, as the stdio adapter does, never with a TCP listener on a bridge.
- Evidence that another account on this Mac can get through the 0700/0600 chain in a way TLS would have stopped (an
  ACL the check cannot see, a sandbox escape that reaches sockets but not keys). Then revisit: a native peer-credential
  check, or TLS on the socket.
- Moving a bridge off this Mac. That is a new decision under the HTTPS-only invariant, not a reversal of this one.
- The only supported way back is the cold rollback below. Never re-add a TCP listener, a TCP fallback or a CA to one
  bridge or one client piecemeal.

## Flag-day rollout (from DESIGN.md v2; step 4's backup note added in review round 2)

Rollout (operator; after review and signed commits; not this branch's work)

0. Decide the landing order against copilot-proxy-preload (whichever lands second rebases its acpMcpServers.ts env block). Cut a fresh backup bundle (scripts/trinc-backup.sh) and record main's SHA. Apply the skill edits (2.1.9) first, so the deploy-surface skill's checks match: `python3 -I -B /Users/myhome/TRINC/.archive/bridges-uds-flagday/apply_b5.py` (its `--check` passed on 2026-11-25), then B5's two `claude plugin` commands. Open no new Claude or Agent Mode sessions between landing and relaunch.
1. Land the branch first: `git -C /Users/myhome/TRINC merge --ff-only refs/heads/claude/bridges-uds`. None of main's uncommitted files (another session's CLAUDE.md, constitution, ARCHITECTURE.md, STATUS.md and others) is a path the branch changes (checked 2026-11-25), so the fast-forward leaves them as they are and the signed commit needs no rebase. Then commit those files (review them first: they are another session's work), then apply the record's root-doc amendments.
2. `obsidian_openclaw_status` shows process_running:false; quit Obsidian.
3. `rm -rf dist && npm run build` in main's Copilot-Everything/bridges/obsidian-copilot-bridge.
4. `bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --build copilot command-center trinc-viz-studio obsidian-bridge-launcher` (dry run, builds all four, no FAIL), then `... --apply` with the same ids and no --build: exit 0, four [DONE] lines, the proxy is 0755. Write down the folder that the `[DONE] copilot:` line names after "backup at" (`/Users/myhome/.claude/backups/tr-suite/<UTC>/copilot`): its `data.json` is the last copy from before the migration, and the cold rollback restores the mcp block from it. Every `--apply` after the step-5 launch writes a newer folder whose `data.json` is already migrated.
5. Launch Obsidian (full launch, never plugin:reload); Copilot's data.json migrates itself.
6. Appendix C1 and C2 are already applied (2026-11-25 01:53Z, at the operator's request; backups in `~/.claude/backups/bridges-uds-appendix-c/20261125T015329Z/`), so the sessions restarted now read the new text. Restart every TRINC Claude session (the adapter); edit .mcp.json if not landed.
7. Live checks: `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs`, `node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs`, the adapter's live test:profiles, a research_notify; then the obsidianwatch re-bless.

### The rollout's commands, location-independent (for the operator's terminal)

```bash
git -C /Users/myhome/TRINC rev-parse HEAD
bash /Users/myhome/TRINC/scripts/trinc-backup.sh --prune
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && rm -rf dist && npm run build
bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --build copilot command-center trinc-viz-studio obsidian-bridge-launcher
bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --apply copilot command-center trinc-viz-studio obsidian-bridge-launcher
stat -f '%Lp' "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/openclaw-stdio-proxy.mjs"
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs
node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter && npm run test:profiles
/usr/bin/python3 -B "/Users/myhome/Security Everything/obsidianwatch/obsidianwatch.py" --status
```

The `stat` line must print `755`, and the `--apply` line prints the `[DONE] copilot:` backup folder that step 4 says to
write down. The obsidianwatch blessing (`--bless`, then `--bless --confirm`, with Obsidian open) stays the operator's.

## Cold rollback (from DESIGN.md v2; amended in review round 2)

Plugins alone is NOT supported. Obsidian stays quit from step 1 until step 7.

1. Quit Obsidian.
2. Operator-signed `git revert` of the bridges-uds commits in main.
3. `rm -rf dist && npm run build` in the bridge package.
4. `deploy.sh --build` then `--apply` for the four ids from the reverted main, then make the deployed proxy executable
   again. The reverted `deploy.sh` writes every file it copies 0644, the revert changes the proxy's bytes, and the
   reverted fork starts `openclaw-stdio-proxy.mjs` by its shebang: at 0644 opencode cannot start it, and Copilot's
   Agent Mode loses its Command Center and Viz Studio tools. `chmod 755` it and check that `stat` prints `755`. A
   later reverted deploy that changes the proxy's bytes needs the same `chmod`.
5. Restore the mcp block of the live Copilot `data.json` from the backup folder written down at rollout step 4, never
   from the newest folder: step 4 here, like every `--apply` after the flag-day launch, wrote a newer one whose
   `data.json` is already migrated, and the reverted fork uses only transport `"http"` entries (a `"uds"` entry gets
   no MCP tools and no research SSE). Every restored entry must show transport `"http"`. Keep the file 0600. This
   replaces the whole `mcp` block: an MCP setting changed after the flag day (a server added or removed, a toggle, a
   rotated bridge token) goes back to its flag-day value. Note any such change before the restore and redo it after;
   a rotated token left at its old value fails every call to that bridge with 401.
6. If `transport.tls` was removed from the gitignored bridge config
   (`Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`), put it back inside
   `transport` with absolute paths to the mkcert pair, and keep the file 0600:
   `"tls": {"certPath": "/Users/myhome/.local/share/mkcert/localhost.pem", "keyPath": "/Users/myhome/.local/share/mkcert/localhost-key.pem"}`.
   The reverted launcher starts the bridge with `--transport=https`, and the reverted bridge exits 1 at every start
   without `transport.tls`; the launcher's status then stays "starting", and only the developer console shows the
   TLS error.
7. Relaunch Obsidian; restart Claude sessions; run the old live check; re-bless obsidianwatch.

### The cold rollback's commands, location-independent (for the operator's terminal)

```bash
git -C /Users/myhome/TRINC revert <the bridges-uds commits, newest first>
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && rm -rf dist && npm run build
bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --build copilot command-center trinc-viz-studio obsidian-bridge-launcher
bash /Users/myhome/TRINC/ops/tr-suite/deploy.sh --apply copilot command-center trinc-viz-studio obsidian-bridge-launcher
chmod 755 "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/openclaw-stdio-proxy.mjs"
stat -f '%Lp' "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/openclaw-stdio-proxy.mjs"
/usr/bin/python3 -B -c 'import json,sys; [print(s.get("id"), s.get("transport")) for s in json.load(open(sys.argv[1]))["mcp"]["servers"]]' "/Users/myhome/.claude/backups/tr-suite/<UTC>/copilot/data.json"
/usr/bin/python3 -B -c 'import json,os,sys; b,l=sys.argv[1],sys.argv[2]; m=json.load(open(b))["mcp"]; bad=[str(s.get("id")) for s in m["servers"] if s.get("transport")!="http"]; bad and sys.exit("refused, not http in this backup: "+", ".join(bad)); d=json.load(open(l)); d["mcp"]=m; t=l+".rollback.tmp"; f=os.fdopen(os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"w",encoding="utf-8"); f.write(json.dumps(d,indent=2,ensure_ascii=False)); f.close(); os.replace(t,l); [print(s.get("id"), s.get("transport")) for s in m["servers"]]' "/Users/myhome/.claude/backups/tr-suite/<UTC>/copilot/data.json" "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/data.json"
stat -f '%Lp' "/Users/myhome/My Digital Garden/.obsidian/plugins/copilot/data.json"
/usr/bin/python3 -B -c 'import json,sys; c=json.load(open(sys.argv[1])); print("keys:", sorted(c), "transport:", sorted(c.get("transport", {})))' /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json
/usr/bin/python3 -B -c 'import json,os,sys; p=sys.argv[1]; c=json.load(open(p)); t=c.setdefault("transport",{}); "tls" in t and sys.exit("transport.tls is already set: nothing written"); t["tls"]={"certPath":"/Users/myhome/.local/share/mkcert/localhost.pem","keyPath":"/Users/myhome/.local/share/mkcert/localhost-key.pem"}; n=p+".rollback.tmp"; f=os.fdopen(os.open(n,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"w",encoding="utf-8"); f.write(json.dumps(c,indent=2,ensure_ascii=False)+"\n"); f.close(); os.replace(n,p); print("transport:", sorted(t))' /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json
stat -f '%Lp' /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json
```

`<UTC>` is the stamp of the folder written down at rollout step 4. The first `python3` line prints each server's id and
transport in that backup and nothing else: every line must end in `http`, or the folder is already migrated and is the
wrong one. The second copies the backup's `mcp` block into the live `data.json` (a new 0600 file, then a rename),
refuses a backup with any entry that is not `http`, and prints the restored ids and transports. The third prints the
bridge config's keys and its `transport` keys, never a value; run the fourth only when `tls` is missing there (it
refuses to replace a `tls` that is set). The proxy's `stat` must print `755`, the other two `600`. None of these lines
prints a token.

## Security Everything follow-ups (propose-only, in that repo; none blocks the landing)

**Drafted 2026-11-24, not committed:** items 1-6 and 8, as uncommitted edits in the Security Everything worktree
`/Users/myhome/Worktrees/Security Everything/eager-lichterman-834507` (branch `claude/hungry-poitras-d2fcb5`). Its
`docs/proposals/bridges-uds-follow-ups-2026-11-24.md` holds the exact diffs, the commands and six operator decisions
(O-1 to O-6). Landing order (its O-6): items 1 and 2 only after the flag day, because both flag today's TCP listeners,
then the obsidianwatch re-bless; item 4 only together with a deploy to both SIEM engines. Item 5 is a hashed gate file,
so it lands alone, with a gatewatch reseal right after. Items 7 and 9 are the operator's and need no code. That session
also corrected items 1 and 5 below.

1. **obsidianwatch.** Expect, at the deploy: critical `protected_plugin_changed` for `copilot` (its top-level
   `openclaw-stdio-proxy.mjs` included), `command-center`, `trinc-viz-studio` and `obsidian-bridge-launcher`, and three
   medium `listener_missing` findings for `127.0.0.1:8798`, `:8799` and `:8800`, which repeat hourly until the re-bless.
   Re-bless right after the live checks. Then propose a **socket-posture probe** (read-only; the witness never
   connects): the run directory is a real directory, uid 501, mode 0700, with no ACL allow entry; each of the
   three names is a socket, uid 501, mode 0600; the holder is found with `lsof -nP -U -F pn` through the hidden-name
   pattern `^<runDir>/\.<name>\.(\d+)\.[0-9a-f]{8}\.tmp$`, its embedded pid equal to lsof's pid and inside the Obsidian
   process tree (the renderer, or the launcher's child); and a TCP listener on 8798-8800 from **any** process, not only
   the Obsidian tree, is a finding. **Corrected 2026-11-24** by the follow-ups session: this said "stat and lsof
   only", which cannot do two of these checks. `stat` cannot see an ACL, so the draft reads it with `/bin/ls -lde`;
   and `lsof` run as uid 501 cannot see another account's sockets (measured that day: 39 listening ports in
   `netstat`, 25 in `lsof`, the 14 missing all root's), so the draft reads 8798-8800 from `netstat -anv -p tcp`.
   Accepting both is its decision O-1. Whether each socket must be held by its own process (the renderer for Command
   Center and Viz Studio, the launcher's `node` child for the vault bridge) rather than anywhere in the tree is its
   O-2. Keep the mkcert pair in `ENGINE_FILES`. Severity under row 64: medium unless an
   automatic fix is named; the prevention is TRINC-side (the bridges refuse a loose chain and never fall back).
2. **The exposure audit** (`obsidian-exposure-audit.py`): keep 8798 and 8799 as tripwires, add 8800, and make any TCP
   listener on 8798-8800 a finding (today a loopback squatter would read "loopback-only OK"). Leave 8801 out.
3. **lolwatch.** The documented health check is `node ops/tr-suite/uds-health.mjs`, so no new curl constellation
   appears. If the operator ever probes a socket with curl by hand, use an `http://localhost/` URL, because
   `chains.py`'s loopback carve-out keys on `localhost`; optionally add that form to the selftest.
4. **OSSEC.** Rules for the vault bridge's new `SOCKET_LOST` and `SOCKET_REFUSED` audit events, next to 100600-100606,
   at medium (recorded, not paged) under row 64, since no automatic fix pairs with them. `json2ossec` forwards only
   `eventType` and `source` today, so decide whether to forward `errorCode` too. The draft (rules 100607 and 100608,
   level 6) does not: every alert's full log line already carries it, and forwarding needs an ordered deploy of both
   bridge copies and both decoders, where a wrong order risks crashing OSSEC's analysisd. Its Appendix B has the
   forwarding version.
5. **session-gate.** **Corrected 2026-11-24** by the follow-ups session, which ran the hook's own path-deny check:
   this said the hook already refused a sub-agent Bash command naming a path under `~/.local/state`, and so covered
   the run directory without meaning to. It does not: before that session's draft, a sub-agent could `rm`, `ln -f`
   or `chmod` the sockets and the run directory, and write files inside it. The draft makes the run directory an
   explicit write-only row: the Read, Glob and Grep tools still work on it, a Bash command that names it is refused
   (even `stat`), and `uds-health.mjs` and `lsof -U` are unaffected because they name no path. If a sub-agent bar on
   `~/.config/openclaw-command-center/bridge-token` and `~/.config/trinc-viz-studio/bridge-token` is ever added, put
   the run directory in the same row.
6. **Falcon.** Close the **rule 1 self-detection from this work at about 2026-11-24 12:13Z** with an attribution
   comment, through the Falcon-Strike lane and the operator's typed confirm; never an exclusion and never a rule change.
   Shortly before 12:13:31Z one Bash call of the compatibility review died with a bare exit 1: a grep whose pattern
   named the engine's tool pre-retrieval map (its file name holds the download-tool word) on a piped command line.
   Nothing ran. Look for the record in `~/falcon-ossec-data/falcon_alerts.json` and read its own command line before
   claiming it. The follow-ups session found it at 12:13:21Z, still `new`: its own command line shows that grep, and
   it is the only rule-1 record that day. The exact propose call and comment are in its proposal, for when the
   operator is at the key (three touches). Also: rule 176 keeps matching (`dist/index.js --transport=uds`), so no
   change and no driftwatch re-accept is needed.
7. **The operator's global config text:** row (e), Appendix C.
8. **Docs and memory, low priority:** `mcp-gates/README.md` (the bridges' wording), `opencode-parity/README.md` (the
   proxy reaches sockets, still no G6 exemption), `docs/obsidian-security-bridge.md` (annotate the new posture),
   `obsidianwatch/README.md` (the listeners row and install step), `opencode-delegation-guard/README.md` (the `:8798`
   SSRF residual closes; `:6433` remains), and the Security Everything memory note on Obsidian-tree listeners.
   `opencode-parity/se_parity.py`'s stale comment waits for its next release, because gatewatch hashes the file.
9. **Attribution notes for the operator.** During the security review three requests from `127.0.0.1` reached root's
   OpenCanary decoy on port 80 at about 04:10 and 04:22 PST (two `POST /mcp/tool` with the header
   `X-MCP-Token: DUMMY-NOT-A-SECRET`, one `GET /healthz`); `opencanary.conf` ignores `127.0.0.1` and `::1`, so no alert is
   expected. One bind attempt on `127.0.0.1:1023` was refused with `EACCES`.

## NotebookLM and brand-check follow-ups

- **NotebookLM** (`My Drive/TRINC/NotebookLM/`, refreshed **in place**: overwrite each file at its own path, never
  trash and recreate, then prove each upload as on 2026-11-16). This branch edits two of the six canon sources,
  `HOW-IT-WORKS.md` and `SYSTEM-REALITY.md`; `ARCHITECTURE.md` follows once Appendix B3 is applied. Re-export those three
  under their banners. Then check chapters 02 (Engine Part 1), 05 (Operations Playbook) and 06 (Code Map, Glossary and
  FAQ) for bridge ports, curl health checks and "HTTPS-only" wording, and refresh what changed, also in place.
- **docs/learn-and-pitch** (Claude Desktop Chat reads it from disk, and the combined pack goes to a claude.ai
  Project): apply Appendix B4, rebuild the pack, and re-upload it in place of the old copy.
- **Brand check.** `SYSTEM-REALITY.md` is the copy canon. The hunks in this branch change machine-room sentences only:
  no price, tagline, claim about citations or customer promise. Run `trinc-business:brand-check` on those hunks and on
  `HOW-IT-WORKS.md` before any customer-facing copy is next drawn from them. The learn-and-pitch pack's one client
  line ("every network service is HTTPS-only") stays true as written.

## Operator follow-ups in TRINC (not branch work)

- The gitignored live bridge config (`Copilot-Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`)
  still says `transport.mode: "http"`. Only the mode needs to change, and it can wait: the launcher's
  `--transport=uds` already overrides it. **Keep `transport.tls` until the rollback window closes** (until the
  operator decides the cold rollback will not be needed), although the bridge notes "config transport.tls is ignored"
  at every start: the reverted bridge starts with `--transport=https` and exits 1 without it (cold rollback, step 6).
  Host and port can stay or go; the reverted loader defaults them to `127.0.0.1` and `8798`. List the keys first
  without printing the token (the third `python3` line under the cold rollback's commands), and keep the file 0600.
- A stored `bridgePort` in Command Center's, Viz Studio's or the bridge launcher's `data.json` is ignored; remove it by
  hand if wanted. On 2026-11-24 Command Center's held 8799 and the launcher's 8798; Viz Studio had no `data.json`.
- Copilot's `data.json` keeps each migrated bridge entry's old URL as an inert legacy record (the fork's settings
  migration keeps the `httpEndpoint` field; the fork never dials it). On 2026-11-24 all three were `https://`, so a
  client that ever followed one would fail TLS against a squatter rather than hand it a token; no plaintext leftover
  was found outside the repos. Scrub them by hand once the rollback window closes, if wanted: the cold rollback restores
  the mcp block from the step-4 backup, not from these.
- Cut a fresh backup bundle after landing and refresh the Drive snapshot, as the root `CLAUDE.md` describes.
- Apply Appendix B5 (the skills, 2.1.9) **before** the deploy, B1-B4, B6 and B9 right after landing (B9 may also
  go into the branch), B7 together with the trinc-content installer, and B8 when the flag day is done.

## Tombstones

> **TCP and mkcert TLS for the three bridges — RETIRED 2026-11-24 (bridges-uds), approved by the operator 2026-11-25; do not
> reintroduce.** Was: the canonical vault bridge on `127.0.0.1:8798`, Command Center on `:8799`, Viz Studio on `:8800`,
> each HTTPS with the mkcert pair, every client trusting the mkcert root (`NODE_EXTRA_CA_CERTS`). Replaced by
> `vault-bridge.sock`, `command-center.sock` and `viz-studio.sock` in `~/.local/state/trinc/run/` (0700, sockets 0600),
> through one byte-identical helper and one client rule set. Went because a loopback port answers every local
> process and the TLS keys never stopped the one uid that matters; a socket in a private directory answers only that
> uid and no browser. Retired with it: `httpTransport.ts` and its tests, `start:https`, `--transport=https`, the
> `OPENCLAW_BRIDGE_TLS_*` / `VIZ_BRIDGE_TLS_*` handling, the `bridgePort` settings fields, the clients' CA loading,
> the adapter's `OBSIDIAN_STDIO_COMMAND_CENTER_URL` / `OBSIDIAN_STDIO_VIZ_URL` overrides (refused at startup), the
> proxy's `OPENCLAW_BRIDGE_URL`, and the launcher's `lsof -iTCP` checks. **If it reappears** (a listener on 8798-8800,
> a client with a bridge URL, a doc with a `--cacert` health check of a bridge): treat it as a regression, read this
> record, and back out only through the cold rollback.

> **`official-plugin-direct-mcp-cutover.sh` and `official-plugin-enable-write-mcp.sh` — RETIRED 2026-11-24
> (bridges-uds), approved by the operator 2026-11-25; reverses the 2026-10-23 reorg's KEEP.** Both now exit 1 with an
> explanation. They wrote one `http://<host>:<port>` server and the bearer token into Copilot's `data.json` through
> `obsidian eval` and printed the token. The fork's own settings migration converts the bridge entries now. If they
> reappear, do not restore them: the last working versions are in git history before bridges-uds, and they only fit
> the TCP stack, which comes back only through the cold rollback.

---

## Appendix A — rule text rewritten in the branch (approval (a))

### A1. `Claude/CLAUDE.md`, Rules

Before:

````markdown
- **HTTPS-only** for every bridge here: run `npm run lint:transport` in `obsidian-command-center` before
  committing a bridge change.
````

After:

````markdown
- **No TCP for the bridges here** (2026-11-24, bridges-uds; record:
  [`../ops/security/bridges-uds-2026-11-24.md`](../ops/security/bridges-uds-2026-11-24.md)). Command Center,
  Viz Studio and the vault bridge the launcher spawns listen only on 0600 Unix sockets in the 0700 run
  directory `~/.local/state/trinc/run/`, through one helper kept byte-identical in three packages
  (`obsidian-command-center/src/bridge/uds-listener.ts`, `obsidian-viz-studio/src/bridge/uds-listener.ts`,
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsListener.ts`; `ops/tr-suite/verify.sh`
  compares them, so change all three together). There is no TCP listener, no TCP fallback and no client path
  that can dial TCP, and a bridge that cannot secure its socket refuses to start. **HTTPS-only still applies to
  any TCP listener** (root `CLAUDE.md`). Run `npm run lint:transport` in `obsidian-command-center` and
  `obsidian-viz-studio` before committing a bridge change: each fails on a `createServer(` or `.listen(`
  anywhere in `src` outside `src/bridge/uds-listener.ts`.
````

The three rows of the file's table also name the sockets in place of `:8799`, `:8798` and `:8800`.

### A2. `Copilot-Everything/CLAUDE.md`, the bridge contract and the Rules

Before (contract):

````markdown
## The `:8798` bridge contract

- `POST /mcp/tool` (authenticated, replay-protected), `GET /healthz`, `GET /metrics`, `GET /mcp/events`
  (the `research` SSE stream the fork's event bridge subscribes to).
- Auth with `x-mcp-token`; replay protection with `x-mcp-timestamp`, `x-mcp-nonce` and `x-mcp-body-sha256`.
- Every caller needs `NODE_EXTRA_CA_CERTS` pointing at the mkcert root CA.
- **Browser guard first** (`src/server/browserGuard.ts`, 2026-10-24): a wrong Host gets 421
  `REQUEST_WRONG_HOST`; an `Origin`, a `Referer` or a `Sec-Fetch-Site` other than `none` gets 403
  `BROWSER_ORIGIN_REFUSED`. Each refusal writes a `BROWSER_REJECT` audit event and increments
  `browser_rejections_total` in `/metrics`. Callers must be programs (Node `https`/`fetch`, Obsidian
  `requestUrl`, curl, Python), never page-level `fetch`.
````

After (contract):

````markdown
## The vault bridge contract (`vault-bridge.sock`)

- **Socket:** `<home>/.local/state/trinc/run/vault-bridge.sock`, with `<home>` = `os.homedir()` (never `~`
  or an XDG variable). The run directory is 0700 and the socket 0600, both owned by the operator's uid; a
  looser directory chain is refused, never repaired. Pidfile `vault-bridge.pid` in the same directory,
  rewritten atomically on every start and never deleted (the launcher validates it). There is no TCP
  listener: nothing answers on 8798 any more, and a listener there is a finding.
- `POST /mcp/tool` (authenticated, replay-protected), `GET /healthz`, `GET /metrics`, `GET /mcp/events`
  (the `research` SSE stream the fork's event bridge subscribes to): the same routes and bodies as before.
- Auth with `x-mcp-token`; replay protection with `x-mcp-timestamp`, `x-mcp-nonce` and `x-mcp-body-sha256`.
- **No CA.** A caller of the socket needs no `NODE_EXTRA_CA_CERTS` and no TLS: there is none on the socket.
  The launcher keeps `NODE_EXTRA_CA_CERTS` in the bridge's own env for its outbound Miyo call (`:8743`), and
  the Local REST API call (`:27124`) is unchanged.
- **Browser guard first** (`src/server/browserGuard.ts`, 2026-10-24), kept as defence in depth: an `Origin`,
  a `Referer` or a `Sec-Fetch-Site` other than `none` gets 403 `BROWSER_ORIGIN_REFUSED`. Each refusal
  writes a `BROWSER_REJECT` audit event and increments `browser_rejections_total` in `/metrics`. **The Host
  rule on the socket:** the guard checks Host only when the request arrived on a TCP port (421
  `REQUEST_WRONG_HOST`); on the socket there is no port, so it skips the check. Node sends
  `Host: localhost` over a socket, or `localhost:80` when the connection is pinned with `createConnection`.
- **Callers must be able to dial a Unix socket**: Node `node:http` with `socketPath` and a pinned
  `createConnection` (the byte-identical `bridges-uds client v1` block, or the fork's `udsClient.ts`),
  Python, or the operator's own terminal. Obsidian `requestUrl`, Chromium or page-level `fetch` and Node's
  global `fetch` cannot reach a socket and are never bridge clients. A client goes through one wrapper that
  validates the exact path it sends (Node turns an empty or undefined `socketPath` into plaintext TCP to
  `localhost:80`), checks the directory chain and the socket mode, and never retries over TCP.
- **Socket audit events** (2026-11-24): `SOCKET_LOST` (the published name was removed or replaced; the
  bridge exits 1) and `SOCKET_REFUSED` (a startup refusal, with `errorCode` = the helper's
  `UdsListenerError` code). The rest of the audit vocabulary and its path are unchanged.
````

Before (rule):

````markdown
- Keep the REST-backed bridge as the production vault lane, keep its replay protection, and keep every
  listener HTTPS-only (`npm run lint:transport` before committing a bridge change).
````

After (rule):

````markdown
- Keep the REST-backed bridge as the production vault lane and keep its replay protection. **The bridge
  listens only on its Unix socket** (2026-11-24, bridges-uds): no TCP listener, no TCP fallback, and no
  client path that can dial TCP; a bridge that cannot secure its socket refuses to start. **Every TCP
  listener here stays HTTPS-only** (the TLS proxies). Run `npm run lint:transport` before committing a
  bridge change: it fails on any server constructor or `.listen(` in `src` outside
  `src/server/udsListener.ts` and `src/server/windowsPipeTransport.ts`, and when either file is missing.
- `src/server/udsListener.ts` is byte-identical with Command Center's and Viz Studio's
  `src/bridge/uds-listener.ts` (`ops/tr-suite/verify.sh` compares them); change all three together.
````

The same file's intro, component table (a "Port or socket" column), Copilot-agent section, key paths, `data.json`
note, Commands block and "Retired here" list were updated to match.

---

## Appendix B — ready-to-apply amendments (not edited in the branch)

Apply each after the branch lands. Root `CLAUDE.md`, the constitution and `ARCHITECTURE.md` are dirty in TRINC main
(an `ff-only` landing refuses while they are), so their main edits are committed first; every "Before" below is
quoted from **main's working copy** of 2026-11-24, uncommitted edits included. Each "Before" occurs once in its file.

### B1. Root `CLAUDE.md`

**B1.1 Repo map.** Before:

````markdown
| `Copilot-Everything/` | Vendored Copilot fork, the `:8798` bridge, the stdio adapter, the TLS proxies | its `CLAUDE.md` |
````

After:

````markdown
| `Copilot-Everything/` | Vendored Copilot fork, the canonical vault bridge (`vault-bridge.sock`), the stdio adapter, the TLS proxies | its `CLAUDE.md` |
````

Before:

````markdown
| `ops/` | `tr-suite/` (registry, `verify.sh`, `deploy.sh`), `xcode/` (the buyer app's Xcode decision record) and the 2026-10 reorg record | — |
````

After:

````markdown
| `ops/` | `tr-suite/` (registry, `verify.sh`, `deploy.sh`, `uds-health.mjs`), `xcode/` (the buyer app's Xcode decision record), `security/` (dated security records, among them the bridges-uds decision record) and the 2026-10 reorg record | — |
````

**B1.2 The canonical vault bridge.** Before:

````markdown
Each workspace's `CLAUDE.md` is authoritative for its own domain. **The `:8798` bridge is the canonical
vault access point; do not create another vault bridge** (new client needs are met by an adapter profile,
below).
````

After:

````markdown
Each workspace's `CLAUDE.md` is authoritative for its own domain. **The canonical vault bridge
(`vault-bridge.sock`, spawned by `obsidian-bridge-launcher`) is the canonical vault access point; do not
create another vault bridge** (new client needs are met by an adapter profile, below).
````

(`Trevor Robey Intelligence Network Citations/scripts/_workflow-runtime.js` paraphrases this sentence in a comment;
the branch already gives it the socket wording, so keep the two in step.)

**B1.3 Ports, now ports and sockets.** Before:

````markdown
## Ports

Coordinated here; do not reassign one without updating this table.

| Port | Service | Owner |
|---|---|---|
| 8798 | Canonical vault bridge (HTTPS) | `obsidian-bridge-launcher` plugin (child process) |
| 27124 | Obsidian Local REST API (the vault engine under `:8798`) | Local REST API plugin |
| 8799 | Command Center bridge (HTTPS) | `command-center` plugin |
| 8800 | Viz Studio bridge (HTTPS) | `trinc-viz-studio` plugin |
| 8801 | Security Bridge (HTTPS) | `trinc-security-bridge` plugin (source in `~/Security Everything`) |
````

After:

````markdown
## Ports and sockets

Coordinated here; do not reassign a port or rename a socket without updating these tables.

**The three bridges listen on Unix sockets, not ports** (2026-11-24, bridges-uds; record:
[`ops/security/bridges-uds-2026-11-24.md`](ops/security/bridges-uds-2026-11-24.md)). Each socket is 0600 in the
run directory `<home>/.local/state/trinc/run/` (`<home>` = `os.homedir()`), which is 0700 and owned by the
operator's uid. No TCP listener, no TCP fallback and no client code path that can dial TCP remains for these
links: ports 8798, 8799 and 8800 are retired, and a listener on one is a finding.

| Socket | Service | Owner |
|---|---|---|
| `vault-bridge.sock` | Canonical vault bridge (bearer token + replay guard; pidfile `vault-bridge.pid` beside it) | `obsidian-bridge-launcher` plugin (child process, `dist/index.js --transport=uds`) |
| `command-center.sock` | Command Center bridge | `command-center` plugin |
| `viz-studio.sock` | Viz Studio bridge | `trinc-viz-studio` plugin |

| Port | Service | Owner |
|---|---|---|
| 27124 | Obsidian Local REST API (the vault engine under the vault bridge) | Local REST API plugin |
| 8801 | Security Bridge (HTTPS) | `trinc-security-bridge` plugin (source in `~/Security Everything`) |
````

(The rows from `8743 → 8742` to `4096` stay as they are.) Then, before:

````markdown
All four Obsidian bridges die when Obsidian quits, so vault tools answer "not running" while it is
closed. Only the HTTPS proxy should ever reach a plaintext upstream.
````

After:

````markdown
All four Obsidian bridges die when Obsidian quits, so vault tools answer "not running" while it is
closed (a socket client sees `ENOENT`, or `ECONNREFUSED` for a stale socket a crash left behind, which the
next start replaces). Only the HTTPS proxy should ever reach a plaintext upstream.
````

**B1.4 Claude's one door.** Before:

````markdown
  `.mcp.json` as **`openclaw-obsidian`** (v0.5.0, 27 tools). On `:8799`: run dispatch, status, results,
  history, artifacts, cancel, citation integrity, delivery evidence, memory search, engine health, a
  restricted publish, and read-only `obsidian_search_notes` / `obsidian_read_note`. On `:8800`: the 12
  `viz_*` renders, with `folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote` and
  `overwrite` stripped and refused, so renders land only in `Visualizations/`. No create, append or command
  execution. It never loads the `:8798` token. Runbook: the `openclaw-dispatch` skill. Regression guard:
  `npm run test:profiles` in the adapter.
````

After:

````markdown
  `.mcp.json` as **`openclaw-obsidian`** (v0.5.0, 27 tools). On Command Center's socket: run dispatch,
  status, results, history, artifacts, cancel, citation integrity, delivery evidence, memory search, engine
  health, a restricted publish, and read-only `obsidian_search_notes` / `obsidian_read_note`. On Viz Studio's
  socket: the 12 `viz_*` renders, with `folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote`
  and `overwrite` stripped and refused, so renders land only in `Visualizations/`. No create, append or command
  execution. It never loads the vault bridge's token and never names `vault-bridge.sock`. Runbook: the
  `openclaw-dispatch` skill. Regression guard: `npm run test:profiles` in the adapter.
````

Before:

````markdown
  **Copilot** calls `:8798`, `:8799` and `:8800` itself, and its agent mode reaches the bridges through
  `bridges/openclaw-stdio-proxy`. That is its door, not Claude's.
````

After:

````markdown
  **Copilot** calls the three bridge sockets itself (Node `http` in the renderer, `src/mcp/udsClient.ts`),
  and its agent mode reaches Command Center and Viz Studio through `bridges/openclaw-stdio-proxy`
  (`OPENCLAW_BRIDGE_SOCKET`). That is its door, not Claude's.
````

Before:

````markdown
- **Aggregate at the client edge, never by merging daemons.** Each bridge stays owned by its own plugin,
  with its own lifecycle, token and port.
````

After:

````markdown
- **Aggregate at the client edge, never by merging daemons.** Each bridge stays owned by its own plugin,
  with its own lifecycle, token and socket (one socket per bridge: a shared socket, broker or multiplexer
  re-proposes the declined merge).
````

**B1.5 Obsidian pipeline lifecycle.** Before:

````markdown
| Full-text read-back fallback | ❌ | `:8798` → `:27124` | Local REST API plugin |
````

After:

````markdown
| Full-text read-back fallback | ❌ | vault bridge (`vault-bridge.sock`) → `:27124` | Local REST API plugin |
````

Before:

````markdown
| Chat bubble (`research_notify`) | ❌ | Command Center | `:8798` |
````

After:

````markdown
| Chat bubble (`research_notify`) | ❌ | Command Center | the vault bridge (`vault-bridge.sock`) |
````

**B1.6 Security, the browser guard.** Before:

````markdown
- **Bridges refuse browser traffic before auth** (2026-10-24; ARCHITECTURE.md §5 "Browser guard"). Never
  add CORS headers back to `:8798`/`:8799`/`:8800`, and never make a bridge client a page-level `fetch`.
  Never refuse on `Sec-Fetch-Mode`/`-Dest` either: Node's `fetch` sends `sec-fetch-mode: cors`, and
  Obsidian's `requestUrl` (Copilot) may send `Sec-Fetch-Site: none`. The three guard copies must stay
  byte-identical (`verify.sh` checks). Merging the bridges onto one port to "shrink the attack surface" was
  assessed the same day and gains nothing: they are loopback-only and token-gated.
````

After:

````markdown
- **Bridges refuse browser traffic before auth** (2026-10-24; ARCHITECTURE.md §5 "Browser guard"), kept
  on the sockets as defence in depth: any `Origin`, any `Referer` and a `Sec-Fetch-Site` other than `none`
  get 403. Never add CORS headers back to the three bridges. A bridge client is a program that can dial a
  Unix socket (Node `http` with `socketPath` and a pinned `createConnection`), never a page-level `fetch`,
  Obsidian's `requestUrl` or Node's global `fetch`, none of which can reach a socket. On a socket the guard
  skips its Host check (there is no port; Node sends `Host: localhost`, or `localhost:80` with the pinned
  connection), so never put a TCP-to-socket forwarder (`ssh -L`, `socat`) in front of a bridge. Never refuse
  on `Sec-Fetch-Mode`/`-Dest` either. The three guard copies must stay byte-identical (`verify.sh` checks).
  Merging the bridges onto one port or one socket to "shrink the attack surface" was assessed on 2026-10-24
  and gains nothing: each is private and token-gated.
````

**B1.7 HTTPS-only invariant** (this replaces the "copy `httpTransport.ts`" instruction). Before:

````markdown
- **Copy this pattern** for a new listener:
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts` (throws without TLS,
  reads the mkcert pair, asserts `instanceof https.Server`).
- **Guards:** `npm run lint:transport` in `Copilot-Everything/bridges/obsidian-copilot-bridge` and
  `Claude/obsidian-command-center` before committing a bridge change; `bash scripts/lint-transport-monorepo.sh
  --strict` across the repo.
````

After:

````markdown
- **Copy this pattern** for a new TCP listener: `Copilot-Everything/scripts/miyo-tls-proxy.mjs` (one file,
  throws on a certificate failure, no plaintext path). `httpTransport.ts`, the old canonical pattern, was
  deleted on 2026-11-24 with the bridges' TCP transport.
- **Unix sockets are the other sanctioned transport, and the only one the three bridges use** (2026-11-24,
  bridges-uds). They serve plain HTTP/1.1 on a 0600 socket in the 0700 run directory through one helper kept
  byte-identical in three files (`Claude/obsidian-command-center/src/bridge/uds-listener.ts`,
  `Claude/obsidian-viz-studio/src/bridge/uds-listener.ts`,
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsListener.ts`; `verify.sh` compares them),
  the only files in those packages that may call `http.createServer`; they are on `LEGITIMATE_NON_TCP`.
  Clients go through one wrapper (the byte-identical `bridges-uds client v1` block in four files, or the
  Copilot fork's `udsClient.ts`) that validates the exact path it sends and pins the connection with
  `createConnection: () => net.connect({ path })`, never an `agent` option: Node turns an empty or undefined
  `socketPath` into plaintext TCP to `localhost:80`. A bridge that cannot secure its directory chain or socket
  throws a stable `UdsListenerError` code and refuses to listen; nothing falls back to TCP.
- **Guards:** `npm run lint:transport` in `Copilot-Everything/bridges/obsidian-copilot-bridge`,
  `Claude/obsidian-command-center` and `Claude/obsidian-viz-studio` before committing a bridge change;
  `bash scripts/lint-transport-monorepo.sh --strict` across the repo; `bash ops/tr-suite/verify.sh` for the
  byte-identity of the helper copies and the client block.
````

**B1.8 TLS.** Before:

````markdown
Keychain. Every Node process needs `NODE_EXTRA_CA_CERTS` pointing at that root.
````

After:

````markdown
Keychain. Every Node process that dials an HTTPS loopback service (the Miyo, Qdrant and SearXNG proxies,
LLM Guard on `:8000`) needs `NODE_EXTRA_CA_CERTS` pointing at that root. A client of the three bridge sockets
needs none: there is no TLS on a socket. Never delete the leaf pair: Security Everything's registry proxy on
`:8893` loads it, and the vault bridge's own Miyo call trusts the root through the launcher's env.
````

**B1.9 Health checks.** Before:

````markdown
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8800/healthz
````

After:

````markdown
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs     # GET /healthz over the three bridge sockets; one line each, never a token
````

Then, after the closing fence of that code block, add:

````markdown
`uds-health.mjs` derives each socket path from the home directory, so a bridge check never puts a socket path (or
`curl`) on a command line. With Obsidian open, `node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs`
also proves the browser guard on each socket and that nothing listens on TCP 8798-8800.
````

### B2. `.specify/memory/constitution.md` (Principle I, version 2.1.0)

**B2.1 Inbound.** Before:

````markdown
**Inbound listeners.** Every TCP listener owned by code in this monorepo MUST be HTTPS. No `http.createServer`, no `OPENCLAW_BRIDGE_TLS_DISABLE`, no `tls ? https : http` ternaries, no null-on-cert-failure silent demotion. On cert-load failure: throw, refuse to listen, debug the config — never fall back to plaintext. Enforced by `scripts/lint-transport-monorepo.sh --strict`. Canonical pattern: `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts`.
````

After:

````markdown
**Inbound listeners.** Every TCP listener owned by code in this monorepo MUST be HTTPS. No `http.createServer` on a TCP host:port, no `OPENCLAW_BRIDGE_TLS_DISABLE`, no `tls ? https : http` ternaries, no null-on-cert-failure silent demotion. On cert-load failure: throw, refuse to listen, debug the config — never fall back to plaintext. Enforced by `scripts/lint-transport-monorepo.sh --strict`. Canonical pattern: `Copilot-Everything/scripts/miyo-tls-proxy.mjs` (`httpTransport.ts` was deleted on 2026-11-24).

**Unix-socket listeners (v2.1.0).** A listener bound to a filesystem path is not a TCP listener and carries its own rules instead. It MUST bind only inside the run directory `~/.local/state/trinc/run/` (always derived from `os.homedir()`), a directory of mode 0700 whose every level from home down is a real directory owned by the uid that group and others cannot write and that carries no ACL allow entry (a looser chain is refused, never repaired); publish its socket with mode 0600 through an exclusive `link()`; and refuse to listen, with a stable error code, rather than fall back to TCP. The three bridges (the canonical vault bridge, Command Center, Viz Studio) are the only such listeners, through one helper kept byte-identical in three files on the lint's `LEGITIMATE_NON_TCP` list; adding a file to that list requires an explicit security review. Record: `ops/security/bridges-uds-2026-11-24.md`.
````

**B2.2 Outbound.** Insert after the paragraph that starts `**Outbound connections (v2.0.0 expansion).**` (leave
that paragraph as it is):

````markdown
**Unix-socket clients (v2.1.0).** An `http.request(` or `http.get(` whose options carry `socketPath` (on the call line or within the next ten, the lint's structural exemption) is a Unix-socket client, not a TCP connection. It is permitted only through one wrapper per client file that validates the exact path it sends (absolute, inside the run directory, the expected socket name, the directory chain and the socket's 0600 mode checked) and pins the connection with `createConnection: () => net.connect({ path })`, never with an `agent` option: Node turns an empty or undefined `socketPath` into plaintext TCP to `localhost:80`. A missing socket is a refusal (`ENOENT`), never a retry over TCP. The bridges' clients carry the byte-identical `bridges-uds client v1` block or, in the Copilot fork, `src/mcp/udsClient.ts`.
````

**B2.3 Technology Constraints.** Before:

````markdown
- mkcert TLS at `~/.local/share/mkcert/localhost.pem`, expires 2028-07-07; all Node processes require `NODE_EXTRA_CA_CERTS` pointing to `~/Library/Application Support/mkcert/rootCA.pem`
````

After:

````markdown
- mkcert TLS at `~/.local/share/mkcert/localhost.pem`, expires 2028-07-07; every Node process that dials an HTTPS listener (the TLS proxies, LLM Guard) requires `NODE_EXTRA_CA_CERTS` pointing to `~/Library/Application Support/mkcert/rootCA.pem`; a client of the bridge sockets needs no CA
````

**B2.4 Version line.** Before (main's working copy; if main drops its uncommitted v2.0.1 instead, the line starts
`**Version**: 2.0.0` and the v2.0.1 clause below goes away):

````markdown
**Version**: 2.0.1 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-11-18 (v2.0.1 — browser-automation carve-out clarified: the Claude Browser pane is no longer the only browser surface; Claude in Chrome is the second, permanent since 2026-11-18, with no plaintext exception. v2.0.0 — extended Principle I scope to include outbound TCP connections; three resolution paths codified (replace / wrap / time-limited carve-out); vendor-code flagging-only carve-out documented; browser-automation carve-out preserved unchanged)
````

After (use the approval date if it is later than 2026-11-24):

````markdown
**Version**: 2.1.0 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-11-24 (v2.1.0 — Principle I: Unix-socket listeners and Unix-socket clients sanctioned under their own rules (run directory 0700, sockets 0600, exclusive publish, refuse rather than fall back to TCP, one validated client wrapper); the three bridges left TCP and mkcert TLS (bridges-uds, `ops/security/bridges-uds-2026-11-24.md`); the CA requirement scoped to HTTPS clients; the canonical TCP pattern repointed to `miyo-tls-proxy.mjs`. v2.0.1 — browser-automation carve-out clarified: the Claude Browser pane is no longer the only browser surface; Claude in Chrome is the second, permanent since 2026-11-18, with no plaintext exception. v2.0.0 — extended Principle I scope to include outbound TCP connections; three resolution paths codified (replace / wrap / time-limited carve-out); vendor-code flagging-only carve-out documented; browser-automation carve-out preserved unchanged)
````

### B3. `ARCHITECTURE.md`

**B3.1 §2 intro.** Before:

````markdown
Ports and owners as read with `lsof` on 2026-10-23, with Obsidian open.
````

After:

````markdown
Ports and owners as read with `lsof` on 2026-10-23, with Obsidian open. On 2026-11-24 (bridges-uds) the three
bridges moved from loopback TCP to Unix sockets in `~/.local/state/trinc/run/` (directory 0700, sockets 0600);
their rows show the socket.
````

**B3.2 §2 component map.** Before:

````text
Obsidian — owns four HTTPS bridges; all of them die when Obsidian quits
├── obsidian-bridge-launcher ─spawns─> canonical vault bridge        :8798  (node child process)
│       Local REST API plugin underneath                              :27124 (the vault engine)
│       routes /healthz /metrics /mcp/events POST /mcp/tool; bearer token + replay guard
├── command-center ──────────────────> Command Center bridge         :8799  32 tools
│       7 vault + 16 obsidian_openclaw_* + 7 zk_* + 2 video_pipeline_*; 0600 token file
│       └─spawns─> node scripts/run-workflow.js   (the engine, on demand)
├── trinc-viz-studio ────────────────> Viz Studio bridge             :8800  12 viz_* tools
│       every render is written under Visualizations/
├── trinc-security-bridge ───────────> Security Bridge               :8801  (owned by ~/Security Everything)
├── copilot (vendored fork)
│       chat: hosted copilot-plus-flash; MCP client for TOOLS only -> :8798, :8799, :8800
│       agent mode: opencode backend (ACP); `opencode serve` on :4096 is password-locked;
│       openclaw-stdio-proxy.mjs carries the agent's tool calls to :8799 and :8800
├── vault-zettelkasten ── in-process ZettelkastenService (LLM linking, scheduled vault scans)
└── personal plugins (sources outside this repo, in ~/Code): origin-nest,
    contextual-wiki-definitions, claude-console-mirror

Claude's one door (Claude Code, repo .mcp.json "openclaw-obsidian")
└── stdio adapter, profile openclaw ──> :8799 and :8800   (its only profile; it holds no :8798 client)
````

After:

````text
Obsidian — owns four bridges (three on Unix sockets, the Security Bridge on HTTPS); all of them die when Obsidian quits
├── obsidian-bridge-launcher ─spawns─> canonical vault bridge    vault-bridge.sock    (node child process)
│       Local REST API plugin underneath                              :27124 (the vault engine)
│       routes /healthz /metrics /mcp/events POST /mcp/tool; bearer token + replay guard
├── command-center ──────────────────> Command Center bridge     command-center.sock  32 tools
│       7 vault + 16 obsidian_openclaw_* + 7 zk_* + 2 video_pipeline_*; 0600 token file
│       └─spawns─> node scripts/run-workflow.js   (the engine, on demand)
├── trinc-viz-studio ────────────────> Viz Studio bridge         viz-studio.sock      12 viz_* tools
│       every render is written under Visualizations/
├── trinc-security-bridge ───────────> Security Bridge               :8801  (owned by ~/Security Everything)
├── copilot (vendored fork)
│       chat: hosted copilot-plus-flash; MCP client for TOOLS only -> the three bridge sockets (src/mcp/udsClient.ts)
│       agent mode: opencode backend (ACP); `opencode serve` on :4096 is password-locked;
│       openclaw-stdio-proxy.mjs carries the agent's tool calls to command-center.sock and viz-studio.sock
├── vault-zettelkasten ── in-process ZettelkastenService (LLM linking, scheduled vault scans)
└── personal plugins (sources outside this repo, in ~/Code): origin-nest,
    contextual-wiki-definitions, claude-console-mirror

Bridge sockets live in ~/.local/state/trinc/run/ (dir 0700, sockets 0600); nothing listens on TCP 8798-8800.

Claude's one door (Claude Code, repo .mcp.json "openclaw-obsidian")
└── stdio adapter, profile openclaw ──> command-center.sock and viz-studio.sock   (its only profile; it holds no vault-bridge client)
````

**B3.3 §4 plugin table.** Before:

````markdown
| `obsidian-bridge-launcher` | `Claude/obsidian-bridge-launcher` | spawns the `:8798` bridge; owns the fd-3 IPC used for console capture and the gated eval tool (off by default) |
| `command-center` | `Claude/obsidian-command-center` | dispatches runs, owns `:8799`, runs the post-run enrichment |
| `trinc-viz-studio` | `Claude/obsidian-viz-studio` | owns `:8800`; diagrams, charts, canvases, explainer cards, stat tiles, mockups, interactive HTML |
````

After:

````markdown
| `obsidian-bridge-launcher` | `Claude/obsidian-bridge-launcher` | spawns the canonical vault bridge (`dist/index.js --transport=uds`, socket `vault-bridge.sock`); owns the fd-3 IPC used for console capture and the gated eval tool (off by default) |
| `command-center` | `Claude/obsidian-command-center` | dispatches runs, owns `command-center.sock`, runs the post-run enrichment |
| `trinc-viz-studio` | `Claude/obsidian-viz-studio` | owns `viz-studio.sock`; diagrams, charts, canvases, explainer cards, stat tiles, mockups, interactive HTML |
````

**B3.4 §4 Claude's door in detail.** Before:

````markdown
evidence, memory search, engine health and a restricted vault publish on `:8799`; read-only
`obsidian_search_notes` / `obsidian_read_note`; the 12 `viz_*` renders on `:8800`, with `folder`,
````

After:

````markdown
evidence, memory search, engine health and a restricted vault publish on Command Center's socket; read-only
`obsidian_search_notes` / `obsidian_read_note`; the 12 `viz_*` renders on Viz Studio's socket, with `folder`,
````

**B3.5 §5 HTTPS-only and bridge auth.** Before:

````markdown
- **Bridge auth.** `:8798` uses a bearer token plus replay protection (nonce, timestamp, body SHA-256);
  `:8799` and `:8800` use 32-byte tokens in 0600 files outside the vault.
````

After:

````markdown
- **No TCP for the three bridges (2026-11-24, bridges-uds).** The vault bridge, Command Center and Viz
  Studio serve plain HTTP/1.1 on 0600 Unix sockets in the 0700 run directory `~/.local/state/trinc/run/`,
  through one helper kept byte-identical in three files on the lint's `LEGITIMATE_NON_TCP` list. A looser
  directory chain, a foreign or live socket at the name, or a path over 103 bytes is refused with a stable
  `UdsListenerError` code; nothing falls back to TCP. Clients check the same chain and the socket mode before
  sending a token, bind each server id to its socket name, and pin the connection to the path. Record:
  `ops/security/bridges-uds-2026-11-24.md`.
- **Bridge auth.** The vault bridge uses a bearer token plus replay protection (nonce, timestamp, body
  SHA-256); Command Center and Viz Studio use 32-byte tokens in 0600 files outside the vault. The tokens stay
  on the sockets as defence in depth against other processes of the same uid.
````

**B3.6 §5 browser guard.** Before:

````markdown
- **Browser guard (2026-10-24).** Before any route and before auth, all four bridges refuse what a web page
  could send: `:8798`, `:8799` and `:8800` answer 421 to a Host other than `127.0.0.1`/`localhost`/`[::1]`
  on the arrival port, and 403 to any `Origin`, any `Referer`, or a `Sec-Fetch-Site` other than `none`
  (`:8801` has its own, stricter version). They send no CORS headers. The helper is three byte-identical
  copies (`browserGuard.ts` / `browser-guard.ts`), compared by `ops/tr-suite/verify.sh`. It deliberately
  ignores `Sec-Fetch-Mode`/`-Dest`: Node's `fetch` sends `sec-fetch-mode: cors`, and Obsidian's `requestUrl`
  (Copilot's transport) may send `Sec-Fetch-Site: none`. Live check after any bridge redeploy (Obsidian open):
  `node ops/tr-suite/bridge-guard-live-check.mjs` (18 cases, read-only, `/healthz` only).
````

After:

````markdown
- **Browser guard (2026-10-24).** Before any route and before auth, all four bridges refuse what a web page
  could send: 403 to any `Origin`, any `Referer`, or a `Sec-Fetch-Site` other than `none` (`:8801` has its
  own, stricter version). On a TCP arrival the guard also answers 421 to a Host other than
  `127.0.0.1`/`localhost`/`[::1]`; the three bridge sockets have no port, so it skips that check there (Node
  sends `Host: localhost`, or `localhost:80` with a pinned connection), and no browser can dial a socket, so
  the guard is defence in depth. They send no CORS headers. The helper is three byte-identical copies
  (`browserGuard.ts` / `browser-guard.ts`), compared by `ops/tr-suite/verify.sh`. It deliberately ignores
  `Sec-Fetch-Mode`/`-Dest`. Live check after any bridge redeploy (Obsidian open):
  `node ops/tr-suite/bridge-guard-live-check.mjs` (read-only: on each socket `/healthz` 200, an
  unauthenticated POST 401, `Origin`, `Referer` and cross-site `Sec-Fetch-Site` 403, `OPTIONS` 405, no
  `Access-Control-*` header; then a TCP tripwire: nothing may accept a connection on 8798-8800 at `127.0.0.1`
  or `[::1]`).
````

**B3.7 §6 Verification.** Before:

````markdown
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8800/healthz
````

After:

````markdown
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs                          # the three bridge sockets, Obsidian open
node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs             # guard cases + TCP tripwire, Obsidian open
````

**B3.8 Retired table.** Before:

````markdown
| Thing | Status |
|---|---|
````

After (the header stays; one new first row):

````markdown
| Thing | Status |
|---|---|
| **TCP and mkcert TLS for the three bridges** (`:8798`, `:8799`, `:8800`; `httpTransport.ts`, `start:https` and `--transport=https`, the bridges' TLS env, the `bridgePort` settings, the clients' CA trust, `official-plugin-direct-mcp-cutover.sh` and `official-plugin-enable-write-mcp.sh`) | Retired 2026-11-24 (bridges-uds; decision record `ops/security/bridges-uds-2026-11-24.md`). The bridges serve the same routes on Unix sockets in `~/.local/state/trinc/run/`. Never re-add a TCP listener or a TCP fallback for them: a client that dials the freed ports hands its token to whatever holds them. The two official-plugin scripts refuse to run: they overwrote Copilot's MCP config with one `http://` server and printed the token. Back out only through the record's cold rollback, never piecemeal. |
````

### B4. `docs/learn-and-pitch` (then rebuild the pack)

**B4.1 `05-the-machine-room.md`.** Before:

````markdown
> hardware-key-approved research engine; every network service is HTTPS-only"). The port numbers, plugin
> names and security layers below are for Trevor's understanding, not for buyers.
````

After:

````markdown
> hardware-key-approved research engine; every network service is HTTPS-only"). The port and socket names,
> plugin names and security layers below are for Trevor's understanding, not for buyers.
````

Before:

````markdown
A *bridge* is a small HTTPS server inside an Obsidian plugin that lets other software talk to that plugin. All
of them stop when Obsidian quits.
````

After:

````markdown
A *bridge* is a small server inside an Obsidian plugin that lets other software on the Mac talk to that plugin.
Since 2026-11-24 the three TRINC bridges answer on private sockets, small files in a folder that only Trevor's
account can open, instead of network ports, so no other account and no web page can reach them. The Security
Bridge, owned by the security repo, is still an HTTPS port. All of them stop when Obsidian quits.
````

Before:

````markdown
    VB[":8798 vault bridge<br/>Copilot's way into the notes"]
    CC[":8799 Command Center<br/>starts runs, receives results"]
    VZ[":8800 Viz Studio<br/>diagrams and charts"]
````

After:

````markdown
    VB["vault bridge (vault-bridge.sock)<br/>Copilot's way into the notes"]
    CC["Command Center (command-center.sock)<br/>starts runs, receives results"]
    VZ["Viz Studio (viz-studio.sock)<br/>diagrams and charts"]
````

Before:

````markdown
| Port | What it does | Owner |
|---|---|---|
| `:8798` | The vault bridge: reading and writing notes. Copilot uses it. | `obsidian-bridge-launcher` plugin |
| `:8799` | Command Center: starts research runs, reports status, receives results (32 tools) | `command-center` plugin |
| `:8800` | Viz Studio: diagrams, charts, canvases, explainer cards, stat tiles, mockups (12 tools); every render lands in `Visualizations/` | `trinc-viz-studio` plugin |
````

After:

````markdown
| Socket or port | What it does | Owner |
|---|---|---|
| `vault-bridge.sock` | The vault bridge: reading and writing notes. Copilot uses it. | `obsidian-bridge-launcher` plugin |
| `command-center.sock` | Command Center: starts research runs, reports status, receives results (32 tools) | `command-center` plugin |
| `viz-studio.sock` | Viz Studio: diagrams, charts, canvases, explainer cards, stat tiles, mockups (12 tools); every render lands in `Visualizations/` | `trinc-viz-studio` plugin |
````

Before:

````markdown
It **cannot** create or edit notes, run commands, or reach the `:8798` vault bridge.
````

After:

````markdown
It **cannot** create or edit notes, run commands, or reach the vault bridge.
````

Before:

````markdown
- **HTTPS-only.** Every network listener in the repo is HTTPS and refuses to start without its certificate; no
  plaintext fallback exists.
````

After:

````markdown
- **HTTPS-only, and no network port for the bridges.** Every network listener in the repo is HTTPS and refuses
  to start without its certificate; no plaintext fallback exists. The three TRINC bridges listen on no network
  port at all: they answer on private sockets in a folder only Trevor's account can open, and they refuse to
  start rather than fall back to a port. [src: `CLAUDE.md` → Ports and sockets]
````

**B4.2 `08-glossary.md`.** Before:

````markdown
| **Bridge** | A small HTTPS server inside an Obsidian plugin |
| **Command Center** | The plugin and bridge (`:8799`) that start runs and receive results |
| **Viz Studio** | The plugin and bridge (`:8800`) that draw diagrams into `Visualizations/` |
````

After:

````markdown
| **Bridge** | A small server inside an Obsidian plugin; the three TRINC bridges answer on private sockets, not network ports |
| **Socket** | The private file a bridge answers on; only Trevor's account can open it, and no web page can reach it |
| **Command Center** | The plugin and bridge (`command-center.sock`) that start runs and receive results |
| **Viz Studio** | The plugin and bridge (`viz-studio.sock`) that draw diagrams into `Visualizations/` |
````

**B4.3 `10-slide-and-animation-brief.md`.** Before:

````markdown
| 21 | The security layers | HTTPS-only, YubiKey gates, secrets, Falcon, posture | `05` |
````

After:

````markdown
| 21 | The security layers | HTTPS-only, socket-only bridges, YubiKey gates, secrets, Falcon, posture | `05` |
````

Before:

````markdown
| 0–6 s | Obsidian drawn as a building with four rooms: Vault (:8798), Command Center (:8799), Viz Studio (:8800), Security (:8801) | "Obsidian is the console." |
````

After:

````markdown
| 0–6 s | Obsidian drawn as a building with four rooms: Vault (vault-bridge.sock), Command Center (command-center.sock), Viz Studio (viz-studio.sock), Security (:8801) | "Obsidian is the console." |
````

**B4.4 `00-README-for-Claude.md`.** Before:

````markdown
> using this pack. Facts are as of **2026-10-23**. Written from the live TRINC repository at
> `/Users/myhome/TRINC`; every fact carries its source.
````

After:

````markdown
> using this pack. Facts are as of **2026-10-23** (parts `05`, `08` and `10` updated on 2026-11-24 for the
> bridge sockets). Written from the live TRINC repository at `/Users/myhome/TRINC`; every fact carries its source.
````

**B4.5 Rebuild and check:**

```bash
python3 /Users/myhome/TRINC/scripts/build-learn-and-pitch-pack.py
python3 /Users/myhome/TRINC/scripts/build-learn-and-pitch-pack.py --check
```

### B5. The trinc-engineering skills, version 2.1.9

Source: `~/.claude/local-plugins/trinc-engineering/` (byte-identical to the 2.1.8 cache). Apply **before** the deploy
(rollout step 0), then load and mirror:

```bash
claude plugin marketplace update trinc-local
claude plugin update trinc-engineering@trinc-local
```

Then refresh the offsite copy in `My Drive/TRINC/Skills-Integrations/trinc-local/` by hand, and check that
`~/.claude/plugins/cache/trinc-local/trinc-engineering/2.1.9/` holds the new text.

**B5.0 `.claude-plugin/plugin.json`.** Before: `"version": "2.1.8",` After: `"version": "2.1.9",`

**B5.1 `skills/deploy-surface/SKILL.md`.** Before:

````markdown
| A TLS proxy (`*-tls-proxy.mjs`) | `~/.local/share/trevclaw-tls-proxies/` (staged copy) | **re-run the installer** — see below |
````

After (one new row above the TLS-proxy row):

````markdown
| The canonical vault bridge (`Copilot-Everything/bridges/obsidian-copilot-bridge`) | its own `dist/`, built in place in TRINC main; the launcher spawns `dist/index.js --transport=uds` | `cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && rm -rf dist && npm run build`, then a full Obsidian launch (or the launcher's "Restart bridge"). The launcher refuses to spawn a `dist/` that predates bridges-uds (no `dist/server/udsListener.js`, or a leftover `dist/server/httpTransport.js`), and `verify.sh` FAILs on it |
| A TLS proxy (`*-tls-proxy.mjs`) | `~/.local/share/trevclaw-tls-proxies/` (staged copy) | **re-run the installer** — see below |
````

Before:

````markdown
**3. The bridges die with Obsidian.** `:8798` (canonical vault bridge, which reads the vault through
the Local REST API plugin on `:27124`), `:8799` (Command Center) and `:8800` (Viz Studio) are served by
Obsidian plugins. Quit Obsidian and the vault is unreachable to every other surface. If a bridge "won't start", check Obsidian is running before debugging the
code.
````

After:

````markdown
**3. The bridges die with Obsidian, and they are Unix sockets, not ports (since 2026-11-24).** The
canonical vault bridge (`vault-bridge.sock`, which reads the vault through the Local REST API plugin on
`:27124`), Command Center (`command-center.sock`) and Viz Studio (`viz-studio.sock`) live in
`~/.local/state/trinc/run/` (directory 0700, sockets 0600) and are served by Obsidian plugins. Quit Obsidian
and every other surface gets `ENOENT` (no socket) or `ECONNREFUSED` (a stale socket a crash left; the next
start replaces it). If a bridge "won't start", check Obsidian is running, then read the refusal code it
logged before debugging the code: `ALREADY_SERVED` means another window or process holds the socket, and
`RUN_DIR_MODE`, `RUN_DIR_UNSAFE` or `RUN_DIR_ACL` mean the directory chain is looser than allowed, which code
never repairs (tell the operator; never change the modes from an agent). Nothing listens on TCP 8798-8800 any
more, and a listener there is a finding. For the bridges-uds flag day and its rollback, quit Obsidian and do a
full launch; never `plugin:reload`.
````

Before:

`````markdown
```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
```
`````

After:

`````markdown
```bash
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs
```

It prints one status line per bridge socket and never a token. It derives each socket path from the home
directory, so no socket path goes on a command line. After a bridge redeploy, with Obsidian open, also run
`node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs`.
`````

Before:

````markdown
Run `/invariant-check`. A deployed change that violates the HTTPS-only rule or a frozen plugin
ID is worse than an undeployed one, because it is now live and harder to attribute.
````

After:

````markdown
Run `/invariant-check`. A deployed change that violates the HTTPS-only rule, the bridges' no-TCP rule
or a frozen plugin ID is worse than an undeployed one, because it is now live and harder to attribute.
````

**B5.2 `skills/invariant-check/SKILL.md`.** Before:

`````markdown
Touched a bridge? Also run its own transport lint:

```bash
cd Copilot-Everything/bridges/obsidian-copilot-bridge && npm run lint:transport
cd Claude/obsidian-command-center && npm run lint:transport
```
`````

After:

`````markdown
Touched a bridge? Also run its own transport lint, and `verify.sh` for the byte-identity checks:

```bash
cd /Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge && npm run lint:transport
cd /Users/myhome/TRINC/Claude/obsidian-command-center && npm run lint:transport
cd /Users/myhome/TRINC/Claude/obsidian-viz-studio && npm run lint:transport
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh   # the three UDS helper copies and the four "bridges-uds client v1" blocks must match
```

Touched the engine's vault read-back (`openclaw-bridge/mcp/base-mcp.js` or `obsidian-bridge-mcp/`)? Also
run `npm run mcp:verify` and `npm run globals:lint` in the engine folder.
`````

Before:

````markdown
`*_TLS_DISABLE` env check, `tls ? https : http` ternaries, `if (!tls) return null`. UDS/pipe
transports binding a filesystem path are exempt. Canonical pattern to copy:
`Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts`.
````

After:

````markdown
`*_TLS_DISABLE` env check, `tls ? https : http` ternaries, `if (!tls) return null`. UDS/pipe
transports binding a filesystem path are exempt from the TLS rule and carry their own (below).
Canonical TCP pattern to copy: `Copilot-Everything/scripts/miyo-tls-proxy.mjs`
(`httpTransport.ts` was deleted on 2026-11-24).

**No TCP for the three bridges (non-negotiable, 2026-11-24, bridges-uds).** The vault bridge,
Command Center and Viz Studio listen only on 0600 Unix sockets in `~/.local/state/trinc/run/`
(directory 0700), through one helper kept byte-identical in three files (`uds-listener.ts` in
Command Center and Viz Studio, `udsListener.ts` in the bridge), the only files there that may call
`http.createServer`, all on the lint's `LEGITIMATE_NON_TCP` list. Every client request goes
through one wrapper that validates the exact path it sends and pins
`createConnection: () => net.connect({ path })` with no `agent` option (Node turns an empty
`socketPath` into plaintext TCP to `localhost:80`); no client falls back to TCP, and none needs a
CA. Red flags in a diff: a `.listen(` with a number or a host in a bridge package, an
`http.request(` to a bridge outside that wrapper, `agent: false` beside `createConnection`, a
socket path read from config instead of derived from `os.homedir()`, a socket path on a command
line, or any new TCP client of 8798-8800. Record: `ops/security/bridges-uds-2026-11-24.md`.
````

Before:

````markdown
**Ports are coordinated centrally.** 8798 (canonical vault bridge), 8799 (Command Center),
8800 (Viz Studio), 8801 (Security Bridge), 8743 (Miyo TLS), 6433 (Qdrant TLS), 8891 (SearXNG TLS).
Don't reassign without updating the repo `CLAUDE.md` port map.
````

After:

````markdown
**Ports and sockets are coordinated centrally.** Sockets in `~/.local/state/trinc/run/`:
`vault-bridge.sock` (canonical vault bridge), `command-center.sock` (Command Center),
`viz-studio.sock` (Viz Studio). Ports: 8801 (Security Bridge), 8743 (Miyo TLS), 6433 (Qdrant TLS),
8891 (SearXNG TLS); 8798, 8799 and 8800 are retired and must stay unbound. Don't reassign a port
or rename a socket without updating the repo `CLAUDE.md` tables and the helper's `SOCKET_NAMES`
(every client binds the name it expects, and `verify.sh` checks them).
````

**B5.3 `skills/openclaw-dispatch/SKILL.md`.** Before:

````markdown
> it started before the registration, so ask the operator to restart it — do NOT fall back to reading the bridge token or calling
> `:8799` yourself. If a restart is not possible, use the `engine-run` skill's terminal path and tell the operator the chat bubble
````

After:

````markdown
> it started before the registration, so ask the operator to restart it — do NOT fall back to reading the bridge token or connecting
> to the Command Center socket yourself. If a restart is not possible, use the `engine-run` skill's terminal path and tell the operator the chat bubble
````

Before:

````markdown
- **Never read `~/.config/openclaw-command-center/bridge-token`** or call `https://127.0.0.1:8799`
  directly. The adapter holds the token; you never do.
````

After:

````markdown
- **Never read `~/.config/openclaw-command-center/bridge-token`** or connect to the Command Center
  socket (`command-center.sock`) directly. The adapter holds the token; you never do.
````

Before:

````markdown
| `obsidian_not_running` | Obsidian is closed or the plugin did not load; nothing was sent | Ask the operator to open Obsidian (or, only on their explicit go, `open -a Obsidian`), then `obsidian_health`; wait ~90 s for the load-time backfill and ZK catch-up before dispatching |
````

After (the row gains a clause; one new row below it):

````markdown
| `obsidian_not_running` | Obsidian is closed or the plugin did not load (no socket, or a stale one a crash left); nothing was sent | Ask the operator to open Obsidian (or, only on their explicit go, `open -a Obsidian`), then `obsidian_health`; wait ~90 s for the load-time backfill and ZK catch-up before dispatching |
| `adapter_error` with a stderr line naming a socket refusal (`SOCKET_UNTRUSTED`, `SOCKET_PATH_TOO_LONG`, `EACCES`, `EPERM`, `ENOTSOCK`) | the bridge socket or its directory failed the trust check; nothing was sent | report it to the operator; do not retry, and never change a mode or a path by hand: a looser run directory is refused by design (`ops/security/bridges-uds-2026-11-24.md`). If the operator gives socket refusals their own code (approval (i)), use it here |
````

Before:

````markdown
- **15 Command Center tools (`:8799`):** `obsidian_health`, the read-only vault tools
````

After:

````markdown
- **15 Command Center tools (Command Center socket):** `obsidian_health`, the read-only vault tools
````

Before:

````markdown
- **12 Viz Studio tools (`:8800`, added 2026-10-23):** `viz_{health,mermaid,chart,canvas,graph_snapshot,
````

After:

````markdown
- **12 Viz Studio tools (Viz Studio socket, added 2026-10-23):** `viz_{health,mermaid,chart,canvas,graph_snapshot,
````

**B5.4 `skills/stack-decision/SKILL.md`.** Before:

````markdown
session to add Notion. "Knowledge base is the Obsidian vault via the `:8798` bridge — Notion is
````

After:

````markdown
session to add Notion. "Knowledge base is the Obsidian vault via the canonical vault bridge — Notion is
````

### B6. `ops/reorg/2026-10-cleanup-manifest.md` (optional pointer; the tombstone itself is in this record)

Before:

````markdown
- `Copilot-Everything/scripts/{assert-registered-paths,inventory,bootstrap-workspace,ollama-preload,socket-audit,official-plugin-*}` — dev-lane tooling, maintained as recently as 07-31/08-12.
````

After:

````markdown
- `Copilot-Everything/scripts/{assert-registered-paths,inventory,bootstrap-workspace,ollama-preload,socket-audit,official-plugin-*}` — dev-lane tooling, maintained as recently as 07-31/08-12. *(2026-11-24, bridges-uds: `official-plugin-direct-mcp-cutover.sh` and `official-plugin-enable-write-mcp.sh` now refuse to run, reversing this KEEP for those two, and `socket-audit.sh` audits the vault bridge's socket. Record: `ops/security/bridges-uds-2026-11-24.md`.)*
````

### B7. `Claude/trinc-content-mcp/src/draft.js`

Before:

````javascript
 * This is a spec, not a render. The `trinc-viz-studio` bridge on :8800 already owns rendering
 * (`viz_stat_tiles`), and proxying it through this server would put one renderer behind two
 * doors and add an Obsidian dependency for no new capability — the same reason this repo
 * declined merging the :8798 and :8799 bridges. Hand this object to `viz_stat_tiles` as-is.
````

After:

````javascript
 * This is a spec, not a render. The `trinc-viz-studio` bridge (its Unix socket viz-studio.sock)
 * already owns rendering (`viz_stat_tiles`), and proxying it through this server would put one
 * renderer behind two doors and add an Obsidian dependency for no new capability — the same
 * reason this repo declined merging the vault bridge and the Command Center bridge. Hand this
 * object to `viz_stat_tiles` as-is.
````

Before:

````javascript
    note: "Pass `spec` straight to the viz_stat_tiles tool on the :8800 bridge (Obsidian must be "
      + "running). Every tile value also appears in the post body with its source."
````

After:

````javascript
    note: "Pass `spec` straight to the viz_stat_tiles tool on the Viz Studio bridge (Obsidian must be "
      + "running). Every tile value also appears in the post body with its source."
````

The note is tool output (`content_draft`'s `thumbnail.note`); `test/thumbnail.test.mjs` matches only its prefix,
which is unchanged. Its subtest "shrinks rather than pads" already fails on `577f8f4` (it reads live release data) and
is not a regression. Then stage the server and check the drift:

```bash
cd /Users/myhome/TRINC/Claude/trinc-content-mcp && node --test test/thumbnail.test.mjs
zsh /Users/myhome/TRINC/Claude/trinc-content-mcp/install-connector.sh
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
```

(The installer also copies `README.md`, which this branch edits, into the staged copy.)

### B8. `_continuity/CONTINUITY.md` (one Log entry, prepended under "> Prepend new entries here.")

Fill the angle-bracket fields when the flag day is done; leave Current focus alone.

````markdown
### <UTC, `date -u +%Y-%m-%dT%H:%MZ`> · <this surface> · **The three bridges moved from loopback TCP and mkcert TLS to Unix sockets (bridges-uds, `<landing commits>`)**
- **SCOPE NOTE:** repo infra (bridge transport), so this is one brief entry; Current focus is unchanged.
- **Decision (operator, <date>):** approved the bridges-uds record `ops/security/bridges-uds-2026-11-24.md`, rows (a) to (i).
- **Did:** the vault bridge, Command Center and Viz Studio serve the same routes on `vault-bridge.sock`, `command-center.sock` and `viz-studio.sock` in `~/.local/state/trinc/run/` (0700, sockets 0600). Every client moved in one flag day: the Copilot fork and its agent proxy, the stdio adapter, Command Center's `research_notify`, the engine's read-back, the dev scripts and the live checks. Nothing listens on 8798-8800, and no client can fall back to TCP.
- **Verified:** <gate results from the landing>; live: `uds-health.mjs`, `bridge-guard-live-check.mjs`, the adapter's live `test:profiles`, one `research_notify`.
- **Next (operator):** the obsidianwatch re-bless, the Security Everything follow-ups in the record, the NotebookLM refresh in place.
- **For whoever's next:** the health check is `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs`; never put a socket path on a command line, and never add a TCP fallback.
````

The board's header names the bridge by its old port in two places; relabel them in the same write.

Before:

````markdown
> infra/topology (the `:8798` bridge, the vault, connectors, plugins). Unrelated work (home
````

After:

````markdown
> infra/topology (the canonical vault bridge, the vault, connectors, plugins). Unrelated work (home
````

Before:

````markdown
> `:8798` (Obsidian bridge → `My Digital Garden`) is an *additional* semantic path, **not**
````

After:

````markdown
> The canonical vault bridge (Obsidian → `My Digital Garden`, a Unix socket since 2026-11-24) is an *additional* semantic path, **not**
````

### B9. `_continuity/README.md` (clean in main, so it may also be edited in the branch)

The process doc mirrors the board's scope gate and the continuity-board skill, whose `:8798` wording this branch
already relabelled. The dated 2026-07-01 correction note stays as history.

Before:

````markdown
> infra/topology (the `:8798` bridge, vault, connectors, plugins). Unrelated work (home network,
> Security Everything, personal) goes to `~/.claude/handoffs/`, memory, or its own repo — not here.
> The business repo's *own infrastructure* counts as business-related (e.g. verifying the `:8798`
> bridge is a valid Log entry).
````

After:

````markdown
> infra/topology (the canonical vault bridge, vault, connectors, plugins). Unrelated work (home network,
> Security Everything, personal) goes to `~/.claude/handoffs/`, memory, or its own repo — not here.
> The business repo's *own infrastructure* counts as business-related (e.g. verifying the canonical vault
> bridge is a valid Log entry).
````

Before:

````markdown
Chat is **not** limited to the `:8798` Obsidian bridge. |
````

After:

````markdown
Chat is **not** limited to the canonical vault bridge. |
````

---

## Appendix C — operator config outside both repos (approval (e))

### C1. `~/.claude/settings.json`, `autoMode.environment`

Four entries, quoted exactly as they read on 2026-11-24 (index in the array, then the text). Replace each whole string.

[12] Before:

```text
**Key internal services**: obsidian-copilot-bridge (https://127.0.0.1:8798, MCP tool execution + healthz), Miyo TLS proxy (https://127.0.0.1:8743 → :8742), Qdrant TLS proxy (https://127.0.0.1:6433 → :6333), SearXNG TLS proxy (https://127.0.0.1:8891 → :8890) — all localhost-only services within this repo's workspace
```

[12] After:

```text
**Key internal services**: obsidian-copilot-bridge (Unix socket ~/.local/state/trinc/run/vault-bridge.sock since 2026-11-24, MCP tool execution + healthz; nothing listens on TCP 8798), Miyo TLS proxy (https://127.0.0.1:8743 → :8742), Qdrant TLS proxy (https://127.0.0.1:6433 → :6333), SearXNG TLS proxy (https://127.0.0.1:8891 → :8890) — all localhost-only services within this repo's workspace
```

[26] Before:

```text
**Key internal services**: obsidian-copilot-bridge (https://127.0.0.1:8798, canonical MCP vault bridge + healthz), Command Center bridge (https://127.0.0.1:8799), Viz Studio bridge (https://127.0.0.1:8800), Miyo TLS proxy (https://127.0.0.1:8743 → :8742), Qdrant TLS proxy (https://127.0.0.1:6433 → :6333), SearXNG TLS proxy (https://127.0.0.1:8891 → :8890), Ollama TLS proxy (https://127.0.0.1:11435 → :11434) — all localhost-only services within this repo's workspace
```

[26] After:

```text
**Key internal services**: the three Obsidian bridges on Unix sockets in ~/.local/state/trinc/run/ since 2026-11-24 (vault-bridge.sock: obsidian-copilot-bridge, the canonical MCP vault bridge + healthz; command-center.sock: Command Center bridge; viz-studio.sock: Viz Studio bridge; dir 0700, sockets 0600; nothing listens on TCP 8798-8800, and a listener there is a finding), Miyo TLS proxy (https://127.0.0.1:8743 → :8742), Qdrant TLS proxy (https://127.0.0.1:6433 → :6333), SearXNG TLS proxy (https://127.0.0.1:8891 → :8890), Ollama TLS proxy (https://127.0.0.1:11435 → :11434) — all localhost-only services within this repo's workspace
```

(The Ollama clause is the operator's to keep or drop: TRINC's docs record that proxy as retired on 2026-11-12.)

[32] Before:

```text
routine under Copilot-Everything/ prefix: obsidian CLI (obsidian read/create/open/search/daily/delete/move/append/vault/version), npx (plugin/bridge dev builds), bridge health-check curl commands against 127.0.0.1:8798/8743/6433/8891
```

[32] After:

```text
routine under Copilot-Everything/ prefix: obsidian CLI (obsidian read/create/open/search/daily/delete/move/append/vault/version), npx (plugin/bridge dev builds), bridge health checks with node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs (the three bridge sockets), and curl health-check commands against the TLS proxies 127.0.0.1:8743/6433/8891
```

[35] Before:

```text
routine under TRINC/ prefix (formerly TrevClaw-Obsidianodus/): obsidian CLI (read/create/open/search/daily/delete/move/append/vault/version), npx (plugin/bridge dev builds), bridge health-check curl commands against 127.0.0.1:8798/8799/8800/8743/6433/8891/11435, node scripts/run-workflow.js (biomedical workflow dispatch), pm2 status/logs/restart
```

[35] After:

```text
routine under TRINC/ prefix (formerly TrevClaw-Obsidianodus/): obsidian CLI (read/create/open/search/daily/delete/move/append/vault/version), npx (plugin/bridge dev builds), bridge health checks with node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs and node /Users/myhome/TRINC/ops/tr-suite/bridge-guard-live-check.mjs (the three bridge sockets), curl health-check commands against the TLS proxies 127.0.0.1:8743/6433/8891/11435, node scripts/run-workflow.js (biomedical workflow dispatch), pm2 status/logs/restart
```

### C2. `~/.claude/skills/security-orchestration/references/trevclaw-stack-profile.md` (lines 63-64)

Before:

```text
Canonical vault bridge `:8798` (HTTPS); additive Command Center bridge `:8799` (HTTPS); a third
Obsidian MCP endpoint is configured at `:8800`.
```

After:

```text
Canonical vault bridge `vault-bridge.sock`; additive Command Center bridge `command-center.sock`; Viz Studio
bridge `viz-studio.sock`. Since 2026-11-24 (TRINC bridges-uds) all three are Unix sockets in
`~/.local/state/trinc/run/` (dir 0700, sockets 0600), with no TCP listener and no TLS; a listener on TCP
8798-8800 is a finding. The Security Bridge stays HTTPS on `:8801`.
```
