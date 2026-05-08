import { getSettings } from "@/settings/model";
import type { BackendAdapter, BackendMode } from "./BackendAdapter";
import { HostedBrevilabsAdapter } from "./HostedBrevilabsAdapter";
import { SelfHostAdapter } from "./SelfHostAdapter";

export function getBackendMode(): BackendMode {
  const settings = getSettings();
  if (settings.backendMode === "self_host" || settings.backendMode === "hosted") {
    return settings.backendMode;
  }
  return settings.enableSelfHostMode ? "self_host" : "hosted";
}

export class BackendSelector {
  private static readonly hostedAdapter = new HostedBrevilabsAdapter();
  private static readonly selfHostAdapter = new SelfHostAdapter();

  static getSelectedAdapter(): BackendAdapter {
    return getBackendMode() === "self_host"
      ? BackendSelector.selfHostAdapter
      : BackendSelector.hostedAdapter;
  }

  static getHostedAdapter(): HostedBrevilabsAdapter {
    return BackendSelector.hostedAdapter;
  }

  static getSelfHostAdapter(): SelfHostAdapter {
    return BackendSelector.selfHostAdapter;
  }

  static isSelfHostSelected(): boolean {
    return getBackendMode() === "self_host";
  }

  static isHostedSelected(): boolean {
    return getBackendMode() === "hosted";
  }

  static setPluginVersion(version: string): void {
    BackendSelector.hostedAdapter.setPluginVersion(version);
  }
}
