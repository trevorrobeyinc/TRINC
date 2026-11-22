import type { OpenClawSettings } from "./types";

export const VIEW_TYPE_WORKFLOW = "openclaw-workflow-status";

export const PLUGIN_ID = "command-center";

export const DEFAULT_SETTINGS: OpenClawSettings = {
  openclawPath: "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations",
  nodePath: "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
  vaultOutputFolder: "OpenClaw",
  autoGenerateNotes: true,
  engineNotesWaitMs: 8000,
  backfillVaultNotesOnLoad: true,
  autoRunZettelkasten: true,
  zkCatchUpOnLoad: true,
  zkCatchUpMaxPerLoad: 2,
  pollIntervalMs: 2000,
  workflowTimeoutMs: 1800000,
  miyoEnabled: true,
  // Default points at the in-monorepo TLS-terminating proxy (`miyo-tls-proxy`),
  // NOT Miyo's raw plaintext port (8742). See TRINC/CLAUDE.md
  // HTTPS-only invariant.
  miyoPort: 8743,
  miyoSimilarityThreshold: 0.5,
  miyoMaxResults: 10,
  miyoIndexWaitMs: 15000,
  miyoIndexPollIntervalMs: 1000,
  miyoSearchRetries: 3,
  enableCopilotBridge: true,
  bridgePort: 8799,
  // Trevorobeyinc Research Memory MCP — auto-ingest hook (added 2026-04-26).
  autoIngestToResearchMemory: true,
  researchMemoryCliPath:
    "/Users/myhome/TRINC/Claude/trevorobeyinc-research-memory-mcp/dist/cli.js",
  researchMemoryDefaultClient: "trevorobeyinc",
  researchMemoryTimeoutMs: 60000,
  // Video pipeline (2026-11-19). Raycast stays the default until the operator flips it; the rest are
  // the Raycast runner's own defaults (its package.json preferences), so a flip changes the backend only.
  videoBackend: "raycast",
  videoDownloadFolder: "Video Downloads",
  videoSummaryFolder: "Copilot Summaries",
  videoTranscriber: "parakeet",
  videoWhisperModel: "medium",
  videoWhisperTask: "translate",
  videoTranscriptSource: "whisper",
  videoCleanupAfterSummary: true,
};

export const STEP_TYPE_LABELS: Record<string, string> = {
  mission: "Research",
  quality_audit: "Quality Audit",
  dataset: "Build Dataset",
  offer: "Package Offer",
  approve: "Approve Release",
  export: "Export",
};

export const STEP_STATUS_ICONS: Record<string, string> = {
  pending: "\u2022",
  running: "\u25CB",
  completed: "\u2713",
  failed: "\u2717",
};

// (The Zettelkasten stdio-subprocess lane — MCP_PROTOCOL_VERSION +
// ZK_LINKING_TOOLS — was retired 2026-08-20; linking runs in-process via the
// vault-zettelkasten plugin api.)
