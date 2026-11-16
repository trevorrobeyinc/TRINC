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

const timeProviderModule = require("../../core/time-provider.js");
const { createNcbiPacing } = require("../../core/ncbi-pacing.js");
const {
  findWrittenAttributions,
  compareAttribution,
  registryLabel,
  bibFromCrossref,
  bibFromNcbiDocsum,
  normName
} = require("../../core/citation-attribution.js");

const STATUS = Object.freeze({ VERIFIED: "VERIFIED", UNRESOLVED: "UNRESOLVED", UNCHECKED: "UNCHECKED" });
// 2026-11-16 (Tier 2): PMCID, ISRCTN and EudraCT resolvers added (T2-16); ChEMBL through its id lookup,
// a UniProt 404 UNRESOLVED and a PubChem 503 rate_limited (T2-3).
const RESOLVER_TABLE_VERSION = "2026-11-16";

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
  // T2-16 (2026-11-16): trial registrations and PMC full texts.
  if (t === "PMCID") return "PMCID";
  if (t === "ISRCTN") return "ISRCTN";
  if (t === "EUDRACT") return "EudraCT";
  // Business research lane (2026-10-21) — see core/research-profiles.js.
  if (t === "SEC") return "SEC";
  if (t === "WEB") return "WEB";
  if (t === "WB") return "WB";
  // Evidence Desk official statistics (2026-10-21) — see mcp/business-sources/.
  if (t === "BLS") return "BLS";
  if (t === "EUROSTAT") return "EUROSTAT";
  if (t === "CENSUS") return "CENSUS";
  if (t === "EIA") return "EIA";
  return t || "UNKNOWN";
}

function hostFor(normalizedType) {
  switch (normalizedType) {
    case "PMID": return "eutils";
    // T2-16: a PMCID shares the PMID lane, so every NCBI request keeps one in-flight call and the pacing.
    case "PMCID": return "eutils";
    case "ISRCTN": return "isrctn";
    case "EudraCT": return "euctr";
    case "DOI": return "crossref";
    case "PubChem CID": return "pubchem";
    case "NCT": return "ctgov";
    case "RxNorm": return "rxnav";
    case "ChEMBL": return "chembl";
    case "UniProt": return "uniprot";
    case "SEC": return "sec";
    case "WB": return "worldbank";
    case "WEB": return "websnapshot";
    case "BLS": return "bls";
    case "EUROSTAT": return "eurostat";
    case "CENSUS": return "census";
    case "EIA": return "eia";
    default: return "none";
  }
}

// Keys travel in query strings for BLS v2, Census and EIA; a resolved_url is recorded in the
// customer-facing manifest, so the key is masked there exactly as the NCBI key is.
function maskKeys(url) {
  return String(url).replace(/([?&](?:registrationkey|key|api_key)=)[^&]+/gi, "$1***");
}

function createCitationReresolver(options = {}) {
  const logger = options.logger && typeof options.logger.warn === "function"
    ? options.logger
    : { info() {}, warn() {}, error() {} };
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 15_000;
  const contactEmail = options.contactEmail || "trevor@trevorobeyinc.com";
  const ncbiApiKey = options.ncbiApiKey || "";
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => timeProviderModule.nowIso();
  const cache = new Map(); // per-run only: `${type}:${ID}` -> result
  // Attribution check (2026-11-04): registry authors and years per cited work, `${type}:${ID}` ->
  // { authors, years } or { error }. PMIDs fill it from the docsum resolvePMID already reads; DOIs
  // are fetched from Crossref only when the report names an author beside them.
  const bibliographic = new Map();
  // Business lane: the run's web snapshot store (mcp/business-sources/web-snapshot-store.js). Absent
  // → every WEB id is UNCHECKED `no_snapshot_store`, never a false VERIFIED.
  const webSnapshotStore = options.webSnapshotStore && typeof options.webSnapshotStore.verify === "function"
    ? options.webSnapshotStore
    : null;
  // SEC fair-access policy requires a User-Agent naming the organisation and a contact address.
  // The Evidence Desk statistics agencies (BLS, Eurostat, Census, EIA) get the same declaration.
  const secUserAgent = `${options.organization || "Trevor Robey Intelligence Network Citations LLC"} ${contactEmail}`;
  // Evidence Desk keys (P2). Absent → BLS falls back to the keyless v1 API; Census and EIA ids are
  // UNCHECKED `no_api_key` (never a false VERIFIED).
  const blsApiKey = typeof options.blsApiKey === "string" ? options.blsApiKey.trim() : "";
  const censusApiKey = typeof options.censusApiKey === "string" ? options.censusApiKey.trim() : "";
  const eiaApiKey = typeof options.eiaApiKey === "string" ? options.eiaApiKey.trim() : "";

  // NCBI politeness: pacing plus ONE retry on a 429 — the policy lives in core/ncbi-pacing.js, shared with
  // pubmed-retraction.js (options: `minRequestIntervalMs`, `maxRetryAfterMs`, and the injectable `nowMs`/`sleep`;
  // production wiring in workflow-engine.js passes 350 ms, or 110 ms with a key). resolveAll() walks one host's
  // citations back to back, so 12 PMIDs left ~100 ms apart and NCBI answered 429 for 7 of them in the first real
  // dispatch-lane run (2026-10-08). That is fail-soft (UNCHECKED, never a false VERIFIED), but every unchecked id
  // forfeits the full-strength DELIVER claim (max_unchecked_ratio is 0 by doctrine, see reproducibility-manifest.js),
  // so the cure is resilience, not a looser bar. Past the retry, or beyond the Retry-After cap, the id stays
  // UNCHECKED `rate_limited`, honestly. Other hosts are untouched.
  const ncbiPacing = createNcbiPacing({
    nowMs: options.nowMs,
    sleep: options.sleep,
    minRequestIntervalMs: options.minRequestIntervalMs,
    maxRetryAfterMs: options.maxRetryAfterMs
  });

  const UA = `TRINC/1.0 (mailto:${contactEmail})`;

  async function doFetch(url, { method = "GET", userAgent, accept = "application/json" } = {}) {
    if (typeof fetchImpl !== "function") return { networkError: true, error: "no fetch implementation" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": userAgent || UA, Accept: accept },
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

  async function safeText(res) {
    try { return typeof res.text === "function" ? await res.text() : undefined; } catch { return undefined; }
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

  // NCBI request: paced, with at most ONE retry on HTTP 429. Returns the final response and how many attempts it took,
  // which the manifest records per id (`attempts`).
  async function ncbiFetch(url) {
    const { out, attempts } = await ncbiPacing.request(() => doFetch(url));
    return { res: out, attempts };
  }

  // ---- per-source resolvers ----

  async function resolvePMID(id) {
    const keyParam = ncbiApiKey ? `&api_key=${ncbiApiKey}` : "";
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(id)}&retmode=json&tool=TRINC-citation-reresolver&email=${encodeURIComponent(contactEmail)}${keyParam}`;
    const resolved_url = url.replace(/&api_key=[^&]+/, "&api_key=***");
    const { res, attempts } = await ncbiFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t, attempts };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" }, attempts };
    const body = await safeJson(res);
    const rec = body && body.result && body.result[String(id)];
    if (!body || !body.result) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" }, attempts };
    if (!rec) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" }, attempts };
    if (rec.error) return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url, evidence: { reason: "cannot_get_document_summary" }, attempts };
    // The docsum already names the authors and dates: keep them for the attribution check
    // (checkAttributions) instead of fetching the record twice.
    bibliographic.set(`PMID:${String(id).toUpperCase()}`, bibFromNcbiDocsum(rec));
    return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { has_docsum: true }, attempts };
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
    // T2-3 (2026-11-16): PubChem answers 503 when it throttles (PUGREST.ServerBusy). This test used to sit
    // after classifyTransport, which files every status from 500 as http_5xx first, so it never ran. A
    // throttle is recorded as rate_limited, which the deferred retry (T2-1) tries again.
    if (res && !res.networkError && Number(res.status) === 503) {
      return { status: STATUS.UNCHECKED, http_status: 503, resolved_url: url, evidence: { reason: "rate_limited" } };
    }
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
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

  // T2-3 (2026-11-16): ChEMBL's id lookup, which knows every ChEMBL id. The molecule endpoint used here
  // before knows compounds only: /molecule/CHEMBL203.json answers 404 for a real, active TARGET
  // (chembl_id_lookup/CHEMBL203.json: entity_type TARGET, status ACTIVE; read live 2026-11-15), so a
  // correct target, assay or document id was UNRESOLVED and blocked the run. An id ChEMBL lists as
  // INACTIVE is UNRESOLVED, as an inactive UniProt entry is (operator default D13); a status the lookup
  // does not document is UNCHECKED. Identifier and entity type only: no data values are read.
  async function resolveChEMBL(id) {
    const url = `https://www.ebi.ac.uk/chembl/api/data/chembl_id_lookup/${encodeURIComponent(id)}.json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      const echoed = body && String(body.chembl_id || "").toUpperCase() === String(id).toUpperCase();
      if (!echoed) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
      const evidence = { chembl_id: body.chembl_id, entity_type: body.entity_type || null };
      const lookupStatus = String(body.status || "").toUpperCase();
      if (lookupStatus === "ACTIVE") return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence };
      if (lookupStatus === "INACTIVE") return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url: url, evidence: { reason: "chembl_inactive", ...evidence } };
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "chembl_status_unknown", lookup_status: lookupStatus || null, ...evidence } };
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
    // T2-3 (2026-11-16): an accession UniProt never issued answers 404 "Resource not found" (Z9ZZZ9 and
    // A0A0A0A0A0, read live 2026-11-15). It used to fall through to UNCHECKED and never block.
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "uniprot_not_found" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  // ---- trial registrations and PMC full texts (T2-16, 2026-11-16) ----
  // Each success criterion below was read from the live registry, read-only, on 2026-11-15
  // (tests/fixtures/registry-probe-2026-11-15/): a bare HTTP 200 is never sufficient.

  // PMCID: NCBI esummary db=pmc, paced like a PMID (same eutils host). A real record echoes its PMCID in
  // `articleids`; an id PMC never issued answers the docsum error "cannot get document summary", the same
  // definitive "does not exist" a PMID gets (:183).
  async function resolvePMCID(id) {
    const m = /^PMC(\d{1,9})$/i.exec(String(id));
    if (!m) return { status: STATUS.UNRESOLVED, http_status: null, resolved_url: null, evidence: { reason: "bad_format" } };
    const digits = m[1];
    const keyParam = ncbiApiKey ? `&api_key=${ncbiApiKey}` : "";
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${encodeURIComponent(digits)}&retmode=json&tool=TRINC-citation-reresolver&email=${encodeURIComponent(contactEmail)}${keyParam}`;
    const resolved_url = url.replace(/&api_key=[^&]+/, "&api_key=***");
    const { res, attempts } = await ncbiFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t, attempts };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" }, attempts };
    const body = await safeJson(res);
    const rec = body && body.result && body.result[digits];
    if (!rec) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" }, attempts };
    if (rec.error) return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url, evidence: { reason: "cannot_get_document_summary" }, attempts };
    const echo = (Array.isArray(rec.articleids) ? rec.articleids : [])
      .find((a) => a && a.idtype === "pmcid" && String(a.value).toUpperCase() === `PMC${digits}`);
    if (echo) return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { pmcid_echo: echo.value }, attempts };
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" }, attempts };
  }

  // ISRCTN: the registry's query API, never the record page (it answers 200 with the same page for a real
  // and an invented id). A well-formed answer with totalCount 0 is the registry saying the trial does not
  // exist (UNRESOLVED, operator default D7); a trial is VERIFIED only when its public id echoes the one cited.
  async function resolveISRCTN(id) {
    const m = /^ISRCTN(\d{8})$/i.exec(String(id));
    if (!m) return { status: STATUS.UNRESOLVED, http_status: null, resolved_url: null, evidence: { reason: "bad_format" } };
    const url = `https://www.isrctn.com/api/query/format/default?q=ISRCTN${m[1]}`;
    const res = await doFetch(url, { accept: "application/xml" });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
    const text = await safeText(res);
    const root = typeof text === "string" ? /<allTrials\b[^>]*\btotalCount="(\d+)"/.exec(text) : null;
    if (!root) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    if (Number(root[1]) === 0) return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url: url, evidence: { reason: "isrctn_not_found" } };
    if (text.includes(`publicIdentifierCanonical="ISRCTN${m[1]}"`)) {
      return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { isrctn_echo: `ISRCTN${m[1]}` } };
    }
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
  }

  // EudraCT: the EU Clinical Trials Register's text download. A record echoes "EudraCT Number: <n>". An
  // empty answer is NOT a "does not exist": the register does not publish every EudraCT trial (adult
  // phase I trials, for one), so it is UNCHECKED and never UNRESOLVED (operator default D7). The register
  // has no documented API, so any other shape is UNCHECKED too.
  async function resolveEudraCT(id) {
    const m = /^((?:19|20)\d{2}-\d{6}-\d{2})$/.exec(String(id));
    if (!m) return { status: STATUS.UNRESOLVED, http_status: null, resolved_url: null, evidence: { reason: "bad_format" } };
    const url = `https://www.clinicaltrialsregister.eu/ctr-search/rest/download/summary?query=${encodeURIComponent(m[1])}&mode=current_page`;
    const res = await doFetch(url, { accept: "text/plain" });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
    const text = await safeText(res);
    if (typeof text !== "string") return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    if (new RegExp(`EudraCT Number:[ \\t]*${m[1]}(?![\\d-])`).test(text)) {
      return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { eudract_echo: m[1] } };
    }
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "registry_no_definitive_answer" } };
  }

  // ---- business research lane (2026-10-21) ----

  // SEC: "<CIK>/<accession>". The filing's EDGAR directory listing answers 200 with a JSON
  // `directory.name` that ends in the bare accession number for a real filing, and 404 for one
  // that does not exist. A 403 is EDGAR's fair-access throttle — UNCHECKED, never UNRESOLVED.
  async function resolveSEC(id) {
    const m = /^(\d{1,10})\/(\d{10}-\d{2}-\d{6})$/.exec(String(id));
    if (!m) return { status: STATUS.UNRESOLVED, http_status: null, resolved_url: null, evidence: { reason: "bad_format" } };
    const cik = m[1].replace(/^0+/, "") || "0";
    const bare = m[2].replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${bare}/index.json`;
    const res = await doFetch(url, { userAgent: secUserAgent });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const body = await safeJson(res);
      const name = body && body.directory && String(body.directory.name || "");
      if (name && name.replace(/\/+$/, "").endsWith(bare)) {
        return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { directory: name } };
      }
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "sec_filing_not_found" } };
    if (res.status === 403) return { status: STATUS.UNCHECKED, http_status: 403, resolved_url: url, evidence: { reason: "rate_limited" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  // WB: the indicator endpoint answers 200 for every request; a real code returns
  // [meta, [{ id }]] and an unknown one returns [{ message: [...] }]. Identity only — no value read.
  async function resolveWB(id) {
    const url = `https://api.worldbank.org/v2/indicator/${encodeURIComponent(id)}?format=json`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
    const body = await safeJson(res);
    const rec = Array.isArray(body) && Array.isArray(body[1]) ? body[1][0] : null;
    if (rec && String(rec.id).toUpperCase() === String(id).toUpperCase()) {
      return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { indicator: rec.name || rec.id } };
    }
    if (Array.isArray(body) && body[0] && Array.isArray(body[0].message)) {
      return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url: url, evidence: { reason: "wb_indicator_unknown" } };
    }
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
  }

  // ---- Evidence Desk official statistics (2026-10-21) ----

  // BLS: the timeseries endpoint answers HTTP 200 for every request. Live-verified 2026-10-21:
  // a real series returns status REQUEST_SUCCEEDED with its seriesID echoed and data rows; an
  // unknown one returns REQUEST_SUCCEEDED, an EMPTY data array and the message "Series does not
  // exist for Series <ID>". A refusal (REQUEST_NOT_PROCESSED, e.g. the keyless 25-a-day limit) is
  // UNCHECKED, never UNRESOLVED. Identity only — no value is read.
  async function resolveBLS(id) {
    const sid = String(id).toUpperCase();
    const url = blsApiKey
      ? `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(sid)}?registrationkey=${encodeURIComponent(blsApiKey)}`
      : `https://api.bls.gov/publicAPI/v1/timeseries/data/${encodeURIComponent(sid)}`;
    const resolved_url = maskKeys(url);
    const res = await doFetch(url, { userAgent: secUserAgent });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" } };
    const body = await safeJson(res);
    if (!body) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" } };
    const messages = Array.isArray(body.message) ? body.message.join(" ") : "";
    if (body.status !== "REQUEST_SUCCEEDED") {
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: /threshold|limit/i.test(messages) ? "rate_limited" : "request_not_processed" } };
    }
    if (messages.toUpperCase().includes(`SERIES DOES NOT EXIST FOR SERIES ${sid}`)) {
      return { status: STATUS.UNRESOLVED, http_status: 200, resolved_url, evidence: { reason: "bls_series_not_found" } };
    }
    const series = body.Results && Array.isArray(body.Results.series)
      ? body.Results.series.find((s) => s && String(s.seriesID).toUpperCase() === sid)
      : null;
    if (series && Array.isArray(series.data) && series.data.length > 0) {
      return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { seriesID: series.seriesID, rows: series.data.length } };
    }
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" } };
  }

  // EUROSTAT: the SDMX dataflow endpoint. Live-verified 2026-10-21: a real dataset answers 200
  // with an SDMX structure document containing `<s:Dataflow id="<CODE>"`; an unknown one answers
  // 404 with "ERR_NOT_FOUND_4: <CODE> ... is not available for dissemination". Identity only.
  async function resolveEUROSTAT(id) {
    const code = String(id).toUpperCase();
    const url = `https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/dataflow/ESTAT/${encodeURIComponent(String(id).toLowerCase())}`;
    const res = await doFetch(url, { userAgent: secUserAgent, accept: "application/xml" });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url: url, evidence: t };
    if (res.status === 200) {
      const text = await safeText(res);
      if (text && text.includes(`<s:Dataflow id="${code}"`)) {
        return { status: STATUS.VERIFIED, http_status: 200, resolved_url: url, evidence: { dataflow: code } };
      }
      return { status: STATUS.UNCHECKED, http_status: 200, resolved_url: url, evidence: { reason: "unparseable" } };
    }
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url: url, evidence: { reason: "eurostat_dataset_not_found" } };
    return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url: url, evidence: { reason: "unexpected_status" } };
  }

  // CENSUS: "<dataset>/<year>/<NAICS>", re-queried with the key. Verified 2026-10-21: a keyless
  // request answers HTTP 200 with an HTML "Missing Key" page — so a 200 is VERIFIED only with a
  // JSON table that echoes the NAICS code. The not-found shape cannot be read without a key: 204
  // (documented "no data") and 404 are UNRESOLVED, everything else UNCHECKED. Confirm on activation.
  async function resolveCENSUS(id) {
    const m = /^([a-z]{2,12})\/(\d{4})\/(\d{2}(?:-\d{2}|\d{1,4})?)$/.exec(String(id));
    if (!m) return { status: STATUS.UNRESOLVED, http_status: null, resolved_url: null, evidence: { reason: "bad_format" } };
    const [, dataset, year, naics] = m;
    if (dataset !== "cbp") return { status: STATUS.UNCHECKED, http_status: null, resolved_url: null, evidence: { reason: "unsupported_dataset" } };
    const base = `https://api.census.gov/data/${year}/cbp?get=NAICS2017_LABEL&for=us:*&NAICS2017=${encodeURIComponent(naics)}`;
    if (!censusApiKey) return { status: STATUS.UNCHECKED, http_status: null, resolved_url: base, evidence: { reason: "no_api_key" } };
    const url = `${base}&key=${encodeURIComponent(censusApiKey)}`;
    const resolved_url = maskKeys(url);
    const res = await doFetch(url, { userAgent: secUserAgent });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t };
    if (res.status === 204) return { status: STATUS.UNRESOLVED, http_status: 204, resolved_url, evidence: { reason: "census_no_data" } };
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url, evidence: { reason: "census_not_found" } };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" } };
    const rows = await safeJson(res);
    if (!Array.isArray(rows)) return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "not_json_key_missing_or_rejected" } };
    const header = Array.isArray(rows[0]) ? rows[0] : [];
    const col = header.indexOf("NAICS2017");
    const echoed = col >= 0 && Array.isArray(rows[1]) ? String(rows[1][col]) : "";
    if (echoed === naics) return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { naics: echoed, label: rows[1][header.indexOf("NAICS2017_LABEL")] || "" } };
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: "unparseable" } };
  }

  // EIA: /v2/seriesid/<legacy id>, with the key. NOT live-verified (every EIA request needs a key):
  // VERIFIED only when the response carries data rows; 404 is UNRESOLVED; anything else, including
  // an empty answer, is UNCHECKED rather than a guess either way. Confirm on activation.
  async function resolveEIA(id) {
    const sid = String(id).toUpperCase();
    const base = `https://api.eia.gov/v2/seriesid/${encodeURIComponent(sid)}`;
    if (!eiaApiKey) return { status: STATUS.UNCHECKED, http_status: null, resolved_url: base, evidence: { reason: "no_api_key" } };
    const url = `${base}?api_key=${encodeURIComponent(eiaApiKey)}`;
    const resolved_url = maskKeys(url);
    const res = await doFetch(url, { userAgent: secUserAgent });
    const t = classifyTransport(res);
    if (t) return { status: STATUS.UNCHECKED, http_status: res.status || null, resolved_url, evidence: t };
    if (res.status === 404) return { status: STATUS.UNRESOLVED, http_status: 404, resolved_url, evidence: { reason: "eia_series_not_found" } };
    if (res.status !== 200) return { status: STATUS.UNCHECKED, http_status: res.status, resolved_url, evidence: { reason: "unexpected_status" } };
    const body = await safeJson(res);
    const rows = body && body.response && Array.isArray(body.response.data) ? body.response.data : null;
    if (rows && rows.length > 0) return { status: STATUS.VERIFIED, http_status: 200, resolved_url, evidence: { rows: rows.length } };
    return { status: STATUS.UNCHECKED, http_status: 200, resolved_url, evidence: { reason: rows ? "empty_response" : "unparseable" } };
  }

  // WEB: no network call. The id is content-addressed, so re-resolution re-reads the stored
  // snapshot and recomputes its hash. Missing = this run never read it; altered = changed since.
  // VERIFIED means "exactly this text was read from this URL at retrieved_at" — not that the page
  // is still live or that its content is true.
  async function resolveWEB(id) {
    if (!webSnapshotStore) return { status: STATUS.UNCHECKED, http_status: null, resolved_url: null, evidence: { reason: "no_snapshot_store" } };
    const v = webSnapshotStore.verify(id);
    if (v.status === "found") {
      return {
        status: STATUS.VERIFIED,
        http_status: null,
        resolved_url: v.record.url,
        resolver_type: "snapshot",
        evidence: { url: v.record.url, retrieved_at: v.record.retrieved_at, sha256: v.record.sha256 }
      };
    }
    return {
      status: STATUS.UNRESOLVED,
      http_status: null,
      resolved_url: v.record ? v.record.url : null,
      resolver_type: "snapshot",
      evidence: { reason: v.status === "altered" ? "snapshot_altered" : "snapshot_missing" }
    };
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
      case "PMCID": return resolvePMCID;
      case "ISRCTN": return resolveISRCTN;
      case "EudraCT": return resolveEudraCT;
      case "SEC": return resolveSEC;
      case "WB": return resolveWB;
      case "WEB": return resolveWEB;
      case "BLS": return resolveBLS;
      case "EUROSTAT": return resolveEUROSTAT;
      case "CENSUS": return resolveCENSUS;
      case "EIA": return resolveEIA;
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
        out = { ...base, resolver_type: r.resolver_type || "primary", status: r.status, http_status: r.http_status == null ? null : r.http_status, resolved_url: r.resolved_url || null, evidence: r.evidence || {}, attempts: r.attempts || 1, checked_at: nowIso() };
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

  // Crossref work metadata for one DOI → { authors, years } or { error }. Separate from resolveDOI
  // (which only proves registration via /agency) so the existence check never depends on it.
  async function fetchDoiBibliographic(id) {
    const url = `https://api.crossref.org/works/${encodeURIComponent(id)}?mailto=${encodeURIComponent(contactEmail)}`;
    const res = await doFetch(url);
    const t = classifyTransport(res);
    if (t) return { error: t.reason };
    if (res.status !== 200) return { error: `http_${res.status}` };
    const body = await safeJson(res);
    if (!body || !body.message) return { error: "unparseable" };
    return bibFromCrossref(body.message);
  }

  // Attribution check (citation-attribution.js): for every VERIFIED DOI / PMID that the report
  // names an author beside, compare that author (and year, when one is written) with the registry
  // record. Never changes an identifier's VERIFIED / UNRESOLVED / UNCHECKED status. Fail-soft: a
  // registry that cannot be reached leaves that citation `not_checked`, never a false mismatch.
  async function checkAttributions(reresolved, reportText) {
    const list = (Array.isArray(reresolved) ? reresolved : [])
      .filter((r) => r && (r.type === "DOI" || r.type === "PMID") && r.status === STATUS.VERIFIED && r.id);
    const written = findWrittenAttributions(String(reportText || ""), list);
    const results = [];
    for (const r of list) {
      const key = `${r.type}:${String(r.id).toUpperCase()}`;
      const w = written.get(key) || { checkable: [], skipped: [] };
      if (w.checkable.length === 0) {
        results.push({ id: r.id, type: r.type, status: "not_checked", reason: (w.skipped[0] && w.skipped[0].reason) || "not_found_in_report" });
        continue;
      }
      // A DOI that resolved only through doi.org (another registration agency) has no Crossref
      // record to read authors from; asking would only spend a 404.
      if (r.type === "DOI" && r.resolver_type === "fallback") {
        results.push({ id: r.id, type: r.type, status: "not_checked", reason: "non_crossref_doi" });
        continue;
      }
      if (r.type === "DOI" && !bibliographic.has(key)) {
        try {
          bibliographic.set(key, await fetchDoiBibliographic(r.id));
        } catch (err) {
          bibliographic.set(key, { error: String(err && err.message) });
        }
      }
      const registry = bibliographic.get(key);
      if (!registry || registry.error) {
        results.push({ id: r.id, type: r.type, status: "not_checked", reason: "registry_unavailable", detail: registry && registry.error });
        continue;
      }
      const lines = w.checkable.map((e) => ({ ...e, ...compareAttribution(e, registry) }));
      const badLines = lines.filter((x) => x.status === "author_mismatch" || x.status === "year_mismatch");
      const good = lines.find((x) => x.status === "match");
      const chosen = badLines[0] || good || lines[0];
      results.push({
        id: r.id,
        type: r.type,
        status: badLines.length ? badLines[0].status : good ? "match" : "not_checked",
        reason: badLines.length || good ? undefined : chosen.reason,
        written: { name: chosen.name, year: chosen.year },
        registry: { authors: registry.authors.slice(0, 6), author_count: registry.authors.length, years: registry.years },
        // The full record, for the annotator's per-line re-check; never serialized into the manifest.
        registry_full: { authors: registry.authors, years: registry.years },
        registry_label: registryLabel(registry),
        bad_lines: badLines.length,
        lines: lines.map((x) => ({ line_no: x.line_no, excerpt: x.excerpt, name: x.name, year: x.year, status: x.status }))
      });
    }
    const counts = { cited: results.length, checked: 0, matched: 0, mismatched: 0, mismatched_works: 0, not_checked: 0 };
    const badWorks = new Set();
    for (const x of results) {
      if (x.status === "match") { counts.checked++; counts.matched++; }
      else if (x.status === "author_mismatch" || x.status === "year_mismatch") {
        counts.checked++;
        counts.mismatched++;
        // A paper cited as "PMID: …; doi: …" is ONE work: group its two ids by the line and name.
        const first = x.lines.find((l) => l.status === x.status);
        badWorks.add(first ? `${first.line_no}|${normName(first.name)}` : `${x.type}:${x.id}`);
      } else counts.not_checked++;
    }
    counts.mismatched_works = badWorks.size;
    return { checked: true, counts, results };
  }

  return Object.freeze({ resolveOne, resolveAll, checkAttributions, STATUS, RESOLVER_TABLE_VERSION });
}

module.exports = { createCitationReresolver, STATUS, RESOLVER_TABLE_VERSION, normType, hostFor };
