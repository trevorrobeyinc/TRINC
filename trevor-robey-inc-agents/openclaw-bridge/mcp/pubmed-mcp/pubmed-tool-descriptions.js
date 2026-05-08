"use strict";

/**
 * Tool descriptions for the PubMed MCP, formatted for injection
 * into the agentic loop LLM prompt via buildToolInstructionBlock().
 *
 * @module pubmed-tool-descriptions
 */

const PUBMED_TOOL_DESCRIPTIONS = Object.freeze([
  {
    name: "pubmed_search_articles",
    description: "Search PubMed for biomedical articles by keyword, author, MeSH term, or Boolean query",
    parameters: '{ "query": "CRISPR gene editing" [, "max_results": 20] [, "sort": "relevance"] [, "date_from": "YYYY/MM/DD"] [, "date_to": "YYYY/MM/DD"] [, "datetype": "pdat"] [, "retstart": 0] }'
  },
  {
    name: "pubmed_get_article_metadata",
    description: "Retrieve title, authors, abstract, journal, and publication details for one or more PubMed IDs",
    parameters: '{ "pmids": ["12345678", "23456789"] }'
  },
  {
    name: "pubmed_get_full_text",
    description: "Fetch full-text content from PubMed Central for open-access articles by PMC ID",
    parameters: '{ "pmc_ids": ["PMC1234567"] }'
  },
  {
    name: "pubmed_find_related",
    description: "Find articles related to given PubMed IDs via NCBI link databases (PubMed, PMC, Gene, Protein, Nucleotide)",
    parameters: '{ "pmids": ["12345678"] [, "link_type": "pubmed_pubmed"] [, "max_results": 20] }'
  },
  {
    name: "pubmed_convert_ids",
    description: "Convert between PubMed ID, PMC ID, and DOI using the NCBI ID Converter API",
    parameters: '{ "ids": ["12345678", "PMC1234567"] [, "id_type": "pmid"] }'
  },
  {
    name: "pubmed_lookup_by_citation",
    description: "Look up PubMed IDs from partial citation details (journal, year, volume, page, author)",
    parameters: '{ "citations": [{ "journal": "Nature", "year": 2023, "volume": "620", "first_page": "123", "author": "Smith" }] }'
  },
  {
    name: "pubmed_get_copyright",
    description: "Get copyright, source journal, location ID, and PMC availability for PubMed articles",
    parameters: '{ "pmids": ["12345678"] }'
  }
]);

module.exports = { PUBMED_TOOL_DESCRIPTIONS };
