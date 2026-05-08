import type {
  ZettelkastenCommandRequest,
  ZettelkastenCommandResponse,
  ZettelkastenPipelineResponse,
} from "./types/zettelkasten";

export type { ZettelkastenCommandRequest, ZettelkastenCommandResponse };

export interface PipelineStep {
  command: "serendipity" | "cross-domain" | "echo-chamber" | "semantic-linker" | "orphan-rescue" | "health";
  options?: { limit?: number; batchMode?: boolean };
}

export interface VaultZettelkastenAPI {
  serendipity(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  crossDomain(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  echoChamber(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  semanticLinker(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  orphanRescue(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  vaultHealth(req: ZettelkastenCommandRequest): Promise<ZettelkastenCommandResponse>;
  pipeline(steps: PipelineStep[], baseRequest: ZettelkastenCommandRequest): Promise<ZettelkastenPipelineResponse>;
}
