import { join } from "path";
import { existsSync } from "fs";

/**
 * Resolve paths within the OpenClaw workspace.
 */
export class PathResolver {
  constructor(private openclawPath: string) {}

  get workflowsDir(): string {
    return join(this.openclawPath, "workspace", "workflows");
  }

  get missionsDir(): string {
    return join(this.openclawPath, "workspace", "missions");
  }

  get researchOutputDir(): string {
    return join(this.openclawPath, "workspace", "research-output");
  }

  get templatesDir(): string {
    return join(this.openclawPath, "config", "workflow-templates");
  }

  get runWorkflowScript(): string {
    return join(this.openclawPath, "scripts", "run-workflow.js");
  }

  workflowStateFile(workflowId: string): string {
    return join(this.workflowsDir, workflowId, "workflow.json");
  }

  missionStatusFile(missionId: string): string {
    return join(this.missionsDir, missionId, "status.json");
  }

  agentOutputFile(taskId: string): string {
    return join(this.researchOutputDir, taskId, "output.md");
  }

  agentMetadataFile(taskId: string): string {
    return join(this.researchOutputDir, taskId, "metadata.json");
  }

  isValid(): boolean {
    return existsSync(this.runWorkflowScript);
  }
}
