# Trevor Robey, INC. Constitution

## Core Principles

### I. HTTPS-Only Invariant (NON-NEGOTIABLE)

**Inbound listeners.** Every TCP listener owned by code in this monorepo MUST be HTTPS. No `http.createServer` on a TCP host:port, no `OPENCLAW_BRIDGE_TLS_DISABLE`, no `tls ? https : http` ternaries, no null-on-cert-failure silent demotion. On cert-load failure: throw, refuse to listen, debug the config — never fall back to plaintext. Enforced by `scripts/lint-transport-monorepo.sh --strict`. Canonical pattern: `Copilot-Everything/scripts/miyo-tls-proxy.mjs` (`httpTransport.ts` was deleted on 2026-11-24).

**Unix-socket listeners (v2.1.0).** A listener bound to a filesystem path is not a TCP listener and carries its own rules instead. It MUST bind only inside the run directory `~/.local/state/trinc/run/` (always derived from `os.homedir()`), a directory of mode 0700 whose every level from home down is a real directory owned by the uid that group and others cannot write and that carries no ACL allow entry (a looser chain is refused, never repaired); publish its socket with mode 0600 through an exclusive `link()`; and refuse to listen, with a stable error code, rather than fall back to TCP. The three bridges (the canonical vault bridge, Command Center, Viz Studio) are the only such listeners, through one helper kept byte-identical in three files on the lint's `LEGITIMATE_NON_TCP` list; adding a file to that list requires an explicit security review. Record: `ops/security/bridges-uds-2026-11-24.md`.

**Outbound connections (v2.0.0 expansion).** Every outbound TCP connection initiated by code in this monorepo MUST also be HTTPS. When monorepo code originates a network request, the destination URL MUST start with `https://`. Plaintext-outbound is the same regression as plaintext-inbound; the rule applies symmetrically. Forbidden shapes include `http.request(`, `http.get(`, `fetch("http://…")`, `axios.get("http://…")`, `got("http://…")`, `new URL("http://…")` for outbound use, and direct references to the four wrapped plaintext upstream ports (`:8742`, `:6333`, `:1234`, `:11434`) — clients MUST route through the HTTPS proxies (`:8743`, `:6433`, `:1235`, `:11435`) instead.

**Unix-socket clients (v2.1.0).** An `http.request(` or `http.get(` whose options carry `socketPath` (on the call line or within the next ten, the lint's structural exemption) is a Unix-socket client, not a TCP connection. It is permitted only through one wrapper per client file that validates the exact path it sends (absolute, inside the run directory, the expected socket name, the directory chain and the socket's 0600 mode checked) and pins the connection with `createConnection: () => net.connect({ path })`, never with an `agent` option: Node turns an empty or undefined `socketPath` into plaintext TCP to `localhost:80`. A missing socket is a refusal (`ENOENT`), never a retry over TCP. The bridges' clients carry the byte-identical `bridges-uds client v1` block or, in the Copilot fork, `src/mcp/udsClient.ts`.

**Three sanctioned resolution paths when a third-party service only speaks plaintext.**
1. **Replace** — swap to an HTTPS-speaking alternative (preferred when one exists).
2. **Wrap** — front the service with a monorepo-local TLS proxy following the canonical pattern at `Copilot-Everything/scripts/*-tls-proxy.mjs`: single `.mjs` file, dedicated launchd unit, throws on cert-load failure, no plaintext fallback path. Existing examples: Miyo `:8743`, Qdrant `:6433`, LM Studio `:1235`, Ollama `:11435`.
3. **Time-limited carve-out** — add the service to an explicit carve-out registry with (a) name, (b) plaintext endpoint, (c) **concrete resolution deadline as a calendar date** (no carve-out without a deadline), (d) operator who owns the resolution. Mark in-source with `// lint-transport: outbound-carve-out` (or `# lint-transport: outbound-carve-out`) and document the registry entry. The lint script counts marker-suppressed lines separately for auditability.

**Carve-outs (standing).**
- **Browser automation MCP** — the Claude Browser pane (`mcp__Claude_Browser__*`) is the one permanent plaintext-loopback exception (2026-09-18); Claude in Chrome, the second browser surface (permanent since 2026-11-18), gets no plaintext exception.
- **Vendor code (flag-only).** Code under `trevor-robey-inc-agents/vendor/tooluniverse/` and `Copilot-Everything/repos/obsidian-copilot-mcp-v4/` is third-party. Modifying it creates upstream-drift; the canonical resolution for vendor-code violations is route-through-proxy or replace, NOT fork-and-patch the vendor file. The lint surfaces these as flagged but does not require in-vendor fixes.

### II. Citation Traceability as Quality Gate
Every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI. Refund-backed Citation-Audit SLA on every customer deliverable. Public Hallucination Audit v1 (open-source methodology). Zero hallucinations on customer-facing output.

### III. Research Artifacts Only; No PHI
Outputs are research artifacts — NOT validated for clinical decision support. No PHI hosted/transmitted/processed. Sources are public biomedical databases only (PubMed, ClinicalTrials.gov, ChEMBL, OpenTargets, NPI, ICD-10). Full disclaimers in `trevor-robey-inc/NOTICE.md`.

### IV. Manual-Only External Actions
No autonomous publish, post, login, or transact. Marketplace submissions, outbound emails, contract signing, financial actions all require explicit operator confirmation.

### V. Plan-First, Single-Repo, Archive Hygiene
Enter plan mode for any non-trivial task (3+ steps or architectural decisions). Single-repo invariant (2026-05-07): no sub-repos for `Claude/`, `Copilot-Everything/`, or `trevor-robey-inc-agents/` — they live here. Session artifacts go to `.archive/`, not workspace roots.

## Technology Constraints
- Node 22.13.1 (engine-strict in `trevor-robey-inc-agents/package.json`)
- CommonJS in `trevor-robey-inc-agents` (NOT ESM); TypeScript in `Copilot-Everything/bridges/` and `Claude/` plugins; Python for vendored ToolUniverse
- Restricted globals inside `openclaw-bridge/`: `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` FORBIDDEN — use injected `timeProvider`/`entropyProvider`
- mkcert TLS at `~/.local/share/mkcert/localhost.pem`, expires 2028-07-07; every Node process that dials an HTTPS listener (the TLS proxies, LLM Guard) requires `NODE_EXTRA_CA_CERTS` pointing to `~/Library/Application Support/mkcert/rootCA.pem`; a client of the bridge sockets needs no CA
- One submodule: `trevor-robey-inc-agents/vendor/tooluniverse` (mims-harvard/ToolUniverse v1.5.7, Apache-2.0). Vendor with UPSTREAM.md for everything else.

## Quality Gates
- All 906 tests in `trevor-robey-inc-agents` (Phase 35 baseline) must pass
- `bash scripts/verify-phase29-policy.sh` exits 0
- `npm run lint:transport` passes per bridge package
- `bash scripts/lint-transport-monorepo.sh --strict` exits 0 in pre-commit/CI

## Governance
This constitution does NOT supersede the `trevor-robey-inc-brand-guardian` skill (authority on canonical brand language). Constitution governs engineering; brand-guardian governs customer-facing copy. `CLAUDE.md` is current source of truth; `ARCHITECTURE.md` is Phase-35 historical reference — CLAUDE.md wins where they disagree.

### Open-Marker Semantics (added v1.1.0)

Spec Kit's stock convention uses a single `[NEEDS CLARIFICATION]` marker for any unresolved item, which conflates two materially different situations and produces false-positive blockers. This constitution distinguishes them:

- **`[NEEDS CLARIFICATION]`** — *Spec/plan ambiguity that BLOCKS implementation.* The intent is unclear, the requirement is contradictory, or a measurable outcome is missing. Engineering MUST resolve before building. Spec Kit's `/speckit-clarify` is the right tool to surface these.

- **`[DEFERRED]`** — *Explicit operator decision to leave a question open* until a separate workstream (commercial, brand, infra-phase, etc.). Engineering MAY proceed against the documented current state. Every `[DEFERRED]` bullet MUST include:
  1. **Current state** — what the de-facto behavior is right now.
  2. **Engineering implication** — what code changes are forbidden until the deferral resolves (i.e., the tripwire that prevents contributors from pre-deciding the eventual answer).

The marker split is intentional and non-blocking — `[DEFERRED]` items do NOT prevent `/speckit-implement`, `/speckit-tasks`, or any other downstream Spec Kit command. They DO populate the "Contributor Guard Rails" section of the per-feature release-readiness checklist (see `checklists/release-readiness.md`).

`[NEEDS CLARIFICATION]` and `[DEFERRED]` are the only two open-marker forms permitted in `.specify/` artifacts. Other markers (`[TODO]`, `[TKTK]`, `[???]`, bare `<placeholder>`, etc.) MUST be converted to one of these two before a spec / plan / checklist is treated as review-ready.

**Version**: 2.1.0 | **Ratified**: 2026-05-13 | **Last Amended**: 2026-11-25 (v2.1.0 — Principle I: Unix-socket listeners and Unix-socket clients sanctioned under their own rules (run directory 0700, sockets 0600, exclusive publish, refuse rather than fall back to TCP, one validated client wrapper); the three bridges left TCP and mkcert TLS (bridges-uds, `ops/security/bridges-uds-2026-11-24.md`); the CA requirement scoped to HTTPS clients; the canonical TCP pattern repointed to `miyo-tls-proxy.mjs`. v2.0.1 — browser-automation carve-out clarified: the Claude Browser pane is no longer the only browser surface; Claude in Chrome is the second, permanent since 2026-11-18, with no plaintext exception. v2.0.0 — extended Principle I scope to include outbound TCP connections; three resolution paths codified (replace / wrap / time-limited carve-out); vendor-code flagging-only carve-out documented; browser-automation carve-out preserved unchanged)
