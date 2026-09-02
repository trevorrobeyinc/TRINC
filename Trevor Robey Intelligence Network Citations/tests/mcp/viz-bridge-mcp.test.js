"use strict";

// Unit tests for the viz-bridge-mcp adapter.
//
// The contract that matters most is FAIL-SOFT: the Viz Studio bridge dies with
// Obsidian, so every call must degrade to { ok: false } rather than throw into
// a run. These tests use an injected fetchImpl + authToken, so they never touch
// the network or the token file.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createVizBridgeMcp, VIZ_TOOLS } = require("../../openclaw-bridge/mcp/viz-bridge-mcp/index.js");

function makeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { fetchImpl, calls };
}

// The Viz Studio bridge answers the FLATTENED shape: { ok: true, ...fields }.
const okResponse = (fields) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, ...fields }),
});

test("chart posts the viz_chart tool with bearer auth and unwraps the flattened response", async () => {
  const { fetchImpl, calls } = makeFetch(() =>
    okResponse({ path: "Visualizations/assets/x.svg", embed: "![[Visualizations/assets/x.svg]]", svg: "<svg/>" })
  );
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.chart({ type: "bar", data: { labels: ["a"], series: [{ name: "s", values: [1] }] } });

  assert.equal(res.ok, true);
  assert.equal(res.data.path, "Visualizations/assets/x.svg");
  assert.equal(res.data.svg, "<svg/>");
  assert.equal(res.data.ok, undefined, "the ok flag must not leak into data");

  assert.match(calls[0].url, /\/mcp\/tool$/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "viz_chart");
  assert.equal(body.operation, undefined, "viz tools must not send an operation field");
  assert.equal(body.input.returnContent, true, "engine callers default to returnContent");
  const h = calls[0].init.headers;
  assert.equal(h.Authorization, "Bearer token-viz-0123456789abcdef0123456789ab");
  assert.equal(h["x-mcp-token"], "token-viz-0123456789abcdef0123456789ab");
  assert.equal(h["x-mcp-timestamp"], undefined, "bearer-only bridge: no replay headers");
});

test("caller can override the returnContent default", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ path: "p.svg" }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  await mcp.mermaid({ source: "flowchart TD\n A-->B", returnContent: false });
  assert.equal(JSON.parse(calls[0].init.body).input.returnContent, false);
});

test("FAIL-SOFT: a thrown transport error returns { ok: false }, never throws", async () => {
  const { fetchImpl } = makeFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.renderSvg({ svg: "<svg/>" });
  assert.equal(res.ok, false);
  assert.match(res.error, /ECONNREFUSED/);
});

test("FAIL-SOFT: a non-ok bridge response surfaces its error message quietly", async () => {
  const { fetchImpl } = makeFetch(() => ({
    ok: false,
    status: 401,
    json: async () => ({ ok: false, error: { message: "unauthorized" } }),
  }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.chart({ type: "bar", data: { series: [{ name: "s", values: [1] }] } });
  assert.deepEqual(res, { ok: false, error: "unauthorized", status: 401 });
});

test("FAIL-SOFT: unparseable JSON degrades to an HTTP-status error", async () => {
  const { fetchImpl } = makeFetch(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("bad json");
    },
  }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.health();
  assert.equal(res.ok, false);
  assert.match(res.error, /HTTP 200/);
});

test("available() caches a failed probe and force re-probes", async () => {
  let respondOk = false;
  const { fetchImpl, calls } = makeFetch(() =>
    respondOk
      ? okResponse({ status: "ok" })
      : { ok: false, status: 0, json: async () => null }
  );
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });

  assert.equal(await mcp.available(), false);
  assert.equal(await mcp.available(), false, "second call must hit the cache");
  assert.equal(calls.length, 1, "no second network probe without force");

  respondOk = true;
  assert.equal(await mcp.available({ force: true }), true);
  assert.equal(calls.length, 2);
});

test("missing token fails closed without touching the network", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({}));
  const mcp = createVizBridgeMcp({ fetchImpl, tokenPath: "/nonexistent/viz-token" });
  const res = await mcp.health();
  assert.equal(res.ok, false);
  assert.match(res.error, /token unavailable/);
  assert.equal(calls.length, 0);
});

test("exposes the twelve-tool surface for the connector registry", () => {
  assert.deepEqual(VIZ_TOOLS, [
    "viz_health",
    "viz_mermaid",
    "viz_chart",
    "viz_render_svg",
    "viz_canvas",
    "viz_graph_snapshot",
    "viz_guided",
    "viz_perceptual_map",
    "viz_diagram",
    "viz_stat_tiles",
    "viz_mockup",
    "viz_interactive",
  ]);
});

test("statTiles posts viz_stat_tiles and defaults to returnContent", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ path: "tiles.svg", svg: "<svg/>" }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.statTiles({ tiles: [{ label: "Revenue", value: "$1" }] });

  assert.equal(res.ok, true);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "viz_stat_tiles");
  assert.equal(body.input.returnContent, true);
});

test("guided posts viz_guided and defaults to returnContent for deliverable renderers", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ path: "card.svg", svg: "<svg/>" }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.guided({ title: "T", spec: { nodes: [{ id: "a", label: "A" }] } });

  assert.equal(res.ok, true);
  assert.equal(res.data.svg, "<svg/>");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "viz_guided");
  assert.equal(body.input.returnContent, true);
});

test("perceptualMap posts viz_perceptual_map and defaults to returnContent", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ path: "map.svg", svg: "<svg/>" }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.perceptualMap({
    title: "T",
    xAxis: { low: "Low Price", high: "High Price" },
    yAxis: { low: "Low Quality", high: "High Quality" },
    items: [{ label: "A", x: 1, y: 2 }],
  });

  assert.equal(res.ok, true);
  assert.equal(res.data.svg, "<svg/>");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "viz_perceptual_map");
  assert.equal(body.input.returnContent, true);
});

test("cardDiagram posts viz_diagram and defaults to returnContent", async () => {
  const { fetchImpl, calls } = makeFetch(() => okResponse({ path: "diagram.svg", svg: "<svg/>" }));
  const mcp = createVizBridgeMcp({ fetchImpl, authToken: "token-viz-0123456789abcdef0123456789ab" });
  const res = await mcp.cardDiagram({
    title: "T",
    nodes: [{ id: "a", title: "A", kind: "ink" }],
  });

  assert.equal(res.ok, true);
  assert.equal(res.data.svg, "<svg/>");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.tool, "viz_diagram");
  assert.equal(body.input.returnContent, true);
});
