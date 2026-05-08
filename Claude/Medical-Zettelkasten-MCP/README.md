# Medical Zettelkasten MCP

MCP server combining InfraNodus text network analysis algorithms with Zettelkasten knowledge management commands for biomedical research.

## Setup

```bash
nvm use 22.13.1
npm ci
```

## Usage

### As MCP Server (stdio)

```bash
npm start
```

Register in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "medical-zettelkasten": {
      "command": "node",
      "args": ["/path/to/Medical-Zettelkasten-MCP/src/server.js"]
    }
  }
}
```

### Programmatic (Node.js)

```javascript
const { dispatch } = require("./src/handlers/index.js");

const result = dispatch("full_zettelkasten_analysis", {
  text: "Your biomedical research text here...",
  input_type: "text",
});

const analysis = JSON.parse(result.content[0].text);
```

### With OpenClaw

```javascript
const { createOpenClawBridgeAdapter } = require("./lib/openclaw-bridge-adapter.js");
const adapter = createOpenClawBridgeAdapter();
const result = await adapter.analyzeToolUniverseData(toolUniverseJson);
```

## Tests

```bash
npm test
```

111 tests across graph algorithms, Zettelkasten commands, MCP server dispatch, and integration adapters.

## 10 MCP Tools

| Tool | What it does |
|------|-------------|
| `analyze_network` | Full graph analysis |
| `find_gaps` | Structural gaps (missing connections) |
| `detect_clusters` | Topical communities |
| `measure_diversity` | Coverage bias scoring |
| `cross_domain_connect` | Cross-domain bridges and isomorphisms |
| `break_echo_chamber` | Bias detection and challenge questions |
| `link_semantically` | Typed relationship classification |
| `rescue_orphans` | Isolated concept reintegration |
| `generate_serendipity` | Unexpected connections and dark nodes |
| `full_zettelkasten_analysis` | All 5 Zettelkasten analyses combined |

## License

UNLICENSED — Trevor Robey Inc.
