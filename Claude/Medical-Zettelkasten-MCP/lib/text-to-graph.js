"use strict";

/**
 * Text-to-graph conversion using a 4-gram co-occurrence window.
 * Implements the algorithm from Paranyushkin (2019) "InfraNodus:
 * Generating Insight Using Text Network Analysis" (WWW'19).
 *
 * Stopwords, lemmatization, and tokenization match the original
 * InfraNodus open-source implementation (noduslabs/infranodus).
 *
 * @module text-to-graph
 */

const fs = require("fs");
const path = require("path");
const { createGraph } = require("./graph.js");
const { lemmatizeWord, extractEntities, extractSyntaxEntities } = require("./lemmatizer.js");

// ---------------------------------------------------------------------------
// Stopword loading — matches InfraNodus options.js (data.toString().split('\n'))
// ---------------------------------------------------------------------------

const STOPWORDS_DIR = path.join(__dirname, "stopwords");

/** @type {Map<string, string[]>} language code -> stopword array */
const _stopwordArrays = new Map();

/** @type {Map<string, Set<string>>} language code -> stopword Set (for fast lookup) */
const _stopwordSets = new Map();

/**
 * Load a stopword file synchronously (cached).
 * File format: one word per line, matching InfraNodus public/files/stopwords_XX_XX.txt
 * @param {string} lang - language code: "en", "ru", "de", "fr", "es", "pt", "sv"
 * @returns {string[]} stopword array
 */
function loadStopwordArray(lang) {
  if (_stopwordArrays.has(lang)) return _stopwordArrays.get(lang);

  const langMap = { en: "en_en", ru: "ru_ru", de: "de_de", fr: "fr_fr", es: "es_es", pt: "pt_pt", sv: "sv_sv" };
  const filename = `stopwords_${langMap[lang] || lang}.txt`;
  const filepath = path.join(STOPWORDS_DIR, filename);

  try {
    const data = fs.readFileSync(filepath, "utf-8");
    const words = data.toString().split("\n").filter(w => w.length > 0);
    _stopwordArrays.set(lang, words);
    return words;
  } catch (_) {
    // Fallback: return empty array if file not found
    _stopwordArrays.set(lang, []);
    return [];
  }
}

/**
 * Get a stopword Set for fast membership testing.
 * @param {string} [lang="en"]
 * @returns {Set<string>}
 */
function getStopwords(lang) {
  lang = lang || "en";
  if (_stopwordSets.has(lang)) return _stopwordSets.get(lang);
  const arr = loadStopwordArray(lang);
  const set = new Set(arr);
  _stopwordSets.set(lang, set);
  return set;
}

/** Default English stopwords — loaded from InfraNodus's stopwords_en_en.txt */
const STOPWORDS = getStopwords("en");

// ---------------------------------------------------------------------------
// Tokenizer — wink-tokenizer matching InfraNodus validate.js
// ---------------------------------------------------------------------------

const Tokenizer = require("wink-tokenizer");
const winkTokenizer = Tokenizer();

/**
 * Lemmatize a word using the lemmatizer module (phpmorphy-locutus primary).
 * @param {string} word
 * @param {string} [lang="en"]
 * @returns {string}
 */
function lemmatize(word, lang) {
  return lemmatizeWord(word, lang);
}

/**
 * Tokenize text using wink-tokenizer, matching InfraNodus's validate.js.
 *
 * - Uses wink-tokenizer (NLP-aware, classifies tokens by type)
 * - Only keeps: word, hashtag, emoji, alien (for Russian)
 * - Words must be >2 chars (matching InfraNodus validate.js line 292)
 * - Strips @mentions before tokenization
 * - Camelizes hashtags in statement before tokenization
 *
 * @param {string} text
 * @param {Set<string>} [customStopwords]
 * @param {string[]} [preserveEntities] - Multi-word entities to keep as single tokens
 * @param {Map<string,string>} [synonymMap]
 * @param {Set<string>} [noLemmaSet] - Tokens to skip lemmatization (e.g., hashtags)
 * @param {string} [lang="en"]
 * @returns {string[]}
 */
function tokenize(text, customStopwords, preserveEntities, synonymMap, noLemmaSet, lang) {
  if (!text || typeof text !== "string") return [];
  const stopSet = customStopwords || STOPWORDS;
  lang = lang || "en";

  let processed = text;

  // Strip @mentions (matching validate.js line 120)
  processed = processed.replace(/@\S+/g, "");

  // Strip single/curly quotes (matching validate.js line 126)
  processed = processed.replace(/['']+/g, " ");

  // Strip URLs (matching validate.js line 129)
  processed = processed.replace(/(?:https?|ftp):\/\/\S+/g, "");

  // Camelize hashtags in statement (matching validate.js line 281)
  // This converts #my-hashtag to myHashtag within the text
  processed = processed.replace(/#(\S*)/g, function(match) {
    // Simple camelCase: remove hyphens/underscores and capitalize following letter
    return match.slice(1).replace(/[-_](.)/g, function(_, c) { return c.toUpperCase(); });
  });

  // Preserve multi-word entities: wink-tokenizer splits on underscores/hyphens,
  // so we concatenate entity words (no separator) and map back after tokenization.
  const entityConcatMap = new Map(); // concatenated lowercase -> underscore_form
  if (preserveEntities && preserveEntities.length > 0) {
    for (const entity of preserveEntities) {
      const entLower = entity.toLowerCase();
      const concat = entLower.replace(/\s+/g, "");
      const underscore = entLower.replace(/\s+/g, "_");
      entityConcatMap.set(concat, underscore);
      processed = processed.replace(new RegExp(entLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), concat);
    }
  }

  // Tokenize with wink-tokenizer (matching validate.js line 287)
  const tokens = winkTokenizer.tokenize(processed);

  const result = [];
  for (const tok of tokens) {
    let word;
    if (tok.tag === "word") {
      word = tok.value.toLowerCase();
      // Words must be >2 chars (matching validate.js line 292)
      if (word.length <= 2) continue;
    } else if (tok.tag === "hashtag") {
      // Convert hashtag to underscore form (matching validate.js line 296-300)
      word = tok.value.slice(1).replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
    } else if (tok.tag === "alien" && lang === "ru") {
      // Russian words come through as "alien" in wink-tokenizer (matching validate.js line 301)
      word = tok.value.toLowerCase();
      if (word.length <= 2) continue;
    } else if (tok.tag === "emoji") {
      word = tok.value;
    } else {
      continue;
    }

    // Remap concatenated entity tokens back to underscore form
    if (entityConcatMap.has(word)) {
      result.push(entityConcatMap.get(word));
      continue;
    }

    // Stopword check
    if (stopSet.has(word)) continue;

    // Lemmatize (skip if in noLemmaSet, e.g., hashtags)
    let lemma = (noLemmaSet && noLemmaSet.has(word)) ? word : lemmatize(word, lang);

    // Post-lemma stopword check (matching validate.js line 412)
    if (stopSet.has(lemma)) continue;

    // Strip backslashes and dashes from lemma (matching validate.js line 417)
    lemma = lemma.replace(/[\\–-]/g, "");
    if (lemma.length === 0) continue;

    // Apply synonym mapping
    if (synonymMap && synonymMap.has(lemma)) {
      lemma = synonymMap.get(lemma);
    }

    result.push(lemma);
  }
  return result;
}

/**
 * Convert text to a co-occurrence graph using a sliding window.
 *
 * Implements InfraNodus's two-pass approach:
 * - Pass 1 (narrative scan): Adjacent concepts, weight = narrativeScanWeight (3)
 * - Pass 2 (landscape scan, when fullscan=true): 4-gram window with distance-based weights
 *
 * @param {string} text - Input text
 * @param {object} [options]
 * @param {number} [options.windowSize=4] - Co-occurrence window size (default: 4-gram)
 * @param {Set<string>} [options.stopwords] - Custom stopword set (default: English from file)
 * @param {string[]} [options.preserveEntities] - Multi-word entities to preserve
 * @param {boolean} [options.fullscan=true] - Enable landscape scan (4-gram window). false = adjacent only.
 * @param {string} [options.language="en"] - Language for stopwords and lemmatization
 * @returns {import("./graph.js").Graph}
 */
function textToGraph(text, options) {
  const opts = options || {};
  const windowSize = opts.windowSize || 4;
  const fullscan = opts.fullscan !== false; // default true, matching InfraNodus options.js fullscan: 1
  const lang = opts.language || "en";
  const graph = createGraph();

  // Use language-specific stopwords if no custom set provided
  const stopSet = opts.stopwords || getStopwords(lang);

  // Auto-detect entities: syntax (#, @, [[]]) + NER (people, places, orgs)
  let entities = opts.preserveEntities || [];
  let hashtagTokens = null;
  if (opts.detectEntities !== false) {
    const syntaxEnts = extractSyntaxEntities(text);
    const nerEnts = extractEntities(text);
    const nerAll = [...nerEnts.people, ...nerEnts.places, ...nerEnts.organizations];
    const multiWord = nerAll.filter(e => e.includes(" "));
    entities = [...new Set([...entities, ...syntaxEnts, ...multiWord])];

    // When lemmatizeHashtags is false (default), build set of hashtag tokens to skip lemmatization
    if (!opts.lemmatizeHashtags) {
      const hashtags = text.match(/#[a-zA-Z0-9_-]+/g);
      if (hashtags && hashtags.length > 0) {
        hashtagTokens = new Set(hashtags.map(h => h.slice(1).toLowerCase()));
      }
    }
  }

  const tokens = tokenize(text, stopSet, entities, opts.synonyms, hashtagTokens, lang);
  if (tokens.length === 0) return graph;

  // Add all unique tokens as nodes, tracking first appearance index
  const firstAppearance = {};
  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (!(token in firstAppearance)) {
      firstAppearance[token] = idx;
    }
    graph.addNode(token, token);
  }
  graph.firstAppearance = firstAppearance;

  // Narrative scan weight (matching neo4j.js line 124)
  const narrativeScanWeight = 3;
  // Landscape scan weight (matching neo4j.js line 127)
  const landscapeScanWeight = 3;

  for (let index = 1; index < tokens.length; index++) {
    // Pass 1: Narrative scan — connect adjacent concepts (matching neo4j.js lines 230-264)
    if (tokens[index - 1] !== tokens[index]) {
      graph.addEdge(tokens[index - 1], tokens[index], narrativeScanWeight);
    }

    // Pass 2: Landscape scan — connect within scanGap window (matching neo4j.js lines 266-323)
    if (fullscan) {
      const leftGap = Math.max(0, index + 1 - windowSize);

      // Scan from leftGap up to (but not including) index-1 (adjacent already handled above)
      for (let indexGap = leftGap; indexGap < index - 1; ++indexGap) {
        if (tokens[indexGap] !== tokens[index]) {
          const weightInGap = landscapeScanWeight + 1 - (index - indexGap);
          if (weightInGap > 0) {
            graph.addEdge(tokens[indexGap], tokens[index], weightInGap);
          }
        }
      }
    }
  }

  // NOTE: No cross-paragraph linking. InfraNodus processes each statement
  // independently and does NOT bridge paragraphs. (Removed to match original.)

  graph.updateNodeWeights();
  return graph;
}

module.exports = { textToGraph, tokenize, lemmatize, STOPWORDS, getStopwords, loadStopwordArray };
