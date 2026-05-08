"use strict";

/**
 * Discourse diversity scoring using Shannon entropy over community sizes.
 * Measures how evenly distributed topical clusters are.
 * Reference: Paranyushkin (2019) — diversity as a metric for balanced coverage.
 *
 * @module diversity
 */

/**
 * Compute diversity score for a graph with assigned communities.
 * Uses normalized Shannon entropy: H / log(k) where k = number of communities.
 *
 * @param {import("./graph.js").Graph} graph - Graph with communities assigned
 * @returns {{score: number, entropy: number, maxEntropy: number, communityCount: number, communitySizes: Object<number, number>, dominantCommunity: number, dominanceRatio: number}}
 */
function measureDiversity(graph) {
  const nodes = graph._nodes;

  // Count nodes per community
  const sizes = new Map();
  let total = 0;
  for (const node of nodes.values()) {
    const c = node.community;
    if (c < 0) continue;
    sizes.set(c, (sizes.get(c) || 0) + 1);
    total++;
  }

  if (total === 0 || sizes.size === 0) {
    return {
      score: 0,
      entropy: 0,
      maxEntropy: 0,
      communityCount: 0,
      communitySizes: {},
      dominantCommunity: -1,
      dominanceRatio: 0,
    };
  }

  if (sizes.size === 1) {
    const [commId] = sizes.keys();
    return {
      score: 0,
      entropy: 0,
      maxEntropy: 0,
      communityCount: 1,
      communitySizes: Object.fromEntries(sizes),
      dominantCommunity: commId,
      dominanceRatio: 1,
    };
  }

  // Shannon entropy: H = -Σ (p_i * log(p_i))
  let entropy = 0;
  let maxSize = 0;
  let dominantComm = -1;
  for (const [commId, size] of sizes) {
    const p = size / total;
    if (p > 0) entropy -= p * Math.log(p);
    if (size > maxSize) {
      maxSize = size;
      dominantComm = commId;
    }
  }

  // Normalize: maxEntropy = log(k)
  const maxEntropy = Math.log(sizes.size);
  const score = maxEntropy > 0 ? entropy / maxEntropy : 0;

  return {
    score: Math.round(score * 1000) / 1000,
    entropy: Math.round(entropy * 1000) / 1000,
    maxEntropy: Math.round(maxEntropy * 1000) / 1000,
    communityCount: sizes.size,
    communitySizes: Object.fromEntries(sizes),
    dominantCommunity: dominantComm,
    dominanceRatio: Math.round((maxSize / total) * 1000) / 1000,
  };
}

module.exports = { measureDiversity };
