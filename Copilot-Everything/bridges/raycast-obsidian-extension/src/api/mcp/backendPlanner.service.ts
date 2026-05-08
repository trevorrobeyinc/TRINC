import type { BackendId, HealthResponse, Operation } from "./contracts";
import { MCPClient } from "./mcpClient.service";

export interface PlannedRoute {
  operation: Operation;
  backendHint: BackendId;
  epochId: number;
}

const CACHE_TTL_MS = 60_000;

export class BackendPlanner {
  private readonly client: MCPClient;
  private cachedHealth: HealthResponse | null = null;
  private lastRefresh = 0;

  constructor(client?: MCPClient) {
    this.client = client ?? new MCPClient();
  }

  async refresh(force = false): Promise<HealthResponse> {
    const now = Date.now();
    if (!force && this.cachedHealth && now - this.lastRefresh < CACHE_TTL_MS) {
      return this.cachedHealth;
    }

    const health = await this.client.callTool<{}, HealthResponse>({
      tool: "obsidian_health",
      operation: "read_note",
      input: {},
    });

    if (!health.ok) {
      throw new Error(`[${health.error.code}] ${health.error.message}`);
    }

    this.cachedHealth = health.data;
    this.lastRefresh = now;
    return this.cachedHealth;
  }

  async routeFor(operation: Operation): Promise<PlannedRoute> {
    const health = await this.refresh();
    const backend = health.routing.operationMap[operation];
    if (!backend) {
      throw new Error(`NO_CAPABLE_BACKEND: no backend route for ${operation}`);
    }

    return {
      operation,
      backendHint: backend,
      epochId: health.routing.epochId,
    };
  }

  async callRouted<TInput, TOutput>(tool: string, operation: Operation, input: TInput): Promise<TOutput> {
    const route = await this.routeFor(operation);
    let response = await this.client.callTool<TInput, TOutput>({
      tool,
      operation,
      input,
      backendHint: route.backendHint,
      epochId: route.epochId,
    });

    if (!response.ok && response.error.code === "BACKEND_SELECTION_STALE") {
      await this.refresh(true);
      const refreshed = await this.routeFor(operation);
      response = await this.client.callTool<TInput, TOutput>({
        tool,
        operation,
        input,
        backendHint: refreshed.backendHint,
        epochId: refreshed.epochId,
      });
    }

    if (!response.ok) {
      throw new Error(`[${response.error.code}] ${response.error.message}`);
    }

    return response.data;
  }
}
