import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Direct unit coverage for the Local REST API transport (src/utils/restApiClient.ts).
 *
 * restApiClient keeps two module-level caches (cachedDiscoveredKey, cachedLocalhostAgent),
 * so every test loads a FRESH module instance via vi.resetModules() + dynamic import.
 * The vi.hoisted() mocks below survive those reloads: the vi.mock factories re-run per
 * module generation but keep returning the same fn references, so per-test setup and
 * assertions stay valid across generations. No real sockets: global fetch is stubbed and
 * the undici agent factory is mocked to a sentinel.
 */
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  getVaults: vi.fn(),
  createLoopbackTlsAgent: vi.fn(),
}));

// restApiClient does `import fs from "node:fs"` — the factory must provide a default export.
vi.mock("node:fs", () => ({
  default: { existsSync: mocks.existsSync, readFileSync: mocks.readFileSync },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

vi.mock("@/obsidian/internal/obsidian", () => ({
  getVaultsFromPreferencesOrObsidianJson: mocks.getVaults,
}));

vi.mock("@/utils/loopbackTlsAgent", () => ({
  createLoopbackTlsAgent: mocks.createLoopbackTlsAgent,
}));

type RestApiClient = typeof import("@/utils/restApiClient");

const VAULT = { name: "Test Vault", key: "/fake/vault", path: "/fake/vault" };
const DATA_JSON_PATH = "/fake/vault/.obsidian/plugins/obsidian-local-rest-api/data.json";
const PINNED_CERT = "-----BEGIN CERTIFICATE-----\nfake-pinned-listener-cert\n-----END CERTIFICATE-----";
const FAKE_AGENT = { kind: "loopback-tls-agent" };

function okResponse(body = ""): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

function errorResponse(status: number, statusText: string, body: string): Response {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

describe("restApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** data.json exists for the fake vault and carries the given key (and optionally a pinned cert). */
  function primeDataJson(apiKey: string, cert?: string) {
    mocks.existsSync.mockImplementation((candidate: string) => candidate === DATA_JSON_PATH);
    mocks.readFileSync.mockReturnValue(JSON.stringify({ apiKey, ...(cert ? { crypto: { cert } } : {}) }));
  }

  /** Fresh module instance per test so the module-level caches never leak between tests. */
  async function loadClient(prefs: Record<string, string> = {}): Promise<RestApiClient> {
    vi.resetModules();
    const { getPreferenceValues } = await import("@raycast/api");
    vi.mocked(getPreferenceValues).mockReturnValue(prefs);
    return import("@/utils/restApiClient");
  }

  function fetchCallAt(index: number): { url: string; init: RequestInit & { dispatcher?: unknown } } {
    const call = fetchMock.mock.calls[index];
    return { url: call[0] as string, init: call[1] as RequestInit & { dispatcher?: unknown } };
  }

  function headersAt(index: number): Record<string, string> {
    return fetchCallAt(index).init.headers as Record<string, string>;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getVaults.mockResolvedValue([VAULT]);
    mocks.existsSync.mockReturnValue(false); // no data.json anywhere unless a test primes one
    mocks.readFileSync.mockReturnValue("{}");
    mocks.createLoopbackTlsAgent.mockReturnValue(FAKE_AGENT);
    fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("URL construction and encoding", () => {
    it("encodes the command id into POST /commands/{id}/ and dials through the loopback agent", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });

      await client.executeCommand("copilot:summarize-to-note");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, init } = fetchCallAt(0);
      expect(url).toBe("https://127.0.0.1:27124/commands/copilot%3Asummarize-to-note/");
      expect(init.method).toBe("POST");
      expect(init.dispatcher).toBe(FAKE_AGENT);
    });

    it("segment-encodes note paths, preserving folder separators", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });
      fetchMock.mockResolvedValue(okResponse("# Test"));

      const content = await client.readNote("Inbox/Q&A #1.md");

      expect(content).toBe("# Test");
      const { url, init } = fetchCallAt(0);
      expect(url).toBe("https://127.0.0.1:27124/vault/Inbox/Q%26A%20%231.md");
      expect(init.method).toBe("GET");
      expect(headersAt(0).Accept).toBe("text/markdown");
    });

    it("strips a leading slash instead of producing an empty path segment", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });

      await client.createNote("/Top Level.md", "hello");

      const { url, init } = fetchCallAt(0);
      expect(url).toBe("https://127.0.0.1:27124/vault/Top%20Level.md");
      expect(init.method).toBe("PUT");
      expect(init.body).toBe("hello");
      expect(headersAt(0)["Content-Type"]).toBe("text/markdown");
    });

    it("PATCHes heading-scoped appends with an encoded Target header", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });

      await client.appendNote("Log.md", "entry", { heading: "My Heading #2", prepend: true });

      const { url, init } = fetchCallAt(0);
      expect(url).toBe("https://127.0.0.1:27124/vault/Log.md");
      expect(init.method).toBe("PATCH");
      const headers = headersAt(0);
      expect(headers.Operation).toBe("prepend");
      expect(headers["Target-Type"]).toBe("heading");
      expect(headers.Target).toBe("My%20Heading%20%232");
    });

    it("appendDailyNote still posts to /periodic/daily/ when the daily-notes bootstrap command fails", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });
      // The bootstrap dispatch 404s (e.g. Daily Notes plugin disabled) — non-fatal by design.
      fetchMock.mockResolvedValueOnce(errorResponse(404, "Not Found", "Command was not found"));

      await client.appendDailyNote("today's entry");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchCallAt(0).url).toBe("https://127.0.0.1:27124/commands/daily-notes/");
      const { url, init } = fetchCallAt(1);
      expect(url).toBe("https://127.0.0.1:27124/periodic/daily/");
      expect(init.method).toBe("POST");
      expect(init.body).toBe("today's entry");
    });
  });

  describe("Authorization header and key discovery", () => {
    it("discovers the key from the plugin's data.json (trimmed) and pins its listener cert", async () => {
      primeDataJson("  discovered-key  ", PINNED_CERT);
      const client = await loadClient();

      await client.executeCommand("noop");

      expect(mocks.existsSync).toHaveBeenCalledWith(DATA_JSON_PATH);
      expect(headersAt(0).Authorization).toBe("Bearer discovered-key");
      // The same data.json's crypto.cert is pinned into the TLS agent.
      expect(mocks.createLoopbackTlsAgent).toHaveBeenCalledWith([PINNED_CERT]);
    });

    it("prefers the live discovered key over a stale preference key", async () => {
      primeDataJson("live-key");
      const client = await loadClient({ obsidianRestApiKey: "stale-pref-key" });

      await client.executeCommand("noop");

      expect(headersAt(0).Authorization).toBe("Bearer live-key");
    });

    it("falls back to the trimmed preference key when no data.json is found", async () => {
      const client = await loadClient({ obsidianRestApiKey: "  pref-key  " });

      await client.executeCommand("noop");

      expect(headersAt(0).Authorization).toBe("Bearer pref-key");
    });

    it("throws the configuration error without dialing when no key is available anywhere", async () => {
      const client = await loadClient();

      await expect(client.executeCommand("noop")).rejects.toThrow("Obsidian Local REST API key is not set");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("caches key discovery and the TLS agent across calls within one module instance", async () => {
      primeDataJson("discovered-key", PINNED_CERT);
      const client = await loadClient();

      await client.executeCommand("first");
      mocks.existsSync.mockClear();
      mocks.readFileSync.mockClear();
      mocks.createLoopbackTlsAgent.mockClear();
      await client.executeCommand("second");

      expect(mocks.existsSync).not.toHaveBeenCalled();
      expect(mocks.readFileSync).not.toHaveBeenCalled();
      expect(mocks.createLoopbackTlsAgent).not.toHaveBeenCalled();
      expect(headersAt(1).Authorization).toBe("Bearer discovered-key");
    });
  });

  describe("HTTP error responses", () => {
    it("throws with method, path, status and body — and does not retry", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });
      fetchMock.mockResolvedValue(errorResponse(404, "Not Found", "Command was not found"));

      await expect(client.executeCommand("nope")).rejects.toThrow(
        "Obsidian REST API POST /commands/nope/ → 404 Not Found: Command was not found"
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("transient connection failures", () => {
    it("retries up to 4 attempts, then throws the last error", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        fetchMock.mockRejectedValueOnce(new Error(`ECONNREFUSED (attempt ${attempt})`));
      }
      vi.useFakeTimers();

      const pending = client.executeCommand("noop");
      const assertion = expect(pending).rejects.toThrow("ECONNREFUSED (attempt 4)");
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("succeeds when a later attempt recovers", async () => {
      const client = await loadClient({ obsidianRestApiKey: "pref-key" });
      fetchMock
        .mockRejectedValueOnce(new Error("ECONNREFUSED (attempt 1)"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED (attempt 2)"));
      vi.useFakeTimers();

      const pending = client.executeCommand("noop");
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("base URL guard", () => {
    it("refuses a non-loopback base URL before creating an agent or dialing", async () => {
      const client = await loadClient({
        obsidianRestApiKey: "pref-key",
        obsidianRestApiBaseUrl: "https://192.168.4.20:27124",
      });

      await expect(client.executeCommand("noop")).rejects.toThrow(
        "refuses to skip TLS verification for non-loopback host"
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.createLoopbackTlsAgent).not.toHaveBeenCalled();
    });

    it("accepts localhost and strips a trailing slash from the base URL", async () => {
      const client = await loadClient({
        obsidianRestApiKey: "pref-key",
        obsidianRestApiBaseUrl: "https://localhost:27124/",
      });

      await client.executeCommand("ping");

      expect(fetchCallAt(0).url).toBe("https://localhost:27124/commands/ping/");
    });
  });
});
