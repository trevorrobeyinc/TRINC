# Algorithm Documentation

## References

- Paranyushkin, D. (2019). "InfraNodus: Generating Insight Using Text Network Analysis." WWW'19.
- Paranyushkin, D. (2011). "Identifying the pathways for meaning circulation using text network analysis." Nodus Labs.
- Brandes, U. (2001). "A Faster Algorithm for Betweenness Centrality." Journal of Mathematical Sociology, 25(2), 163-177.
- Blondel, V. D., Guillaume, J.-L., Lambiotte, R., & Lefebvre, E. (2008). "Fast unfolding of communities in large networks." Journal of Statistical Mechanics: Theory and Experiment, 2008(10), P10008.

## 1. Text-to-Graph (4-gram Co-occurrence Window)

**Source**: Paranyushkin (2019), Section 3.1

**Algorithm**:
1. Tokenize input text: lowercase, split on non-alphanumeric boundaries
2. Remove stopwords (general English + optional biomedical)
3. Apply suffix-based lemmatization
4. Slide a window of size 4 (configurable) across the token sequence
5. For each window position, create edges between all pairs of tokens in the window
6. Edge weight = co-occurrence count (incremented each time the pair appears in any window)
7. Node weight = sum of incident edge weights

**Deviation from InfraNodus**: Our lemmatizer is suffix-based (no NLP library). InfraNodus uses a more sophisticated lemmatization pipeline. For biomedical text, we supplement with entity preservation (multi-word terms kept as single tokens).

**File**: `lib/text-to-graph.js`

## 2. Betweenness Centrality (Brandes' Algorithm)

**Source**: Brandes (2001)

**Algorithm**:
1. For each source node s, run BFS to compute shortest paths
2. During BFS, track predecessor lists and path counts (σ)
3. Back-propagate dependency scores (δ) from leaves to root
4. Accumulate centrality: CB(v) += δ_s(v) for all sources s ≠ v
5. Normalize: CB(v) *= 2/((n-1)(n-2)) for undirected graphs
6. Scale to [0, 1] by dividing by max centrality

**Complexity**: O(V × E) for unweighted graphs

**File**: `lib/centrality.js`

## 3. Community Detection (Louvain Algorithm)

**Source**: Blondel et al. (2008)

**Algorithm**:
1. Initialize: each node in its own community
2. Phase 1 (local moving): For each node, compute modularity gain of moving to each neighbor's community. Move to the community with highest positive gain. Repeat until no improvement.
3. Phase 2 (aggregation): Contract each community into a super-node. Not implemented in our version — we use Phase 1 only, which is sufficient for the graph sizes we encounter.
4. Renumber communities to contiguous 0, 1, 2, ...

**Modularity**: Q = (1/2m) × Σ [A_ij - (k_i × k_j)/(2m)] × δ(c_i, c_j)

**Deviation**: We implement Phase 1 only (no hierarchical aggregation). For graphs under ~500 nodes (our typical range), this produces good community assignments.

**File**: `lib/community-detection.js`

## 4. Structural Gap Detection

**Source**: Paranyushkin (2019), Section 3.3

**Algorithm**:
1. After community detection, enumerate all community pairs
2. Count inter-community edges for each pair
3. Gap score = (size_A × size_B) / (inter_edges + 1)
4. Higher score = larger communities with fewer connections = bigger gap
5. For each gap, find bridge candidates: nodes in community A whose 2nd-degree neighbors are in community B
6. Sort gaps by score descending

**Innovation**: This is the core InfraNodus insight — gaps in the knowledge graph represent unexplored connections, blind spots, or novel research hypotheses.

**File**: `lib/gap-detection.js`

## 5. Discourse Diversity (Shannon Entropy)

**Source**: Paranyushkin (2019), Section 3.4

**Algorithm**:
1. Count nodes per community: n_i
2. Compute proportions: p_i = n_i / total_nodes
3. Shannon entropy: H = -Σ (p_i × log(p_i))
4. Normalize: score = H / log(k) where k = number of communities
5. Score range: [0, 1]. 1.0 = perfectly balanced coverage, 0.0 = single dominant topic

**File**: `lib/diversity.js`
