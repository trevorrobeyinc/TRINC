import { ObsidianVault } from "@/obsidian";
import { getPreferenceValues, List } from "@raycast/api";
import { useMemo } from "react";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { NoteList } from "./components/NoteList/NoteList";
import { VaultSelection } from "./components/VaultSelection";
import { useNotes, useObsidianVaults } from "./utils/hooks";
import { RecentNotesPreferences } from "./utils/preferences";

const DEFAULT_RECENT_NOTES_COUNT = 10;

function RecentNotesList(props: { vault: ObsidianVault; maxNotes: number }) {
  const { vault, maxNotes } = props;
  const { notes, loading, updateNote, deleteNote } = useNotes(vault, false);

  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).slice(0, maxNotes),
    [maxNotes, notes]
  );

  return (
    <NoteList
      title={`Recent Notes in ${vault.name}`}
      notes={recentNotes}
      vault={vault}
      searchArguments={{}}
      isLoading={loading}
      onNoteUpdated={updateNote}
      onDelete={(note) => deleteNote(note.path)}
    />
  );
}

export default function Command() {
  const { ready, vaults } = useObsidianVaults();
  const pref = getPreferenceValues<RecentNotesPreferences>();

  const maxNotes = useMemo(() => {
    const parsed = Number.parseInt(pref.recentNotesCount || `${DEFAULT_RECENT_NOTES_COUNT}`, 10);
    if (Number.isNaN(parsed)) return DEFAULT_RECENT_NOTES_COUNT;
    return Math.max(1, Math.min(parsed, 100));
  }, [pref.recentNotesCount]);

  if (!ready) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const preferredVault = vaults.find((vault) => vault.name === pref.recentVaultName);
  if (preferredVault) {
    return <RecentNotesList vault={preferredVault} maxNotes={maxNotes} />;
  }

  if (vaults.length > 1) {
    return (
      <VaultSelection
        vaults={vaults}
        target={(vault: ObsidianVault) => <RecentNotesList vault={vault} maxNotes={maxNotes} />}
      />
    );
  }

  return <RecentNotesList vault={vaults[0]} maxNotes={maxNotes} />;
}
