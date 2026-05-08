import { Obsidian, ObsidianTargetType } from "@/obsidian";
import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  getPreferenceValues,
  List,
  LocalStorage,
  open,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { clearCache } from "./api/cache/cache.service";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { useObsidianVaults } from "./utils/hooks";
import { QuickCapturePreferences } from "./utils/preferences";

type QuickCaptureDestination = "daily" | "inbox";

interface QuickCaptureFormValues {
  vaultName: string;
  destination: QuickCaptureDestination;
  inboxPath: string;
  heading?: string;
  content: string;
  silent: boolean;
}

const STORAGE_KEYS = {
  vaultName: "quick_capture_vault_name",
  destination: "quick_capture_destination",
  inboxPath: "quick_capture_inbox_path",
  heading: "quick_capture_heading",
} as const;

export default function Command() {
  const { ready, vaults } = useObsidianVaults();
  const pref = getPreferenceValues<QuickCapturePreferences>();

  const [vaultName, setVaultName] = useState<string>(pref.captureVaultName ?? "");
  const [destination, setDestination] = useState<QuickCaptureDestination>(pref.captureDestination ?? "daily");
  const [inboxPath, setInboxPath] = useState<string>(pref.captureInboxPath || "Inbox");
  const [heading, setHeading] = useState<string>(pref.captureHeading ?? "");
  const [silent, setSilent] = useState<boolean>(pref.captureSilent ?? true);

  useEffect(() => {
    let cancelled = false;
    async function loadLocalDefaults() {
      const [storedVaultName, storedDestination, storedInboxPath, storedHeading] = await Promise.all([
        LocalStorage.getItem<string>(STORAGE_KEYS.vaultName),
        LocalStorage.getItem<QuickCaptureDestination>(STORAGE_KEYS.destination),
        LocalStorage.getItem<string>(STORAGE_KEYS.inboxPath),
        LocalStorage.getItem<string>(STORAGE_KEYS.heading),
      ]);

      if (cancelled) return;

      if (storedVaultName) setVaultName(storedVaultName);
      if (storedDestination === "daily" || storedDestination === "inbox") setDestination(storedDestination);
      if (storedInboxPath) setInboxPath(storedInboxPath);
      if (storedHeading) setHeading(storedHeading);
    }

    loadLocalDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vaultName && vaults.length > 0) {
      setVaultName(vaults[0].name);
    }
  }, [vaultName, vaults]);

  async function handleSubmit(values: QuickCaptureFormValues) {
    const selectedVault = vaults.find((vault) => vault.name === values.vaultName) || vaults[0];

    if (!selectedVault) {
      await showToast({ style: Toast.Style.Failure, title: "No vault found" });
      return;
    }

    if (values.destination === "inbox" && !values.inboxPath.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Inbox path is required" });
      return;
    }

    const target =
      values.destination === "daily"
        ? Obsidian.getTarget({
            type: ObsidianTargetType.DailyNoteAppend,
            vault: selectedVault,
            text: values.content,
            heading: values.heading?.trim() || undefined,
            silent: values.silent,
          })
        : Obsidian.getTarget({
            type: ObsidianTargetType.AppendToNote,
            vault: selectedVault,
            text: values.content,
            path: values.inboxPath.trim(),
            mode: "append",
            heading: values.heading?.trim() || undefined,
            silent: values.silent,
          });

    await open(target);
    clearCache();
    await Promise.all([
      LocalStorage.setItem(STORAGE_KEYS.vaultName, values.vaultName),
      LocalStorage.setItem(STORAGE_KEYS.destination, values.destination),
      LocalStorage.setItem(STORAGE_KEYS.inboxPath, values.inboxPath),
      LocalStorage.setItem(STORAGE_KEYS.heading, values.heading ?? ""),
    ]);

    await showToast({
      style: Toast.Style.Success,
      title: "Capture saved",
      message: values.destination === "daily" ? "Appended to daily note" : `Appended to ${values.inboxPath}`,
    });

    popToRoot();
    closeMainWindow();
  }

  if (!ready) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  return (
    <Form
      navigationTitle="Quick Capture"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Capture" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="vaultName" title="Vault" value={vaultName} onChange={setVaultName}>
        {vaults.map((vault) => (
          <Form.Dropdown.Item key={vault.key} value={vault.name} title={vault.name} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="destination"
        title="Destination"
        value={destination}
        onChange={(value) => setDestination(value as QuickCaptureDestination)}
      >
        <Form.Dropdown.Item value="daily" title="Daily Note" />
        <Form.Dropdown.Item value="inbox" title="Inbox Note" />
      </Form.Dropdown>

      {destination === "inbox" && (
        <Form.TextField
          id="inboxPath"
          title="Inbox Path"
          placeholder="Inbox/Capture"
          value={inboxPath}
          onChange={setInboxPath}
        />
      )}

      <Form.TextField
        id="heading"
        title="Heading (Optional)"
        placeholder="Inbox"
        value={heading}
        onChange={setHeading}
      />

      <Form.Checkbox
        id="silent"
        title="Silent Mode"
        label="Don't switch to Obsidian"
        value={silent}
        onChange={setSilent}
      />

      <Form.TextArea
        id="content"
        title="Capture Text"
        placeholder="Capture something quickly..."
        enableMarkdown={true}
        autoFocus={true}
      />
    </Form>
  );
}
