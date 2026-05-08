import { getChainType, getModelKey, getCurrentProject } from "@/aiParams";
import { BackendSelector } from "@/backend/BackendSelector";
import {
  type SelfHostChatMessage,
  type SelfHostMcpToolBinding,
  type SelfHostModelSpec,
  type SelfHostTurnRequest,
} from "@/backend/selfHostContract";
import { ChainType } from "@/chainFactory";
import { COMPOSER_OUTPUT_INSTRUCTIONS, RETRIEVED_DOCUMENT_TAG } from "@/constants";
import { LayerToMessagesConverter } from "@/context/LayerToMessagesConverter";
import { getDecryptedKey } from "@/encryptionService";
import { getMcpCatalogEntry } from "@/mcp/catalog";
import { RetrieverFactory } from "@/search/RetrieverFactory";
import { FilterRetriever } from "@/search/v3/FilterRetriever";
import { mergeFilterAndSearchResults } from "@/search/v3/mergeResults";
import { extractTagsFromQuery } from "@/search/v3/utils/tagUtils";
import { getSettings, getModelKeyFromModel } from "@/settings/model";
import { ChatMessage } from "@/types/message";
import { extractChatHistory, findCustomModel, getProviderInfo } from "@/utils";
import { getStandaloneQuestion } from "@/chainUtils";
import { BaseChainRunner } from "./BaseChainRunner";
import { loadAndAddChatHistory } from "./utils/chatHistoryUtils";
import {
  formatSourceCatalog,
  getQACitationInstructions,
  sanitizeContentForCitations,
  type SourceCatalogEntry,
} from "./utils/citationUtils";

export class SelfHostEmulatorChainRunner extends BaseChainRunner {
  async run(
    userMessage: ChatMessage,
    abortController: AbortController,
    updateCurrentAiMessage: (message: string) => void,
    addMessage: (message: ChatMessage) => void,
    _options: {
      debug?: boolean;
      ignoreSystemMessage?: boolean;
      updateLoading?: (loading: boolean) => void;
    }
  ): Promise<string> {
    const adapter = BackendSelector.getSelfHostAdapter();
    const chainType = this.getCurrentChainType();
    const { messages, sources } = await this.buildMessagesForChain(userMessage, chainType);
    const settings = getSettings();
    const runtimeLane = settings.selfHostAdapter.runtimeLane || "fork_dev";
    const useStreaming = runtimeLane === "fork_dev" && settings.stream;

    const request: SelfHostTurnRequest = {
      requestId: crypto.randomUUID(),
      executionMode: "exact_backend_emulator",
      runtimeLane,
      chainType,
      rawUserMessage: this.getRawUserMessage(userMessage),
      originalUserMessage: userMessage.originalMessage,
      messages,
      model: await this.resolveModelSpec(),
      tools: this.buildMcpToolBindings(),
      responseStyle: {
        stream: useStreaming,
        includeReasoning: true,
      },
      contextEnvelope: userMessage.contextEnvelope,
      retrieval:
        sources.length > 0
          ? {
              mode: chainType,
              sources,
            }
          : undefined,
      project: this.getProjectInfo(),
      debug: settings.debug,
    };

    try {
      const response = useStreaming
        ? await adapter.streamAgentTurn(
            request,
            {
              onDisplayContent: (content) => updateCurrentAiMessage(content),
            },
            abortController.signal
          )
        : await adapter.agentTurn(request, abortController.signal);

      if (abortController.signal.aborted) {
        updateCurrentAiMessage("");
        return "";
      }

      await this.handleResponse(
        response.assistant.content,
        userMessage,
        abortController,
        addMessage,
        updateCurrentAiMessage,
        response.assistant.sources.map((source) => ({
          title: source.title,
          path: source.path,
          score: source.score ?? 0,
        })),
        response.assistant.reply,
        response.responseMetadata
      );

      return response.assistant.content;
    } catch (error) {
      if (abortController.signal.aborted) {
        updateCurrentAiMessage("");
        return "";
      }

      await this.handleError(error, updateCurrentAiMessage);
      return "";
    }
  }

  private getCurrentChainType(): string {
    return getChainType() || ChainType.COPILOT_PLUS_CHAIN;
  }

  private getRawUserMessage(userMessage: ChatMessage): string {
    const l5User = userMessage.contextEnvelope?.layers.find((layer) => layer.id === "L5_USER");
    return l5User?.text || userMessage.originalMessage || userMessage.message;
  }

  private async buildMessagesForChain(
    userMessage: ChatMessage,
    chainType: string
  ): Promise<{
    messages: SelfHostChatMessage[];
    sources: Array<{ title: string; path: string; score?: number; explanation?: any }>;
  }> {
    if (chainType === ChainType.VAULT_QA_CHAIN) {
      return await this.buildVaultQaMessages(userMessage);
    }

    return await this.buildStandardMessages(userMessage);
  }

  private async buildStandardMessages(userMessage: ChatMessage): Promise<{
    messages: SelfHostChatMessage[];
    sources: Array<{ title: string; path: string; score?: number; explanation?: any }>;
  }> {
    if (!userMessage.contextEnvelope) {
      throw new Error("Context envelope is required for exact backend emulator mode.");
    }

    const baseMessages = LayerToMessagesConverter.convert(userMessage.contextEnvelope, {
      includeSystemMessage: true,
      mergeUserContent: true,
      debug: false,
    });

    const messages: SelfHostChatMessage[] = [];
    const memory = this.chainManager.memoryManager.getMemory();

    const systemMessage = baseMessages.find((message) => message.role === "system");
    if (systemMessage) {
      messages.push(systemMessage);
    }

    await loadAndAddChatHistory(memory, messages);

    const userContent = baseMessages.find((message) => message.role === "user");
    if (userContent) {
      messages.push({
        role: "user",
        content: this.appendComposerInstructionsIfNeeded(userContent.content, userMessage),
      });
    }

    return { messages, sources: [] };
  }

  private async buildVaultQaMessages(userMessage: ChatMessage): Promise<{
    messages: SelfHostChatMessage[];
    sources: Array<{ title: string; path: string; score?: number; explanation?: any }>;
  }> {
    const envelope = userMessage.contextEnvelope;
    if (!envelope) {
      throw new Error("Context envelope is required for exact backend emulator Vault QA mode.");
    }

    const l5User = envelope.layers.find((layer) => layer.id === "L5_USER");
    const rawUserQuery = l5User?.text || userMessage.message;
    const tags = extractTagsFromQuery(rawUserQuery);
    const memory = this.chainManager.memoryManager.getMemory();
    const memoryVariables = await memory.loadMemoryVariables({});
    const chatHistory = extractChatHistory(memoryVariables);
    const standaloneQuestion =
      chatHistory.length > 0
        ? await getStandaloneQuestion(rawUserQuery, chatHistory)
        : rawUserQuery;

    const settings = getSettings();
    const filterRetriever = new FilterRetriever(this.chainManager.app, {
      salientTerms: tags.length > 0 ? [...tags] : [],
      maxK: settings.maxSourceChunks,
      returnAll: tags.length > 0,
    });
    const filterDocs = await filterRetriever.getRelevantDocuments(standaloneQuestion);

    const retrieverResult = await RetrieverFactory.createRetriever(
      this.chainManager.app,
      {
        minSimilarityScore: 0.01,
        maxK: settings.maxSourceChunks,
        salientTerms: tags.length > 0 ? [...tags] : [],
        tagTerms: tags,
        returnAll: tags.length > 0,
      },
      RetrieverFactory.isMiyoActive() ? { enableMiyo: false, enableSemanticSearchV3: false } : {}
    );
    const searchDocs = await retrieverResult.retriever.getRelevantDocuments(standaloneQuestion);
    const { filterResults, searchResults } = mergeFilterAndSearchResults(filterDocs, searchDocs);
    const mergedDocs = [...filterResults, ...searchResults].slice(0, settings.maxSourceChunks);
    this.chainManager.storeRetrieverDocuments(mergedDocs);

    const context = mergedDocs
      .map((doc: any) => {
        const title = doc.metadata?.title || "Untitled";
        const path = doc.metadata?.path || title;
        return `<${RETRIEVED_DOCUMENT_TAG}>\n<title>${title}</title>\n<path>${path}</path>\n<content>\n${sanitizeContentForCitations(doc.pageContent)}\n</content>\n</${RETRIEVED_DOCUMENT_TAG}>`;
      })
      .join("\n\n");

    const sources = mergedDocs.map((doc: any) => ({
      title: doc.metadata?.title || doc.metadata?.path || "Untitled",
      path: doc.metadata?.path || doc.metadata?.title || "",
      score: doc.metadata?.score,
      explanation: doc.metadata?.explanation,
    }));

    const baseMessages = LayerToMessagesConverter.convert(envelope, {
      includeSystemMessage: true,
      mergeUserContent: true,
      debug: false,
    });
    const messages: SelfHostChatMessage[] = [];
    const systemMessage = baseMessages.find((message) => message.role === "system");
    if (systemMessage) {
      messages.push(systemMessage);
    }

    await loadAndAddChatHistory(memory, messages);

    const sourceEntries: SourceCatalogEntry[] = sources
      .slice(0, Math.max(5, Math.min(20, sources.length)))
      .map((source) => ({
        title: source.title,
        path: source.path,
      }));
    const sourceCatalog = formatSourceCatalog(sourceEntries).join("\n");
    const qaInstructions =
      "\n\nAnswer the question based only on the following context:\n" +
      context +
      getQACitationInstructions(sourceCatalog, settings.enableInlineCitations);

    const userContent = baseMessages.find((message) => message.role === "user");
    if (userContent) {
      messages.push({
        role: "user",
        content: qaInstructions + "\n\n" + userContent.content,
      });
    }

    return { messages, sources };
  }

  private async resolveModelSpec(): Promise<SelfHostModelSpec> {
    const settings = getSettings();
    const model = findCustomModel(getModelKey(), settings.activeModels);

    return {
      key: getModelKeyFromModel(model),
      name: model.name,
      provider: model.provider,
      baseUrl: this.resolveProviderBaseUrl(model.provider, model.baseUrl),
      apiKey: await this.resolveProviderApiKey(model.provider, model.apiKey),
      openAIOrgId: model.openAIOrgId
        ? await getDecryptedKey(model.openAIOrgId)
        : settings.openAIOrgId
          ? await getDecryptedKey(settings.openAIOrgId)
          : undefined,
      azureOpenAIApiInstanceName:
        model.azureOpenAIApiInstanceName || settings.azureOpenAIApiInstanceName,
      azureOpenAIApiDeploymentName:
        model.azureOpenAIApiDeploymentName || settings.azureOpenAIApiDeploymentName,
      azureOpenAIApiVersion: model.azureOpenAIApiVersion || settings.azureOpenAIApiVersion,
      temperature: model.temperature ?? settings.temperature,
      maxTokens: model.maxTokens ?? settings.maxTokens,
      topP: model.topP,
      frequencyPenalty: model.frequencyPenalty,
      reasoningEffort: model.reasoningEffort || settings.reasoningEffort,
      verbosity: model.verbosity || settings.verbosity,
      stream: model.stream ?? settings.stream,
      streamUsage: model.streamUsage ?? false,
      numCtx: model.numCtx,
      useResponsesApi: model.useResponsesApi,
      capabilities: model.capabilities,
    };
  }

  private async resolveProviderApiKey(
    provider: string,
    modelApiKey?: string
  ): Promise<string | undefined> {
    const settings = getSettings();
    const source =
      modelApiKey ||
      (
        {
          openai: settings.openAIApiKey,
          openrouterai: settings.openRouterAiApiKey,
          "azure openai": settings.azureOpenAIApiKey,
          deepseek: settings.deepseekApiKey,
          siliconflow: settings.siliconflowApiKey,
          "3rd party (openai-format)": settings.openAIApiKey,
          "copilot-plus": settings.plusLicenseKey,
          "lm-studio": "default-key",
          ollama: "default-key",
        } as Record<string, string | undefined>
      )[provider];

    if (!source) {
      return undefined;
    }

    return await getDecryptedKey(source);
  }

  private resolveProviderBaseUrl(provider: string, modelBaseUrl?: string): string | undefined {
    if (modelBaseUrl) {
      return modelBaseUrl;
    }

    if (provider === "lm-studio") {
      return "http://127.0.0.1:1234/v1";
    }

    if (provider === "ollama") {
      return "http://127.0.0.1:11434";
    }

    try {
      return getProviderInfo(provider).host || undefined;
    } catch {
      return undefined;
    }
  }

  private buildMcpToolBindings(): SelfHostMcpToolBinding[] {
    const settings = getSettings();
    if (!settings.mcp.enabled) {
      return [];
    }

    return settings.mcp.servers.flatMap((server) => {
      if (!server.enabled || server.transport !== "http") {
        return [];
      }

      return server.enabledToolNames.flatMap((toolName) => {
        const entry = getMcpCatalogEntry(toolName);
        if (!entry) {
          return [];
        }

        if (entry.isMutating && settings.mcp.confirmationPolicy === "read_only_only") {
          return [];
        }

        const runtimeName = `mcp_${server.id}_${toolName}`;
        return [
          {
            runtimeName,
            displayName: entry.displayName,
            description: entry.description,
            category: "mcp" as const,
            isMutating: entry.isMutating,
            // In emulator mode, interactive confirmation is impossible —
            // always allow writes through. The read_only_only gate above
            // still strips mutating tools when that policy is active.
            requiresConfirmation: false,
            bridge: {
              toolName: entry.toolName,
              operation: entry.operation,
              backendHint: server.backendHint || undefined,
              serverId: server.id,
              httpEndpoint: server.httpEndpoint,
              vaultName: server.vaultName,
              vaultRoot: server.vaultRoot,
            },
          },
        ];
      });
    });
  }

  private appendComposerInstructionsIfNeeded(content: string, userMessage: ChatMessage): string {
    if (!userMessage.message.includes("@composer")) {
      return content;
    }

    return `${content}\n\n<OUTPUT_FORMAT>\n${COMPOSER_OUTPUT_INSTRUCTIONS}\n</OUTPUT_FORMAT>`;
  }

  private getProjectInfo(): { id?: string; name?: string } | undefined {
    const project = getCurrentProject();
    if (!project) {
      return undefined;
    }

    return {
      id: project.id,
      name: project.name,
    };
  }
}
