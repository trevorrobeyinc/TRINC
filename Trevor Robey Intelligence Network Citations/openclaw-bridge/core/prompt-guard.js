"use strict";

// Phase 5 — interim-AIDR prompt firewall gate (LLM Guard, github.com/protectai/llm-guard).
//
// Routes the fully-assembled prompt (template + inputs + injected tooluniverse://
// tool-prefetch results — i.e. BOTH the direct prompt and the indirect-injection
// vector) through the local LLM Guard service's /analyze/prompt scanner BEFORE the
// prompt reaches any LLM provider. The service runs the hardened, biomedical-safe
// scanner set (PromptInjection / InvisibleText / Secrets / Regex / TokenLimit;
// content-policy + PII scanners deliberately DISABLED so legitimate oncology /
// adverse-event / citation text is not crippled).
//
// Non-negotiables baked in here:
//   * DEFAULT OFF — does nothing unless promptGuard.enabled is explicitly true.
//   * FAIL-OPEN — if the service is unreachable / errors / times out, the prompt is
//     ALLOWED (research must not break because an interim security control hiccuped).
//     failOpen:false flips this to fail-closed for operators who want hard denial.
//   * HTTPS-only — endpoint is https; there is no http fallback and TLS verification
//     is NOT disabled (Node verifies via NODE_EXTRA_CA_CERTS, same mkcert root the
//     engine already uses for the LM Studio / Ollama TLS proxies).
//   * NEVER logs the prompt — only sha256(prompt) + the scanner score map.
//
// Restricted-globals safe: no Date.now / new Date / Math.random / randomUUID.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { safeString } = require("../../workflows/governance-automation/common.js");

// Same mkcert root the engine already uses for its LM Studio / Ollama TLS proxies.
const MKCERT_CA_DEFAULT = path.join(process.env.HOME || "", "Library", "Application Support", "mkcert", "rootCA.pem");

// Resolve the CA explicitly (NODE_EXTRA_CA_CERTS, else the mkcert default) so the
// scan VERIFIES the local LLM Guard cert even when the engine's launch env (e.g.
// the Obsidian-spawned Command Center process) did not export NODE_EXTRA_CA_CERTS.
// Verification is never disabled — if no CA is found, Node's default trust store
// applies (which fails closed on the mkcert cert -> fail-open per policy).
function readCa() {
  const explicit = process.env.NODE_EXTRA_CA_CERTS;
  for (const candidate of [explicit, MKCERT_CA_DEFAULT]) {
    if (candidate && fs.existsSync(candidate)) {
      try { return fs.readFileSync(candidate); } catch { /* try next */ }
    }
  }
  return null;
}

const DEFAULTS = Object.freeze({
  enabled: false,
  endpoint: "https://127.0.0.1:8000",
  scanPath: "/analyze/prompt",
  mode: "enforce",            // "enforce" = block on is_valid:false; "monitor" = scan + log only
  failOpen: true,             // service unreachable/errored/timed-out => ALLOW (never cripple research)
  timeoutMs: 8000,
  authTokenEnv: "LLM_GUARD_AUTH_TOKEN",
  authToken: ""               // optional inline token (prefer the env var or llm-providers.local.json)
});

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readJsonSection(filePath, key) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlainObject(parsed) && isPlainObject(parsed[key]) ? parsed[key] : {};
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function envOverrides() {
  const env = process.env || {};
  const out = {};
  if (typeof env.LLM_GUARD_ENABLED === "string") {
    out.enabled = env.LLM_GUARD_ENABLED.toLowerCase() === "true";
  }
  if (env.LLM_GUARD_ENDPOINT) out.endpoint = safeString(env.LLM_GUARD_ENDPOINT);
  if (env.LLM_GUARD_MODE) out.mode = safeString(env.LLM_GUARD_MODE);
  if (typeof env.LLM_GUARD_FAIL_OPEN === "string") {
    out.failOpen = env.LLM_GUARD_FAIL_OPEN.toLowerCase() !== "false";
  }
  if (env.LLM_GUARD_TIMEOUT_MS) {
    const n = Number.parseInt(env.LLM_GUARD_TIMEOUT_MS, 10);
    if (Number.isFinite(n) && n > 0) out.timeoutMs = n;
  }
  return out;
}

// Merge order (lowest -> highest precedence): DEFAULTS, config/llm-providers.json
// promptGuard, config/llm-providers.local.json promptGuard, env, explicit override.
function resolveGuardConfig(root, override) {
  const base = path.resolve(root || process.cwd());
  const committed = readJsonSection(path.join(base, "config", "llm-providers.json"), "promptGuard");
  const local = readJsonSection(path.join(base, "config", "llm-providers.local.json"), "promptGuard");
  const merged = {
    ...DEFAULTS,
    ...(isPlainObject(committed) ? committed : {}),
    ...(isPlainObject(local) ? local : {}),
    ...envOverrides(),
    ...(isPlainObject(override) ? override : {})
  };
  merged.enabled = merged.enabled === true;
  merged.failOpen = merged.failOpen !== false;
  merged.mode = merged.mode === "monitor" ? "monitor" : "enforce";
  merged.timeoutMs = Number(merged.timeoutMs) > 0 ? Number(merged.timeoutMs) : DEFAULTS.timeoutMs;
  merged.endpoint = safeString(merged.endpoint) || DEFAULTS.endpoint;
  merged.scanPath = safeString(merged.scanPath) || DEFAULTS.scanPath;
  return merged;
}

function resolveToken(cfg) {
  const direct = safeString(cfg.authToken);
  if (direct) return direct;
  const envName = safeString(cfg.authTokenEnv) || DEFAULTS.authTokenEnv;
  return safeString((process.env || {})[envName]);
}

function summarizeFlagged(scanners) {
  const flagged = {};
  if (isPlainObject(scanners)) {
    for (const [name, score] of Object.entries(scanners)) {
      const n = Number(score);
      if (Number.isFinite(n) && n > 0) {
        flagged[name] = Math.round(n * 1000) / 1000;
      }
    }
  }
  return flagged;
}

// POST the prompt to LLM Guard. Returns { isValid, flagged, scanners, status }.
// THROWS on transport failure / timeout / non-2xx so the caller can apply the
// fail-open vs fail-closed policy. The service itself writes its structlog
// detection line on a hit, which the HEC shipper forwards to NG-SIEM — so a hit
// here automatically reaches the Falcon correlation rule + digest with no extra wiring.
async function scanPrompt(promptText, cfg) {
  const target = new URL(String(cfg.endpoint).replace(/\/+$/, "") + cfg.scanPath);
  if (target.protocol !== "https:") {
    const err = new Error("LLM Guard endpoint must be https (got " + target.protocol + ")");
    err.code = "PHASE5_LLM_GUARD_NON_HTTPS";
    throw err;
  }
  const token = resolveToken(cfg);
  const body = JSON.stringify({ prompt: String(promptText || "") });
  const headers = { "content-type": "application/json", "content-length": Buffer.byteLength(body) };
  if (token) headers.authorization = "Bearer " + token;
  const ca = readCa();

  const payload = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: "POST",
        headers,
        ca: ca || undefined,        // explicit mkcert root; TLS verification stays ON
        timeout: cfg.timeoutMs
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            const err = new Error("LLM Guard scan failed (" + status + "): " + raw.slice(0, 200));
            err.code = "PHASE5_LLM_GUARD_HTTP_ERROR";
            err.status = status;
            return reject(err);
          }
          try { resolve(JSON.parse(raw)); }
          catch (parseErr) { reject(new Error("LLM Guard returned non-JSON: " + parseErr.message)); }
        });
      }
    );
    req.on("timeout", () => { req.destroy(new Error("LLM Guard scan timed out after " + cfg.timeoutMs + "ms")); });
    req.on("error", (err) => { reject(err); });
    req.write(body);
    req.end();
  });

  const scanners = isPlainObject(payload.scanners) ? payload.scanners : {};
  return {
    isValid: payload.is_valid !== false,   // default-allow only on an explicit non-false
    flagged: summarizeFlagged(scanners),
    scanners,
    status: 200
  };
}

module.exports = { resolveGuardConfig, scanPrompt, summarizeFlagged, GUARD_DEFAULTS: DEFAULTS };
