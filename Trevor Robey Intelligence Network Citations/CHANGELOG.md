# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026-05-06] California LLC formation filed

- Articles of Organization filed at California Secretary of State (bizfileOnline) on 2026-05-06; receipt B20260217250; standard processing.
- Legal entity name (pending CA SOS approval, expected 2026-05-09 ± 1 day): **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company.
- Brand wordmark adopted: **"Trevor Robey, INC."** where INC = Intelligence Network Citations (a backronym, not a corporate suffix). Customer-facing materials pair the wordmark with a disclosure of the underlying LLC entity per Cal. Bus. & Prof. Code §17910.5(a). The legal name spells the words out per Cal. Corp. Code §17701.08(e) (which bars "Inc." inside LLC names).
- Filing record: [`/Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md`](../trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md).
- Domain `trevorobeyinc.com`, email `trevor@trevorobeyinc.com`, AWS Marketplace seller display name `trevor-robey-inc`, repo slug `trevor-robey-inc-agents` — all unchanged (slugs/domains aren't regulated entity names).

## [Unreleased]

### Removed — rebrand baggage cleanup (P3)

Tracked deletions:

- Stale live-LLM evidence in `audit/evidence/live-llm/` older than 30 days (9 files, all dated 2026-03-05).
- Stale MCP-live evidence in `audit/evidence/mcp-live/` older than 30 days (3 files, all dated 2026-03-05).

Untracked filesystem cleanup (not in git history):

- Auto-generated mission run logs under `workspace/missions/` (~460 files, gitignored; regenerated per workflow run).
- Backup snapshot files matching `**/*.bak.cleanup.*` (15 files, untracked).
- Top-level `node_modules/` (~17 MB, regenerable via `npm install`).
- Test-output leakage under `var/folders/` (~1.8 MB, untracked; originated from a misdirected `$TMPDIR`).

### Reset

- `state/runtime/state.json` reset to `{}` (gitignored runtime checkpoint, was 302 KB).

### Recovery anchors

- Tag `pre-rebrand-2026-04-27` on `main` is the durable rollback point for the entire rebrand effort.
- Branch `wip-snapshot-2026-04-27` preserves the pre-P3 WIP commits on the feature branch.
