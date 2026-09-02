import type { App } from "obsidian";

export interface VizStudioSettings {
  enableBridge: boolean;
  bridgePort: number;
  /** Vault-relative folder for generated SVG/PNG attachments. */
  assetFolder: string;
  /** Vault-relative folder for generated .canvas files. */
  canvasFolder: string;
  /** Vault-relative folder for generated notes (mermaid fences). */
  notesFolder: string;
  /** Rasterization scale multiplier for PNG export (1-4). */
  pngScale: number;
  /** Background painted behind charts and PNG exports; "transparent" disables. */
  chartBackground: string;
}

/**
 * Everything a tool handler needs. The bridge itself is transport-only
 * (TLS, auth, routing) and never touches the vault; handlers own all writes.
 */
export interface ToolContext {
  app: App;
  settings: VizStudioSettings;
}

export type ToolHandler = (
  input: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export type ToolHandlers = Record<string, ToolHandler>;
