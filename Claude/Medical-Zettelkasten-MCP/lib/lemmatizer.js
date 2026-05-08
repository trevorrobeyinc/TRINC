"use strict";

/**
 * Lemmatizer matching InfraNodus's validate.js implementation.
 *
 * Primary: phpmorphy-locutus for English, Russian, German
 *          (dictionary-based morphological analysis)
 * French:  nlp-js-tools-french
 * Spanish/Portuguese/Swedish: natural Porter stemmers
 * Fallback: compromise NLP, then suffix-based stripping
 *
 * @module lemmatizer
 */

// ---------------------------------------------------------------------------
// phpmorphy-locutus — matches validate.js lines 23-53 exactly
// ---------------------------------------------------------------------------

let Morphy;
let lemmerEng, lemmerRus, lemmerGer;

try {
  Morphy = require("phpmorphy-locutus").default;

  const morphyConfig = {
    storage: Morphy.STORAGE_MEM,
    predict_by_suffix: true,
    predict_by_db: true,
    graminfo_as_text: true,
    use_ancodes_cache: false,
    resolve_ancodes: Morphy.RESOLVE_ANCODES_AS_TEXT,
  };

  lemmerEng = new Morphy("en", morphyConfig);
  lemmerRus = new Morphy("ru", morphyConfig);
  lemmerGer = new Morphy("de", morphyConfig);
} catch (err) {
  console.warn("phpmorphy-locutus not available, falling back to compromise:", err.message);
  Morphy = null;
}

// ---------------------------------------------------------------------------
// French lemmatizer — matches validate.js line 21
// ---------------------------------------------------------------------------

let NlpjsTFr;
try {
  NlpjsTFr = require("nlp-js-tools-french");
} catch (_) {
  NlpjsTFr = null;
}

// ---------------------------------------------------------------------------
// natural Porter stemmers — matches validate.js lines 362-379
// ---------------------------------------------------------------------------

let natural;
try {
  natural = require("natural");
} catch (_) {
  natural = null;
}

// ---------------------------------------------------------------------------
// compromise — tertiary fallback
// ---------------------------------------------------------------------------

let nlp;
try {
  nlp = require("compromise");
} catch (_) {
  nlp = null;
}

/** Cache for lemmatized forms to avoid repeated lookups. */
const cache = new Map();

/**
 * Lemmatize a single word, matching InfraNodus's validate.js extractConcepts logic.
 *
 * Language dispatch (matching validate.js lines 340-398):
 * - en: phpmorphy English -> first result, lowercased
 * - ru: phpmorphy Russian -> first result, lowercased
 * - de: phpmorphy German -> first result, lowercased
 * - fr: nlp-js-tools-french -> first lemma
 * - es: natural PorterStemmerEs
 * - pt: natural PorterStemmerPt
 * - sv: natural PorterStemmerSv
 * - fallback: compromise NLP, then suffix-based stripping
 *
 * @param {string} word
 * @param {string} [lang="en"]
 * @returns {string}
 */
function lemmatizeWord(word, lang) {
  if (!word || word.length <= 2) return word;
  lang = lang || "en";

  const cacheKey = `${lang}:${word}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let result = word;

  if (lang === "en" && lemmerEng) {
    const lemmas = lemmerEng.lemmatize(word.toUpperCase());
    if (lemmas !== false && lemmas.length > 0) {
      result = lemmas[0].toLowerCase();
    } else {
      result = _fallbackLemmatize(word);
    }
  } else if (lang === "ru" && lemmerRus) {
    const lemmas = lemmerRus.lemmatize(word.toUpperCase());
    if (lemmas !== false && lemmas.length > 0) {
      result = lemmas[0].toLowerCase();
    } else {
      result = word;
    }
  } else if (lang === "de" && lemmerGer) {
    const lemmas = lemmerGer.lemmatize(word.toUpperCase());
    if (lemmas !== false && lemmas.length > 0) {
      result = lemmas[0].toLowerCase();
    } else {
      result = word;
    }
  } else if (lang === "fr" && NlpjsTFr) {
    try {
      const lemmerFra = new NlpjsTFr(word);
      const lemmaspre = lemmerFra.lemmatizer();
      if (lemmaspre[0] && lemmaspre[0]["lemma"] !== undefined) {
        result = lemmaspre[0]["lemma"];
      }
    } catch (_) {
      result = word;
    }
  } else if (lang === "es" && natural) {
    result = natural.PorterStemmerEs.stem(word);
  } else if (lang === "pt" && natural) {
    result = natural.PorterStemmerPt.stem(word);
  } else if (lang === "sv" && natural) {
    result = natural.PorterStemmerSv.stem(word);
  } else {
    result = _fallbackLemmatize(word);
  }

  cache.set(cacheKey, result);
  return result;
}

/**
 * Fallback lemmatization: try compromise NLP, then suffix stripping.
 * @param {string} word
 * @returns {string}
 */
function _fallbackLemmatize(word) {
  if (nlp) {
    try {
      const doc = nlp(word);
      const verbs = doc.verbs();
      if (verbs.length > 0) {
        const inf = verbs.toInfinitive().text();
        if (inf) return inf.toLowerCase().trim();
      }
      const nouns = doc.nouns();
      if (nouns.length > 0) {
        const sing = nouns.toSingular().text();
        if (sing) return sing.toLowerCase().trim();
      }
    } catch (_) {
      // fall through to suffix
    }
  }
  return _suffixLemmatize(word);
}

/**
 * Suffix-based fallback lemmatizer.
 * @param {string} word
 * @returns {string}
 */
function _suffixLemmatize(word) {
  if (word.length <= 3) return word;
  if (/[0-9]/.test(word) || /[A-Z]/.test(word.slice(1))) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ves") && word.length > 4) return word.slice(0, -3) + "f";
  if (word.endsWith("ses") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("tion") || word.endsWith("sion")) return word;
  if (word.endsWith("ment") && word.length > 5) return word;
  if (word.endsWith("ness") && word.length > 5) return word.slice(0, -4);
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ly") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * Extract named entities from text using compromise.
 * Returns arrays of people, places, and organizations.
 * @param {string} text
 * @returns {{ people: string[], places: string[], organizations: string[] }}
 */
function extractEntities(text) {
  if (!nlp || !text) return { people: [], places: [], organizations: [] };

  try {
    const doc = nlp(text);
    return {
      people: doc.people().out("array"),
      places: doc.places().out("array"),
      organizations: doc.organizations().out("array"),
    };
  } catch (_) {
    return { people: [], places: [], organizations: [] };
  }
}

/**
 * Extract special syntax entities from text:
 * #hashtags, @mentions, [[wiki-links]]
 * @param {string} text
 * @returns {string[]} Array of entity strings to preserve
 */
function extractSyntaxEntities(text) {
  if (!text) return [];
  const entities = [];

  // #hashtags
  const hashtags = text.match(/#[a-zA-Z0-9_-]+/g);
  if (hashtags) entities.push(...hashtags.map(h => h.slice(1)));

  // @mentions
  const mentions = text.match(/@[a-zA-Z0-9_-]+/g);
  if (mentions) entities.push(...mentions.map(m => m.slice(1)));

  // [[wiki-links]]
  const wikiLinks = text.match(/\[\[([^\]]+)\]\]/g);
  if (wikiLinks) entities.push(...wikiLinks.map(w => w.slice(2, -2)));

  return entities;
}

/**
 * Clear the lemmatization cache.
 */
function clearCache() {
  cache.clear();
}

module.exports = { lemmatizeWord, extractEntities, extractSyntaxEntities, clearCache };
