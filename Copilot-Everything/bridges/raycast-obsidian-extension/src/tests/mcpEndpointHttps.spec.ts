import { describe, expect, it, vi, afterEach } from "vitest";
import { getPreferenceValues } from "@raycast/api";
import { MCPClient } from "@/api/mcp/mcpClient.service";
import { RaycastObsidianMcpClient } from "@/api/mcp/raycastObsidianMcp";
import { requireHttpsEndpoint } from "@/utils/loopbackTlsAgent";

describe("HTTPS-only MCP lane", () => {
  afterEach(() => {
    vi.mocked(getPreferenceValues).mockReturnValue({
      vaultPath: "",
      excludedFolders: "",
      configFileName: ".obsidian",
    });
  });

  describe("requireHttpsEndpoint", () => {
    it("returns an https endpoint unchanged", () => {
      expect(requireHttpsEndpoint("https://127.0.0.1:8798", "test")).toBe("https://127.0.0.1:8798");
    });

    it("throws on a plaintext http endpoint", () => {
      expect(() => requireHttpsEndpoint("http://127.0.0.1:8798", "test")).toThrow(/not HTTPS/);
    });

    it("throws on a non-URL endpoint", () => {
      expect(() => requireHttpsEndpoint("not a url", "test")).toThrow(/not a valid URL/);
    });
  });

  describe("MCPClient", () => {
    it("rejects an explicit plaintext endpoint on the TCP transport", () => {
      vi.mocked(getPreferenceValues).mockReturnValue({
        mcpTransport: "http",
        mcpHttpEndpoint: "http://127.0.0.1:8798",
      });
      expect(() => new MCPClient()).toThrow(/not HTTPS/);
    });

    it("resolves an https endpoint by default", () => {
      vi.mocked(getPreferenceValues).mockReturnValue({});
      const client = new MCPClient();
      expect((client as unknown as { endpoint: string }).endpoint.startsWith("https://")).toBe(true);
    });

    it("does not gate socket transports on the unused TCP endpoint", () => {
      vi.mocked(getPreferenceValues).mockReturnValue({
        mcpTransport: "uds",
        mcpHttpEndpoint: "http://never-dialed.invalid",
      });
      expect(() => new MCPClient()).not.toThrow();
    });
  });

  describe("RaycastObsidianMcpClient", () => {
    it("rejects an explicit plaintext endpoint", () => {
      vi.mocked(getPreferenceValues).mockReturnValue({
        raycastObsidianMcpEndpoint: "http://127.0.0.1:8798",
        raycastObsidianMcpAuthToken: "t",
      });
      expect(() => new RaycastObsidianMcpClient()).toThrow(/not HTTPS/);
    });

    it("accepts an https endpoint", () => {
      vi.mocked(getPreferenceValues).mockReturnValue({
        raycastObsidianMcpEndpoint: "https://127.0.0.1:8798",
        raycastObsidianMcpAuthToken: "t",
      });
      const client = new RaycastObsidianMcpClient();
      expect((client as unknown as { endpoint: string }).endpoint).toBe("https://127.0.0.1:8798");
    });
  });
});
