import { Action, ActionPanel, closeMainWindow, getPreferenceValues, List, popToRoot } from "@raycast/api";
import { useEffect, useState } from "react";
import LocalRestApiPluginNotInstalled from "./components/Notifications/LocalRestApiPluginNotInstalled";
import { NoPathProvided } from "./components/Notifications/NoPathProvided";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { vaultsWithoutLocalRestApiToast } from "./components/Toasts";
import { AppendTaskPreferences } from "./utils/preferences";
import { useObsidianVaults, useVaultPluginCheck } from "./utils/hooks";
import { clearCache } from "./api/cache/cache.service";
import { applyTemplates } from "./api/templating/templating.service";
import { appendNote } from "./utils/restApiClient";

interface appendTaskArgs {
  text: string;
  dueDate: string;
}

export default function AppendTask(props: { arguments: appendTaskArgs }) {
  const { vaults, ready } = useObsidianVaults();
  const { text } = props.arguments;
  const { dueDate } = props.arguments;
  const dateContent = dueDate ? " 📅 " + dueDate : "";

  const { appendTemplate, heading, notePath, noteTag, vaultName, creationDate } =
    getPreferenceValues<AppendTaskPreferences>();
  const { vaultsWithPlugin, vaultsWithoutPlugin } = useVaultPluginCheck({
    vaults: vaults,
    communityPlugins: ["obsidian-local-rest-api"],
  });
  const [content, setContent] = useState<string | null>(null);
  const [shouldAppend, setShouldAppend] = useState(false);

  useEffect(() => {
    async function getContent() {
      const content = await applyTemplates(text, appendTemplate);
      setContent(content);
    }

    getContent();
  }, [appendTemplate, text]);

  useEffect(() => {
    if (!shouldAppend || !ready || content === null || !notePath) {
      return;
    }

    const runAppend = async () => {
      const tag = noteTag ? noteTag + " " : "";
      const creationDateString = creationDate ? " ➕ " + new Date().toLocaleDateString("en-CA") : "";
      const notePathExpanded = await applyTemplates(notePath);
      const taskMarkdown = "- [ ] " + tag + content + dateContent + creationDateString;
      await appendNote(notePathExpanded, taskMarkdown, heading ? { heading } : {});
      clearCache();
      popToRoot();
      closeMainWindow();
    };

    runAppend();
  }, [
    shouldAppend,
    ready,
    content,
    vaultName,
    vaults,
    vaultsWithPlugin,
    notePath,
    noteTag,
    creationDate,
    dateContent,
    heading,
  ]);

  if (!ready || content === null) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  if (vaultsWithoutPlugin.length > 0) {
    vaultsWithoutLocalRestApiToast(vaultsWithoutPlugin);
  }

  if (vaultsWithPlugin.length === 0) {
    return <LocalRestApiPluginNotInstalled />;
  }

  if (vaultName) {
    if (!vaultsWithPlugin.some((v) => v.name === vaultName)) {
      return <LocalRestApiPluginNotInstalled vaultName={vaultName} />;
    }
  }

  if (!notePath) {
    return <NoPathProvided />;
  }

  const creationDateString = creationDate ? " ➕ " + new Date().toLocaleDateString("en-CA") : "";
  const tag = noteTag ? noteTag + " " : "";

  const selectedVault = vaultName && vaults.find((vault) => vault.name === vaultName);
  if (selectedVault || vaultsWithPlugin.length === 1) {
    if (vaults.length > 1 && !selectedVault) {
      return <List isLoading={true} />;
    }

    if (!shouldAppend) {
      setShouldAppend(true);
    }

    return <List isLoading={true} />;
  }

  return (
    <List isLoading={false}>
      {vaultsWithPlugin.map((vault) => (
        <List.Item
          key={vault.key}
          title={vault.name}
          actions={
            <ActionPanel>
              <Action
                title="Append Task"
                onAction={async () => {
                  const taskMarkdown = "- [ ] " + tag + content + dateContent + creationDateString;
                  await appendNote(notePath, taskMarkdown, heading ? { heading } : {});
                  clearCache();
                  popToRoot();
                  closeMainWindow();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
