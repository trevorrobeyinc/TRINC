"use strict";

// polite-http.js — the one request helper the Evidence Desk sources share (2026-10-21).
//
// Every request names the requester: a User-Agent carrying the organisation and a contact
// address, the form SEC fair access requires and the form BLS, Eurostat, Census and EIA ask
// automated clients to use. Nothing here retries, rotates or disguises a request: a refusal,
// a rate limit or a CAPTCHA page comes back to the caller as the answer it is.
//
// Injectable `fetchImpl` (tests run offline), a per-request AbortController timeout, and a
// normalised response so a caller can tell JSON from an HTML error page that answered 200
// (Census answers a keyless request with HTTP 200 and an HTML "Missing Key" page).

const DEFAULT_ORG = "Trevor Robey Intelligence Network Citations LLC";
const DEFAULT_CONTACT = "trevor@trevorobeyinc.com";

function createPoliteHttp(options = {}) {
  const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const timeoutMs = Number(options.timeoutMs) || 20_000;
  const userAgent = `${options.org || DEFAULT_ORG} ${options.contactEmail || DEFAULT_CONTACT}`;

  /**
   * One request. Throws only on transport failure (no fetch, network error, timeout); every HTTP
   * answer, including 4xx/5xx, is returned for the caller to classify.
   * @returns {Promise<{status:number, ok:boolean, contentType:string, text:string}>}
   */
  async function send(url, { method = "GET", body, accept = "application/json" } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("no fetch implementation available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { "User-Agent": userAgent, Accept: accept };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      if (!res) throw new Error("no response");
      const contentType = res.headers && typeof res.headers.get === "function"
        ? String(res.headers.get("content-type") || "")
        : "";
      let text = "";
      if (typeof res.text === "function") text = await res.text();
      else if (typeof res.json === "function") text = JSON.stringify(await res.json());
      return { status: Number(res.status) || 0, ok: Boolean(res.ok), contentType, text };
    } finally {
      clearTimeout(timer);
    }
  }

  /** The body as JSON, or undefined when it is not JSON (an HTML error page, an empty 204). */
  function parseJson(response) {
    if (!response || !response.text) return undefined;
    try {
      return JSON.parse(response.text);
    } catch {
      return undefined;
    }
  }

  return Object.freeze({ send, parseJson, userAgent });
}

module.exports = { createPoliteHttp, DEFAULT_ORG, DEFAULT_CONTACT };
