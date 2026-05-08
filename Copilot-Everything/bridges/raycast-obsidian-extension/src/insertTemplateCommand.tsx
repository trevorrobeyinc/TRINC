import { ObsidianVault } from "@/obsidian";
import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  getPreferenceValues,
  List,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import fs from "fs";
import path from "path";
import { useEffect, useState } from "react";
import { invalidateNotesCache } from "./api/cache/cache.service";
import { createNote } from "./api/create-note";
import { getFilePaths } from "./api/file/file.service";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { VaultSelection } from "./components/VaultSelection";
import { useObsidianVaults } from "./utils/hooks";
import { InsertTemplatePreferences } from "./utils/preferences";

interface InsertTemplateFormValues {
  templatePath: string;
  noteName: string;
  notePath: string;
}

async function getTemplatePaths(vault: ObsidianVault, templatesFolder: string): Promise<string[]> {
  const templateRoot = path.resolve(vault.path, templatesFolder);
  if (!fs.existsSync(templateRoot)) {
    return [];
  }

  const files = await getFilePaths({
    path: templateRoot,
    includedFileExtensions: [".md"],
  });

  return files.map((file) => path.relative(vault.path, file)).sort((a, b) => a.localeCompare(b));
}

function InsertTemplateForm(props: {
  vault: ObsidianVault;
  templatesFolder: string;
  defaultDestinationFolder: string;
}) {
  const { vault, templatesFolder, defaultDestinationFolder } = props;
  const [templatePaths, setTemplatePaths] = useState<string[]>([]);
  const [templatePath, setTemplatePath] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      setIsLoading(true);
      const files = await getTemplatePaths(vault, templatesFolder);
      if (cancelled) return;
      setTemplatePaths(files);
      setTemplatePath(files[0] ?? "");
      setIsLoading(false);
    }

    loadTemplates().catch(() => {
      if (!cancelled) {
        setTemplatePaths([]);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [templatesFolder, vault]);

  async function createFromTemplate(values: InsertTemplateFormValues) {
    const selectedTemplatePath = values.templatePath || templatePath;
    const noteName = values.noteName.trim();
    const notePath = values.notePath.trim();

    if (!selectedTemplatePath) {
      await showToast({ style: Toast.Style.Failure, title: "No template selected" });
      return;
    }

    if (!noteName) {
      await showToast({ style: Toast.Style.Failure, title: "Note name is required" });
      return;
    }

    const absoluteTemplatePath = path.resolve(vault.path, selectedTemplatePath);
    const templateContent = await fs.promises.readFile(absoluteTemplatePath, "utf-8");

    const saved = await createNote(vault, {
      name: noteName,
      path: notePath,
      content: templateContent,
      tags: [],
    });

    if (saved) {
      invalidateNotesCache(vault.path);
      await showToast({
        style: Toast.Style.Success,
        title: "Template inserted",
        message: `${noteName}.md`,
      });
      popToRoot();
      closeMainWindow();
    }
  }

  if (isLoading) {
    return <List isLoading={true} />;
  }

  if (templatePaths.length === 0) {
    return (
      <List>
        <List.EmptyView
          title="No Templates Found"
          description={`No markdown templates found in "${templatesFolder}" for vault "${vault.name}".`}
        />
      </List>
    );
  }

  return (
    <Form
      navigationTitle={`Insert Template in ${vault.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Note from Template" onSubmit={createFromTemplate} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="templatePath" title="Template" value={templatePath} onChange={setTemplatePath}>
        {templatePaths.map((template) => (
          <Form.Dropdown.Item key={template} value={template} title={template} />
        ))}
      </Form.Dropdown>

      <Form.TextField id="noteName" title="Note Name" placeholder="Meeting Notes" autoFocus={true} />

      <Form.TextField
        id="notePath"
        title="Destination Path"
        placeholder="path/to/folder (optional)"
        defaultValue={defaultDestinationFolder}
      />
    </Form>
  );
}

export default function Command() {
  const { ready, vaults } = useObsidianVaults();
  const pref = getPreferenceValues<InsertTemplatePreferences>();
  const templatesFolder = pref.templatesFolder?.trim() || "Templates";
  const destinationFolder = pref.destinationFolder?.trim() || "";

  if (!ready) {
    return <List isLoading={true} />;
  }

  if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const preferredVault = vaults.find((vault) => vault.name === pref.templateVaultName);
  if (preferredVault) {
    return (
      <InsertTemplateForm
        vault={preferredVault}
        templatesFolder={templatesFolder}
        defaultDestinationFolder={destinationFolder}
      />
    );
  }

  if (vaults.length > 1) {
    return (
      <VaultSelection
        vaults={vaults}
        target={(vault: ObsidianVault) => (
          <InsertTemplateForm
            vault={vault}
            templatesFolder={templatesFolder}
            defaultDestinationFolder={destinationFolder}
          />
        )}
      />
    );
  }

  return (
    <InsertTemplateForm
      vault={vaults[0]}
      templatesFolder={templatesFolder}
      defaultDestinationFolder={destinationFolder}
    />
  );
}
