"use strict";

/**
 * Curated biomedical stopword list.
 * Common medical terms that don't carry analytical signal in graph analysis.
 *
 * @module biomedical-stopwords
 */

const BIOMEDICAL_STOPWORDS = new Set([
  // Clinical/research context
  "patient", "patients", "study", "studies", "treatment", "treatments",
  "result", "results", "method", "methods", "analysis", "conclusion",
  "conclusions", "background", "objective", "objectives", "introduction",
  "discussion", "findings", "data", "evidence", "research", "clinical",
  "trial", "trials", "group", "groups", "sample", "samples",
  "participants", "subjects", "case", "cases", "report", "reports",
  "review", "literature", "published", "article", "articles",
  // Statistical/measurement
  "significant", "significantly", "compared", "associated", "effect",
  "effects", "increased", "decreased", "higher", "lower", "level",
  "levels", "rate", "rates", "risk", "factor", "factors", "value",
  "values", "mean", "median", "range", "total", "number", "percent",
  "percentage", "ratio", "score", "scores", "measure", "measured",
  "observed", "showed", "demonstrated", "indicated", "determined",
  // Process/protocol
  "performed", "conducted", "evaluated", "assessed", "examined",
  "investigated", "identified", "detected", "obtained", "collected",
  "administered", "received", "included", "excluded", "selected",
  "approved", "diagnosed", "treated", "monitored",
  // General medical
  "disease", "condition", "diagnosis", "therapy", "dose", "dosage",
  "mg", "ml", "kg", "daily", "weeks", "months", "years", "days",
  "baseline", "follow", "period", "duration", "onset", "outcome",
  "outcomes", "response", "procedure", "intervention",
]);

module.exports = { BIOMEDICAL_STOPWORDS };
