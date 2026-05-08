/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Obsidian Vault Path - Path to your Obsidian vault */
  "vaultPath": string,
  /** Config filename - Override the vault config filename (default: .obsidian) */
  "configFileName": string,
  /** Exclude following folders - Specify which folders to exclude (comma separated) */
  "excludedFolders"?: string,
  /** Remove content - Hide YAML frontmatter for copying and viewing notes */
  "removeYAML"?: boolean,
  /** undefined - Hide LaTeX (surrounded by $$ or $) for copying and viewing notes */
  "removeLatex"?: boolean,
  /** undefined - Hide links for copying and viewing notes */
  "removeLinks"?: boolean,
  /** [DEPRECATED] Backend Emulator URL - DEPRECATED 2026-04-30. The Copilot Backend Emulator at :8789 was retired Phase D 2026-04-11 and no longer accepts connections. This preference is preserved only to avoid breaking the schema imported by existing extension code; any flow that reads this preference will silently fail. Migrate dependent flows onto the MCP bridge / raycast-obsidian-mcp before removing. */
  "backendEmulatorUrl": string,
  /** Backend Emulator API Key - Auth token for backend emulator routes. */
  "backendEmulatorApiKey"?: string,
  /** Backend Request Timeout (ms) - Timeout for backend emulator calls. */
  "backendRequestTimeoutMs": string,
  /** Backend Runtime Lane - Lane metadata sent to backend self-host routes. */
  "backendRuntimeLane": "raycast" | "fork_dev" | "production_official",
  /** CLI MCP Mode - Use the shared MCP bridge for CLI-backed note and command operations. */
  "mcpEnabled": boolean,
  /** MCP Transport - Preferred transport for MCP server connection. */
  "mcpTransport": "http" | "uds" | "pipe",
  /** MCP HTTP Endpoint - Base URL for MCP server when using HTTP transport. Defaults to the Raycast-flavoured raycast-obsidian-mcp on :18799 (the obsidian-copilot-bridge on :8798 is being retired). */
  "mcpHttpEndpoint": string,
  /** MCP Config Path - Optional path to the local MCP config file for auto-discovering the auth token. */
  "mcpConfigPath": string,
  /** MCP Auth Token - Shared secret token used by MCP server auth guard. Store local values outside git-tracked config files. */
  "mcpAuthToken"?: string,
  /** MCP Request Timeout (ms) - Timeout for MCP tool calls. */
  "mcpRequestTimeoutMs": string,
  /** yt-dlp Path - Path to yt-dlp executable */
  "ytDlpPath": string,
  /** yt-dlp Cookies Browser - Optional browser to pull YouTube/TikTok cookies from (helps bypass bot checks). */
  "ytDlpCookiesFromBrowser": "none" | "chrome" | "arc" | "safari" | "brave" | "firefox" | "edge",
  /** yt-dlp Cookies File - Optional cookies.txt path for yt-dlp (overrides browser cookies setting). */
  "ytDlpCookiesFile"?: string,
  /** Whisper Path - Path to whisper executable */
  "whisperPath": string,
  /** Whisper Model - Whisper model size (tiny, base, small, medium, large) */
  "whisperModel": "tiny" | "base" | "small" | "medium" | "large",
  /** Video Download Folder - Folder in vault for video downloads */
  "videoDownloadFolder": string,
  /** PDF Text Extractor Path - Path to a PDF text extraction CLI (e.g. pdftotext). */
  "pdfTextExtractorPath": string,
  /** PDF Download Folder - Folder in vault to save PDF files downloaded from web URLs. */
  "pdfDownloadFolder": string,
  /** PDF OCR Fallback - Uses pdftoppm + tesseract when regular PDF text extraction is empty or sparse. */
  "pdfOcrFallbackEnabled": boolean,
  /** PDF OCR Language - Tesseract language code(s), e.g. eng or eng+spa. */
  "pdfOcrLanguage": string,
  /** PDF OCR DPI - Render DPI for OCR fallback (higher is slower). */
  "pdfOcrDpi": string,
  /** PDF OCR Max Pages - Optional OCR page limit. Use 0 for all pages. */
  "pdfOcrMaxPages": string,
  /** Cleanup Source Video - When enabled, the generated note links to YouTube instead of embedding the local video file. */
  "cleanupSourceVideo": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `searchNoteCommand` command */
  export type SearchNoteCommand = ExtensionPreferences & {
  /** Template for Append action - Specify a template for Append action (e.g. '- {content}') */
  "appendTemplate"?: string,
  /** Template for Append Selected Text action - Specify a template for Append Selected Text action (e.g. '- {content}') */
  "appendSelectedTemplate"?: string,
  /** Show Detail - Show the notes content in a detail view */
  "showDetail": boolean,
  /** Show Metadata - Show the notes metadata in a detail view (only works when Show Detail is enabled) */
  "showMetadata": boolean,
  /** Search Content - Use the content of notes for searching */
  "searchContent": boolean,
  /** Use Fuzzy Search - If fuzzy search should be used */
  "fuzzySearch": boolean,
  /** Primary Action - Select a primary action to be executed on enter */
  "primaryAction"?: "quicklook" | "obsidian" | "newpane" | "defaultapp"
}
  /** Preferences accessible in the `starredNotesCommand` command */
  export type StarredNotesCommand = ExtensionPreferences & {
  /** Template for Append action - Specify a template for Append action (e.g. '- {content}') */
  "appendTemplate"?: string,
  /** Template for Append Selected Text action - Specify a template for Append Selected Text action (e.g. '- {content}') */
  "appendSelectedTemplate"?: string,
  /** Show Detail - Show the notes content in a detail view */
  "showDetail": boolean,
  /** Show Metadata - Show the notes metadata in a detail view (only works when Show Detail is enabled) */
  "showMetadata": boolean,
  /** Search Content - Use the content of notes for searching */
  "searchContent": boolean,
  /** Primary Action - Select a primary action to be executed on enter */
  "primaryAction"?: "quicklook" | "obsidian" | "newpane" | "defaultapp"
}
  /** Preferences accessible in the `openVaultCommand` command */
  export type OpenVaultCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `openWorkspaceCommand` command */
  export type OpenWorkspaceCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `dailyNoteAppendCommand` command */
  export type DailyNoteAppendCommand = ExtensionPreferences & {
  /** Template for Daily Note Append action - Specify a template for Daily Note Append action (e.g. '- {content}') */
  "appendTemplate"?: string,
  /** Name of Obsidian vault where note is - Name of Obsidian vault where note is */
  "vaultName"?: string,
  /** Name of heading in note in which to append - If no heading is set, text will be appended to the end of the daily note */
  "heading"?: string,
  /** Prepend - Prepend the text instead of appending */
  "prepend": boolean,
  /** Silent Mode - Don't open daily note when appending to the daily note. */
  "silent": boolean
}
  /** Preferences accessible in the `dailyNoteCommand` command */
  export type DailyNoteCommand = ExtensionPreferences & {
  /** Obsidian Vault - Name of Obsidian vault. If not given, a selector is presented. */
  "vaultName"?: string
}
  /** Preferences accessible in the `createNoteCommand` command */
  export type CreateNoteCommand = ExtensionPreferences & {
  /** Blank Note - Create a blank note */
  "blankNote": boolean,
  /** Auto Focus Content Field - Let's you auto focus on the content field rather than the name field */
  "focusContentArea": boolean,
  /** Open Note on Creation - Open the created note in Obsidian */
  "openOnCreate": boolean,
  /** Default Path - The default path where a new note will be created */
  "prefPath": string,
  /** Default Note Name - The default note name if no name is specified */
  "prefNoteName": string,
  /** Default Note Content - The default note content (supports templates) */
  "prefNoteContent": string,
  /** Fill form with defaults - Fill form with default values */
  "fillFormWithDefaults": boolean,
  /** Default Tag - The default selected tag */
  "prefTag": string,
  /** Tags - The tags which will be suggested on note creation */
  "tags": string,
  /** Folder Actions - Add actions to folders (comma separated) */
  "folderActions": string
}
  /** Preferences accessible in the `randomNoteCommand` command */
  export type RandomNoteCommand = ExtensionPreferences & {
  /** Template for Append action - Specify a template for Append action (e.g. '- {content}') */
  "appendTemplate"?: string,
  /** Template for Append Selected Text action - Specify a template for Append Selected Text action (e.g. '- {content}') */
  "appendSelectedTemplate"?: string,
  /** Primary Action - Select a primary action to be executed on enter */
  "primaryAction"?: "quicklook" | "obsidian" | "newpane" | "defaultapp"
}
  /** Preferences accessible in the `searchMedia` command */
  export type SearchMedia = ExtensionPreferences & {
  /** Exclude following folders - Specify which folders to exclude (comma separated) */
  "excludedFolders"?: string,
  /** Image Size - Select the image size to display */
  "imageSize"?: "small" | "medium" | "large"
}
  /** Preferences accessible in the `obsidianMenuBar` command */
  export type ObsidianMenuBar = ExtensionPreferences & {}
  /** Preferences accessible in the `quickCaptureCommand` command */
  export type QuickCaptureCommand = ExtensionPreferences & {
  /** Default Vault - Name of the default vault for quick capture. */
  "captureVaultName"?: string,
  /** Default Destination - Where quick captures are appended by default. */
  "captureDestination"?: "daily" | "inbox",
  /** Inbox Note Path - Vault-relative path for inbox capture notes. */
  "captureInboxPath": string,
  /** Default Heading - Optional heading to append captures under. */
  "captureHeading"?: string,
  /** Silent Mode - Don't switch to Obsidian when appending capture content. */
  "captureSilent": boolean
}
  /** Preferences accessible in the `searchByTagCommand` command */
  export type SearchByTagCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `recentNotesCommand` command */
  export type RecentNotesCommand = ExtensionPreferences & {
  /** Default Vault - Name of the default vault for recent notes. */
  "recentVaultName"?: string,
  /** Maximum Notes - Number of recent notes to display (1-100). */
  "recentNotesCount": string
}
  /** Preferences accessible in the `insertTemplateCommand` command */
  export type InsertTemplateCommand = ExtensionPreferences & {
  /** Default Vault - Name of the default vault for template insertion. */
  "templateVaultName"?: string,
  /** Templates Folder - Vault-relative folder containing markdown templates. */
  "templatesFolder": string,
  /** Default Destination Path - Vault-relative destination folder for notes created from templates. */
  "destinationFolder"?: string
}
  /** Preferences accessible in the `linkVaultNoteCommand` command */
  export type LinkVaultNoteCommand = ExtensionPreferences & {
  /** Default Vault - Name of the default vault for note linking. */
  "linkVaultName"?: string,
  /** Preferred Link Format - Default format used when copying links from this command. */
  "preferredLinkFormat"?: "obsidian" | "markdown" | "wikilink"
}
  /** Preferences accessible in the `appendTaskCommand` command */
  export type AppendTaskCommand = ExtensionPreferences & {
  /** Path of the note you wish to append the task to - Path of note */
  "notePath": string,
  /** Tag to append to the beginning of the task. - Defaults to #task for compatibility with Obsidian Tasks. */
  "noteTag": string,
  /** Creation Date - ➕ YYYY-MM-DD (Current date) */
  "creationDate": boolean,
  /** Name of Obsidian vault where note is - Name of Obsidian vault where note is */
  "vaultName"?: string,
  /** Name of heading in note in which to append - If no heading is not set, text will be appended to the end of the note */
  "heading"?: string,
  /** Silent Mode - Don't open note when appending. */
  "silent": boolean
}
  /** Preferences accessible in the `runActionCommand` command */
  export type RunActionCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `aiSummarizeCommand` command */
  export type AiSummarizeCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `videoTranscribeCommand` command */
  export type VideoTranscribeCommand = ExtensionPreferences & {
  /** Raycast-Obsidian MCP Endpoint - Standalone raycast-obsidian-mcp server URL. Used only by Transcribe & Save; the live obsidian-bridge is untouched. */
  "raycastObsidianMcpEndpoint": string,
  /** Raycast-Obsidian MCP Auth Token - Auth token for the standalone raycast-obsidian-mcp server. If empty, the client reads it from the server's local config file. */
  "raycastObsidianMcpAuthToken"?: string,
  /** Raycast-Obsidian MCP Config Path - Path to the standalone server's config file (used to auto-discover endpoint + auth token). */
  "raycastObsidianMcpConfigPath": string,
  /** Raycast-Obsidian MCP Request Timeout (ms) - HTTPS request timeout for the standalone server. */
  "raycastObsidianMcpRequestTimeoutMs": string
}
  /** Preferences accessible in the `pdfSummarizeCommand` command */
  export type PdfSummarizeCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `copilotPromptsCommand` command */
  export type CopilotPromptsCommand = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `searchNoteCommand` command */
  export type SearchNoteCommand = {
  /** Note */
  "searchArgument": string,
  /** Tag */
  "tagArgument": string
}
  /** Arguments passed to the `starredNotesCommand` command */
  export type StarredNotesCommand = {
  /** Note */
  "searchArgument": string,
  /** Tag */
  "tagArgument": string
}
  /** Arguments passed to the `openVaultCommand` command */
  export type OpenVaultCommand = {}
  /** Arguments passed to the `openWorkspaceCommand` command */
  export type OpenWorkspaceCommand = {}
  /** Arguments passed to the `dailyNoteAppendCommand` command */
  export type DailyNoteAppendCommand = {
  /** Take out the trash */
  "text": string
}
  /** Arguments passed to the `dailyNoteCommand` command */
  export type DailyNoteCommand = {}
  /** Arguments passed to the `createNoteCommand` command */
  export type CreateNoteCommand = {}
  /** Arguments passed to the `randomNoteCommand` command */
  export type RandomNoteCommand = {}
  /** Arguments passed to the `searchMedia` command */
  export type SearchMedia = {
  /** Name */
  "searchArgument": string,
  /** Type */
  "typeArgument": string
}
  /** Arguments passed to the `obsidianMenuBar` command */
  export type ObsidianMenuBar = {}
  /** Arguments passed to the `quickCaptureCommand` command */
  export type QuickCaptureCommand = {}
  /** Arguments passed to the `searchByTagCommand` command */
  export type SearchByTagCommand = {}
  /** Arguments passed to the `recentNotesCommand` command */
  export type RecentNotesCommand = {}
  /** Arguments passed to the `insertTemplateCommand` command */
  export type InsertTemplateCommand = {}
  /** Arguments passed to the `linkVaultNoteCommand` command */
  export type LinkVaultNoteCommand = {}
  /** Arguments passed to the `appendTaskCommand` command */
  export type AppendTaskCommand = {
  /** Your task */
  "text": string,
  /** YYYY-MM-DD */
  "dueDate": string
}
  /** Arguments passed to the `runActionCommand` command */
  export type RunActionCommand = {}
  /** Arguments passed to the `aiSummarizeCommand` command */
  export type AiSummarizeCommand = {}
  /** Arguments passed to the `videoTranscribeCommand` command */
  export type VideoTranscribeCommand = {}
  /** Arguments passed to the `pdfSummarizeCommand` command */
  export type PdfSummarizeCommand = {}
  /** Arguments passed to the `copilotPromptsCommand` command */
  export type CopilotPromptsCommand = {}
}

