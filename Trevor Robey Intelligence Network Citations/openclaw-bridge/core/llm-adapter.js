"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { canonicalize, safeString, sha256 } = require("../../workflows/governance-automation/common.js");
const { throwWithDiagnostic } = require("./tls-diagnostic.js");
const { resolveGuardConfig, scanPrompt } = require("./prompt-guard.js");

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function resolveProviderConfig(config = {}, provider) {
  const root = path.resolve(process.cwd());
  const committedPath = path.join(root, "config", "llm-providers.json");
  const localPath = path.join(root, "config", "llm-providers.local.json");

  const committed = parseJsonFile(committedPath, { providers: {} });
  const local = parseJsonFile(localPath, { providers: {} });

  const merged = {
    ...(committed && committed.providers && committed.providers[provider] ? committed.providers[provider] : {}),
    ...(local && local.providers && local.providers[provider] ? local.providers[provider] : {}),
    ...(isPlainObject(config) ? config : {})
  };

  return merged;
}

function estimateTokenCount(text) {
  const normalized = safeString(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function makeError(code, message, details) {
  const error = new Error(String(message || "LLM adapter error"));
  error.code = String(code || "PHASE14_LLM_ADAPTER_ERROR");
  if (typeof details !== "undefined") {
    error.details = details;
  }
  return error;
}

function buildMockResponse(prompt, model) {
  const source = String(prompt || "");
  const digest = sha256(`mock-llm-v1|${source}`);
  const focusLine = source.split("\n").find((line) => line.trim().length > 0) || "";
  const preview = focusLine.slice(0, 120);
  return {
    text: [
      `Mock completion (${model})`,
      `Digest: ${digest}`,
      `Focus: ${preview}`,
      "Summary: Deterministic mock response generated from canonical prompt hash."
    ].join("\n"),
    tokenCount: Math.max(8, estimateTokenCount(source) / 2),
    raw: { digest }
  };
}

async function callLocalOllama(prompt, providerConfig) {
  // HTTPS-only invariant: default is the in-monorepo TLS proxy at :11435,
  // which terminates TLS and forwards to Ollama's plaintext upstream. If
  // the call fails, surface a structured diagnostic via tls-diagnostic.js —
  // NEVER fall back to http://.
  const endpoint = safeString(providerConfig.endpoint) || "https://127.0.0.1:11435/api/generate";
  const model = safeString(providerConfig.model) || "llama3.1";

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: String(prompt || ""),
        stream: false
      })
    });
  } catch (err) {
    throwWithDiagnostic("ollama", {
      proxyPort: 11435,
      upstreamPort: 11434,
      launchdLabel: "com.trevorrobey.ollama-tls-proxy",
      error: err,
    });
  }

  if (!response.ok) {
    throw makeError("PHASE14_LLM_LOCAL_HTTP_ERROR", `Local provider request failed (${response.status})`);
  }

  const payload = await response.json();
  return {
    text: safeString(payload.response),
    tokenCount: estimateTokenCount(safeString(payload.response)),
    raw: payload,
    model
  };
}

async function callOpenAi(prompt, providerConfig) {
  const endpoint = safeString(providerConfig.endpoint) || "https://api.openai.com/v1/responses";
  const model = safeString(providerConfig.model) || "gpt-4.1-mini";
  const apiKey = safeString(providerConfig.apiKey) || safeString(process.env[safeString(providerConfig.apiKeyEnv) || "OPENAI_API_KEY"]);
  if (!apiKey) {
    throw makeError("PHASE14_LLM_MISSING_API_KEY", "OpenAI API key not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: String(prompt || "")
    })
  });

  if (!response.ok) {
    throw makeError("PHASE14_LLM_OPENAI_HTTP_ERROR", `OpenAI request failed (${response.status})`);
  }

  const payload = await response.json();
  const text = safeString(payload.output_text)
    || safeString(payload?.output?.[0]?.content?.[0]?.text)
    || safeString(payload?.choices?.[0]?.message?.content);

  return {
    text,
    tokenCount: Number(payload?.usage?.total_tokens || estimateTokenCount(text)),
    raw: payload,
    model
  };
}

async function callAnthropic(prompt, providerConfig) {
  const endpoint = safeString(providerConfig.endpoint) || "https://api.anthropic.com/v1/messages";
  const model = safeString(providerConfig.model) || "claude-3-5-sonnet-latest";
  const apiKey = safeString(providerConfig.apiKey) || safeString(process.env[safeString(providerConfig.apiKeyEnv) || "ANTHROPIC_API_KEY"]);
  if (!apiKey) {
    throw makeError("PHASE14_LLM_MISSING_API_KEY", "Anthropic API key not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: Number(providerConfig.maxTokens || 1024),
      messages: [{ role: "user", content: String(prompt || "") }]
    })
  });

  if (!response.ok) {
    throw makeError("PHASE14_LLM_ANTHROPIC_HTTP_ERROR", `Anthropic request failed (${response.status})`);
  }

  const payload = await response.json();
  const text = safeString(payload?.content?.[0]?.text);
  return {
    text,
    tokenCount: Number(payload?.usage?.input_tokens || 0) + Number(payload?.usage?.output_tokens || 0),
    raw: payload,
    model
  };
}

async function callOpenRouter(prompt, providerConfig) {
  const endpoint = safeString(providerConfig.endpoint) || "https://openrouter.ai/api/v1/chat/completions";
  const model = safeString(providerConfig.model) || "openai/gpt-4o-mini";
  const apiKey = safeString(providerConfig.apiKey) || safeString(process.env[safeString(providerConfig.apiKeyEnv) || "OPENROUTER_API_KEY"]);
  if (!apiKey) {
    throw makeError("PHASE14_LLM_MISSING_API_KEY", "OpenRouter API key not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: String(prompt || "") }]
    })
  });

  if (!response.ok) {
    throw makeError("PHASE14_LLM_OPENROUTER_HTTP_ERROR", `OpenRouter request failed (${response.status})`);
  }

  const payload = await response.json();
  const text = safeString(payload?.choices?.[0]?.message?.content);
  return {
    text,
    tokenCount: Number(payload?.usage?.total_tokens || estimateTokenCount(text)),
    raw: payload,
    model
  };
}

const { spawn: spawnChild } = require("node:child_process");

// An MCP config with NO servers. Passed with --strict-mcp-config so a role call starts none of the
// operator's user/project/plugin MCP servers (see buildClaudeCodeArgs).
const CLAUDE_CODE_EMPTY_MCP_CONFIG = path.join(__dirname, "..", "..", "config", "claude-code-print-mcp.json");

/**
 * argv for `claude -p` (exported for tests). ISOLATION (2026-09-22, found by the first gated smoke
 * run through Copilot chat): without --strict-mcp-config the CLI boots EVERY MCP server the operator
 * has configured — user, project and plugin — for each role call. The pdf-viewer plugin's server is
 * an `npx` package, and because the child's cwd is the engine folder, its `.npmrc`
 * (`cache=.ci/npm-cache`) made npx pull 209 packages into the repo's LOCKED supply-chain cache
 * mid-run (caught by tests/supply-chain). A role call needs no MCP server at all — tools are off
 * (--allowedTools "") — so it gets an empty, strict MCP config: zero servers, no npx, no network
 * beyond the model call, and a much lighter spawn.
 *
 * HERMETIC PROMPT (same day, second finding): print mode also loads the operator's instruction files
 * — ~/.claude/CLAUDE.md, the monorepo CLAUDE.md and this folder's CLAUDE.md/AGENTS.md — into every
 * role call (a control probe answered YES to all three, at ~10x the token cost of a clean call).
 * `--setting-sources ""` skips user/project/local settings (and their hooks), and
 * CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 in the env (buildClaudeCodeEnv) skips every memory file; together
 * a probe from this folder answered NO NO NO under the operator's OAuth session. `--bare` was NOT
 * usable (it reads only an API key). `--no-session-persistence` stops each role call from writing a
 * transcript under the operator's ~/.claude/projects/. Re-verify after a CLI upgrade with the probe
 * recorded in CLAUDE.md → "Role-call isolation".
 */
function buildClaudeCodeArgs(model) {
  return [
    "-p",
    "--output-format", "json",
    "--model", model,
    "--allowedTools", "",
    "--strict-mcp-config",
    "--mcp-config", CLAUDE_CODE_EMPTY_MCP_CONFIG,
    "--setting-sources", "",
    "--no-session-persistence"
  ];
}

/**
 * env for `claude -p` (exported for tests): the caller's env minus the Google Drive secrets
 * (audit gdrive-oauth / F-SUB2), plus the memory-file kill switch described above.
 */
function buildClaudeCodeEnv(baseEnv) {
  const claudeEnv = { ...(baseEnv || {}) };
  for (const k of Object.keys(claudeEnv)) {
    if (/^GOOGLE_DRIVE_|^GOOGLE_CLIENT_SECRET$/i.test(k)) delete claudeEnv[k];
  }
  claudeEnv.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
  return claudeEnv;
}

/**
 * Call Claude Code in print mode via stdin piping.
 *
 * Uses the user's authenticated Claude session (no API key).
 * Pipes the prompt via stdin to avoid CLI argument length limits.
 * Disables tool use (--allowedTools "") to force direct text response
 * with real citations from Claude's parametric knowledge.
 */
async function callClaudeCode(prompt, providerConfig, logger) {
  const claudeCommand = safeString(providerConfig.claudeCommand) || "claude";
  const model = safeString(providerConfig.model) || "claude-sonnet-4-6";
  const timeoutMs = Number(providerConfig.executionTimeoutMs) || 180_000;

  const args = buildClaudeCodeArgs(model);

  logger.info({ event: "cc_print_spawn", command: claudeCommand, model });

  try {
    const stdout = await new Promise((resolve, reject) => {
      // Secrets stripped + memory files disabled: see buildClaudeCodeEnv.
      const claudeEnv = buildClaudeCodeEnv(process.env);
      const child = spawnChild(claudeCommand, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: claudeEnv,
        cwd: process.cwd()
      });

      let out = "";
      let err = "";
      child.stdout.on("data", (d) => { out += d.toString(); });
      child.stderr.on("data", (d) => { err += d.toString(); });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Claude Code timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out) {
          reject(new Error(`Claude Code exited with code ${code}: ${err.slice(0, 500)}`));
        } else {
          resolve(out);
        }
      });

      // Pipe prompt via stdin
      child.stdin.write(String(prompt || ""));
      child.stdin.end();
    });

    let text = "";
    let raw = {};

    try {
      const parsed = JSON.parse(stdout);
      // claude -p --output-format json returns:
      // { type: "result", result: "response text", usage: {...}, ... }
      // The envelope carries its own error contract: is_error / an error subtype. Honor it.
      // Verified live 2026-08-12: an expired CLI OAuth session returned
      // "Failed to authenticate: OAuth session expired and could not be refreshed" (72 chars)
      // in `result` — and because only `code !== 0 && !out` was checked, all three roles
      // recorded that string as a COMPLETED research response. The citation gate was the only
      // thing that stopped it shipping (NO_CITATIONS). A provider auth failure must fail the
      // task loudly, not masquerade as output.
      if (parsed.is_error === true || /^error/i.test(safeString(parsed.subtype))) {
        const detail = safeString(parsed.result || parsed.error || "").slice(0, 300);
        const authErr = new Error(
          `Claude Code returned an error envelope${detail ? `: ${detail}` : ""} — ` +
          "if this is an OAuth/session failure, re-authenticate the claude CLI (run `claude` in Terminal and complete /login), then re-run."
        );
        authErr.code = "PROVIDER_CC_ERROR_ENVELOPE";
        throw authErr;
      }
      text = safeString(parsed.result || parsed.text || parsed.output || "");
      raw = parsed;

      // Extract token counts from Claude's usage object
      if (parsed.usage) {
        const u = parsed.usage;
        const inputTokens = Number(u.input_tokens || 0)
          + Number(u.cache_read_input_tokens || 0)
          + Number(u.cache_creation_input_tokens || 0);
        const outputTokens = Number(u.output_tokens || 0);
        raw._tokenCount = inputTokens + outputTokens;
      }
    } catch (parseOrEnvelopeError) {
      // The error-envelope rejection above must NOT be swallowed by the JSON fallback.
      if (parseOrEnvelopeError && parseOrEnvelopeError.code === "PROVIDER_CC_ERROR_ENVELOPE") {
        throw parseOrEnvelopeError;
      }
      // If not valid JSON, use raw stdout as text — but a bare auth-failure line is still a
      // provider failure, not a response (same 2026-08-12 incident, non-JSON form).
      if (/failed to authenticate|oauth session expired|please run \/login/i.test(stdout)) {
        const authErr = new Error(
          `Claude Code returned an authentication failure: ${safeString(stdout).slice(0, 200)} — ` +
          "re-authenticate the claude CLI (run `claude` in Terminal and complete /login), then re-run."
        );
        authErr.code = "PROVIDER_CC_ERROR_ENVELOPE";
        throw authErr;
      }
      text = safeString(stdout);
      raw = { stdout };
    }

    logger.info({ event: "cc_print_complete", model, text_length: text.length });

    return {
      text,
      tokenCount: Number(raw._tokenCount) || estimateTokenCount(text),
      raw,
      model
    };
  } catch (err) {
    const wrapped = makeError("PHASE33_CC_PROVIDER_ERROR", `Claude Code provider failed: ${err.message}`, {
      originalCode: err.code,
      fallbackProvider: safeString(providerConfig.fallbackProvider)
    });
    throw wrapped;
  }
}

function createLLMAdapter(options = {}) {
  const provider = safeString(options.provider || "mock") || "mock";
  const logger = isPlainObject(options.logger) ? options.logger : { info() {}, warn() {}, error() {} };
  const timeProvider = options.timeProvider && typeof options.timeProvider.nowMs === "function"
    ? options.timeProvider
    : { nowMs: () => 0 };
  const interactionLog = options.interactionLog && typeof options.interactionLog.recordInteraction === "function"
    ? options.interactionLog
    : null;

  const providerConfig = resolveProviderConfig(options.config, provider);
  const defaultModel = safeString(providerConfig.model)
    || (provider === "mock" ? "mock-v1" : "unknown");

  // Phase 5 — interim-AIDR prompt-firewall gate (LLM Guard). Default OFF; resolved
  // once at construction. When enabled, complete() scans every assembled prompt
  // (incl. injected tool-prefetch results) before it reaches the provider.
  const guardConfig = resolveGuardConfig(process.cwd(), options.promptGuard);
  if (guardConfig.enabled) {
    logger.info({
      event: "phase5_llm_guard_enabled",
      endpoint: guardConfig.endpoint,
      mode: guardConfig.mode,
      fail_open: guardConfig.failOpen
    });
  }

  async function complete(prompt, completionOptions = {}) {
    const promptText = String(prompt || "");
    // Per-call provider override → enables per-role backend routing (multi-agent layer).
    // When no override is supplied, falls back to the adapter's bound provider, so existing
    // single-provider behavior is unchanged. getProviderInfo() still reports the bound default.
    const callProvider = safeString(completionOptions.provider) || provider;
    const callConfig = callProvider === provider
      ? providerConfig
      : resolveProviderConfig(options.config, callProvider);
    const model = safeString(completionOptions.model) || safeString(callConfig.model) || defaultModel;
    const skillsContext = completionOptions.skillsContext && typeof completionOptions.skillsContext === "object"
      ? canonicalize(completionOptions.skillsContext)
      : { local_skills: [], hosted_skill_refs: [] };
    const startedAt = Number(timeProvider.nowMs());

    // Phase 5 — interim-AIDR prompt-firewall gate. Scan the fully-assembled prompt
    // (template + inputs + injected tooluniverse:// tool-results) BEFORE any provider
    // call. FAIL-OPEN on transport errors (research must not break on a control hiccup);
    // block on is_valid:false in enforce mode. Logs only sha256(prompt) + scanner scores.
    if (guardConfig.enabled) {
      let verdict = null;
      try {
        verdict = await scanPrompt(promptText, guardConfig);
      } catch (guardErr) {
        logger.warn({
          event: "phase5_llm_guard_unavailable",
          fail_open: guardConfig.failOpen,
          error: safeString(guardErr && guardErr.message),
          prompt_hash: sha256(promptText)
        });
        if (!guardConfig.failOpen) {
          throw makeError(
            "PHASE5_LLM_GUARD_UNAVAILABLE",
            "LLM Guard unreachable and fail-open disabled; refusing to send prompt",
            { taskId: safeString(completionOptions.taskId) }
          );
        }
      }
      if (verdict && verdict.isValid === false) {
        logger.warn({
          event: "phase5_llm_guard_flagged",
          mode: guardConfig.mode,
          flagged: verdict.flagged,
          prompt_hash: sha256(promptText)
        });
        if (guardConfig.mode === "enforce") {
          throw makeError(
            "PHASE5_LLM_GUARD_BLOCKED",
            "Prompt blocked by LLM Guard prompt firewall (is_valid=false)",
            { flagged: verdict.flagged, taskId: safeString(completionOptions.taskId) }
          );
        }
      } else if (verdict) {
        logger.info({ event: "phase5_llm_guard_pass", prompt_hash: sha256(promptText) });
      }
    }

    let result;
    try {
    if (callProvider === "mock") {
      const mock = buildMockResponse(promptText, model);
      result = { text: mock.text, tokenCount: Math.floor(mock.tokenCount), raw: mock.raw, model };
    } else if (callProvider === "local") {
      result = await callLocalOllama(promptText, { ...callConfig, model });
    } else if (callProvider === "openai") {
      result = await callOpenAi(promptText, { ...callConfig, model });
    } else if (callProvider === "anthropic") {
      result = await callAnthropic(promptText, { ...callConfig, model });
    } else if (callProvider === "openrouter") {
      result = await callOpenRouter(promptText, { ...callConfig, model });
    } else if (callProvider === "claude-code") {
      try {
        result = await callClaudeCode(promptText, { ...callConfig, model }, logger);
      } catch (ccErr) {
        const fallback = ccErr.details && safeString(ccErr.details.fallbackProvider);
        if (fallback) {
          logger.warn({ event: "phase33_cc_fallback", fallback, error: ccErr.message, original_error: ccErr.message });
          const fallbackConfig = resolveProviderConfig({}, fallback);
          // Use the fallback provider's OWN configured model (from llm-providers.json),
          // not the Claude model — a fallback provider would reject an unknown Claude model id.
          if (fallback === "anthropic") {
            result = await callAnthropic(promptText, fallbackConfig);
          } else if (fallback === "mock") {
            const mock = buildMockResponse(promptText, model);
            result = { text: mock.text, tokenCount: Math.floor(mock.tokenCount), raw: mock.raw, model };
          } else {
            throw ccErr;
          }
        } else {
          throw ccErr;
        }
      }
    } else {
      throw makeError("PHASE14_LLM_PROVIDER_UNSUPPORTED", `Unsupported provider '${callProvider}'`);
    }
    } catch (dispatchErr) {
      // Role-level fallback: if a routed backend (e.g. a restored local/Ollama route) errors and
      // the caller supplied a fallbackProvider, retry once on it. Keeps a per-role local route
      // resilient — a down local backend degrades to claude-code instead of failing the run.
      // (Under Option B the engine is 100% Claude with empty fallbacks, so this is currently inert.)
      const fb = safeString(completionOptions.fallbackProvider);
      if (fb && fb !== callProvider) {
        logger.warn({ event: "provider_role_fallback", from: callProvider, to: fb, error: dispatchErr && dispatchErr.message });
        return complete(prompt, { ...completionOptions, provider: fb, fallbackProvider: "" });
      }
      throw dispatchErr;
    }

    const completedAt = Number(timeProvider.nowMs());
    const durationMs = Math.max(0, completedAt - startedAt);

    if (interactionLog) {
      await interactionLog.recordInteraction({
        taskId: safeString(completionOptions.taskId),
        prompt: promptText,
        response: safeString(result.text),
        provider: callProvider,
        model,
        duration: durationMs,
        tokenCount: Math.max(0, Number.parseInt(String(result.tokenCount || 0), 10) || 0),
        metadata: {
          prompt_hash: sha256(promptText),
          response_hash: sha256(safeString(result.text)),
          phase18_skill_count: Array.isArray(skillsContext.local_skills) ? skillsContext.local_skills.length : 0,
          phase18_hosted_skill_ref_count: Array.isArray(skillsContext.hosted_skill_refs) ? skillsContext.hosted_skill_refs.length : 0
        }
      });
    }

    logger.info({ event: "phase14_llm_complete", provider: callProvider, model, duration_ms: durationMs });

    return {
      text: safeString(result.text),
      provider: callProvider,
      model,
      skillsContext,
      durationMs,
      tokenCount: Math.max(0, Number.parseInt(String(result.tokenCount || estimateTokenCount(result.text)), 10) || 0),
      raw: result.raw
    };
  }

  function getProviderInfo() {
    return canonicalize({
      provider,
      model: defaultModel,
      configured: Boolean(providerConfig && Object.keys(providerConfig).length > 0),
      skill_attachment_mode: "modeled_noop_until_verified"
    });
  }

  return Object.freeze({
    complete,
    getProviderInfo
  });
}

module.exports = {
  buildClaudeCodeArgs,
  buildClaudeCodeEnv,
  CLAUDE_CODE_EMPTY_MCP_CONFIG,
  createLLMAdapter,
  estimateTokenCount,
  resolveProviderConfig
};
