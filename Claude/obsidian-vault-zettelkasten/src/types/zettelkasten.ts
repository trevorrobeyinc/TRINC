import { z } from "zod";

/* ── Relationship Schema ─────────────────────────────────────────────── */

export const relationshipTypeSchema = z.enum([
  "hierarchical",
  "causal",
  "temporal",
  "logical",
  "social",
  "functional",
]);

export const relationshipSubtypeSchema = z.enum([
  // hierarchical
  "is-a",
  "part-of",
  "parent-of",
  "instance-of",
  // causal
  "causes",
  "enables",
  "prevents",
  "results-in",
  // temporal
  "precedes",
  "follows",
  "evolves-into",
  // logical
  "supports",
  "contradicts",
  "refines",
  "extends",
  "relates-to",
  // social
  "author-of",
  "influenced-by",
  // functional
  "uses",
  "implements",
  "depends-on",
]);

export const typedRelationshipSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: relationshipTypeSchema,
  subtype: relationshipSubtypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  dataviewSyntax: z.string(),
});

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type RelationshipSubtype = z.infer<typeof relationshipSubtypeSchema>;
export type TypedRelationship = z.infer<typeof typedRelationshipSchema>;

/* ── Suggestion Schema ───────────────────────────────────────────────── */

export const actionableSuggestionSchema = z.object({
  targetNote: z.string(),
  wikilink: z.string(),
  rationale: z.string(),
  relationship: relationshipSubtypeSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type ActionableSuggestion = z.infer<typeof actionableSuggestionSchema>;

/* ── Vault Health ────────────────────────────────────────────────────── */

export const vaultHealthScoreSchema = z.object({
  totalFiles: z.number(),
  orphanCount: z.number(),
  orphanRatio: z.number(),
  avgConnectivity: z.number(),
  stalenessRatio: z.number(),
  tagCoverage: z.number(),
  orphanPaths: z.array(z.string()),
  computedAt: z.string(),
});

export type VaultHealthScore = z.infer<typeof vaultHealthScoreSchema>;

/* ── Command Names ───────────────────────────────────────────────────── */

export const zettelkastenCommandSchema = z.enum([
  "serendipity",
  "cross-domain",
  "echo-chamber",
  "semantic-linker",
  "orphan-rescue",
  "health",
]);

export type ZettelkastenCommand = z.infer<typeof zettelkastenCommandSchema>;

/* ── Request / Response ──────────────────────────────────────────────── */

export const zettelkastenCommandRequestSchema = z.object({
  notePath: z.string().optional(),
  noteContent: z.string().optional(),
  vault: z.string().optional(),
  model: z
    .object({
      key: z.string().min(1),
      name: z.string().min(1),
      provider: z.string().min(1),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().int().positive().optional(),
    })
    .passthrough()
    .optional(),
  options: z
    .object({
      limit: z.number().int().positive().default(10),
      batchMode: z.boolean().default(false),
      writeReport: z.boolean().default(false),
    })
    // zod 4: `.prefault({})` parses `{}` through the object so its inner defaults apply;
    // `.default({})` would hand back the bare `{}` (it is what zod 3's `.default({})` meant).
    .prefault({}),
});

export type ZettelkastenCommandRequest = z.infer<typeof zettelkastenCommandRequestSchema>;

export const zettelkastenCommandResponseSchema = z.object({
  ok: z.literal(true),
  command: zettelkastenCommandSchema,
  content: z.string(),
  suggestions: z.array(actionableSuggestionSchema),
  relationships: z.array(typedRelationshipSchema).optional(),
  healthScore: vaultHealthScoreSchema.optional(),
  metadata: z.object({
    durationMs: z.number(),
    notesAnalyzed: z.number(),
    miyoQueries: z.number(),
    llmCalls: z.number(),
    filesScanned: z.number().optional(),
    vault: z.string(),
  }),
});

export type ZettelkastenCommandResponse = z.infer<typeof zettelkastenCommandResponseSchema>;

export const zettelkastenErrorResponseSchema = z.object({
  ok: z.literal(false),
  command: zettelkastenCommandSchema,
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ZettelkastenErrorResponse = z.infer<typeof zettelkastenErrorResponseSchema>;

/* ── Pipeline ────────────────────────────────────────────────────────── */

export const pipelineStepSchema = z.object({
  command: zettelkastenCommandSchema,
  options: z
    .object({
      limit: z.number().int().positive().optional(),
      batchMode: z.boolean().optional(),
    })
    .optional(),
});

export const zettelkastenPipelineRequestSchema = z.object({
  notePath: z.string().optional(),
  noteContent: z.string().optional(),
  vault: z.string().optional(),
  model: zettelkastenCommandRequestSchema.shape.model,
  steps: z.array(pipelineStepSchema).min(1).max(5),
  writeReport: z.boolean().default(false),
});

export type ZettelkastenPipelineRequest = z.infer<typeof zettelkastenPipelineRequestSchema>;

export const zettelkastenPipelineResponseSchema = z.object({
  ok: z.literal(true),
  steps: z.array(zettelkastenCommandResponseSchema),
  combinedContent: z.string(),
  metadata: z.object({
    durationMs: z.number(),
    totalLlmCalls: z.number(),
    totalMiyoQueries: z.number(),
  }),
});

export type ZettelkastenPipelineResponse = z.infer<typeof zettelkastenPipelineResponseSchema>;
