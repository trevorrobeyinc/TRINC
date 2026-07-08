"use strict";

// agent-session-recorder — appends a per-run session record under
// config/agents/<role>/sessions/<sessionId>.json and maintains a rolling
// summary-latest.json window. This is the local "session state / memory log" half of the
// stateful multi-agent model: backends stay stateless, OpenClaw retains the history.
//
// Fail-soft: any I/O error is logged and swallowed — recording must never break a run.

const fs = require("node:fs");
const path = require("node:path");

const WINDOW = 15;

function safeStr(v) { return typeof v === "string" ? v.trim() : ""; }

// Atomic JSON write: write to a sibling .tmp then rename (same dir = same filesystem, no
// EXDEV). Prevents a crash mid-write from corrupting the rolling summary on disk.
function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, filePath);
}

function createAgentSessionRecorder(options = {}) {
  const rootDir = safeStr(options.rootDir) || process.cwd();
  const agentStateDir = safeStr(options.agentStateDir) || "config/agents";
  const logger = options.logger && typeof options.logger.info === "function"
    ? options.logger : { info() {}, warn() {} };

  function sessionsDir(role) {
    return path.join(rootDir, agentStateDir, String(role || ""), "sessions");
  }

  function recordSession(role, record = {}) {
    const r = safeStr(role);
    if (!r) return { ok: false };
    try {
      const dir = sessionsDir(r);
      fs.mkdirSync(dir, { recursive: true });
      const sessionId = safeStr(record.session_id) || safeStr(record.subtask_id)
        || safeStr(record.task_id) || `session-${safeStr(record.mission_id) || "x"}`;
      const full = {
        schema_version: "agent-session-v1",
        session_id: sessionId,
        role: r,
        ...record
      };
      writeJsonAtomic(path.join(dir, `${sessionId}.json`), full);

      // Update rolling window summary.
      const summaryPath = path.join(dir, "summary-latest.json");
      let summary;
      try { summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")); }
      catch { summary = { schema_version: "agent-sessions-summary-v1", role: r, total_sessions: 0, window_sessions: [] }; }
      summary.total_sessions = Number(summary.total_sessions || 0) + 1;
      const win = Array.isArray(summary.window_sessions) ? summary.window_sessions : [];
      win.push({
        session_id: sessionId,
        completed_at: safeStr(record.completed_at),
        status: safeStr(record.status),
        model: safeStr(record.model),
        provider: safeStr(record.provider),
        topic: safeStr(record.topic)
      });
      summary.window_sessions = win.slice(-WINDOW);
      writeJsonAtomic(summaryPath, summary);

      logger.info({ event: "agent_session_recorded", role: r, session_id: sessionId, total: summary.total_sessions });
      return { ok: true, session_id: sessionId };
    } catch (err) {
      logger.warn({ event: "agent_session_record_failed", role: r, error: err && err.message });
      return { ok: false };
    }
  }

  return Object.freeze({ recordSession });
}

module.exports = { createAgentSessionRecorder };
