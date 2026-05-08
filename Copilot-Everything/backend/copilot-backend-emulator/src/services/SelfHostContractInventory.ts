export class SelfHostContractInventory {
  readonly canonicalRoutes = [
    { method: "GET", path: "/healthz" },
    { method: "POST", path: "/v1/self-host/agent-turn" },
    { method: "POST", path: "/v1/self-host/agent-turn/stream" },
    { method: "POST", path: "/v1/self-host/tool-call" },
    { method: "POST", path: "/v1/self-host/zettelkasten/serendipity" },
    { method: "POST", path: "/v1/self-host/zettelkasten/cross-domain" },
    { method: "POST", path: "/v1/self-host/zettelkasten/echo-chamber" },
    { method: "POST", path: "/v1/self-host/zettelkasten/semantic-linker" },
    { method: "POST", path: "/v1/self-host/zettelkasten/orphan-rescue" },
    { method: "POST", path: "/v1/self-host/zettelkasten/health" },
    { method: "POST", path: "/v1/self-host/zettelkasten/pipeline" },
  ] as const;

  readonly compatAliasRoutes = [
    { method: "GET", path: "/v0/health" },
    { method: "POST", path: "/v0/search" },
    { method: "POST", path: "/v0/search/related" },
    { method: "POST", path: "/v0/parse-doc" },
    { method: "POST", path: "/v0/index/upsert" },
    { method: "DELETE", path: "/v0/index/by_path" },
    { method: "POST", path: "/v0/index/clear" },
    { method: "GET", path: "/v0/index/files" },
    { method: "GET", path: "/v0/index/stats" },
    { method: "GET", path: "/v0/index/documents" },
  ] as const;

  getContractVersion(): string {
    return "v1/self-host";
  }
}
