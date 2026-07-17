# Dependency Review

Lockfile-Review: approved
Reviewer: security-team-initial
Review-Date: 2026-03-03
Risk-Assessment: low

Cache-Rebuild-Reason: phase3 zod dependency addition for strict MCP schemas

## Notes
- Node version pinned to `v22.13.1` via `.nvmrc`.
- Registry pinned to `https://registry.npmjs.org/` via `.npmrc`.
- Install policy requires `npm ci --offline --ignore-scripts`.
- Lifecycle hooks are prohibited and validated by CI.
- Added `zod@3.24.1` for strict MCP input/output schema enforcement.
- **Cache-integrity manifest is content-addressed only (re-baselined 2026-07-17).** `security/npm-cache.lock.json` pins ONLY the `content-v2/` blobs — a blob's path IS its content sha512, so it is self-verifying and byte-reproducible from the pinned lockfile. The `index-v5` cache index embeds install-time timestamps (not reproducibly verifiable) and is kept for offline install but EXCLUDED from integrity verification. The prior manifest pinned 155 orphaned predecessor-repo blobs (imported wholesale at the 2026-05-19 flat-merge and never reconciled); the actual dependency set is `zod` alone. Regenerate with `scripts/generate-npm-cache-lock.sh`; verify with `scripts/verify-npm-cache-checksum.sh`.
