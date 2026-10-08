"use strict";

// ncbi-pacing.js — the NCBI E-utilities politeness policy, in one place.
//
// Two modules call E-utilities: the delivery-time citation re-resolver (esummary, one PMID at a time) and the PubMed
// retraction screen (esummary batches plus one esearch per DOI). Both need the same two behaviors, and until
// 2026-10-08 each carried its own copy with a comment naming the other ("same idiom as ...", "same rule as ...") —
// the code itself flagging that a tweak to one had to be remembered in the other.
//
//   1. PACING. NCBI allows 3 requests/sec without an api_key and 10 with one. `minRequestIntervalMs` spaces the
//      requests of one pacing instance (default 0 = OFF, so offline unit tests stay instant; production wiring passes
//      350 ms, or 110 ms with a key).
//   2. ONE RETRY ON HTTP 429. NCBI answers an occasional 429 even while the caller stays under its limit (verified
//      live 2026-10-08: 7 of 12 PMIDs in one run, 2 of 21 DOI lookups in the next). Wait for `Retry-After` (integer
//      seconds; absent, an HTTP-date or garbage = 1 s, NCBI's window) and retry ONCE, never waiting longer than
//      `maxRetryAfterMs` (default 5 s). A second 429, or a longer Retry-After, is handed back to the caller as it
//      is: each consumer keeps its own fail-soft rule (UNCHECKED `rate_limited`; `checked:false`), because a
//      non-answer must never become a false VERIFIED or a false "clean".
//
// Pacing state is per instance, so each consumer keeps its own spacing exactly as when each carried its own copy.
// `nowMs` and `sleep` are injectable so a test can prove the spacing without real delays.

const timeProvider = require("./time-provider.js");

const DEFAULT_MAX_RETRY_AFTER_MS = 5_000;
const NCBI_WINDOW_MS = 1_000;   // the wait when Retry-After is absent or unusable

function createNcbiPacing(options = {}) {
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : timeProvider.nowMs;
  const sleep = typeof options.sleep === "function"
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const minRequestIntervalMs = Number.isFinite(options.minRequestIntervalMs)
    ? Math.max(0, options.minRequestIntervalMs)
    : 0;
  const maxRetryAfterMs = Number.isFinite(options.maxRetryAfterMs)
    ? Math.max(0, options.maxRetryAfterMs)
    : DEFAULT_MAX_RETRY_AFTER_MS;
  let lastRequestAt = null;   // null = no request yet; the first request never waits

  async function throttle() {
    if (minRequestIntervalMs <= 0) return;
    if (lastRequestAt !== null) {
      const wait = lastRequestAt + minRequestIntervalMs - nowMs();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = nowMs();
  }

  // Milliseconds to wait before the single retry, or null when the server asks for longer than we will wait.
  // Only integer-seconds Retry-After is honored; an absent header, an HTTP-date or garbage means 1 s.
  function retryAfterMs(res) {
    const raw = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("retry-after") : null;
    const secs = Number.parseInt(String(raw == null ? "" : raw).trim(), 10);
    const ms = Number.isFinite(secs) && secs >= 0 ? secs * 1000 : NCBI_WINDOW_MS;
    return ms > maxRetryAfterMs ? null : ms;
  }

  // Runs `attempt` — ONE unpaced request — behind the pacing, and once more if it drew a 429 worth waiting out.
  // `responseOf` extracts the HTTP response (anything with `.status` / `.headers`) from whatever `attempt`
  // resolves to; the default suits an attempt that resolves to the response itself. Resolves to
  // { out, attempts }: the final attempt's result and how many attempts it took (1 or 2). An attempt that throws
  // propagates unchanged — transport failure is the caller's to classify, and it is never retried here.
  async function request(attempt, responseOf = (out) => out) {
    await throttle();
    const first = await attempt();
    const res = responseOf(first);
    if (res && Number(res.status) === 429) {
      const waitMs = retryAfterMs(res);
      if (waitMs !== null) {
        if (waitMs > 0) await sleep(waitMs);
        await throttle();
        return { out: await attempt(), attempts: 2 };
      }
    }
    return { out: first, attempts: 1 };
  }

  return Object.freeze({ request });
}

module.exports = { createNcbiPacing, DEFAULT_MAX_RETRY_AFTER_MS };
