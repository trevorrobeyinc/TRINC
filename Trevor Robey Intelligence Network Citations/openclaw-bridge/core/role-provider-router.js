"use strict";

// role-provider-router — resolves which backend (provider/model) a given role uses,
// for the multi-agent routing layer. Precedence:
//   1. config/role-provider-map.json  roles[<role>]   (explicit per-role route)
//   2. the provider/model already in context (from the workflow template's
//      provider_preference, or the global default carried down by the engine)
//   3. config/role-provider-map.json  default
//   4. hard fallback "claude-code"
// Backward-compatible: with an empty roles{} map, every role resolves to whatever
// the engine already passed (i.e. the global claude-code default) — no behavior change.

const fs = require("node:fs");
const path = require("node:path");

function safeStr(v) { return typeof v === "string" ? v.trim() : ""; }

// A role may declare a small `helper` model that runs a cheap, bounded pre-pass before the
// primary backend (evidence triage/compression). Normalize to { provider, model[, maxTokens] }
// or null. The helper is advisory only and can never expand the citation grounded set.
function normalizeHelper(h) {
  if (!h || typeof h !== "object") return null;
  const provider = safeStr(h.provider);
  if (!provider) return null;
  const helper = { provider, model: safeStr(h.model) };
  const maxTokens = Number(h.maxTokens);
  if (Number.isFinite(maxTokens) && maxTokens > 0) helper.maxTokens = maxTokens;
  return helper;
}

function createRoleProviderRouter(options = {}) {
  const rootDir = safeStr(options.rootDir) || process.cwd();
  const logger = options.logger && typeof options.logger.info === "function"
    ? options.logger : { info() {}, warn() {} };
  const mapPath = path.join(rootDir, "config", "role-provider-map.json");

  let cache = null;
  function loadMap() {
    if (cache) return cache;
    try {
      const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      cache = {
        default: (raw && raw.default) || {},
        roles: (raw && raw.roles) || {}
      };
    } catch (err) {
      // No map / unreadable → empty (pure passthrough of context defaults).
      cache = { default: {}, roles: {} };
    }
    return cache;
  }

  // ctx carries the provider/model the engine already resolved (template/global default).
  function resolveRoute(role, ctx = {}) {
    const map = loadMap();
    const roleEntry = (role && map.roles && map.roles[role]) || null;
    const ctxProvider = safeStr(ctx.provider);
    const ctxModel = safeStr(ctx.model);

    const provider = (roleEntry && safeStr(roleEntry.provider))
      || ctxProvider
      || safeStr(map.default.provider)
      || "claude-code";
    const model = (roleEntry && safeStr(roleEntry.model))
      || ctxModel
      || safeStr(map.default.model)
      || "";
    const fallback = (roleEntry && safeStr(roleEntry.fallback))
      || safeStr(map.default.fallback)
      || "";
    const helper = normalizeHelper(roleEntry && roleEntry.helper)
      || normalizeHelper(map.default && map.default.helper)
      || null;

    if (roleEntry) {
      logger.info({ event: "role_provider_routed", role, provider, model, fallback, helper });
    }
    return { provider, model, fallback, helper };
  }

  return Object.freeze({ resolveRoute });
}

module.exports = { createRoleProviderRouter };
