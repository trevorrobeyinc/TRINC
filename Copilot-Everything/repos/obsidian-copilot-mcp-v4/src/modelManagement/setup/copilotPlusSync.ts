/**
 * Reconciles the Copilot Plus provider with the user's current Plus state.
 *
 * Plus has no model-list endpoint, so the model set is a hardcoded snapshot
 * (`COPILOT_PLUS_MODELS`). `syncCopilotPlusProvider` is the single bridge the
 * plugin host calls on Plus sign-in / sign-out (and once on load): it
 * registers the Plus provider when signed in (with a key) and unregisters it
 * otherwise. Both `register`/`unregister` are idempotent, so calling this on
 * every relevant settings change is safe.
 */

import { BREVILABS_MODELS_BASE_URL, ChatModels } from "@/constants";
import { logError } from "@/logger";
import type { ModelManagementApi } from "@/modelManagement/createModelManagement";
import type { ModelInfo } from "@/modelManagement/types/catalog";

/**
 * The Copilot Plus models the brevilabs relay exposes. Hardcoded — there's no
 * relay catalog to fetch, so this mirrors the curated public lineup served by
 * `models.brevilabs.com/v1/models`. Wire ids must match what the relay accepts;
 * opencode routes them as `copilot-plus/<id>` (see `mapProviderToOpencodeId`).
 *
 * `COPILOT_PLUS_DEFAULT_ENABLED_MODELS` names the few enabled by default; the
 * rest ship available-but-off in the chat + opencode pickers for the user to
 * toggle on.
 *
 * `reasoning: true` marks the models the relay accepts an effort level for (it
 * matches the models service's `supports_reasoning`). The chat + agent pickers
 * read this (via `configuredModelToCustomModel` → `ModelCapability.REASONING`)
 * to surface the effort selector. These models do NOT reason unless the user
 * picks an effort, so flash stays fast by default. Reconciled 2026-10-19 against
 * the live relay catalog (Kimi retired; MiMo → V2.6 Flash; MiniMax → M3; new
 * GLM-5.3-Flash and DeepSeek V4.1 Flash added).
 */
export const COPILOT_PLUS_MODELS: readonly ModelInfo[] = Object.freeze([
  {
    id: ChatModels.COPILOT_PLUS_FLASH,
    displayName: "Copilot Plus Flash",
    description: "The default model: fastest responses and the most quota.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_GLM_5_2,
    displayName: "GLM-5.2",
    description: "A long-horizon frontier open model that beats some of the best closed models.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_GLM_5_3_FLASH,
    displayName: "GLM-5.3 Flash",
    description: "Fast, cost-efficient coding and long-horizon agent tasks.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_DEEPSEEK_V4_PRO,
    displayName: "DeepSeek V4 Pro",
    description: "A top-tier model for the hardest reasoning and agentic tasks.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_DEEPSEEK_V4_FLASH_0731,
    displayName: "DeepSeek V4 Flash 0731",
    description: "The July 2026 DeepSeek V4 Flash snapshot: fast, cheap, and broadly capable.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_DEEPSEEK_V4_1_FLASH,
    displayName: "DeepSeek V4.1 Flash",
    description: "Fast multimodal reasoning for coding and agentic tasks.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_MIMO_V2_6_FLASH,
    displayName: "MiMo V2.6 Flash",
    description: "Cost-effective model for everyday use.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: ChatModels.COPILOT_PLUS_MINIMAX_M3,
    displayName: "MiniMax M3",
    description: "Long-context model for coding and agentic tasks.",
    toolCall: true,
    reasoning: true,
    modalities: { input: ["text"], output: ["text"] },
  },
]);

/**
 * Wire ids auto-enrolled (toggled on) by default when the Plus provider is
 * registered. Everything else in `COPILOT_PLUS_MODELS` is added but left
 * unenrolled, so users opt into the extra models themselves. Passed to
 * `registerPlusProvider` as `autoEnrollModelIds`.
 *
 * Six models are enabled by default to mirror the relay's `default_enabled`
 * flag (Flash, GLM-5.2, GLM-5.3-Flash, DeepSeek V4 Pro, DeepSeek V4.1 Flash,
 * MiniMax M3): representative coverage across fast, frontier-open, top-tier
 * reasoning, multimodal, and long-context.
 */
export const COPILOT_PLUS_DEFAULT_ENABLED_MODELS: readonly string[] = Object.freeze([
  ChatModels.COPILOT_PLUS_FLASH,
  ChatModels.COPILOT_PLUS_GLM_5_2,
  ChatModels.COPILOT_PLUS_GLM_5_3_FLASH,
  ChatModels.COPILOT_PLUS_DEEPSEEK_V4_PRO,
  ChatModels.COPILOT_PLUS_DEEPSEEK_V4_1_FLASH,
  ChatModels.COPILOT_PLUS_MINIMAX_M3,
]);

/**
 * Register or unregister the Plus provider to match Plus state. Best-effort:
 * a failure is logged, not thrown, since this runs as background reconciliation
 * off a settings change.
 *
 * `licenseKey` is already hydrated from Obsidian Keychain by the settings
 * persistence boundary.
 */
export async function syncCopilotPlusProvider(
  api: ModelManagementApi,
  isPaidUser: boolean,
  licenseKey: string | undefined
): Promise<void> {
  try {
    if (isPaidUser && licenseKey) {
      await api.setup.copilotPlus.registerPlusProvider({
        providerType: "openai-compatible",
        displayName: "Copilot",
        baseUrl: BREVILABS_MODELS_BASE_URL,
        apiKey: licenseKey,
        models: COPILOT_PLUS_MODELS,
        autoEnrollModelIds: COPILOT_PLUS_DEFAULT_ENABLED_MODELS,
      });
    } else {
      await api.setup.copilotPlus.unregisterPlusProvider();
    }
  } catch (err) {
    logError("[modelManagement] Copilot Plus provider sync failed", err);
  }
}
