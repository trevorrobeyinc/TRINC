import { ObsidianVault } from "@/obsidian";
import { NoVaultFoundMessage } from "@/components/Notifications/NoVaultFoundMessage";
import { VaultSelection } from "@/components/VaultSelection";
import { useObsidianVaults } from "@/utils/hooks";
import { Action, ActionPanel, List, showToast, Toast } from "@raycast/api";
import path from "path";
import { useCallback, useEffect, useState } from "react";
import {
  loadPromptItems,
  openPrompt as openPromptInObsidian,
  refreshPromptRegistry as refreshPromptRegistryFlow,
  runPrompt as runPromptFlow,
  type PromptItem,
} from "@/tools/copilotPromptsFlow";

function CopilotPromptsList(props: { vault: ObsidianVault }) {
  const { vault } = props;
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPrompts = useCallback(
    async (isCancelled?: () => boolean) => {
      const result = await loadPromptItems(vault);
      if (!isCancelled?.()) {
        setPrompts(result);
      }
    },
    [vault]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    loadPrompts(() => cancelled)
      .catch(async (error) => {
        if (!cancelled) {
          setPrompts([]);
        }
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load prompts",
          message: String(error),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadPrompts]);

  async function runPrompt(item: PromptItem) {
    const result = await runPromptFlow(vault, item);
    await showToast({
      style: Toast.Style.Success,
      title: "Copilot prompt triggered",
      message: `${result.title} (${result.commandId})`,
    });
  }

  async function refreshPromptRegistry() {
    setIsLoading(true);
    try {
      const result = await refreshPromptRegistryFlow(vault);
      setPrompts(result.prompts);
      await showToast({
        style: Toast.Style.Success,
        title: "Prompt registry refreshed",
        message: result.commandId,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to refresh prompt registry",
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function openPrompt(item: PromptItem) {
    await openPromptInObsidian(item);
    await showToast({
      style: Toast.Style.Success,
      title: "Opened in Obsidian",
      message: item.relativePath,
    });
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder={`Search Copilot prompts in ${vault.name}...`}>
      {prompts.map((prompt) => (
        <List.Item
          key={prompt.relativePath}
          title={prompt.title}
          subtitle={prompt.commandId}
          accessories={[{ text: prompt.relativePath }]}
          actions={
            <ActionPanel>
              <Action title="Run Prompt on Active Note" onAction={() => runPrompt(prompt)} />
              <Action title="Open Prompt File" onAction={() => openPrompt(prompt)} />
              <Action title="Refresh Prompt Registry" onAction={refreshPromptRegistry} />
              <Action.CopyToClipboard title="Copy Path" content={prompt.relativePath} />
              <Action.CopyToClipboard title="Copy Command Id" content={prompt.commandId} />
            </ActionPanel>
          }
        />
      ))}
      {!isLoading && prompts.length === 0 ? (
        <List.EmptyView
          title="No Copilot prompts found"
          description={`No markdown prompts found under ${path.posix.join("copilot", "copilot-custom-prompts")}`}
        />
      ) : null}
    </List>
  );
}

export default function Command() {
  const { ready, vaults } = useObsidianVaults();

  if (!ready) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  if (vaults.length > 1) {
    return <VaultSelection vaults={vaults} target={(vault: ObsidianVault) => <CopilotPromptsList vault={vault} />} />;
  }

  return <CopilotPromptsList vault={vaults[0]} />;
}
