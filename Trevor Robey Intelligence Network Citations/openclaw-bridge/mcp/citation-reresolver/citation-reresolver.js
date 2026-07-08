"use strict";

// citation-reresolver.js — programmatic re-resolution of cited identifiers against their LIVE
// source registries at delivery time. This is what makes the brand claim true: every cited
// identifier is re-resolved against its issuing public registry and recorded VERIFIED /
// UNRESOLVED / UNCHECKED in the Reproducibility Manifest.
//
// Mirrors crossref-retraction.js: a createX(options) factory, an injectable `fetchImpl`
// (so the whole thing is unit-tested offline with mocks — no live calls in CI), a per-call
// AbortController timeout, and FAIL-SOFT semantics: a non-definitive answer is UNCHECKED,
// NEVER a false VERIFIED.
//
// HARD RULE (zero-fabrication): a bare HTTP 200 is NEVER sufficient. PMID (E-utilities),
// RxNorm (RxNav) and UniProt all return 200 for non-existent ids; PubChem's property/cids
// endpoints 200-echo bogus CIDs. Every resolver parses the body per its 2026-06-19
// live-verified success criterion. ChEMBL is identifier-resolution ONLY (no data values).

const STATUS = Object.freeze({ VERIFIED: "VERIFIED", UNRESOLVED: "UNRESOLVED", UNCHECKED: "UNCHECKED" });
const RESOLVER_TABLE_VERSION = "2026-06-19";

function normType(type) {
  const t = String(type == null ? "" : type).trim().toUpperCase();
  if (t === "PMID") return "PMID";
  if (t === "DOI") return "DOI";
  if (t === "NCT") return "NCT";
  if (t === "CHEMBL") return "ChEMBL";
  if (t === "UNIPROT") return "UniProt";
  if (t === "DRUGBANK") return "DrugBank";
  if (t === "PUBCHEM CID" || t === "CID" || t === "PUBCHEM") return "PubChem CID";
  if (t === "RXNORM" || t === "RXCUI") return "RxNorm";
  return t || "UNKNOWN";
}

function hostFor(normalizedType) {
  switch (normalizedType) {
    case "PMID": return "eutils";
    case "DOI": return "crossref";
    case "PubChem CID": return "pubchem";
    case "NCT": return "ctgov";
    case "RxNorm": return "rxnav";
    case "ChEMBL": return "chembl";
    case "UniProt": return "uniprot";
    default: return "none";
  }
}

function createCitationReresolver(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const ncbiApiKey = options.ncbiApiKey || "";
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const cache = new Map(); // per-run only: `${type}:${ID}` -> result

  const UA = `TRINC/1.0 (mailto:${contactEmail})`;

  async function doFetch(url, { method = "GET" } = {}) {
    if (typeof fetchImpl !== "function") return { networkError: true, error: "no fetch implementation" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
    } catch (err) {
      const aborted = err && (err.name === "AbortError" || /abort/i.test(String(err.message)));
      return { networkError: true, aborted: Boolean(aborted), error: String(err && err.message) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function safeJson(res) {
    try { return await res.json(); } catch { return undefined; }
  }

  function classifyTransport(res) {
    // Shared transport-level classification → UNCHECKED reasons. Returns null if the response
    // is a "normal" HTTP response the resolver should inspect by body.
    if (!res || res.networkError) return { reason: res && res.aborted ? "timeout" : "network_error", error: res && res.error };
    const s = Number(res.status) || 0;
    if (s === 429) return { reason: "rate_limited" };
    if (s >= 500) return { reason: "http_5xx" };
    return null;
  }

  // ---- per-source resolvers ----

  async function resolvePMID(id) {
    const keyParam = ncbiApiKey ? `&api_key=${ncbiApiKey}` : "";
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(id)}&retmode=json&tool=TRINC-citation-reresolver&email=${encodeURIComponent(contactEmail)}${keyParam}`;
    const resolved_url = url.replace(/&api_key=[^&]+/, "&api_key=***");
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" } };
    const body = await safeJson(res);
    const rec = body && body.result && body.result[String(id)];
    if (!body || !body.result) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" } };
    if (!rec) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" } };
    if (rec.error) return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url, evidence: { reason: "cannot_get_document_summary" } };
    return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { has_docsum: true } };
  }

  async function resolveDOI(id) {
    const crUrl = `https://api.crossref.org/works/${encodeURIComponent(id)}/agency?mailto=${encodeURIComponent(contactEmail)}`;
    const res = await doFetch(crUrl);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: crUrl, resolver_type: "primary", evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      if (body && body.status === "ok" && body["message-type"] === "work-agency") {
        return { status: STATUS.VERIFIED, http_status: 200, resolved_url: crUrl, resolver_type: "primary", evidence: { crossref_status: "ok", message_type: "work-agency" } };
      }
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: crUrl, resolver_type: "primary", evidence: { reason: "unparseable" } };
    }
    if (res.status !== 404) {
      return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: crUrl, resolver_type: "primary", evidence: { reason: "unexpected_status" } };
    }
    // Crossref 404 is NOT final — a DataCite/other-agency DOI is valid yet absent from Crossref.
    const fbUrl = `https://doi.org/${id}`;
    const fb = await doFetch(fbUrl, { method: "HEAD" });
    const ft = classifyTransport(fb);
    if (ft) return { status: STATUS.UNCHECKED, http_status: fb.status || null, resolved_url: fbUrl, resolver_type: "fallback", evidence: ft };
    if (fb.status >= 200 && fb.status < 400) {
      return { status: STATUS.VERIFIED, http_status: fb.status, resolved_url: fbUrl, resolver_type: "fallback", evidence: { resolved_via: "doi.org-head", note: "registration confirmed; content identity not asserted" } };
    }
    if (fb.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: fbUrl, resolver_type: "fallback", evidence: { reason: "resource_not_found" } };
    return { status: STATUS.UNCHECKED, http_status: fb.status, resolved_url: fbUrl, resolver_type: "fallback", evidence: { reason: "unexpected_status" } };
  }

  async function resolvePubChemCID(id) {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(id)}/JSON`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 503) return { status: STATUS.UNCHECKED, http_status: 503, resolved_url: url, evidence: { reason: "rate_limited" } };
    if (res.status === 200) {
      const body = await safeJson(res);
      const cid = body && Array.isArray(body.PC_Compounds) && body.PC_Compounds[0] && body.PC_Compounds[0].id && body.PC_Compounds[0].id.id && body.PC_Compounds[0].id.id.cid;
      if (Number(cid) === Number(id)) return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { pc_cid_echo: Number(id) } };
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "pugrest_notfound" } };
    if (res.status === 400) return { status: STATUS.UNRESOLVED, http_status: 400, resolved_url: url, evidence: { reason: "bad_request" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  async function resolveNCT(id) {
    const url = `https://clinicaltrials.gov/api/v2/studies/${encodeURIComponent(id)}?format=json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      const nctId = body && body.protocolSection && body.protocolSection.identificationModule && body.protocolSection.identificationModule.nctId;
      if (String(nctId).toUpperCase() === String(id).toUpperCase()) return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { nctId_echo: nctId } };
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "nct_not_found" } };
    if (res.status === 400) return { status: STATUS.UNRESOLVED, http_status: 400, resolved_url: url, evidence: { reason: "bad_format" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  async function resolveRxNorm(id) {
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(id)}/historystatus.json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
    const body = await safeJson(res);
    const st = body && body.rxcuiStatusHistory && body.rxcuiStatusHistory.metaData && body.rxcuiStatusHistory.metaData.status;
    if (!st) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    if (st === "UNKNOWN") return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url: url, evidence: { reason: "rxnorm_unknown" } };
    return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { rxnorm_status: st } };
  }

  async function resolveChEMBL(id) {
    const url = `https://www.ebi.ac.uk/chembl/api/data/molecule/${encodeURIComponent(id)}.json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      const cid = body && body.molecule_chembl_id; // identifier ONLY — no data values read
      if (String(cid).toUpperCase() === String(id).toUpperCase()) return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { molecule_chembl_id: cid } };
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "chembl_404" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  async function resolveUniProt(id) {
    const url = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(id)}.json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      if (!body || !body.primaryAccession) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
      const inactive = body.entryType === "Inactive" || (body.inactiveReason && body.inactiveReason.inactiveReasonType);
      if (inactive) return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url: url, evidence: { reason: "uniprot_inactive" } };
      if (String(body.primaryAccession).toUpperCase() === String(id).toUpperCase()) {
        return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { primaryAccession: body.primaryAccession, entryType: body.entryType } };
      }
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 400) return { status: STATUS.UNRESOLVED, http_status: 400, resolved_url: url, evidence: { reason: "bad_format" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  function resolverFor(t) {
    switch (t) {
      case "PMID": return resolvePMID;
      case "DOI": return resolveDOI;
      case "PubChem CID": return resolvePubChemCID;
      case "NCT": return resolveNCT;
      case "RxNorm": return resolveRxNorm;
      case "ChEMBL": return resolveChEMBL;
      case "UniProt": return resolveUniProt;
      default: return null;
    }
  }

  async function resolveOne(citation) {
    const type = normType(citation && citation.type);
    const id = String((citation && citation.id) != null ? citation.id : "").trim();
    const base = { id, type, resolver_type: "primary", attempts: 1, checked_at: nowIso() };
    if (!id) return { ...base, status: STATUS.UNCHECKED, http_status: null, resolved_url: null, evidence: { reason: "empty_id" } };
    const ck = `${type}:${id.toUpperCase()}`;
    if (cache.has(ck)) return cache.get(ck);

    const resolver = resolverFor(type);
    let out;
    if (!resolver) {
      out = { ...base, status: STATUS.UNCHECKED, http_status: null, resolved_url: null, evidence: { reason: "no_resolver" } };
    } else {
      try {
        const r = await resolver(id);
        out = { ...base, resolver_type: r.resolver_type || "primary", status: r.status, http_status: r.http_status == null ? null : r.http_status, resolved_url: r.resolved_url || null, evidence: r.evidence || {}, checked_at: nowIso() };
      } catch (err) {
        logger.warn({ event: "citation_reresolve_crashed", type, id, error: String(err && err.message) });
        out = { ...base, status: STATUS.UNCHECKED, http_status: null, resolved_url: null, evidence: { reason: "network_error", error: String(err && err.message) }, checked_at: nowIso() };
      }
    }
    cache.set(ck, out);
    return out;
  }

  // Dedup by type+ID; one in-flight request PER HOST (polite, never trips a registry limit),
  // hosts processed concurrently. Cache makes duplicate citations resolve once per run.
  async function resolveAll(citations) {
    const dedup = new Map();
    for (const c of Array.isArray(citations) ? citations : []) {
      const type = normType(c && c.type);
      const id = String((c && c.id) != null ? c.id : "").trim();
      if (!id) continue;
      const ck = `${type}:${id.toUpperCase()}`;
      if (!dedup.has(ck)) dedup.set(ck, { type, id });
    }
    const byHost = new Map();
    for (const c of dedup.values()) {
      const h = hostFor(c.type);
      if (!byHost.has(h)) byHost.set(h, []);
      byHost.get(h).push(c);
    }
    const results = [];
    await Promise.all([...byHost.values()].map(async (list) => {
      for (const c of list) results.push(await resolveOne(c));
    }));
    return results;
  }

  return Object.freeze({ resolveOne, resolveAll, STATUS, RESOLVER_TABLE_VERSION });
}

module.exports = { createCitationReresolver, STATUS, RESOLVER_TABLE_VERSION, normType, hostFor };
