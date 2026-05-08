import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { pathToFileURL } from "node:url";
import { loadEnv, type EmulatorEnv } from "./config/env.js";
import { createLogger } from "./logging/logger.js";
import { HttpMcpTransport } from "./transports/HttpMcpTransport.js";
import { BridgeMcpClient } from "./adapters/BridgeMcpClient.js";
import { AuthAdapter } from "./adapters/AuthAdapter.js";
import { CapabilityRegistry } from "./services/CapabilityRegistry.js";
import { SelfHostContractInventory } from "./services/SelfHostContractInventory.js";
import { CopilotRequestParser } from "./services/CopilotRequestParser.js";
import { ToolRouter } from "./services/ToolRouter.js";
import { McpOrchestrator } from "./services/McpOrchestrator.js";
import { ModelGateway } from "./services/ModelGateway.js";
import { ResponseTransformer } from "./services/ResponseTransformer.js";
import { CopilotResponseAdapter } from "./adapters/CopilotResponseAdapter.js";
import { SelfHostExecutionEngine } from "./services/SelfHostExecutionEngine.js";
import { CompatibilityAliasService } from "./services/CompatibilityAliasService.js";
import { MiyoCompatibilityClient } from "./adapters/MiyoCompatibilityClient.js";
import { MiyoCompatibilityService } from "./services/MiyoCompatibilityService.js";
import { ZettelkastenService } from "./services/ZettelkastenService.js";
import { VaultFileSystem } from "./services/VaultFileSystem.js";
import { QdrantScrollClient } from "./services/QdrantScrollClient.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerSelfHostContractRoutes } from "./routes/selfHostContract.js";
import { registerCompatAliasRoutes } from "./routes/compatAliases.js";
import { registerZettelkastenRoutes } from "./routes/zettelkasten.js";

export interface EmulatorDependencies {
  env?: EmulatorEnv;
  bridgeClient?: BridgeMcpClient;
  modelGateway?: ModelGateway;
  miyoClient?: MiyoCompatibilityClient;
  logger?: ReturnType<typeof createLogger>;
}

export async function buildServer(deps: EmulatorDependencies = {}): Promise<FastifyInstance> {
  const env = deps.env ?? loadEnv();
  const logger = deps.logger ?? createLogger(env.ENABLE_VERBOSE_LOGS);
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  const transport = new HttpMcpTransport(env);
  const bridgeClient = deps.bridgeClient ?? new BridgeMcpClient(transport);
  const authAdapter = new AuthAdapter(env);
  const inventory = new SelfHostContractInventory();
  const capabilityRegistry = new CapabilityRegistry();
  const requestParser = new CopilotRequestParser(env);
  const toolRouter = new ToolRouter();
  const miyoClient = deps.miyoClient ?? new MiyoCompatibilityClient(env);
  const mcpOrchestrator = new McpOrchestrator(
    bridgeClient,
    miyoClient,
    env.MIYO_DEFAULT_VAULT,
    env.DEFAULT_VAULT_NAME,
    env.DEFAULT_VAULT_ROOT
  );
  const modelGateway = deps.modelGateway ?? new ModelGateway();
  const responseTransformer = new ResponseTransformer();
  const responseAdapter = new CopilotResponseAdapter(responseTransformer);
  const executionEngine = new SelfHostExecutionEngine(
    modelGateway,
    mcpOrchestrator,
    toolRouter,
    responseAdapter
  );
  const miyoCompatibilityService = new MiyoCompatibilityService(miyoClient);
  const compatibilityAliasService = new CompatibilityAliasService(
    authAdapter,
    miyoCompatibilityService
  );
  const vaultFs = new VaultFileSystem(env.DEFAULT_VAULT_ROOT);
  const qdrantClient = new QdrantScrollClient("http://127.0.0.1:6333");
  const zettelkastenService = new ZettelkastenService(
    mcpOrchestrator,
    miyoClient,
    modelGateway,
    env,
    vaultFs,
    qdrantClient
  );
  mcpOrchestrator.setZettelkastenService(zettelkastenService);

  await registerHealthRoute(app as any, inventory, bridgeClient);
  await registerSelfHostContractRoutes(
    app as any,
    authAdapter,
    requestParser,
    executionEngine,
    bridgeClient
  );
  await registerCompatAliasRoutes(app as any, compatibilityAliasService);
  await registerZettelkastenRoutes(app as any, authAdapter, zettelkastenService);

  return app as unknown as FastifyInstance;
}

export async function startServer(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = await buildServer({ env });
  await app.listen({ host: env.HOST, port: env.PORT });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
