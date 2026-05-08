import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { vi } from "vitest";

const execFileAsync = promisify(execFile);

export const Clipboard = {
  readText: async () => "Test clipboard content",
};

export const getSelectedText = () => {
  return "Test selected text";
};

function createToastHandle(input: { style?: string; title?: string; message?: string } = {}) {
  return {
    style: input.style,
    title: input.title,
    message: input.message,
  };
}

export const showToast = vi.fn(async (...args: unknown[]) => {
  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    return createToastHandle(args[0] as { style?: string; title?: string; message?: string });
  }

  return createToastHandle({
    style: typeof args[0] === "string" ? args[0] : undefined,
    title: typeof args[1] === "string" ? args[1] : undefined,
    message: typeof args[2] === "string" ? args[2] : undefined,
  });
});

export const open = vi.fn(async (target?: string) => {
  if (
    process.env.OBSIDIAN_LIVE_RAYCAST_OPEN_REAL === "1" &&
    typeof target === "string" &&
    target.startsWith("obsidian://")
  ) {
    await execFileAsync("/usr/bin/open", [target]);
  }
});

export const popToRoot = vi.fn(async () => undefined);
export const closeMainWindow = vi.fn(async () => undefined);
export const confirmAlert = vi.fn(async () => true);

export const Toast = {
  Style: {
    Success: "success",
    Failure: "failure",
    Animated: "animated",
  },
};

export const Icon = {
  ExclamationMark: "exclamation-mark",
};

export const AI = {
  ask: vi.fn(async () => "Mock Raycast AI response"),
};

class InMemoryCache {
  private readonly store = new Map<string, string>();

  constructor(_opts?: { capacity?: number }) {}

  set(key: string, value: string) {
    this.store.set(key, value);
  }

  get(key: string) {
    return this.store.get(key);
  }

  has(key: string) {
    return this.store.has(key);
  }

  remove(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

class InMemoryLocalStorage {
  private readonly store = new Map<string, string>();

  async getItem<T = string>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export const Cache = InMemoryCache as unknown as typeof InMemoryCache;
export const LocalStorage = new InMemoryLocalStorage();

export const getPreferenceValues = vi.fn().mockReturnValue({
  vaultPath: "",
  excludedFolders: "",
  configFileName: ".obsidian",
});
