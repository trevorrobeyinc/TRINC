import { ObsidianUtils, Vault, ObsidianVault } from "@/obsidian";
import { Action, ActionPanel, List } from "@raycast/api";
import { useEffect, useState } from "react";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { NoteListObsidian } from "./components/NoteList/NoteListObsidian";
import { VaultSelection } from "./components/VaultSelection";
import { useNotes, useObsidianVaults } from "./utils/hooks";

interface TagItem {
  tag: string;
  count: number;
}

function SearchByTagList(props: { vault: ObsidianVault }) {
  const { vault } = props;
  const { notes, loading } = useNotes(vault, false);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [isTagLoading, setIsTagLoading] = useState(false);

  useEffect(() => {
    if (notes.length === 0) {
      setTags([]);
      return;
    }

    let cancelled = false;
    async function loadTags() {
      setIsTagLoading(true);

      const tagCount = new Map<string, number>();
      const contents = await Promise.allSettled(notes.map((note) => Vault.readMarkdown(note.path)));

      for (const contentResult of contents) {
        if (contentResult.status !== "fulfilled") continue;
        for (const tag of ObsidianUtils.getAllTags(contentResult.value)) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      }

      if (cancelled) return;

      const values = Array.from(tagCount.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => a.tag.localeCompare(b.tag));

      setTags(values);
      setIsTagLoading(false);
    }

    loadTags().catch(() => {
      if (!cancelled) {
        setTags([]);
        setIsTagLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [notes]);

  return (
    <List isLoading={loading || isTagLoading} searchBarPlaceholder={`Filter tags in ${vault.name}`}>
      {tags.map((item) => (
        <List.Item
          key={item.tag}
          title={`#${item.tag}`}
          accessories={[{ text: `${item.count}` }]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Show Notes with Tag"
                target={
                  <NoteListObsidian
                    vault={vault}
                    showTitle={true}
                    bookmarked={false}
                    searchArguments={{ tagArgument: item.tag }}
                  />
                }
              />
              <Action.CopyToClipboard title="Copy Tag" content={`#${item.tag}`} />
            </ActionPanel>
          }
        />
      ))}
      {!loading && !isTagLoading && tags.length === 0 ? (
        <List.EmptyView
          title="No Tags Found"
          description={`No inline or frontmatter tags were detected in ${vault.name}`}
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
    return <VaultSelection vaults={vaults} target={(vault: ObsidianVault) => <SearchByTagList vault={vault} />} />;
  }

  return <SearchByTagList vault={vaults[0]} />;
}
