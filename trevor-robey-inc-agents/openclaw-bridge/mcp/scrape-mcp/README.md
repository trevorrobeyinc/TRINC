# scrape-mcp

Node-side adapter to the manual-invocation Python `scrape-sidecar/` service.

## Architecture

```
agent prompt / script
        │
        ▼
createScrapeMcp().scrape_target(input)
        │
        ▼
scrapeSidecarRequest()  ── HTTPS (mkcert) ──▶ scrape-sidecar :8842
        │                                            │
        ▼                                            ▼
Zod-validated output                       Camoufox / SeleniumBase
                                                     │
                                                     ▼
                                        Open-access biomedical page
```

## Calling directly from scripts

```js
const { runScrape } = require("openclaw-bridge/mcp/scrape-mcp/scrape-mcp.js");

const out = await runScrape("elife", { article_id: "83456" });
console.log(out.record.payload.title);
```

## Wiring into the agent runtime (manual step)

`openclaw-bridge/mcp/mcp-service.js` registers biomedical MCPs via factory imports. To expose `scrape_target` to the agent runtime, add:

```js
const { createScrapeMcp } = require("./scrape-mcp/scrape-mcp.js");
```

at the top of `mcp-service.js`, then register it in the same place the other MCPs are registered. This is intentionally a manual step: the brand posture in `trevor-robey-inc-agents/CLAUDE.md` lists browser automation as manual-only, so the operator decides when to expose scraping to autonomous agent loops.

## Required env

- `NODE_EXTRA_CA_CERTS=/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem` — Node.js trusts the sidecar's mkcert TLS cert.
- `SCRAPE_SIDECAR_HOST` (default `127.0.0.1`)
- `SCRAPE_SIDECAR_PORT` (default `8842`)

## Pre-flight

For research-session calls, no pre-flight is needed — `scripts/run-research-task.js` and `scripts/run-workflow.js` auto-start the sidecar via `openclaw-bridge/core/scrape-sidecar-lifecycle.js` and stop it when the session exits.

For ad-hoc calls outside a research session, start the sidecar manually:

```
cd scrape-sidecar && bash scripts/start-sidecar.sh
```

`cd scrape-sidecar && bash scripts/start-sidecar.sh` - enters the sidecar folder and boots it over HTTPS via mkcert; refuses to start if certs are missing.

Set `OPENCLAW_AUTOSTART_SCRAPE_SIDECAR=0` to disable the lifecycle (the sidecar then must be started manually as in any earlier setup).
