import { Action, ActionPanel, closeMainWindow, getPreferenceValues, List, open, popToRoot } from "@raycast/api";

import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { useObsidianVaults } from "./utils/hooks";
import { DailyNotePreferences } from "./utils/preferences";

function getDailyTarget(vaultName: string) {
  return `obsidian://daily?vault=${encodeURIComponent(vaultName)}`;
}

export default function Command() {
  const { vaults, ready } = useObsidianVaults();
  const { vaultName } = getPreferenceValues<DailyNotePreferences>();
  const preselectedVault = vaults.find((vault) => vault.name === vaultName);

  if (!ready) {
    return <List isLoading={true}></List>;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  if (preselectedVault || vaults.length == 1) {
    const vaultToUse = preselectedVault || vaults[0];
    const target = getDailyTarget(vaultToUse.name);
    open(target);
    popToRoot();
    closeMainWindow();
    return <List />;
  }

  return (
    <List>
      {vaults?.map((vault) => (
        <List.Item
          title={vault.name}
          key={vault.key}
          actions={
            <ActionPanel>
              <Action.Open title="Daily Note" target={getDailyTarget(vault.name)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
