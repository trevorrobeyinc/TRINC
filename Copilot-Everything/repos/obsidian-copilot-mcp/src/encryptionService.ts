import { type CopilotSettings } from "@/settings/model";
import type { McpServerConfig } from "@/mcp/types";
import { Buffer } from "buffer";
import { Platform } from "obsidian";

// @ts-ignore
let safeStorageInternal: Electron.SafeStorage | null = null;

function getSafeStorage() {
  if (Platform.isDesktop && safeStorageInternal) {
    return safeStorageInternal;
  }
  // Dynamically import electron to access safeStorage
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  safeStorageInternal = require("electron")?.remote?.safeStorage;
  return safeStorageInternal;
}

// Add new prefixes to distinguish encryption methods
const DESKTOP_PREFIX = "enc_desk_";
const WEBCRYPTO_PREFIX = "enc_web_";
// Keep old prefix for backward compatibility
const ENCRYPTION_PREFIX = "enc_";
const DECRYPTION_PREFIX = "dec_";
const DECRYPTION_FAILURE_MESSAGE = "Copilot failed to decrypt API keys!";

// Add these constants for the Web Crypto implementation
const ENCRYPTION_KEY = new TextEncoder().encode("obsidian-copilot-v1");
const ALGORITHM = { name: "AES-GCM", iv: new Uint8Array(12) };

async function getEncryptionKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", ENCRYPTION_KEY, ALGORITHM.name, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptAllKeys(
  settings: Readonly<CopilotSettings>
): Promise<Readonly<CopilotSettings>> {
  if (!settings.enableEncryption) {
    return settings;
  }
  const newSettings = { ...settings };
  const keysToEncrypt = Object.keys(settings).filter(
    (key) =>
      key.toLowerCase().includes("apikey") ||
      key === "plusLicenseKey" ||
      key === "githubCopilotAccessToken" ||
      key === "githubCopilotToken"
  );

  for (const key of keysToEncrypt) {
    const apiKey = settings[key as keyof CopilotSettings] as string;
    (newSettings[key as keyof CopilotSettings] as any) = await getEncryptedKey(apiKey);
  }

  if (Array.isArray(settings.activeModels)) {
    newSettings.activeModels = await Promise.all(
      settings.activeModels.map(async (model) => ({
        ...model,
        apiKey: await getEncryptedKey(model.apiKey || ""),
      }))
    );
  }

  if (Array.isArray(settings.activeEmbeddingModels)) {
    newSettings.activeEmbeddingModels = await Promise.all(
      settings.activeEmbeddingModels.map(async (model) => ({
        ...model,
        apiKey: await getEncryptedKey(model.apiKey || ""),
      }))
    );
  }

  if (settings.selfHostAdapter) {
    newSettings.selfHostAdapter = {
      ...settings.selfHostAdapter,
      apiKey: await getEncryptedKey(settings.selfHostAdapter.apiKey || ""),
    };
  }

  if (settings.mcp) {
    newSettings.mcp = {
      ...settings.mcp,
      servers: Array.isArray(settings.mcp.servers)
        ? await Promise.all(settings.mcp.servers.map((server) => encryptMcpServer(server)))
        : settings.mcp.servers,
    };
  }

  return newSettings;
}

export async function decryptStoredSettings(
  settings: Readonly<CopilotSettings>
): Promise<Readonly<CopilotSettings>> {
  const newSettings = { ...settings };
  const keysToDecrypt = Object.keys(settings).filter(
    (key) =>
      key.toLowerCase().includes("apikey") ||
      key === "plusLicenseKey" ||
      key === "githubCopilotAccessToken" ||
      key === "githubCopilotToken"
  );

  for (const key of keysToDecrypt) {
    const apiKey = settings[key as keyof CopilotSettings] as string;
    (newSettings[key as keyof CopilotSettings] as any) = await getBestEffortDecryptedValue(apiKey);
  }

  if (Array.isArray(settings.activeModels)) {
    newSettings.activeModels = await Promise.all(
      settings.activeModels.map(async (model) => ({
        ...model,
        apiKey: await getBestEffortDecryptedValue(model.apiKey || ""),
      }))
    );
  }

  if (Array.isArray(settings.activeEmbeddingModels)) {
    newSettings.activeEmbeddingModels = await Promise.all(
      settings.activeEmbeddingModels.map(async (model) => ({
        ...model,
        apiKey: await getBestEffortDecryptedValue(model.apiKey || ""),
      }))
    );
  }

  if (settings.selfHostAdapter) {
    newSettings.selfHostAdapter = {
      ...settings.selfHostAdapter,
      apiKey: await getBestEffortDecryptedValue(settings.selfHostAdapter.apiKey || ""),
    };
  }

  if (settings.mcp) {
    newSettings.mcp = {
      ...settings.mcp,
      servers: Array.isArray(settings.mcp.servers)
        ? await Promise.all(settings.mcp.servers.map((server) => decryptMcpServer(server)))
        : settings.mcp.servers,
    };
  }

  return newSettings;
}

export async function getEncryptedKey(apiKey: string): Promise<string> {
  if (!apiKey || apiKey.startsWith(ENCRYPTION_PREFIX)) {
    return apiKey;
  }

  if (isDecrypted(apiKey)) {
    apiKey = apiKey.replace(DECRYPTION_PREFIX, "");
  }

  try {
    // Try desktop encryption first
    if (getSafeStorage()?.isEncryptionAvailable()) {
      const encryptedBuffer = getSafeStorage().encryptString(apiKey) as Buffer;
      return DESKTOP_PREFIX + encryptedBuffer.toString("base64");
    }

    // Fallback to Web Crypto API
    const key = await getEncryptionKey();
    const encodedData = new TextEncoder().encode(apiKey);
    const encryptedData = await crypto.subtle.encrypt(ALGORITHM, key, encodedData);
    return WEBCRYPTO_PREFIX + arrayBufferToBase64(encryptedData);
  } catch (error) {
    console.error("Encryption failed:", error);
    return apiKey;
  }
}

export async function getDecryptedKey(apiKey: string): Promise<string> {
  if (!apiKey || isPlainText(apiKey)) {
    return apiKey;
  }
  if (isDecrypted(apiKey)) {
    return apiKey.replace(DECRYPTION_PREFIX, "");
  }

  // Handle different encryption methods
  if (apiKey.startsWith(DESKTOP_PREFIX)) {
    const base64Data = apiKey.replace(DESKTOP_PREFIX, "");
    const buffer = Buffer.from(base64Data, "base64");
    return getSafeStorage().decryptString(buffer) as string;
  }

  if (apiKey.startsWith(WEBCRYPTO_PREFIX)) {
    const base64Data = apiKey.replace(WEBCRYPTO_PREFIX, "");
    const key = await getEncryptionKey();
    const encryptedData = base64ToArrayBuffer(base64Data);
    const decryptedData = await crypto.subtle.decrypt(ALGORITHM, key, encryptedData);
    return new TextDecoder().decode(decryptedData);
  }

  // Legacy support for old enc_ prefix
  const base64Data = apiKey.replace(ENCRYPTION_PREFIX, "");
  try {
    // Try desktop decryption first
    if (getSafeStorage()?.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(base64Data, "base64");
        return getSafeStorage().decryptString(buffer) as string;
      } catch {
        // Silent catch is intentional - if desktop decryption fails,
        // it means this key was likely encrypted with Web Crypto.
        // We'll fall through to the Web Crypto decryption below.
      }
    }

    // Fallback to Web Crypto API
    const key = await getEncryptionKey();
    const encryptedData = base64ToArrayBuffer(base64Data);
    const decryptedData = await crypto.subtle.decrypt(ALGORITHM, key, encryptedData);
    return new TextDecoder().decode(decryptedData);
  } catch (err) {
    console.error("Decryption failed:", err);
    return DECRYPTION_FAILURE_MESSAGE;
  }
}

async function getBestEffortDecryptedValue(value: string): Promise<string> {
  if (!value) {
    return value;
  }

  const decrypted = await getDecryptedKey(value);
  return decrypted === DECRYPTION_FAILURE_MESSAGE ? value : decrypted;
}

async function encryptMcpServer(server: McpServerConfig): Promise<McpServerConfig> {
  return {
    ...server,
    id: await getEncryptedKey(server.id || ""),
    displayName: await getEncryptedKey(server.displayName || ""),
    transport: (await getEncryptedKey(server.transport || "")) as McpServerConfig["transport"],
    httpEndpoint: await getEncryptedKey(server.httpEndpoint || ""),
    authToken: await getEncryptedKey(server.authToken || ""),
    vaultName: await getEncryptedKey(server.vaultName || ""),
    vaultRoot: await getEncryptedKey(server.vaultRoot || ""),
    backendHint: server.backendHint
      ? ((await getEncryptedKey(server.backendHint)) as McpServerConfig["backendHint"])
      : server.backendHint,
    enabledToolNames: await Promise.all(
      (server.enabledToolNames || []).map(async (toolName) => await getEncryptedKey(toolName))
    ),
  };
}

async function decryptMcpServer(server: McpServerConfig): Promise<McpServerConfig> {
  return {
    ...server,
    id: await getBestEffortDecryptedValue(server.id || ""),
    displayName: await getBestEffortDecryptedValue(server.displayName || ""),
    transport: (await getBestEffortDecryptedValue(
      server.transport || ""
    )) as McpServerConfig["transport"],
    httpEndpoint: await getBestEffortDecryptedValue(server.httpEndpoint || ""),
    authToken: await getBestEffortDecryptedValue(server.authToken || ""),
    vaultName: await getBestEffortDecryptedValue(server.vaultName || ""),
    vaultRoot: await getBestEffortDecryptedValue(server.vaultRoot || ""),
    backendHint: server.backendHint
      ? ((await getBestEffortDecryptedValue(server.backendHint)) as McpServerConfig["backendHint"])
      : server.backendHint,
    enabledToolNames: await Promise.all(
      (server.enabledToolNames || []).map(
        async (toolName) => await getBestEffortDecryptedValue(toolName)
      )
    ),
  };
}

function isPlainText(key: string): boolean {
  return !key.startsWith(ENCRYPTION_PREFIX) && !key.startsWith(DECRYPTION_PREFIX);
}

function isDecrypted(keyBuffer: string): boolean {
  return keyBuffer.startsWith(DECRYPTION_PREFIX);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
