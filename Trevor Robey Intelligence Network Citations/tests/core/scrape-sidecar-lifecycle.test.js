"use strict";

// Pins the 2026-08-12 operator decision: the Playwright scrape-sidecar is RETIRED — autostart
// defaults OFF and only an explicit env opt-in re-enables it. This test is the checkable form
// of the decision (see the tombstoned `scrape` entry in config/connector-registry.json): if a
// future change flips the default back on, this fails loudly instead of the lane returning by
// drift. It also pins the fail-soft contract the operator relies on — a disabled sidecar must
// yield a no-op handle, never block or spawn.

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  isAutostartEnabled,
  ensureSidecar,
  noopHandle
} = require("../../openclaw-bridge/core/scrape-sidecar-lifecycle.js");

const ENV_KEY = "OPENCLAW_AUTOSTART_SCRAPE_SIDECAR";

describe("scrape-sidecar lifecycle — retired by operator decision (2026-08-12)", () => {
  let savedEnv;
  beforeEach(() => { savedEnv = process.env[ENV_KEY]; delete process.env[ENV_KEY]; });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedEnv;
  });

  it("autostart is OFF by default (env unset)", () => {
    assert.equal(isAutostartEnabled(), false);
  });

  it("autostart stays OFF for '0' and 'false'", () => {
    process.env[ENV_KEY] = "0";
    assert.equal(isAutostartEnabled(), false);
    process.env[ENV_KEY] = "false";
    assert.equal(isAutostartEnabled(), false);
  });

  it("only an explicit '1' or 'true' opt-in re-enables it", () => {
    process.env[ENV_KEY] = "1";
    assert.equal(isAutostartEnabled(), true);
    process.env[ENV_KEY] = "true";
    assert.equal(isAutostartEnabled(), true);
    // Arbitrary junk must NOT enable a retired lane.
    process.env[ENV_KEY] = "yes please";
    assert.equal(isAutostartEnabled(), false);
  });

  it("ensureSidecar with autostart off returns a no-op handle without spawning or probing", async () => {
    const events = [];
    const logger = { info: (o) => events.push(o.event), warn: (o) => events.push(o.event), error() {} };
    const handle = await ensureSidecar({ logger });
    assert.equal(handle.ownsProcess, false);
    assert.equal(handle.childProcess, null);
    await handle.stop(); // must be callable and inert
    assert.deepEqual(events, ["scrape_sidecar_autostart_disabled"]);
  });

  it("noopHandle stop() is idempotent", async () => {
    const h = noopHandle();
    await h.stop();
    await h.stop();
    assert.equal(h.ownsProcess, false);
  });
});
