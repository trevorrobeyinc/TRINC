// A stand-in for the parts of Obsidian's App that src/vaultIpc.ts uses: an index of notes and folders, a disk
// that can hold files the index has not caught up with, a workspace that records which leaf opened what, a
// metadata cache that resolves link text, and a command registry. Every write is logged in `calls`, so a test
// can say what happened and, as important, what did not.
import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export class FakeFolder {
  path: string;
  name: string;
  children: unknown[] = [];

  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
  }
}

export class FakeFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { size: number; ctime: number; mtime: number };

  constructor(path: string, size: number) {
    this.path = path;
    this.name = path.split("/").pop() ?? path;
    const dot = this.name.lastIndexOf(".");
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
    this.stat = { size, ctime: 0, mtime: 0 };
  }
}

export interface FakeVaultOptions {
  notes?: Record<string, string>;
  /** Files on disk that the index does not hold yet. */
  disk?: Record<string, string>;
  folders?: string[];
  /** Folders on disk that the index does not hold yet: createFolder fails on them, as Obsidian's does. */
  diskFolders?: string[];
  /** Ids in Obsidian's command registry (app.commands.commands). */
  registeredCommands?: string[];
  configDir?: string;
}

export class FakeVault {
  readonly notes = new Map<string, string>();
  readonly disk = new Map<string, string>();
  readonly folders = new Set<string>();
  readonly diskFolders = new Set<string>();
  readonly calls: string[] = [];
  readonly sizes = new Map<string, number>();
  commandResult: boolean | Error = true;
  failOpen = false;
  /** Called inside createFolder: a test uses it to have "another writer" put a file on disk mid-call. */
  onCreateFolder: ((path: string) => void) | null = null;
  /** A file another writer puts on disk the instant vault.create runs, which then fails as Obsidian's would. */
  raceOnCreate: { path: string; content: string } | null = null;
  /**
   * The weaker contract the launcher must not rely on: vault.create refuses only a path the index holds, and
   * otherwise writes, replacing a file that is on disk but not indexed. Off by default.
   */
  createRefusesIndexedOnly = false;
  /** Every vault.create call, recorded before any check. */
  readonly createAttempts: string[] = [];
  private readonly files = new Map<string, FakeFile>();
  private readonly folderObjects = new Map<string, FakeFolder>();
  readonly app: unknown;

  constructor(options: FakeVaultOptions = {}) {
    for (const [path, content] of Object.entries(options.notes ?? {})) this.addNote(path, content);
    for (const [path, content] of Object.entries(options.disk ?? {})) this.disk.set(path, content);
    for (const folder of options.folders ?? []) this.folders.add(folder);
    for (const folder of options.diskFolders ?? []) this.diskFolders.add(folder);
    for (const path of this.notes.keys()) this.addParents(path);
    const registered = Object.fromEntries((options.registeredCommands ?? []).map((id) => [id, { id }]));
    const vault = this.buildVault(options.configDir ?? ".obsidian");
    this.app = {
      vault,
      workspace: {
        getLeaf: (paneType: unknown) => {
          this.calls.push(`getLeaf:${String(paneType)}`);
          return {
            openFile: async (file: FakeFile) => {
              if (this.failOpen) throw new Error("the leaf could not open the file");
              this.calls.push(`openFile:${file.path}`);
            },
          };
        },
      },
      metadataCache: {
        getFirstLinkpathDest: (linkpath: string) => this.resolveLink(linkpath),
      },
      commands: {
        commands: registered,
        executeCommandById: (id: string) => {
          this.calls.push(`executeCommandById:${id}`);
          if (this.commandResult instanceof Error) throw this.commandResult;
          return this.commandResult;
        },
      },
    };
  }

  removeCommandRegistry(): void {
    delete (this.app as { commands?: unknown }).commands;
  }

  addNote(path: string, content: string): void {
    this.notes.set(path, content);
    this.addParents(path);
  }

  /** The index catching up with a file that was on disk only. */
  indexFromDisk(path: string): void {
    const content = this.disk.get(path);
    if (content === undefined) return;
    this.disk.delete(path);
    this.addNote(path, content);
  }

  fileOf(path: string): FakeFile {
    let file = this.files.get(path);
    if (!file) {
      file = new FakeFile(path, this.sizes.get(path) ?? (this.notes.get(path) ?? "").length);
      this.files.set(path, file);
    }
    return file;
  }

  private folderOf(path: string): FakeFolder {
    let folder = this.folderObjects.get(path);
    if (!folder) {
      folder = new FakeFolder(path);
      this.folderObjects.set(path, folder);
    }
    return folder;
  }

  private addParents(path: string): void {
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) this.folders.add(parts.slice(0, i).join("/"));
  }

  private resolveLink(linkpath: string): FakeFile | null {
    const wanted = linkpath.toLowerCase().replace(/\.md$/, "");
    for (const path of this.notes.keys()) {
      const bare = path.toLowerCase().replace(/\.md$/, "");
      if (bare === wanted || (!wanted.includes("/") && bare.split("/").pop() === wanted)) return this.fileOf(path);
    }
    return null;
  }

  private onDisk(path: string, sensitive: boolean): "file" | "folder" | null {
    const same = (a: string): boolean => (sensitive ? a === path : a.toLowerCase() === path.toLowerCase());
    for (const p of this.notes.keys()) if (same(p)) return "file";
    for (const p of this.disk.keys()) if (same(p)) return "file";
    for (const p of this.folders) if (same(p)) return "folder";
    for (const p of this.diskFolders) if (same(p)) return "folder";
    return null;
  }

  private buildVault(configDir: string): unknown {
    return {
      configDir,
      getName: () => "Test Vault",
      getAbstractFileByPath: (path: string) => {
        if (this.notes.has(path)) return this.fileOf(path);
        if (this.folders.has(path)) return this.folderOf(path);
        return null;
      },
      getFiles: () => [...this.notes.keys()].map((path) => this.fileOf(path)),
      getMarkdownFiles: () => [...this.notes.keys()].filter((p) => p.endsWith(".md")).map((path) => this.fileOf(path)),
      getAllLoadedFiles: () => [
        ...[...this.folders].map((path) => this.folderOf(path)),
        ...[...this.notes.keys()].map((path) => this.fileOf(path)),
      ],
      read: async (file: FakeFile) => this.notes.get(file.path) ?? "",
      cachedRead: async (file: FakeFile) => this.notes.get(file.path) ?? "",
      modify: async (file: FakeFile, data: string) => {
        this.calls.push(`modify:${file.path}`);
        this.notes.set(file.path, data);
      },
      create: async (path: string, data: string) => {
        this.createAttempts.push(path);
        if (this.raceOnCreate && this.raceOnCreate.path === path) {
          this.disk.set(path, this.raceOnCreate.content);
          this.raceOnCreate = null;
        }
        const refused = this.createRefusesIndexedOnly
          ? [...this.notes.keys()].some((p) => p.toLowerCase() === path.toLowerCase())
          : this.onDisk(path, false) !== null;
        if (refused) throw new Error("File already exists.");
        this.calls.push(`create:${path}`);
        this.disk.delete(path);
        this.addNote(path, data);
        return this.fileOf(path);
      },
      process: async (file: FakeFile, fn: (data: string) => string) => {
        this.calls.push(`process:${file.path}`);
        const next = fn(this.notes.get(file.path) ?? "");
        this.notes.set(file.path, next);
        return next;
      },
      createFolder: async (path: string) => {
        this.onCreateFolder?.(path);
        if (this.diskFolders.has(path)) throw new Error("Folder already exists.");
        this.calls.push(`createFolder:${path}`);
        this.folders.add(path);
      },
      adapter: {
        getBasePath: () => "/vaults/Test Vault",
        exists: async (path: string, sensitive?: boolean) => this.onDisk(path, sensitive === true) !== null,
        stat: async (path: string) => {
          const type = this.onDisk(path, true);
          if (!type) return null;
          const content = this.disk.get(path) ?? this.notes.get(path) ?? "";
          return { type, size: this.sizes.get(path) ?? content.length, ctime: 0, mtime: 0 };
        },
        read: async (path: string) => this.disk.get(path) ?? this.notes.get(path) ?? "",
        write: async (path: string, data: string) => {
          this.calls.push(`adapter.write:${path}`);
          this.disk.set(path, data);
        },
        process: async (path: string, fn: (data: string) => string) => {
          this.calls.push(`adapter.process:${path}`);
          const next = fn(this.disk.get(path) ?? "");
          this.disk.set(path, next);
          return next;
        },
      },
    };
  }
}

/** Obsidian's normalizePath, as far as these tests need it: one slash between segments, none at the ends, NFC. */
function normalizePath(path: string): string {
  const cleaned = path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "").normalize("NFC");
  return cleaned === "" ? "/" : cleaned;
}

/** A substring search standing in for prepareSimpleSearch: an earlier match scores higher. */
function prepareSimpleSearch(query: string): (text: string) => { score: number; matches: Array<[number, number]> } | null {
  const needle = query.toLowerCase();
  return (text: string) => {
    const at = text.toLowerCase().indexOf(needle);
    return at < 0 ? null : { score: -at, matches: [[at, at + needle.length]] };
  };
}

export const runtime = {
  normalizePath,
  prepareSimpleSearch,
  isNote: (entry: unknown): boolean => entry instanceof FakeFile,
  isFolder: (entry: unknown): boolean => entry instanceof FakeFolder,
};

export interface Harness {
  vault: FakeVault;
  audits: Array<Record<string, unknown>>;
  deps: {
    app: unknown;
    obsidian: typeof runtime;
    audit: (event: Record<string, unknown>) => void;
    version: string;
    indexWaitMs: number;
  };
}

export function harness(options: FakeVaultOptions = {}, obsidian: typeof runtime = runtime): Harness {
  const vault = new FakeVault(options);
  const audits: Array<Record<string, unknown>> = [];
  return {
    vault,
    audits,
    deps: { app: vault.app, obsidian, audit: (event) => audits.push(event), version: "0.2.0", indexWaitMs: 300 },
  };
}
