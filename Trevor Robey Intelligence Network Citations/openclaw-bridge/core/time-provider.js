"use strict";

let deterministicNowMs = null;
let deterministicStepMs = 0;

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

// NOTE: an OPENCLAW_FIXED_TIME_MS environment override was removed 2026-07-29. It replaced the
// global clock from a shell variable, which neutralized the operator-approval token's 300s TTL and
// let chosen timestamps be stamped into the append-only evidence ledgers. Tests set a deterministic
// clock through setDeterministicTime() instead, so nothing needed it. Do not reintroduce an env
// path here — an in-process setter is testable without being a production off-switch.
function nowMs() {
  if (deterministicNowMs !== null) {
    const current = deterministicNowMs;
    deterministicNowMs += deterministicStepMs;
    return current;
  }

  return Date.now();
}

function nowIso() {
  return new Date(nowMs()).toISOString();
}

function msToIso(ms) {
  if (!Number.isFinite(Number(ms))) {
    return null;
  }
  return new Date(Number(ms)).toISOString();
}

function setDeterministicTime(fixedNowMs, stepMs = 0) {
  const normalizedNow = parseNumber(fixedNowMs, null);
  if (normalizedNow === null) {
    const error = new Error("fixedNowMs must be a finite number");
    error.code = "INVALID_TIME_OVERRIDE";
    throw error;
  }
  deterministicNowMs = normalizedNow;
  deterministicStepMs = parseNumber(stepMs, 0);
}

function clearDeterministicTime() {
  deterministicNowMs = null;
  deterministicStepMs = 0;
}

function createTimeProvider(options = {}) {
  const hasFixed = Object.prototype.hasOwnProperty.call(options, "fixedNowMs");
  let localNow = hasFixed ? parseNumber(options.fixedNowMs, null) : null;
  const localStep = parseNumber(options.stepMs, 0);

  function localNowMs() {
    if (localNow !== null) {
      const value = localNow;
      localNow += localStep;
      return value;
    }
    return nowMs();
  }

  return Object.freeze({
    nowMs: localNowMs,
    nowIso() {
      return new Date(localNowMs()).toISOString();
    },
  });
}

module.exports = {
  nowMs,
  nowIso,
  msToIso,
  setDeterministicTime,
  clearDeterministicTime,
  createTimeProvider,
};
