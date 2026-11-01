# Dependency Review

Lockfile-Review: approved
Reviewer: Trevor Robey (operator)
Review-Date: 2026-11-01
Risk-Assessment: low

Cache-Rebuild-Reason: zod 3.24.1 -> 4.6.7 (GHSA-mrhx-c7xc-m3w5, high; no 3.x fix)

## Notes
- Node version pinned to `v22.13.1` via `.nvmrc`.
- Registry pinned to `https://registry.npmjs.org/` via `.npmrc`.
- Install policy requires `npm ci --offline --ignore-scripts`.
- Lifecycle hooks are prohibited and validated by CI.
- Added `zod@3.24.1` for strict MCP input/output schema enforcement.
- **2026-11-01: `zod` 3.24.1 → 4.6.7** (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained collections, high; no 3.x fix). Approved by the operator, Trevor Robey, who asked to be named as reviewer; applied by Claude Code in a cloud session. The schemas were made version-neutral first (`CHANGELOG.md` 2026-11-01). The LOCKED cache was rebuilt from the new lockfile with scripts off. It again holds exactly one `content-v2` blob, the zod 4.6.7 tarball, whose sha512 equals the lockfile's integrity, plus its `index-v5` entry. `security/known-good-dependencies.json` was regenerated from the SBOM generator. Checks: `npm test`, `verify-lockfile-review.sh`, `verify-npm-cache-checksum.sh`, `verify-dependency-integrity.js` and `verify-phase12-policy.sh` (record: `ops/security/dependency-audit-2026-10.md`, "2026-11-01 follow-up").
- **Cache-integrity manifest is content-addressed only (re-baselined 2026-07-17).** `security/npm-cache.lock.json` pins ONLY the `content-v2/` blobs — a blob's path IS its content sha512, so it is self-verifying and byte-reproducible from the pinned lockfile. The `index-v5` cache index embeds install-time timestamps (not reproducibly verifiable) and is kept for offline install but EXCLUDED from integrity verification. The prior manifest pinned 155 orphaned predecessor-repo blobs (imported wholesale at the 2026-05-19 flat-merge and never reconciled); the actual dependency set is `zod` alone. Regenerate with `scripts/generate-npm-cache-lock.sh`; verify with `scripts/verify-npm-cache-checksum.sh`.
