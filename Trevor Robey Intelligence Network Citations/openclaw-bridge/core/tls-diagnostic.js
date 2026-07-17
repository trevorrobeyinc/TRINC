"use strict";

/**
 * tls-diagnostic.js
 *
 * Structured root-cause diagnostic for HTTPS-proxy call failures.
 * Surfaces actionable info instead of silently degrading to plaintext HTTP.
 *
 * The HTTPS-only invariant forbids fallback to `http://`. When an HTTPS call
 * fails (cert error, ECONNREFUSED, 502, etc.), this module produces a
 * structured JSON-shaped diagnostic that explains WHY — covering the four
 * common failure modes:
 *
 *   1. The launchd-managed TLS proxy isn't loaded
 *      → run `launchctl load ~/Library/LaunchAgents/<label>.plist`
 *   2. The plaintext upstream app isn't running
 *      → start LM Studio / Ollama / Miyo
 *   3. The mkcert pair is missing
 *      → run `mkcert -install && mkcert localhost 127.0.0.1`
 *   4. Something else (DNS, port shifted, kernel SIGPIPE, etc.)
 *      → the raw error code/message is preserved for further triage
 *
 * The diagnostic emits the SAME JSON shape as scripts/lib/tls-diagnostic.sh
 * so a future self-healing agent can consume either source uniformly.
 *
 * Restricted-globals compliance: this module does NOT call any of the
 * forbidden time/entropy globals enforced by
 * scripts/lint-restricted-globals.sh. If a timestamp is needed, the
 * caller supplies it from timeProvider.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const DEFAULT_CERT = path.join(os.homedir(), ".local/share/mkcert/localhost.pem");
const DEFAULT_KEY = path.join(os.homedir(), ".local/share/mkcert/localhost-key.pem");

function safeRun(cmd, args) {
  try {
    const result = spawnSync(cmd, args, { encoding: "utf8", timeout: 2000 });
    return {
      ok: result.status === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      status: result.status,
    };
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err && err.message), status: -1 };
  }
}

function launchdLoaded(label) {
  const res = safeRun("launchctl", ["list"]);
  if (!res.ok) return false;
  return res.stdout.split("\n").some((line) => line.includes(label));
}

function upstreamListening(port) {
  const res = safeRun("lsof", ["-nP", "-iTCP:" + String(port), "-sTCP:LISTEN"]);
  if (!res.ok) return false;
  return res.stdout.trim().length > 0;
}

function certPresent(certPath, keyPath) {
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

function classifyError(err) {
  if (!err) return { code: "UNKNOWN", detail: "" };
  const msg = String(err.message || err);
  if (err.code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) {
    return { code: "ECONNREFUSED", detail: msg };
  }
  if (err.code === "CERT_HAS_EXPIRED" || /expired/i.test(msg)) {
    return { code: "CERT_EXPIRED", detail: msg };
  }
  if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || /self.signed|unable to verify/i.test(msg)) {
    return { code: "CERT_NOT_TRUSTED", detail: msg + " (set NODE_EXTRA_CA_CERTS to the mkcert root CA)" };
  }
  if (err.code === "EHOSTUNREACH" || /EHOSTUNREACH/.test(msg)) {
    return { code: "EHOSTUNREACH", detail: msg };
  }
  if (err.code === "ETIMEDOUT" || /ETIMEDOUT|timeout/i.test(msg)) {
    return { code: "ETIMEDOUT", detail: msg };
  }
  return { code: err.code || "UNKNOWN", detail: msg };
}

function buildSuggestion(diagnostic) {
  if (!diagnostic.proxy_loaded) {
    return "launchctl load ~/Library/LaunchAgents/" + diagnostic.launchd_label + ".plist";
  }
  if (!diagnostic.cert_present) {
    return "mkcert -install && mkcert localhost 127.0.0.1; move output to ~/.local/share/mkcert/";
  }
  if (!diagnostic.upstream_listening) {
    return "Start the upstream app so it listens on 127.0.0.1:" + diagnostic.upstream_port +
      " (Miyo / LM Studio / Ollama / Qdrant). The proxy is up but the upstream is unreachable.";
  }
  if (diagnostic.error_code === "CERT_NOT_TRUSTED") {
    return "Set NODE_EXTRA_CA_CERTS=$HOME/Library/Application\\ Support/mkcert/rootCA.pem in the launching env.";
  }
  return "Proxy + upstream + cert all look healthy. Investigate the raw error: " + diagnostic.error_detail;
}

/**
 * @param {object} opts
 * @param {number} opts.proxyPort       - HTTPS proxy port (e.g. 11435 for Ollama)
 * @param {number} opts.upstreamPort    - Plaintext upstream port (e.g. 11434)
 * @param {string} opts.launchdLabel    - launchd unit label (e.g. "com.trevorrobey.ollama-tls-proxy")
 * @param {Error}  opts.error           - The underlying error from fetch / curl
 * @param {string} [opts.certPath]      - Override path to mkcert cert
 * @param {string} [opts.keyPath]       - Override path to mkcert key
 * @returns {object} structured diagnostic
 */
function diagnoseFailedTlsCall(opts) {
  const proxyPort = Number(opts.proxyPort);
  const upstreamPort = Number(opts.upstreamPort);
  const launchdLabel = String(opts.launchdLabel || "");
  const certPath = String(opts.certPath || DEFAULT_CERT);
  const keyPath = String(opts.keyPath || DEFAULT_KEY);
  const errInfo = classifyError(opts.error);

  const diagnostic = {
    proxy_port: proxyPort,
    upstream_port: upstreamPort,
    launchd_label: launchdLabel,
    proxy_loaded: launchdLabel ? launchdLoaded(launchdLabel) : null,
    upstream_listening: upstreamPort ? upstreamListening(upstreamPort) : null,
    cert_present: certPresent(certPath, keyPath),
    error_code: errInfo.code,
    error_detail: errInfo.detail,
    suggestion: "",
  };
  diagnostic.suggestion = buildSuggestion(diagnostic);
  return diagnostic;
}

/**
 * Throws an Error whose .message is the JSON-stringified diagnostic and
 * whose .diagnostic property holds the parsed object. A self-healing
 * agent reads `err.diagnostic` directly; a human reads the JSON message.
 *
 * Does NOT fall back to HTTP. Ever.
 *
 * @param {string} label - Service label for the error code (e.g. "ollama")
 * @param {object} opts  - Same shape as diagnoseFailedTlsCall opts
 */
function throwWithDiagnostic(label, opts) {
  const diagnostic = diagnoseFailedTlsCall(opts);
  const code = "TLS_PROXY_CALL_FAILED_" + String(label).toUpperCase();
  const err = new Error(JSON.stringify({ code, label, diagnostic }, null, 2));
  err.code = code;
  err.label = label;
  err.diagnostic = diagnostic;
  throw err;
}

module.exports = {
  diagnoseFailedTlsCall,
  throwWithDiagnostic,
  // Exposed for tests / dependency injection
  _internal: { launchdLoaded, upstreamListening, certPresent, classifyError, buildSuggestion },
};
