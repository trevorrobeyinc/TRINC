"use strict";

/**
 * PubMed MCP — queries NCBI E-utilities (eutils.ncbi.nlm.nih.gov) over HTTPS.
 *
 * Provides article search, metadata retrieval, full-text extraction,
 * related-article discovery, ID conversion, citation lookup, and copyright
 * checking for OpenClaw research agents.
 *
 * Uses the shared HTTPS client from ../../core/https-client.js for rate
 * limiting and connection management.
 *
 * Follows the same execute({name, arguments}) interface as other MCP providers.
 *
 * @module pubmed-mcp
 */

const { createHttpsClient } = require("../../core/https-client.js");
const { SCHEMA_BY_TOOL } = require("./pubmed-schema.js");

function isPlainObject(v) {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

/**
 * Extract the target database name from a link_type string.
 * e.g. "pubmed_pmc" -> "pmc", "pubmed_gene" -> "gene"
 */
function linkTypeToDb(linkType) {
  const parts = (linkType || "pubmed_pubmed").split("_");
  return parts.length > 1 ? parts.slice(1).join("_") : "pubmed";
}

/**
 * Parse author list from esummary `authors` array.
 * Returns [{name, authtype}].
 */
function parseAuthors(authors) {
  if (!Array.isArray(authors)) return [];
  return authors.map(a => ({
    name: a.name || "",
    authtype: a.authtype || "Author"
  })).filter(a => a.name);
}

/**
 * Extract structured text content from PMC XML.
 * Uses basic regex to pull title, abstract, and body sections.
 * Returns structured text, not raw XML.
 */
function extractTextFromPmcXml(xml) {
  const articles = [];
  const articleBlocks = xml.split(/<article[\s>]/);

  for (let i = 1; i < articleBlocks.length; i++) {
    const block = articleBlocks[i];
    const article = { title: "", abstract: "", sections: [] };

    // Extract article title
    const titleMatch = block.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/);
    if (titleMatch) {
      article.title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    // Extract abstract
    const abstractMatch = block.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/);
    if (abstractMatch) {
      article.abstract = abstractMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    // Extract body sections
    const secRegex = /<sec[^>]*>([\s\S]*?)<\/sec>/g;
    let secMatch;
    while ((secMatch = secRegex.exec(block)) !== null) {
      const secContent = secMatch[1];
      const secTitleMatch = secContent.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const secTitle = secTitleMatch
        ? secTitleMatch[1].replace(/<[^>]+>/g, "").trim()
        : "";
      const secText = secContent
        .replace(/<title[^>]*>[\s\S]*?<\/title>/, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (secText) {
        article.sections.push({ title: secTitle, text: secText.slice(0, 4000) });
      }
    }

    articles.push(article);
  }

  return articles;
}

/**
 * Create a PubMed MCP adapter.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Logger with info/warn/error methods
 * @returns {{ execute, isAvailable }}
 */
function createPubmedMcp(options = {}) {
  const logger = isPlainObject(options.logger)
    ? options.logger
    : { info() {}, warn() {}, error() {} };

  const apiKey = process.env.NCBI_API_KEY || "";
  const rateLimit = apiKey ? 10 : 3;

  const client = createHttpsClient({
    hostname: "eutils.ncbi.nlm.nih.gov",
    basePath: "/entrez/eutils",
    maxPerSecond: rateLimit
  });

  /**
   * Append API key parameter to a query string if available.
   */
  function withApiKey(qs) {
    return apiKey ? qs + "&api_key=" + encodeURIComponent(apiKey) : qs;
  }

  async function execute(input) {
    const toolName = (input && typeof input.name === "string") ? input.name : "";
    const args = (input && isPlainObject(input.arguments)) ? input.arguments : {};

    if (!toolName) throw new Error("pubmed-mcp: tool name is required");

    const schema = SCHEMA_BY_TOOL[toolName];
    if (!schema) throw new Error("pubmed-mcp: unknown tool " + toolName);

    const validated = schema.parse(args);
    let result;

    switch (toolName) {

      case "pubmed_search_articles": {
        let qs = "/esearch.fcgi?db=pubmed&retmode=json"
          + "&term=" + encodeURIComponent(validated.query)
          + "&retmax=" + validated.max_results
          + "&retstart=" + validated.retstart
          + "&datetype=" + validated.datetype;

        if (validated.sort) {
          qs += "&sort=" + encodeURIComponent(validated.sort);
        }
        if (validated.date_from) {
          qs += "&mindate=" + encodeURIComponent(validated.date_from);
        }
        if (validated.date_to) {
          qs += "&maxdate=" + encodeURIComponent(validated.date_to);
        }

        const data = await client.getJson(withApiKey(qs));
        const esearchResult = data.esearchresult || {};

        result = {
          ok: true,
          pmids: Array.isArray(esearchResult.idlist) ? esearchResult.idlist : [],
          count: Number(esearchResult.count) || 0,
          retmax: Number(esearchResult.retmax) || 0,
          retstart: Number(esearchResult.retstart) || 0,
          query_translation: esearchResult.querytranslation || ""
        };
        break;
      }

      case "pubmed_get_article_metadata": {
        const idList = validated.pmids.join(",");
        const qs = "/esummary.fcgi?db=pubmed&retmode=json&id="
          + encodeURIComponent(idList);
        const data = await client.getJson(withApiKey(qs));
        const summaryResult = data.result || {};
        const uids = Array.isArray(summaryResult.uids) ? summaryResult.uids : [];

        const articles = uids.map(uid => {
          const item = summaryResult[uid] || {};
          return {
            pmid: uid,
            title: (item.title || "").slice(0, 4000),
            authors: parseAuthors(item.authors),
            source: item.source || "",
            fulljournalname: item.fulljournalname || "",
            pubdate: item.pubdate || "",
            epubdate: item.epubdate || "",
            volume: item.volume || "",
            issue: item.issue || "",
            pages: item.pages || "",
            elocationid: item.elocationid || "",
            doi: (item.elocationid || "").replace(/^doi:\s*/i, ""),
            pubtype: Array.isArray(item.pubtype) ? item.pubtype : [],
            abstract: (item.abstract || "").slice(0, 4000),
            pmcid: (item.articleids || []).find(a => a.idtype === "pmc")?.value || ""
          };
        });

        result = { ok: true, articles };
        break;
      }

      case "pubmed_get_full_text": {
        const idList = validated.pmc_ids.join(",");
        const qs = "/efetch.fcgi?db=pmc&rettype=xml&id="
          + encodeURIComponent(idList);
        const xml = await client.getText(withApiKey(qs));
        const articles = extractTextFromPmcXml(xml);

        result = {
          ok: true,
          articles: articles.length > 0 ? articles : [],
          pmc_ids: validated.pmc_ids,
          note: articles.length === 0
            ? "No full text found. Articles may not be available in PMC."
            : undefined
        };
        break;
      }

      case "pubmed_find_related": {
        const db = linkTypeToDb(validated.link_type);
        let qs = "/elink.fcgi?dbfrom=pubmed&db=" + encodeURIComponent(db)
          + "&retmode=json&cmd=neighbor";
        for (const pmid of validated.pmids) {
          qs += "&id=" + encodeURIComponent(pmid);
        }

        const data = await client.getJson(withApiKey(qs));
        const linkSets = Array.isArray(data.linksets) ? data.linksets : [];
        const links = [];

        for (const ls of linkSets) {
          const fromId = Array.isArray(ls.ids) ? ls.ids[0] : "";
          const linkSetDbs = Array.isArray(ls.linksetdbs) ? ls.linksetdbs : [];
          for (const lsdb of linkSetDbs) {
            let relatedIds = Array.isArray(lsdb.links) ? lsdb.links.map(l =>
              typeof l === "object" ? String(l.id || l) : String(l)
            ) : [];
            if (validated.max_results && relatedIds.length > validated.max_results) {
              relatedIds = relatedIds.slice(0, validated.max_results);
            }
            links.push({
              from_pmid: String(fromId),
              link_name: lsdb.linkname || validated.link_type,
              db: lsdb.dbto || db,
              related_ids: relatedIds
            });
          }
        }

        result = { ok: true, links };
        break;
      }

      case "pubmed_convert_ids": {
        const idList = validated.ids.join(",");
        const convClient = createHttpsClient({
          hostname: "www.ncbi.nlm.nih.gov",
          basePath: "/pmc/utils/idconv/v1.0",
          maxPerSecond: 3
        });
        const convQs = "/?ids=" + encodeURIComponent(idList)
          + "&idtype=" + encodeURIComponent(validated.id_type)
          + "&format=json";
        const data = await convClient.getJson(convQs);
        const records = Array.isArray(data.records) ? data.records : [];

        result = {
          ok: true,
          conversions: records.map(r => ({
            pmid: r.pmid || "",
            pmcid: r.pmcid || "",
            doi: r.doi || "",
            status: r.status || "ok",
            errmsg: r.errmsg || ""
          }))
        };
        break;
      }

      case "pubmed_lookup_by_citation": {
        const bdataLines = validated.citations.map(c => {
          const parts = [
            c.journal || "",
            c.year != null ? String(c.year) : "",
            c.volume || "",
            c.first_page || "",
            c.author || "",
            c.key || ""
          ];
          return parts.join("|") + "||";
        });
        const bdata = bdataLines.join("\r\n");

        const qs = "/ecitmatch.cgi?db=pubmed&rettype=xml&bdata="
          + encodeURIComponent(bdata);
        const text = await client.getText(withApiKey(qs));

        const matches = text.trim().split(/\r?\n/).filter(Boolean).map(line => {
          const parts = line.split("|");
          return {
            journal: parts[0] || "",
            year: parts[1] || "",
            volume: parts[2] || "",
            first_page: parts[3] || "",
            author: parts[4] || "",
            key: parts[5] || "",
            pmid: parts[6] || ""
          };
        });

        result = { ok: true, matches };
        break;
      }

      case "pubmed_get_copyright": {
        const idList = validated.pmids.join(",");
        const summaryQs = "/esummary.fcgi?db=pubmed&retmode=json&id="
          + encodeURIComponent(idList);
        const summaryData = await client.getJson(withApiKey(summaryQs));
        const summaryResult = summaryData.result || {};
        const uids = Array.isArray(summaryResult.uids) ? summaryResult.uids : [];

        // Check PMC availability via elink
        let elinkQs = "/elink.fcgi?dbfrom=pubmed&db=pmc&retmode=json&cmd=neighbor";
        for (const pmid of validated.pmids) {
          elinkQs += "&id=" + encodeURIComponent(pmid);
        }
        let pmcAvailability = {};
        try {
          const elinkData = await client.getJson(withApiKey(elinkQs));
          const linkSets = Array.isArray(elinkData.linksets) ? elinkData.linksets : [];
          for (const ls of linkSets) {
            const fromId = Array.isArray(ls.ids) ? String(ls.ids[0]) : "";
            const linkSetDbs = Array.isArray(ls.linksetdbs) ? ls.linksetdbs : [];
            const pmcLinks = linkSetDbs.find(d => d.dbto === "pmc");
            pmcAvailability[fromId] = Boolean(pmcLinks && Array.isArray(pmcLinks.links) && pmcLinks.links.length > 0);
          }
        } catch (_) {
          // PMC availability check is best-effort
        }

        const copyrightInfo = uids.map(uid => {
          const item = summaryResult[uid] || {};
          return {
            pmid: uid,
            source: item.source || "",
            fulljournalname: item.fulljournalname || "",
            elocationid: item.elocationid || "",
            pubtype: Array.isArray(item.pubtype) ? item.pubtype : [],
            pmc_available: Boolean(pmcAvailability[uid])
          };
        });

        result = { ok: true, copyright: copyrightInfo };
        break;
      }
    }

    logger.info({
      event: "pubmed_mcp_execute",
      tool_name: toolName,
      ok: result && result.ok
    });

    return JSON.stringify(result, null, 2);
  }

  /**
   * Quick availability check: search for "test" and verify valid response.
   */
  async function isAvailable() {
    try {
      const qs = "/esearch.fcgi?db=pubmed&retmode=json&term=test&retmax=1";
      const data = await client.getJson(withApiKey(qs));
      return Boolean(data && data.esearchresult && data.esearchresult.count);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ execute, isAvailable });
}

module.exports = { createPubmedMcp };
