import { Note, Obsidian, ObsidianTargetType, ObsidianVault } from "@/obsidian";
import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  getPreferenceValues,
  getSelectedFinderItems,
  Icon,
  List,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { VaultSelection } from "./components/VaultSelection";
import { useNotes, useObsidianVaults } from "./utils/hooks";
import { LinkFormatPreference, LinkVaultNotePreferences } from "./utils/preferences";

function normalizeLinkFormat(format?: string): LinkFormatPreference {
  if (format === "markdown" || format === "wikilink" || format === "obsidian") {
    return format;
  }
  return "obsidian";
}

function getObsidianUri(note: Note): string {
  return Obsidian.getTarget({ type: ObsidianTargetType.OpenPath, path: note.path });
}

function getFormattedLink(note: Note, format: LinkFormatPreference): string {
  const obsidianUri = getObsidianUri(note);
  if (format === "markdown") return `[${note.title}](${obsidianUri})`;
  if (format === "wikilink") return `[[${note.title}]]`;
  return obsidianUri;
}

function LinkNoteList(props: { vault: ObsidianVault; preferredFormat: LinkFormatPreference }) {
  const { vault, preferredFormat } = props;
  const { notes, loading } = useNotes(vault, false);

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => a.title.localeCompare(b.title)), [notes]);

  return (
    <List isLoading={loading} searchBarPlaceholder={`Pick a note in ${vault.name} to copy a link`}>
      {sortedNotes.map((note) => {
        const obsidianUri = getObsidianUri(note);
        const relativePath = note.path.replace(`${vault.path}/`, "");
        return (
          <List.Item
            key={note.path}
            title={note.title}
            subtitle={relativePath}
            accessories={[{ text: note.lastModified.toLocaleDateString() }]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Preferred Link"
                  icon={Icon.Link}
                  content={getFormattedLink(note, preferredFormat)}
                />
                <Action.CopyToClipboard title="Copy Obsidian Link" content={obsidianUri} />
                <Action.CopyToClipboard title="Copy Markdown Link" content={`[${note.title}](${obsidianUri})`} />
                <Action.CopyToClipboard title="Copy Wikilink" content={`[[${note.title}]]`} />
                <Action.Open title="Open in Obsidian" target={obsidianUri} />
              </ActionPanel>
            }
          />
        );
      })}
      {!loading && sortedNotes.length === 0 ? (
        <List.EmptyView title="No Notes Found" description={`No notes found in ${vault.name}.`} />
      ) : null}
    </List>
  );
}

export default function Command() {
  const { ready, vaults } = useObsidianVaults();
  const pref = getPreferenceValues<LinkVaultNotePreferences>();
  const preferredFormat = normalizeLinkFormat(pref.preferredLinkFormat);
  const [checkingFinderSelection, setCheckingFinderSelection] = useState(true);
  const [handledFinderSelection, setHandledFinderSelection] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function tryCopyFromFinderSelection() {
      try {
        const selectedItems = await getSelectedFinderItems();
        const selectedPath = selectedItems[0]?.path;
        if (!selectedPath || !selectedPath.match(/\.(md|canvas)$/i)) {
          return;
        }

        const selectedVault = vaults.find((vault) => selectedPath.startsWith(vault.path));
        if (!selectedVault) {
          return;
        }

        const selectedNote: Note = {
          title: path.basename(selectedPath, path.extname(selectedPath)),
          path: selectedPath,
          lastModified: new Date(),
          bookmarked: false,
        };

        await Clipboard.copy(getFormattedLink(selectedNote, preferredFormat));
        await showToast({
          style: Toast.Style.Success,
          title: "Copied note link",
          message: `Copied link for ${selectedNote.title}`,
        });
        popToRoot();
        closeMainWindow();
        if (!cancelled) {
          setHandledFinderSelection(true);
        }
      } catch {
        // Finder not focused or no selected item; fall back to manual picker list.
      } finally {
        if (!cancelled) {
          setCheckingFinderSelection(false);
        }
      }
    }

    tryCopyFromFinderSelection();
    return () => {
      cancelled = true;
    };
  }, [preferredFormat, ready, vaults]);

  if (!ready || checkingFinderSelection) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  if (handledFinderSelection) {
    return <List />;
  }

  const preferredVault = vaults.find((vault) => vault.name === pref.linkVaultName);
  if (preferredVault) {
    return <LinkNoteList vault={preferredVault} preferredFormat={preferredFormat} />;
  }

  if (vaults.length > 1) {
    return (
      <VaultSelection
        vaults={vaults}
        target={(vault: ObsidianVault) => <LinkNoteList vault={vault} preferredFormat={preferredFormat} />}
      />
    );
  }

  return <LinkNoteList vault={vaults[0]} preferredFormat={preferredFormat} />;
}
