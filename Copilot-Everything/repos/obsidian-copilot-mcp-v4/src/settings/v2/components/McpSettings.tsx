import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingItem } from "@/components/ui/setting-item";
import { Textarea } from "@/components/ui/textarea";
import { McpToolProvider, type McpServerHealth } from "@/mcp/McpToolProvider";
import { updateSetting, useSettingsValue } from "@/settings/model";
import React from "react";

function arrayToMultiline(values: string[]): string {
  return values.join("\n");
}

function multilineToArray(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function maskValue(value: string, start = 10, end = 6): string {
  if (!value) {
    return "Not set";
  }

  if (value.length <= start + end + 3) {
    return "Hidden";
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export const McpSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [serversJson, setServersJson] = React.useState(
    JSON.stringify(settings.mcp.servers, null, 2)
  );
  const [showServerDetails, setShowServerDetails] = React.useState(false);
  const [jsonError, setJsonError] = React.useState("");
  const [healthStatuses, setHealthStatuses] = React.useState<McpServerHealth[]>([]);

  React.useEffect(() => {
    setServersJson(JSON.stringify(settings.mcp.servers, null, 2));
  }, [settings.mcp.servers]);

  React.useEffect(() => {
    if (!settings.mcp.enabled) {
      setHealthStatuses([]);
      return;
    }

    let cancelled = false;
    McpToolProvider.probeConfiguredServers(settings.mcp)
      .then((statuses) => {
        if (!cancelled) {
          setHealthStatuses(statuses);
        }
      })
      .catch(() => {
        // Probe failures already surface per-server in healthStatuses; a
        // rejected probe batch must not become an unhandled rejection.
      });

    return () => {
      cancelled = true;
    };
  }, [settings.mcp]);

  const updateMcp = (patch: Partial<typeof settings.mcp>) => {
    updateSetting("mcp", {
      ...settings.mcp,
      ...patch,
    });
  };

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <div className="tw-flex tw-items-center tw-gap-2 tw-py-4">
        <Badge variant="secondary" className="tw-text-accent">
          MCP Provider
        </Badge>
        <span className="tw-text-xs tw-text-muted">
          MCP stays independent from hosted Brevilabs auth and backend selection. With encryption
          enabled, saved MCP server details are encrypted at rest.
        </span>
      </div>

      <SettingItem
        type="switch"
        title="Enable MCP Tools"
        description="Register configured MCP servers as first-class tools in the agent tool registry."
        checked={settings.mcp.enabled}
        onCheckedChange={(checked) => updateMcp({ enabled: checked })}
      />

      <SettingItem
        type="select"
        title="Mutating Tool Policy"
        description="Control whether mutating MCP tools are blocked, held for prompt-based confirmation, or allowed without prompt."
        value={settings.mcp.confirmationPolicy}
        onChange={(value) =>
          updateMcp({
            confirmationPolicy: value as typeof settings.mcp.confirmationPolicy,
          })
        }
        options={[
          { label: "Read-only only", value: "read_only_only" },
          { label: "Prompt on writes", value: "prompt_on_writes" },
          { label: "Allow without prompt", value: "allow_without_prompt" },
        ]}
      />

      <SettingItem
        type="switch"
        title="Redact MCP Logs"
        description="When enabled, MCP logs avoid printing request bodies and tool results."
        checked={settings.mcp.redactLogs}
        onCheckedChange={(checked) => updateMcp({ redactLogs: checked })}
      />

      <SettingItem
        type="textarea"
        title="Allowlist Patterns"
        description="Optional wildcard patterns for allowed MCP catalog tool names, one per line."
        value={arrayToMultiline(settings.mcp.allowlist)}
        onChange={(value) => updateMcp({ allowlist: multilineToArray(value) })}
        placeholder="obsidian_health\nobsidian_read_*"
        rows={4}
      />

      <SettingItem
        type="textarea"
        title="Denylist Patterns"
        description="Optional wildcard patterns that should be blocked even if present in server registrations."
        value={arrayToMultiline(settings.mcp.denylist)}
        onChange={(value) => updateMcp({ denylist: multilineToArray(value) })}
        placeholder="obsidian_append_note"
        rows={4}
      />

      <SettingItem
        type="custom"
        title="MCP Servers JSON"
        description="Register one or more MCP servers and enabled tool names. Raw server JSON is hidden by default because it can include tokens, local paths, and internal endpoints."
      >
        <div className="tw-flex tw-w-full tw-flex-col tw-gap-2">
          <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
            <div className="tw-text-xs tw-text-muted">
              Copilot now encrypts saved MCP server details at rest when encryption is enabled.
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowServerDetails((current) => !current)}
            >
              {showServerDetails ? "Hide raw JSON" : "Reveal raw JSON"}
            </Button>
          </div>

          {settings.mcp.servers.length === 0 ? (
            <div className="tw-rounded-md tw-border tw-border-dashed tw-border-border tw-p-3 tw-text-xs tw-text-muted">
              No MCP servers are currently configured.
            </div>
          ) : (
            settings.mcp.servers.map((server) => (
              <div
                key={server.id}
                className="tw-rounded-md tw-border tw-border-solid tw-border-border tw-p-3"
              >
                <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <div className="tw-font-medium">{server.displayName || "Unnamed MCP server"}</div>
                  <Badge
                    variant="secondary"
                    className={server.enabled ? "tw-text-success" : "tw-text-muted"}
                  >
                    {server.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="tw-mt-2 tw-grid tw-gap-1 tw-text-xs tw-text-muted">
                  <div>Endpoint: {maskValue(server.httpEndpoint, 18, 10)}</div>
                  <div>Vault: {maskValue(server.vaultRoot, 18, 10)}</div>
                  <div>Token: {maskValue(server.authToken)}</div>
                  <div>Tools: {server.enabledToolNames.length}</div>
                </div>
              </div>
            ))
          )}

          {showServerDetails ? (
            <>
              <Textarea
                value={serversJson}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setServersJson(nextValue);
                  try {
                    const parsed = JSON.parse(nextValue);
                    if (!Array.isArray(parsed)) {
                      throw new Error("Server config must be a JSON array.");
                    }
                    updateMcp({ servers: parsed });
                    setJsonError("");
                  } catch (error) {
                    setJsonError(error instanceof Error ? error.message : String(error));
                  }
                }}
                rows={16}
                className="tw-min-h-[320px] tw-w-full"
              />
              {jsonError ? (
                <div className="tw-text-xs tw-text-error">Invalid MCP server JSON: {jsonError}</div>
              ) : (
                <div className="tw-text-xs tw-text-muted">
                  Available catalog tools: {McpToolProvider.getAvailableToolNames().join(", ")}
                </div>
              )}
            </>
          ) : (
            <div className="tw-text-xs tw-text-muted">
              Reveal raw JSON when you want to inspect or edit the full MCP server configuration.
            </div>
          )}
        </div>
      </SettingItem>

      <SettingItem
        type="custom"
        title="Diagnostics"
        description="Current health and compatibility status for configured MCP servers."
      >
        <div className="tw-flex tw-w-full tw-flex-col tw-gap-2">
          {healthStatuses.length === 0 ? (
            <div className="tw-text-xs tw-text-muted">
              {settings.mcp.enabled
                ? "No enabled MCP servers are currently configured."
                : "Enable MCP to run health probes."}
            </div>
          ) : (
            healthStatuses.map((status) => (
              <div
                key={status.serverId}
                className="tw-rounded-md tw-border tw-border-solid tw-border-border tw-p-3"
              >
                <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <div className="tw-font-medium">{status.displayName}</div>
                  <Badge
                    variant="secondary"
                    className={status.ok ? "tw-text-success" : "tw-text-warning"}
                  >
                    {status.ok ? "Healthy" : "Attention"}
                  </Badge>
                </div>
                <div className="tw-mt-1 tw-text-xs tw-text-muted">{status.message}</div>
              </div>
            ))
          )}
        </div>
      </SettingItem>
    </div>
  );
};
