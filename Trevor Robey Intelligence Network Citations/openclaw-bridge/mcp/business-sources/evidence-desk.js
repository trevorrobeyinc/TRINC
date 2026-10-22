"use strict";

// evidence-desk.js — the Evidence Desk's brief: the business scout's section, written WITHOUT a
// model (operator decision 2026-10-21).
//
// On the business lane the scout's job is collect-and-summarise. The records it would summarise are
// already structured (series values with period and geography, ranked verbatim web passages, DOIs,
// filings), so this module lays them out deterministically: an official-statistics table, the
// ranked passages with their `WEB: <id> ¶<n>` references, published research, company filings, and
// an honest account of what every search returned. The analyst then reasons over the brief.
//
// What it guarantees:
//   • Every identifier in the brief comes from a record this role fetched in this run. Nothing is
//     paraphrased, computed or inferred; values are quoted as their source published them.
//   • Context-only documents (vault read-back, memory priors) are never used.
//   • Same records → same brief, byte for byte (no clock, no randomness).
// The brief is marked `authored_by: "evidence-desk"` by agent-engine.js, so the citation gate and
// the density audit judge only model-written sections; the brief itself still ships and is still
// re-resolved, retraction-screened and license-scanned.

const VERSION = "evidence-desk-v1";
const ABSTRACT_CHARS = 400;
const FILING_CHARS = 300;

function cell(value) {
  return String(value == null ? "" : value).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

function opening(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max);
  return `${s.slice(0, cut > max * 0.6 ? cut : max)} …`;
}

function statRows(record) {
  const stat = record && record.stat;
  if (Array.isArray(stat)) return stat.filter((s) => s && s.cite);
  return stat && stat.cite ? [stat] : [];
}

function quote(text) {
  return String(text || "").split("\n").map((line) => `> ${line}`).join("\n");
}

const COVERAGE_WORDS = Object.freeze({
  returned: "returned records",
  empty: "returned nothing (an honest zero)",
  failed: "failed to answer (inconclusive, not evidence of absence)",
  skipped: "not run (does not apply to this request or is not configured)"
});

function createEvidenceDesk(options = {}) {
  const logger =
    options.logger && typeof options.logger.warn === "function"
      ? options.logger
      : { info() {}, warn() {}, error() {} };

  /**
   * @param {object} args
   * @param {string} [args.role]
   * @param {Array<object>} args.docs        this role's prefetch docs (tool-prefetch.js), each with
   *                                         non-enumerable `records` and `tool_name`
   * @param {Array<object>} [args.coverage]  the role's per-search outcome log
   * @param {object} [args.workflowInputs]
   * @returns {{ text: string, version: string, counts: object }}
   */
  function buildBrief({ role, docs, coverage, workflowInputs } = {}) {
    const evidence = (Array.isArray(docs) ? docs : []).filter((d) => d && d.context_only !== true);
    const stats = [];
    const pages = [];
    const works = [];
    const filings = [];
    for (const doc of evidence) {
      for (const record of Array.isArray(doc.records) ? doc.records : []) {
        if (!record || typeof record !== "object" || record.context_only === true) continue;
        const rows = statRows(record);
        if (rows.length > 0) {
          stats.push(...rows);
        } else if (record.webSnapshotId && Array.isArray(record.passages)) {
          pages.push(record);
        } else if (typeof record.doi === "string" && record.doi) {
          works.push(record);
        } else if (typeof record.text === "string" && /^SEC: \d+\/\d{10}-\d{2}-\d{6}/.test(record.text)) {
          filings.push(record);
        }
      }
    }

    const topic = String((workflowInputs && workflowInputs.topic) || "").trim();
    const lines = [
      "# Evidence Brief",
      "",
      "*Assembled by the Evidence Desk from the sources this run retrieved, without a language model. "
        + "Figures are quoted exactly as each source published them, with the period and geography it states; "
        + "every entry carries the identifier to cite.*",
      ""
    ];
    if (topic) lines.push(`**Question:** ${topic}`, "");

    lines.push("## Official statistics", "");
    if (stats.length === 0) {
      lines.push("No official-statistics series returned a value for this request.", "");
    } else {
      lines.push("| Identifier | Series | Value | Unit | Period | Geography |", "| --- | --- | --- | --- | --- | --- |");
      for (const s of stats) {
        lines.push(`| ${cell(s.cite)} | ${cell(s.series)} | ${cell(s.value)} | ${cell(s.unit)} | ${cell(s.period)} | ${cell(s.geo)} |`);
      }
      lines.push("");
    }

    lines.push("## Web sources: passages ranked for the question", "");
    if (pages.length === 0) {
      lines.push("No web page passed the relevance check for this request, so none is quoted.", "");
    } else {
      lines.push(
        "Each passage is verbatim; the character range locates it in the stored snapshot, which ships in `sources/`.",
        ""
      );
      pages.forEach((page, i) => {
        lines.push(`### ${i + 1}. ${cell(page.title || page.url)}`, "");
        lines.push(`${page.url} · snapshot WEB: ${page.webSnapshotId} · ${page.passages.length} of ${page.passageTotal || page.passages.length} passages shown`, "");
        for (const p of page.passages) {
          lines.push(`**WEB: ${page.webSnapshotId} ¶${p.n}** (characters ${p.start}–${p.end})`, "", quote(p.text), "");
        }
      });
    }

    lines.push("## Published research", "");
    if (works.length === 0) {
      lines.push("No DOI-indexed work was returned for this request.", "");
    } else {
      for (const w of works) {
        const meta = [w.year, w.journal].filter(Boolean).join("; ");
        lines.push(`- **${cell(w.title || w.doi)}**${meta ? ` (${cell(meta)})` : ""} — doi: ${w.doi}`);
        if (w.abstract) lines.push(`  - Abstract (opening): ${opening(w.abstract, ABSTRACT_CHARS)}`);
      }
      lines.push("");
    }

    lines.push("## Company filings", "");
    if (filings.length === 0) {
      lines.push("No company filing was requested or returned for this request.", "");
    } else {
      for (const f of filings) {
        const [idLine, ...rest] = String(f.text).split("\n");
        lines.push(`- **${cell(f.title || idLine)}**${f.year ? ` (${cell(f.year)})` : ""} — ${idLine}`);
        const description = rest.join(" ").trim();
        if (description) lines.push(`  - ${opening(description, FILING_CHARS)}`);
      }
      lines.push("");
    }

    lines.push("## What each search returned", "");
    const log = Array.isArray(coverage) ? coverage : [];
    if (log.length === 0) {
      lines.push("No search outcome was recorded for this role.", "");
    } else {
      for (const c of log) {
        const words = COVERAGE_WORDS[c && c.status] || String((c && c.status) || "unknown");
        const count = c && c.status === "returned" ? ` (${Number(c.records) || 0})` : "";
        lines.push(`- ${cell(c && c.source)}: ${words}${count}`);
      }
      lines.push("");
    }

    const counts = { series: stats.length, web_pages: pages.length, passages: pages.reduce((n, p) => n + p.passages.length, 0), works: works.length, filings: filings.length };
    logger.info({ event: "evidence_desk_brief_built", role: role || "", ...counts });
    return { text: `${lines.join("\n").trim()}\n`, version: VERSION, counts };
  }

  return Object.freeze({ buildBrief, VERSION });
}

module.exports = { createEvidenceDesk, VERSION };
