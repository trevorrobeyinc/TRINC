# Viz Studio (`trinc-viz-studio`)

Obsidian plugin that renders visualizations **locally** into the vault and exposes them to
agents over an additive MCP bridge on an owner-only Unix socket,
**`~/.local/state/trinc/run/viz-studio.sock`** (HTTP/1.1 plus a bearer token; no TCP port since
bridges-uds, 2026-11-24). No external APIs, no network egress, no new keys — mermaid via
Obsidian's bundled `loadMermaid()`, charts and graph snapshots as hand-rolled deterministic SVG,
boards as JSONCanvas files, PNG via Electron-canvas rasterization.

Suite: **TR-Obsidian Intelligence Network Citations — Viz Studio**. Both ids are **FROZEN**:

| id | where it's load-bearing |
|---|---|
| `trinc-viz-studio` (plugin id) | vault plugin dir, token path `~/.config/trinc-viz-studio/bridge-token` |
| `viz-studio` (fork MCP server id) | Copilot `mcp.servers[].id`, Lane A tool ids `mcp_viz-studio_*`, the fork's `ACP_MCP_CAPABLE_SERVER_IDS` allow-set |

Version is pinned `9.9.9` so a community-registry id collision can never offer a false
"update" (the defense that failed for the copilot fork on 2026-08-12).

## The core constraint the design serves

**Tool results are text-only in both Copilot chat lanes** (Lane A `JSON.stringify`s results;
Lane B's ACP translator drops non-text tool-result content). So every tool **writes files
into the vault** and returns `{path, embed: "![[…]]", summary}` — the *note* is the display
surface, never the chat bubble. `returnContent: true` additionally returns the raw
`svg`/`canvas`/`mermaid` content for consumers that don't read the vault (the research
engine's bundle renderers, which must ship **SVG only** — the deliverable packager hashes
files as UTF-8 text, so PNG would corrupt).

## Tools (12)

`viz_health` · `viz_mermaid` (note fence default; svg/png export) · `viz_chart`
(bar/line/area/scatter/pie/donut — Cove palette + mark specs since 2026-08-27, see below) ·
`viz_render_svg` (sanitized agent-authored SVG) · `viz_canvas` (JSONCanvas boards,
grid/tree/radial auto-layout) · `viz_graph_snapshot` (metadata-cache link graph around a
note) · `viz_guided` (Guided Learning explainer card) · `viz_perceptual_map` (marketing
positioning 2×2 — see below) · `viz_diagram` (styled system/architecture card diagram — see
below) · `viz_stat_tiles` (stat tiles / KPI row / meters) · `viz_mockup` (typed-block UI
mockups in browser/phone/card frames) · `viz_interactive` (self-contained interactive HTML
explainer, opens in the system browser).

### The visualize design layer (2026-08-27)

The visualize MCP's remaining module specs (chart/data-viz, mockup, interactive) were
captured the same way as the diagram module and centralized in
`src/render/vizTokens.ts` — ramps, INK, the **Cove categorical palette** (8 fixed slots,
never cycled past 8), status colors, CDS chrome neutrals, and the full CSS custom-property
block for HTML documents (light + dark). What changed / arrived:

- **`viz_chart` restyled** (operator-directed): Cove series colors in fixed slot order; ink
  #0b0b0b / secondary #52514e / muted #898781 text; #e1e0d9 gridlines, #c3c2b7 baselines;
  mark specs — bars ≤24px with 4px rounded data-ends and square baselines, 2px surface gaps
  between stacked segments and pie slices, 2px round-capped lines, 10%-opacity areas, 8px
  markers ringed in the surface color.
- **`viz_stat_tiles`** — the forms the spec prescribes INSTEAD of charts: stat tiles (muted
  13px label, ≥48px serif hero with tabular figures, ▲/▼ status-colored delta, Cove-blue
  sparkline with ringed end-dot), KPI rows, and same-ramp meters (blue-100 track /
  blue-600 fill). Serif is Georgia-stack — Anthropic Serif is host-only.
- **`viz_mockup`** — typed blocks (header/metric_row/field/select/button_row/text incl.
  wireframe bars/list/badge_row/image/divider) in the CDS component language, framed as a
  browser window (traffic lights + address pill), phone, raised card, or bare. Warns when a
  view carries more than one filled button (accent rule).
- **`viz_interactive`** — a self-contained `.html` written to the vault: CDS tokens live in
  both modes, pre-styled bare form controls (36px inputs, 4px-track sliders, outline
  buttons), `.card`/`.metric`/`.hero`/`.badge`/`.row`/`.grid` helpers, a `sendPrompt` stub,
  and a **strict CSP making the document network-inert** (external refs also stripped, with
  warnings). Obsidian does not execute scripts in embeds, so `open: true` launches the
  system browser and the note gets a `[[link]]`. Not bundle-eligible (bundles are SVG-only).

### `viz_diagram` — card diagrams in the visualize design language (added 2026-08-27)

System/architecture diagrams styled like the host "visualize" MCP's diagram module, whose
component conventions (captured from its read_me and baked in as literals in
`src/render/cardDiagram.ts`) define the look: rounded cards (rx 10) with a 14px/600 title and
a muted 12px subtitle, per-card semantic color `kind` (the module's 9 ramps — solid style =
800-stop fill + 200 stroke + 100/200 text; `soft` style = 50 fill + 600 stroke + 800/600
text — plus `ink` for near-black hub/terminal cards), faint section headers over `group`
clusters, and thin grey chevron-head arrows (`dashed: true` for pending/planned links).
Layout is deterministic: longest-path layering left→right, grouped nodes share one labeled
column, same-column cards stack, disconnected subgraphs become stacked bands — EXCEPT a band
that is exactly one group, which lays out by depth so a pure chain reads horizontally.
Agent guidance mirrored from the module: 2-3 kinds per diagram, gray for neutral/structural,
reserve red/amber/green/blue for genuine semantics. Placement contract shared with
`viz_perceptual_map`/`viz_guided` (`targetNote` / `targetCanvas` image card / `useActiveTab` /
`open`), now factored into `resolveTargets()`/`revealResult()` in `src/tools/shared.ts`.

### `viz_perceptual_map` — positioning maps (added 2026-08-19)

The marketing 2×2 (à la Visual Paradigm's perceptual-map maker): two bipolar attribute
axes crossing at the center of a relative space (default scale -10..10, shared by both
axes), competitors plotted as labeled bubbles with optional `segment` colors + legend,
`size` bubble weighting (area-true sqrt scaling), and muted `quadrantLabels` captions.
One resolver validates the spec; two builders consume it:

- **`format: "svg"/"png"`** — one deterministic image (chart conventions: explicit
  background, pinned system fonts, palette from `src/render/palette.ts`).
- **`format: "canvas"`** — a native JSONCanvas board: four HALF×HALF group frames form
  the quadrant grid, pole labels sit outside it, and every competitor is a **draggable
  card** (segment color = card tint), so the map stays workshoppable.

Placement mirrors `viz_guided`: `targetNote` appends the embed, `targetCanvas` adds the
map to an existing canvas (`canvas` format inserts the whole node-set into free space via
`insertCanvasNodes`; svg/png insert the image as a card), `useActiveTab` routes to
whatever the user has open (note vs canvas auto-detected), and `open` (default true)
reveals the result.

### `viz_guided` — Guided Learning cards

The teaching tool. From a structured spec it emits **one self-contained SVG**: title banner,
themed diagram with auto-numbered stage subgraphs and semantic node shapes, an auto-derived
legend, and a numbered step-by-step breakdown underneath.

- **Presets** fix the teaching structure: `flow_progression` (caller-supplied stages),
  `network_segmentation` (Physical · L2 · L3 · Out-of-Band), `threat_containment`
  (Detect · Isolate · Eradicate · Recover), `data_vs_control_plane` (two lanes).
  Adding one is a single object in `src/render/guided/presets.ts`.
- **Node `kind`** drives color + shape (endpoint, infra, transit, server, datastore, sensor,
  control, threat, asset, decision, step); `shape` overrides it; `badge` prefixes the label.
- **Edge `kind`** drives the line semantics: `data` solid · `mirror` dashed grey ·
  `control` dashed purple · `blocked` bold red.
- `mermaid` may be passed instead of `spec` to wrap an existing diagram in card chrome.
- `stepKeyNote: true` also writes a companion note holding the embed, the step key as
  searchable text, and the editable Mermaid source.
- Node cap is 60 (legibility + the ACP proxy's 8s budget); the generated Mermaid is validated
  before render, so a bad spec returns the verbatim parser error and writes nothing.

Two mechanics are load-bearing and easy to break: the nested diagram `<svg>` must carry
mermaid's own root **`id`** (its stylesheet is id-scoped — drop the id and every subgraph
cluster loses its fill and paints solid black), and an edge label goes **after** the complete
arrow (`-->|"text"|`, not `--|"text"|>`).

The **contract of record** is `src/bridge/toolSchemas.ts` (served live by `tools/list`).
Mirrors that must stay in sync:
- `Copilot-Everything/repos/obsidian-copilot-mcp-v4/src/mcp/catalog.ts` (Lane A zod entries)
- `Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs` `VIZ_TOOL_NAMES` and
  `VIZ_BLOCKED_PROPS` (Claude's door; it reads the schemas live, so only the names and any
  new write-target property need adding — `npm run test:profiles` fails until they are)

Common writer params: `fileName?`, `folder?`, `targetNote?` (append the embed to a note,
created with a heading if missing), `overwrite?` (default false → `-2`/`-3` suffix),
`returnContent?`. Errors are thrown server-side and surface as
`{ok: false, error: {message}}` — chart validation pinpoints the exact bad datum
(`data.series[1].values[3] is not a finite number`) and mermaid returns the parser message
verbatim, so calling agents can self-correct.

## Wire contract (clone of the Command Center bridge)

- **Transport** (bridges-uds, 2026-11-24; HTTPS on `127.0.0.1:8800` until then): plain HTTP/1.1
  on the Unix socket `~/.local/state/trinc/run/viz-studio.sock`, the home taken from
  `os.homedir()`. The run directory is 0700 and the socket 0600, so only processes of this user
  can connect and no browser can: there is no TCP listener, no TLS and no mkcert pair, and no
  client falls back to TCP (a client that cannot reach the socket reports the bridge as not
  running). All socket work is `src/bridge/uds-listener.ts`, byte-identical with the Command
  Center and vault bridge copies (`ops/tr-suite/verify.sh` compares them). A start is refused,
  with a stable error code, when the run directory is loose, symlinked or not this user's, when
  something other than our socket sits at the path, or when another process serves the socket
  (the plugin in a second Obsidian window); only a stale socket left by a crash is replaced. A
  plugin reload hands the socket to the new instance. If the socket name is removed or replaced
  while the bridge runs, the bridge closes and shows "Bridge stopped: …".
  `npm run lint:transport` fails on any `createServer(` or `.listen(` in `src/` outside that file.
- **Browser guard**: Origin, Referer and a cross-site Sec-Fetch-Site are refused with 403 before
  auth and before any route. The Host check (421) applies only to a TCP arrival port, so it is
  skipped on the socket, where Node clients send `Host: localhost` (`localhost:80` with the
  socket-pinned request the bridges-uds clients make).
- **Auth**: `Authorization: Bearer <token>` or `X-MCP-Token: <token>`; token auto-created
  0600 at `~/.config/trinc-viz-studio/bridge-token` (never in `data.json` — Obsidian
  persists that world-readable with `.bak` copies). `GET /`, `/health`, `/healthz` are
  auth-exempt probes. The token is still required on the socket: it is the defence against
  other processes of the same user.
- **Three POST shapes**, all → the same dispatcher:
  1. `/mcp/tool` `{tool, operation?, input}` → flattened `{ok: true, ...result}` (Lane A /
     engine adapter shape; `operation` is ignored — the dispatcher keys on `tool`)
  2. `{name, arguments}` → `{result}` / 400 `{error}`
  3. JSON-RPC 2.0 `initialize` / `tools/list` / `tools/call` (what the ACP stdio proxy
     speaks; `tools/call` wraps the result as MCP text content)
- 1 MB body cap; no SSE (nothing consumes it).
- **Health**: the probes answer `viz_health`, whose `socket` field (the socket's basename,
  `viz-studio.sock`) replaced `port` on 2026-11-24. Check all three bridges with
  `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs`, which prints one status line per bridge
  and never a token.

## Consumers and how each is wired

1. **Copilot Agent Mode (opencode/codex, ACP)** — dynamic discovery. The fork's
   `acpMcpServers.ts` allow-set contains `viz-studio`; per session the generic
   `openclaw-stdio-proxy.mjs` (deployed with the copilot plugin) is spawned with
   `OPENCLAW_BRIDGE_SOCKET` (the resolved socket path, whose name must be `viz-studio.sock`) and
   `OPENCLAW_BRIDGE_TOKEN`. **Future tools added here appear in Agent Mode with zero fork
   changes.** Note the proxy's 8 s per-request timeout — tools must answer inside it
   (rasterization is capped accordingly).
2. **Classic chat-pane autonomous agent (Lane A)** — static catalog entries in the fork's
   `catalog.ts` (no `operation` field — the vault bridge's strict enum must never see one) +
   `data.json`: the `viz-studio` entry in `mcp.servers[]` (transport `uds`) and the twelve
   `mcp_viz-studio_*` ids in `autonomousAgentEnabledToolIds`. Obsidian's `requestUrl` cannot
   reach a Unix socket, so the fork calls the bridge with Node `http` over the socket
   (`src/mcp/udsClient.ts`).
3. **Claude (since 2026-10-23)** — the stdio adapter's `openclaw` profile, registered as
   `openclaw-obsidian` in the monorepo `.mcp.json`: all twelve tools, schemas taken live from
   `tools/list`, with `folder`, `targetNote`, `targetCanvas`, `useActiveTab`/`useActiveNote` and
   `overwrite` stripped and refused, so Claude's renders land only in `Visualizations/`. It
   reaches `viz-studio.sock` under its own `os.homedir()`; there is no URL override any more.
4. ~~**Research engine**~~ — the `viz-bridge-mcp` adapter (`researchRuntime.vizBridge`) was
   never called by any deliverable and was **retired 2026-10-23**; its registry entry
   `viz-bridge` is a tombstone with the restore command.

### `data.json` server entry recipe (deployed config, not in git)

```json
{
  "id": "viz-studio",
  "displayName": "Viz Studio",
  "enabled": true,
  "transport": "uds",
  "socketPath": "",
  "authToken": "<contents of ~/.config/trinc-viz-studio/bridge-token>",
  "timeoutMs": 30000,
  "vaultName": "My Digital Garden",
  "vaultRoot": "/Users/myhome/My Digital Garden",
  "enabledToolNames": ["viz_health", "viz_mermaid", "viz_chart", "viz_render_svg", "viz_canvas", "viz_graph_snapshot", "viz_guided", "viz_perceptual_map", "viz_diagram", "viz_stat_tiles", "viz_mockup", "viz_interactive"]
}
```

`"socketPath": ""` lets the fork resolve `~/.local/state/trinc/run/viz-studio.sock` from the id
at run time. An entry still in the old form (`"transport": "http"`, `"httpEndpoint":
"https://127.0.0.1:8800"`) is converted by the fork itself when it loads, which keeps
`httpEndpoint` as a record; an unconverted http entry is listed in Diagnostics and never dialled.

Edit with Obsidian **closed** (the plugin persists settings and will clobber concurrent
edits), keep the file 0600, and remember `enabledToolNames` gates only Lane A — Agent Mode
ignores it and reads `tools/list` live.

## Build / install / dev

```bash
npm install
npm run check          # tsc -noEmit
npm run build          # → main.js
npm test               # node --test: browser guard + socket helper (test/uds-listener.test.ts)
npm run lint:transport # fails on createServer( or .listen( outside src/bridge/uds-listener.ts
```

Install = copy `main.js` + `manifest.json` + `styles.css` into
`<vault>/.obsidian/plugins/trinc-viz-studio/`, merge the id into
`community-plugins.json`, then Obsidian CLI `app:reload` (a "socket hang up" response is
success). Settings tab: bridge status/start/stop, the socket path (read-only), output
folders, PNG scale, chart background. A `bridgePort` left in the plugin's `data.json` by an
older build is ignored and kept as it is.

## Security posture

- SVG sanitizer (`src/render/svgSanitize.ts`): strips `<script>`, `foreignObject`,
  `iframe`/`embed`/`object`, non-local `use`, non-`data:` `image`, all `on*` handlers,
  non-fragment hrefs, `javascript:` values, and external `url()`/`@import` in styles —
  removals are reported in `warnings`. This doubles as canvas-taint protection for PNG
  export.
- Path traversal blocked (`safePath`), writes confined to vault-relative paths; default
  output namespace `Visualizations/` (+ `Visualizations/assets/`), which nothing else owns.
- Deterministic rendering: no timestamps/randomness in any generated artifact — identical
  input ⇒ byte-identical SVG (verified by shasum in the smoke suite).

## Caveats

- PNG export uses system fonts only (generated SVG pins `system-ui`); external
  fonts/images can't rasterize by design.
- Mermaid export requires the bundled mermaid to expose `render` (probed via `viz_health`
  → `mermaid.canExportSvg`; verified true on Obsidian 1.12.7). Degraded mode falls back to
  `format: "note"` (native rendering) with a clear error.
- `// OPERATOR DECISION` markers sit at the three taste points: chart palette
  (`src/render/palette.ts`), canvas density (`src/render/layout.ts`), file-naming policy
  (`src/vaultWriter.ts`).
