/**
 * Thin client for the Obsidian Local REST API community plugin.
 * Plugin: https://obsidian.md/plugins?id=obsidian-local-rest-api
 *
 * The plugin's listener uses a self-signed cert (mkcert-style) on
 * https://127.0.0.1:27124 by default. Node's default fetch rejects
 * unverified certs, so we attach an undici dispatcher that disables
 * verification — but ONLY for loopback hosts. If the user reconfigures
 * the base URL to a non-loopback host, the helper throws rather than
 * silently disabling TLS verification on a public network.
 */

import { getPreferenceValues } from "@raycast/api";
import { Agent } from "undici";

interface ExtensionPreferences {
  obsidianRestApiKey?: string;
  obsidianRestApiBaseUrl?: string;
}

const DEFAULT_BASE_URL = "https://127.0.0.1:27124";

const localhostAgent = new Agent({ connect: { rejectUnauthorized: false } });

function getRestApiConfig(): { baseUrl: string; apiKey: string } {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const baseUrl = (prefs.obsidianRestApiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const apiKey = prefs.obsidianRestApiKey ?? "";
  if (!apiKey) {
    throw new Error(
      "Obsidian Local REST API key is not set. Configure it in the Raycast extension preferences.",
    );
  }
  return { baseUrl, apiKey };
}

function isLoopback(url: string): boolean {
  const u = new URL(url);
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
}

function encodeVaultPath(path: string): string {
  return path
    .replace(/^\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

async function restApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, apiKey } = getRestApiConfig();
  if (!isLoopback(baseUrl)) {
    throw new Error(
      `restApiFetch refuses to skip TLS verification for non-loopback host: ${baseUrl}`,
    );
  }
  const fullUrl = baseUrl + path;
  const res = await fetch(fullUrl, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
    // @ts-expect-error: undici's `dispatcher` option is not in lib.dom.d.ts
    // but is supported by Node 18+'s global fetch (which Raycast uses).
    dispatcher: localhostAgent,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(
      `Obsidian REST API ${init.method ?? "GET"} ${path} → ${res.status} ${res.statusText}: ${body}`,
    );
  }
  return res;
}

export async function readNote(path: string): Promise<string> {
  const res = await restApiFetch(`/vault/${encodeVaultPath(path)}`, {
    method: "GET",
    headers: { Accept: "text/markdown" },
  });
  return res.text();
}

export async function createNote(path: string, content: string): Promise<void> {
  await restApiFetch(`/vault/${encodeVaultPath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });
}

export async function appendNote(
  path: string,
  content: string,
  opts: { heading?: string; prepend?: boolean } = {},
): Promise<void> {
  if (opts.heading) {
    await restApiFetch(`/vault/${encodeVaultPath(path)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "text/markdown",
        Operation: opts.prepend ? "prepend" : "append",
        "Target-Type": "heading",
        Target: encodeURIComponent(opts.heading),
      },
      body: content,
    });
    return;
  }
  await restApiFetch(`/vault/${encodeVaultPath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });
}

export async function appendDailyNote(
  content: string,
  opts: { heading?: string; prepend?: boolean } = {},
): Promise<void> {
  // Ensure today's daily note exists before appending. The `daily-notes` command
  // (from Obsidian's core Daily Notes plugin) opens today's daily note, auto-creating
  // it if missing. REST API's POST/PATCH /periodic/daily/ requires the note to exist;
  // without this step the helper would 404 with errorCode 40461 on the first call
  // each day. The executeCommand call is a no-op if the note already exists.
  try {
    await executeCommand("daily-notes");
  } catch {
    // Non-fatal — proceed to the append and surface the real error if the note
    // truly cannot be created (e.g., Daily Notes plugin disabled).
  }

  if (opts.heading) {
    await restApiFetch(`/periodic/daily/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "text/markdown",
        Operation: opts.prepend ? "prepend" : "append",
        "Target-Type": "heading",
        Target: encodeURIComponent(opts.heading),
      },
      body: content,
    });
    return;
  }
  await restApiFetch(`/periodic/daily/`, {
    method: "POST",
    headers: { "Content-Type": "text/markdown" },
    body: content,
  });
}

export async function searchSimple(query: string): Promise<unknown> {
  const res = await restApiFetch(`/search/simple/?query=${encodeURIComponent(query)}`, {
    method: "POST",
  });
  return res.json();
}

export async function executeCommand(commandId: string): Promise<void> {
  await restApiFetch(`/commands/${encodeURIComponent(commandId)}/`, { method: "POST" });
}

export async function openFile(path: string, newLeaf = false): Promise<void> {
  const qs = newLeaf ? "?newLeaf=true" : "";
  await restApiFetch(`/open/${encodeVaultPath(path)}${qs}`, { method: "POST" });
}
