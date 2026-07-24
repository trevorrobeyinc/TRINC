"use strict";

// open-targets-graphql.js — subprocess adapter for the Open Targets Platform GraphQL API.
//
// WHY THIS EXISTS: `open-targets-graphql` was the registry's only HIGH-priority adapter gap
// ("load-bearing for $9,950+ deliverables"). It existed ONLY as a claude-host-mcp connector,
// which per config/connector-registry.json is "NOT reachable from subprocess" — so the engine
// running under scripts/run-workflow.js could never call it. This closes that gap.
//
// CITATION GROUNDING is the point. Every record this returns carries an identifier the
// citation gate can extract (openclaw-bridge/core/citation-extractor.js):
//   * drug candidates  -> `chemblId`  (Open Targets drug ids ARE ChEMBL ids, e.g. CHEMBL2402737)
//   * literature       -> `pmid`
// tool-prefetch.js `renderRecord` turns those fields into "ChEMBL: ..." / "PMID: ..." lines,
// which land in fetched_citation_ids and therefore raise the grounded-citation ratio rather
// than merely adding prose. Disease/target ids (ENSG…, MONDO…, EFO…) are NOT citation
// identifiers, so they ride along as context only — deliberately not dressed up as cites.
//
// Schema was verified live 2026-07-24 against api.platform.opentargets.org/api/v4/graphql.
// Two field names are counter-intuitive and were confirmed by introspection, NOT assumed:
//   * `drugAndClinicalCandidates` — NOT `knownDrugs` (which does not exist on Target here),
//     and it takes NO arguments (paging is client-side).
//   * `literatureOcurrences` — the API's own spelling, one "c". Do not "fix" it.
//
// Defensive + fail-soft: any network/parse/GraphQL error returns [] and logs a warning. A
// prefetch source must never break a run (same contract as ctgov-supplemental.js).
// No restricted globals (Date.now / new Date / Math.random / randomUUID) — see CLAUDE.md.

const OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql";

function createOpenTargetsGraphql(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const endpoint = options.endpoint || OT_GRAPHQL;
  // Session cache shared by every caller of this instance: a target/disease's Open Targets
  // profile is stable within a run. Only successful lookups are cached; errors stay retryable.
  const cache = new Map();

  async function gql(query, variables) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": `TRINC/1.0 (mailto:${contactEmail})`
        },
        body: JSON.stringify({ query, variables: variables || {} })
      });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "no-response"}`);
      const body = await res.json();
      // GraphQL returns 200 with an `errors` array on a bad query — treat that as a failure
      // rather than silently returning a partial/empty `data`.
      if (body && Array.isArray(body.errors) && body.errors.length > 0) {
        throw new Error(`graphql: ${body.errors.map((e) => e && e.message).join("; ").slice(0, 300)}`);
      }
      return (body && body.data) || null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Resolve a free-text gene/target symbol (e.g. "TP53", "EGFR") to an Ensembl gene id.
  // Returns null when nothing matches — callers treat that as an honest zero, not an error.
  async function resolveTarget(symbol) {
    const q = String(symbol || "").trim();
    if (!q) return null;
    const key = `target:${q.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);
    let data;
    try {
      data = await gql(
        `query R($q:String!){ search(queryString:$q, entityNames:["target"], page:{index:0,size:1}){ hits { id name description } } }`,
        { q }
      );
    } catch (err) {
      logger.warn({ event: "opentargets_resolve_failed", symbol: q, error: String(err && err.message) });
      return null;
    }
    const hit = data && data.search && Array.isArray(data.search.hits) ? data.search.hits[0] : null;
    const resolved = hit && hit.id ? { ensemblId: hit.id, name: hit.name || q, description: hit.description || "" } : null;
    cache.set(key, resolved);
    return resolved;
  }

  // Target intelligence: clinical/approved drug candidates (ChEMBL-grounded) + top associated
  // diseases + recent literature (PMID-grounded). One call, one flat record array for prefetch.
  async function targetIntel(args = {}) {
    // Deliberately NOT falling back to a compound name: Open Targets `search` over entityNames
    // ["target"] expects a gene/protein symbol, and feeding it a drug name ("aspirin") returns
    // either nothing or a spurious gene match that would then be presented as target evidence.
    // An unresolved template var arrives as "" and yields an honest zero instead.
    const symbol = String(args.target || args.target_gene || args.gene || args.query || "").trim();
    if (!symbol) return [];
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 50);
    const cacheKey = `intel:${symbol.toLowerCase()}:${limit}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const resolved = await resolveTarget(symbol);
    if (!resolved) {
      logger.info({ event: "opentargets_target_intel_zero", symbol });
      return [];
    }

    let data;
    try {
      data = await gql(
        `query T($id:String!,$startYear:Int){
           target(ensemblId:$id){
             approvedSymbol
             approvedName
             drugAndClinicalCandidates { count rows { maxClinicalStage drug { id name drugType } } }
             associatedDiseases(page:{index:0,size:5}) { count rows { score disease { id name } } }
             literatureOcurrences(startYear:$startYear) { count rows { pmid publicationDate } }
           }
         }`,
        { id: resolved.ensemblId, startYear: Number(args.startYear) || 2022 }
      );
    } catch (err) {
      logger.warn({ event: "opentargets_target_intel_failed", symbol, error: String(err && err.message) });
      return [];
    }

    const t = (data && data.target) || null;
    if (!t) return [];
    const records = [];
    const label = t.approvedSymbol || resolved.name || symbol;

    // --- Drug / clinical candidates: chemblId => GROUNDED citation id ---
    const dc = (t.drugAndClinicalCandidates && Array.isArray(t.drugAndClinicalCandidates.rows))
      ? t.drugAndClinicalCandidates.rows : [];
    for (const row of dc.slice(0, limit)) {
      const drug = (row && row.drug) || {};
      if (!drug.id) continue;
      records.push({
        title: `${drug.name || drug.id} — clinical candidate against ${label}`,
        chemblId: drug.id,
        phase: normalizeStage(row.maxClinicalStage),
        status: drug.drugType || "",
        description: `Open Targets: ${drug.name || drug.id} (${drug.drugType || "unknown type"}) targeting ${label}${
          t.approvedName ? ` (${t.approvedName})` : ""}. Max clinical stage ${row.maxClinicalStage || "n/a"}.`,
        url: `https://platform.opentargets.org/drug/${encodeURIComponent(drug.id)}`
      });
    }

    // --- Associated diseases: context only. MONDO/EFO ids are NOT citation identifiers, so
    // these carry no chemblId/pmid and must not be mistaken for grounded cites. ---
    const ad = (t.associatedDiseases && Array.isArray(t.associatedDiseases.rows))
      ? t.associatedDiseases.rows : [];
    if (ad.length) {
      const top = ad
        .filter((r) => r && r.disease && r.disease.name)
        .map((r) => `${r.disease.name} (score ${Number(r.score || 0).toFixed(2)}, ${r.disease.id})`)
        .join("; ");
      if (top) {
        records.push({
          title: `${label} — top disease associations (Open Targets)`,
          description: `Association evidence, strongest first: ${top}. Total associated diseases: ${
            (t.associatedDiseases && t.associatedDiseases.count) || 0}.`,
          url: `https://platform.opentargets.org/target/${encodeURIComponent(resolved.ensemblId)}/associations`
        });
      }
    }

    // --- Literature: pmid => GROUNDED citation id ---
    const lit = (t.literatureOcurrences && Array.isArray(t.literatureOcurrences.rows))
      ? t.literatureOcurrences.rows : [];
    for (const row of lit.slice(0, limit)) {
      if (!row || !row.pmid) continue;
      records.push({
        title: `Literature co-occurrence for ${label} (PMID ${row.pmid})`,
        pmid: String(row.pmid),
        year: (row.publicationDate || "").slice(0, 4),
        description: `Open Targets literature index links PMID ${row.pmid} to ${label}.`
      });
    }

    logger.info({
      event: "opentargets_target_intel_ok",
      symbol, ensemblId: resolved.ensemblId, count: records.length,
      drugs: dc.length, literature: lit.length
    });
    cache.set(cacheKey, records);
    return records;
  }

  // Disease-side lens for competitive intelligence: which targets carry the strongest evidence
  // in an indication, and which drugs are already in the clinic against it.
  async function diseaseIntel(args = {}) {
    // Fallback chain covers every template that names an indication under a different key:
    // drug-discovery-full -> indication, rare-disease-brief -> disease_name,
    // target-validation-pack -> disease_context, clinical-trial-landscape -> therapeutic_area.
    // Unresolved vars arrive as "" (falsy) so the chain simply advances; all-empty = honest zero.
    const name = String(
      args.indication || args.disease || args.disease_name ||
      args.disease_context || args.query || args.therapeutic_area || ""
    ).trim();
    if (!name) return [];
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 50);
    const cacheKey = `disease:${name.toLowerCase()}:${limit}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    let hit;
    try {
      const found = await gql(
        `query D($q:String!){ search(queryString:$q, entityNames:["disease"], page:{index:0,size:1}){ hits { id name description } } }`,
        { q: name }
      );
      hit = found && found.search && Array.isArray(found.search.hits) ? found.search.hits[0] : null;
    } catch (err) {
      logger.warn({ event: "opentargets_disease_resolve_failed", indication: name, error: String(err && err.message) });
      return [];
    }
    if (!hit || !hit.id) {
      logger.info({ event: "opentargets_disease_intel_zero", indication: name });
      return [];
    }

    let data;
    try {
      // NB: Disease exposes `drugAndClinicalCandidates` — the SAME field name as Target, and
      // NOT `knownDrugs` (which exists on neither type in this API version). Verified by
      // introspection 2026-07-24 after an initial `knownDrugs` query returned HTTP 400.
      data = await gql(
        `query DI($id:String!){
           disease(efoId:$id){
             name
             associatedTargets(page:{index:0,size:10}) { count rows { score target { id approvedSymbol approvedName } } }
             drugAndClinicalCandidates { count rows { maxClinicalStage drug { id name drugType } } }
           }
         }`,
        { id: hit.id }
      );
    } catch (err) {
      logger.warn({ event: "opentargets_disease_intel_failed", indication: name, error: String(err && err.message) });
      return [];
    }

    const dis = (data && data.disease) || null;
    if (!dis) return [];
    const records = [];
    const label = dis.name || hit.name || name;

    const at = (dis.associatedTargets && Array.isArray(dis.associatedTargets.rows)) ? dis.associatedTargets.rows : [];
    if (at.length) {
      const top = at
        .filter((r) => r && r.target && r.target.approvedSymbol)
        .map((r) => `${r.target.approvedSymbol} (${Number(r.score || 0).toFixed(2)})`)
        .join("; ");
      if (top) {
        records.push({
          title: `${label} — top associated targets (Open Targets)`,
          description: `Strongest target-disease associations: ${top}. Total: ${
            (dis.associatedTargets && dis.associatedTargets.count) || 0}.`,
          url: `https://platform.opentargets.org/disease/${encodeURIComponent(hit.id)}/associations`
        });
      }
    }

    // Drug candidates carry ChEMBL drug ids => GROUNDED citation identifiers.
    const kd = (dis.drugAndClinicalCandidates && Array.isArray(dis.drugAndClinicalCandidates.rows))
      ? dis.drugAndClinicalCandidates.rows : [];
    const seen = new Set();
    for (const row of kd) {
      const drug = (row && row.drug) || {};
      if (!drug.id || seen.has(drug.id)) continue;
      seen.add(drug.id);
      records.push({
        title: `${drug.name || drug.id} — in-clinic against ${label}`,
        chemblId: drug.id,
        phase: normalizeStage(row.maxClinicalStage),
        status: drug.drugType || "",
        description: `Open Targets clinical-candidate evidence: ${drug.name || drug.id} (${
          drug.drugType || "unknown type"}) for ${label}. Max clinical stage ${row.maxClinicalStage || "n/a"}. Total candidates in indication: ${
          (dis.drugAndClinicalCandidates && dis.drugAndClinicalCandidates.count) || 0}.`,
        url: `https://platform.opentargets.org/drug/${encodeURIComponent(drug.id)}`
      });
      if (seen.size >= limit) break;
    }

    logger.info({ event: "opentargets_disease_intel_ok", indication: name, efoId: hit.id, count: records.length });
    cache.set(cacheKey, records);
    return records;
  }

  // "PHASE_3" -> "3"; "PHASE_1_2" -> "1/2" (a straddling trial, not a phase-1 trial — collapsing
  // it to "1" would understate maturity in a competitive-landscape read). renderRecord prints
  // "Phase <x>". Non-numeric stages (e.g. "PRECLINICAL") pass through unchanged.
  function normalizeStage(stage) {
    if (stage == null || stage === "") return "";
    const s = String(stage);
    const nums = s.match(/\d+/g);
    if (!nums || nums.length === 0) return s;
    return nums.join("/");
  }

  async function health() {
    const hits = await resolveTarget("TP53");
    return { ok: Boolean(hits && hits.ensemblId), ensemblId: (hits && hits.ensemblId) || null };
  }

  return Object.freeze({ targetIntel, diseaseIntel, resolveTarget, health });
}

module.exports = { createOpenTargetsGraphql };
