export interface GlobalPreferences {
  vaultPath: string;
  configFileName: string;
  removeYAML: boolean;
  removeLinks: boolean;
  removeLatex: boolean;
  excludedFolders: string;
  defaultSortOrder?: string;
  mcpEnabled?: boolean;
  mcpTransport?: "http" | "uds" | "pipe";
  mcpHttpEndpoint?: string;
  mcpConfigPath?: string;
  mcpAuthToken?: string;
  mcpRequestTimeoutMs?: string;
}

export interface AppendNotePreferences {
  appendTemplate: string;
  appendSelectedTemplate: string;
}
export interface NoteFormPreferences extends GlobalPreferences {
  blankNote: boolean;
  prefPath: string;
  prefNoteName: string;
  prefNoteContent: string;
  fillFormWithDefaults: boolean;
  prefTag: string;
  tags: string;
  openOnCreate: boolean;
  folderActions: string;
  focusContentArea: boolean;
}

export interface SearchNotePreferences extends GlobalPreferences, AppendNotePreferences {
  primaryAction: string;
  showDetail: boolean;
  showMetadata: boolean;
  searchContent: boolean;
  fuzzySearch: boolean;
}

export interface RandomNotePreferences extends GlobalPreferences, AppendNotePreferences {}

export interface SearchMediaPreferences extends GlobalPreferences {
  imageSize: string;
}

export interface DailyNoteAppendPreferences {
  appendTemplate?: string;
  vaultName?: string;
  heading?: string;
  prepend?: boolean;
  silent?: boolean;
}

export interface AppendTaskPreferences {
  appendTemplate?: string;
  vaultName?: string;
  heading?: string;
  notePath?: string;
  noteTag?: string;
  silent?: boolean;
  creationDate?: boolean;
}

export interface DailyNotePreferences {
  vaultName?: string;
}

export interface QuickCapturePreferences {
  captureVaultName?: string;
  captureDestination?: "daily" | "inbox";
  captureInboxPath?: string;
  captureHeading?: string;
  captureSilent?: boolean;
}

export interface RecentNotesPreferences {
  recentVaultName?: string;
  recentNotesCount?: string;
}

export interface InsertTemplatePreferences {
  templateVaultName?: string;
  templatesFolder?: string;
  destinationFolder?: string;
}

export type LinkFormatPreference = "obsidian" | "markdown" | "wikilink";

export interface LinkVaultNotePreferences {
  linkVaultName?: string;
  preferredLinkFormat?: LinkFormatPreference;
}
