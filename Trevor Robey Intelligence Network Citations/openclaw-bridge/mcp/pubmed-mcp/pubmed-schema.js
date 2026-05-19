"use strict";

const { z } = require("zod");

const PUBMED_TOOL_NAMES = Object.freeze([
  "pubmed_search_articles",
  "pubmed_get_article_metadata",
  "pubmed_get_full_text",
  "pubmed_find_related",
  "pubmed_convert_ids",
  "pubmed_lookup_by_citation",
  "pubmed_get_copyright"
]);

const SortEnum = z.enum(["relevance", "pub_date", "author", "journal_name", "title"]).optional();
const DateTypeEnum = z.enum(["pdat", "edat", "mdat"]).default("pdat");
const DateString = z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/);
const IdTypeEnum = z.enum(["pmid", "pmcid", "doi"]).default("pmid");
const LinkTypeEnum = z.enum([
  "pubmed_pubmed", "pubmed_pmc", "pubmed_gene",
  "pubmed_protein", "pubmed_nucleotide"
]).default("pubmed_pubmed");

const PubmedSearchArticlesSchema = z.object({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(100).default(20),
  sort: SortEnum,
  date_from: DateString.optional(),
  date_to: DateString.optional(),
  datetype: DateTypeEnum,
  retstart: z.number().int().min(0).default(0)
}).strict();

const PubmedGetArticleMetadataSchema = z.object({
  pmids: z.array(z.string().min(1)).min(1).max(50)
}).strict();

const PubmedGetFullTextSchema = z.object({
  pmc_ids: z.array(z.string().min(1)).min(1).max(10)
}).strict();

const PubmedFindRelatedSchema = z.object({
  pmids: z.array(z.string().min(1)).min(1),
  link_type: LinkTypeEnum,
  max_results: z.number().int().min(1).optional()
}).strict();

const PubmedConvertIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  id_type: IdTypeEnum
}).strict();

const CitationSchema = z.object({
  journal: z.string().optional(),
  year: z.number().int().optional(),
  volume: z.string().optional(),
  first_page: z.string().optional(),
  author: z.string().optional(),
  key: z.string().optional()
}).strict();

const PubmedLookupByCitationSchema = z.object({
  citations: z.array(CitationSchema).min(1)
}).strict();

const PubmedGetCopyrightSchema = z.object({
  pmids: z.array(z.string().min(1)).min(1)
}).strict();

const SCHEMA_BY_TOOL = Object.freeze({
  pubmed_search_articles: PubmedSearchArticlesSchema,
  pubmed_get_article_metadata: PubmedGetArticleMetadataSchema,
  pubmed_get_full_text: PubmedGetFullTextSchema,
  pubmed_find_related: PubmedFindRelatedSchema,
  pubmed_convert_ids: PubmedConvertIdsSchema,
  pubmed_lookup_by_citation: PubmedLookupByCitationSchema,
  pubmed_get_copyright: PubmedGetCopyrightSchema
});

module.exports = {
  PUBMED_TOOL_NAMES,
  SCHEMA_BY_TOOL,
  PubmedSearchArticlesSchema,
  PubmedGetArticleMetadataSchema,
  PubmedGetFullTextSchema,
  PubmedFindRelatedSchema,
  PubmedConvertIdsSchema,
  PubmedLookupByCitationSchema,
  PubmedGetCopyrightSchema
};
