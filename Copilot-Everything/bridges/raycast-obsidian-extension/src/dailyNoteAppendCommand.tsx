import { Action, ActionPanel, closeMainWindow, getPreferenceValues, List, popToRoot } from "@raycast/api";
import { useEffect, useState } from "react";
import LocalRestApiPluginNotInstalled from "./components/Notifications/LocalRestApiPluginNotInstalled";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { DailyNoteAppendPreferences } from "./utils/preferences";
import { useObsidianVaults, useVaultPluginCheck } from "./utils/hooks";
import { clearCache } from "./api/cache/cache.service";
import { applyTemplates } from "./api/templating/templating.service";
import { appendDailyNote } from "./utils/restApiClient";

interface DailyNoteAppendArgs {
  text: string;
}

export default function DailyNoteAppend(props: { arguments: DailyNoteAppendArgs }) {
  const { vaults, ready } = useObsidianVaults();
  const { text } = props.arguments;
  const { appendTemplate, heading, vaultName, prepend } = getPreferenceValues<DailyNoteAppendPreferences>();
  const { vaultsWithPlugin } = useVaultPluginCheck({
    vaults: vaults,
    communityPlugins: ["obsidian-local-rest-api"],
    corePlugins: ["daily-notes"],
  });
  const [content, setContent] = useState("");
  const [isAppending, setIsAppending] = useState(false);

  useEffect(() => {
    async function getContent() {
      const content = await applyTemplates(text, appendTemplate);
      setContent(content);
    }
    getContent();
  }, []);

  useEffect(() => {
    if (!ready || !content || isAppending) return;
    if (vaults.length === 0 || vaultsWithPlugin.length === 0) return;

    const selectedVault = vaultName && vaults.find((vault) => vault.name === vaultName);

    if (selectedVault || vaultsWithPlugin.length === 1) {
      setIsAppending(true);
      const run = async () => {
        await appendDailyNote(content, { heading, prepend });
        clearCache();
        popToRoot();
        closeMainWindow();
      };
      run();
    }
  }, [ready, content, vaults, vaultsWithPlugin, vaultName]);

  if (!ready || !content) {
    return <List isLoading={true}></List>;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  if (vaultsWithPlugin.length === 0) {
    return <LocalRestApiPluginNotInstalled />;
  }
  if (vaultName && !vaultsWithPlugin.some((v) => v.name === vaultName)) {
    return <LocalRestApiPluginNotInstalled vaultName={vaultName} />;
  }

  if (!vaultName && vaultsWithPlugin.length > 1) {
    return (
      <List>
        {vaultsWithPlugin?.map((vault) => (
          <List.Item
            title={vault.name}
            key={vault.key}
            actions={
              <ActionPanel>
                <Action
                  title="Append to Daily Note"
                  onAction={async () => {
                    await appendDailyNote(content, { heading, prepend });
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

  return <List isLoading={true}></List>;
}
