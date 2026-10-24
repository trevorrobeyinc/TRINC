# docs/history

Records that are finished but worth keeping in the tree. Nothing here describes how things work
today: for that, start at the repo `README.md` and `STATUS.md`.

| Item | What it is |
|---|---|
| `THE-WHOLE-SYSTEM-2026-06-10.md` | The June 2026 "map of everything" (from the engine folder). Its §0a records how the engine was first unblocked on 2026-06-10. Replaced on 2026-10-23 by the root `HOW-IT-WORKS.md` (the story) and `ARCHITECTURE.md` (the verified technical record). |
| `TREVOR_ROBEY_INC_AGENTS_DOSSIER-2026-05.md` | The March–May 2026 handoff dossier (from the engine folder): early phase timeline, session chronology and drift matrix. Replaced by the same two docs. |
| `speckit-specs-2026-05/` | The four May 2026 speckit specs (001 engine, 002 Claude hub, 003 Copilot-Everything incl. its outbound-HTTPS audit, 004 brand). They describe the repo as it was then, under folder names that no longer exist. New business specs go in the top-level `specs/` folder that speckit creates; start numbering at 005 with `create-new-feature.sh --number 5 …`. |

Anything removed from the tree in the 2026-10 reorganization is listed in
[`../../ops/reorg/2026-10-cleanup-manifest.md`](../../ops/reorg/2026-10-cleanup-manifest.md) and
restorable with `git show pre-trinc-reorg-2026-10-23:<path>`.
