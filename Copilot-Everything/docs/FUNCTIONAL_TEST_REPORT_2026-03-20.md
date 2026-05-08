# Functional Test Report

Historical snapshot captured before the final CLI-only cutover for this workspace.

Updated: 2026-03-20

## Summary

- Checklist used: `docs/FUNCTIONAL_TEST_CHECKLIST.md`
- Final sweep run: `configs/validation/full-functional-sweep-20260320-192908/`
- Final result: `21/21` checks passed

## Final Status

| Area | Result |
|---|---|
| Core local services | PASS |
| Obsidian Local REST API | PASS |
| Ollama inventory + generation | PASS |
| Backend emulator contract + smoke | PASS |
| Direct self-host and bridge tool calls | PASS |
| Official plugin Miyo compatibility | PASS |
| Backend package tests | PASS |
| Raycast extension tests | PASS |
| Raycast MCP server tests | PASS |
| Copilot MCP repo tests | PASS |

## Issues Found And Fixed During This Run

1. The new sweep harness stopped at the first failure because `scripts/lib.sh` re-enabled `set -e` after the runner sourced it.
2. The direct MCP bridge HTTP probe was missing replay-protection headers, so the bridge rejected the request.
3. The official plugin Miyo harness still referenced `dev-vault` paths and reload behavior even though the live setup is now centered on `My Digital Garden`.
4. Three `repos/obsidian-copilot-mcp` tests were stale:
   - two still used pre-rename frontmatter keys
   - one expected the tool id instead of the tool display name in the Plus-subscription error message

## Key Artifacts

- Checklist: `docs/FUNCTIONAL_TEST_CHECKLIST.md`
- Final machine-readable sweep results: `configs/validation/full-functional-sweep-20260320-192908/results.tsv`
- Final human-readable sweep report: `configs/validation/full-functional-sweep-20260320-192908/report.md`
- Official plugin Miyo runtime output: `configs/validation/official-plugin-miyo-runtime.json`
- Official plugin Miyo console log: `configs/validation/official-plugin-miyo-console.txt`

## Notes

- The final pass validates the current production architecture, not the removed `dev-vault` user flow.
- Self-improvement entries for the harness failure and follow-on learnings were recorded in `.learnings/ERRORS.md` and `.learnings/LEARNINGS.md`.
