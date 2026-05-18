import { Detail } from "@raycast/api";

export default function LocalRestApiPluginNotInstalled({ vaultName }: { vaultName?: string }) {
  const vaultText = vaultName ? `vault "${vaultName}"` : "any vault";
  const text = `# Required plugin not installed or enabled in ${vaultText}.

This command requires the [Local REST API plugin](https://obsidian.md/plugins?id=obsidian-local-rest-api) for Obsidian to be installed and enabled.

Install it through the community plugins list, then set the API key (and optionally the base URL) in this Raycast extension's preferences.`;

  return <Detail navigationTitle="Local REST API plugin not installed" markdown={text} />;
}
