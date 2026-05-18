---
name: self-evolving
description: "Improve reusable agent workflows with reflective experiments, value checks, and local pattern memory. Use when the user wants to improve a repeated workflow, test one mutation at a time, gather evidence across comparable runs, or compound proven patterns into stable rules — without blind self-rewrites. Defers single-shot LEARNINGS / ERRORS / FEATURE_REQUESTS capture to the existing .learnings/ system documented in the user's global CLAUDE.md."
---

## When to Use

User wants the agent to improve a repeated workflow without blind self-rewrites. The skill handles local experiment logs, promotion of proven patterns, and explicit value gates before a new behavior becomes stable.

## Architecture

Memory lives in `<workspace>/.self-evolving/`. If `<workspace>/.self-evolving/` does not exist, run `setup.md`. See `memory-template.md`, `memory.md`, `experiments.md`, `evolution-loop.md`, and `boundaries.md` for the operating model.

```text
<workspace>/.self-evolving/
├── memory.md        # HOT: stable rules, guardrails, activation cues
├── experiments.md   # WARM: tentative mutations and outcomes
└── archive/         # COLD: retired patterns and old experiments
```

## Memory Path Resolution

`<workspace>` is resolved at activation time by walking up from the current working directory. The first ancestor whose basename matches a known sub-workspace wins; the monorepo root is the fallback. Self-improvement memory should land where the friction was observed, not in a single global pile.

Resolution order (deepest match wins):

1. `Claude/` — central hub
2. `Copilot-Everything/` — Obsidian integration
3. `trevor-robey-inc-agents/` — biomedical research engine
4. `trevor-robey-inc/` — brand canon
5. `TrevClaw-Obsidianodus/` — monorepo root (fallback)

Hard rules:

- Never write memory to `$HOME`, `/tmp`, or any path outside the monorepo.
- Never write memory above the monorepo root.
- If the active cwd is outside `TrevClaw-Obsidianodus/`, do not activate this skill — escalate instead.

### File-vs-cwd tiebreak

If cwd resolves to the monorepo-root fallback BUT the friction or learning was observed while operating on a file inside one of the four sub-workspaces, route the memory write to that sub-workspace's `.self-evolving/` instead of the root. Pick the sub-workspace of the file most recently read, edited, or written to in the active task. The goal is co-location of learnings with the code that produced them; a session launched at the repo root must not erase that signal.

## Coexistence with Existing Self-Improvement Systems

The user already runs two self-improvement systems documented in `~/.claude/CLAUDE.md`:

- **Global Self-Improvement System**: writes single-shot entries to `<project>/.learnings/LEARNINGS.md`, `ERRORS.md`, `FEATURE_REQUESTS.md` with structured IDs (`LRN-`, `ERR-`, `FEAT-`). Triggers: user corrections, command failures, knowledge gaps, feature requests, better approaches, external API failures. Promotion path: distill into project CLAUDE.md or memory.
- **Global skill `self-improving-agent`** at `~/.claude/skills/self-improving-agent/`: provides the entry templates and procedures for that system.

This skill's lane is narrower:

- **Owns**: the *experiment loop* — testing one mutation, gathering three comparable wins, promoting only repeated winners into `<workspace>/.self-evolving/memory.md`.
- **Does NOT own**: single-shot LRN/ERR/FEAT capture. Defer those to `.learnings/`.
- **When in doubt, prefer `.learnings/`.** Use this skill only when the user's friction maps to a deliberate-mutation experiment, not to one-time corrections or errors.

## Quick Reference

| Topic | File |
|-------|------|
| Setup guide | `setup.md` |
| Memory template | `memory-template.md` |
| Hot memory baseline | `memory.md` |
| Experiment log format | `experiments.md` |
| Evolution cycle | `evolution-loop.md` |
| Safety boundaries | `boundaries.md` |

## Requirements

- No credentials required
- No extra binaries required
- No network access required

## Core Rules

### 1. Start From Real Friction
- Evolve only after a failed attempt, repeated correction, or measurable bottleneck.
- Do not invent mutations just because a task feels interesting.

### 2. Change One Lever at a Time
- Test one prompt pattern, decision rule, retrieval step, or file habit per experiment.
- Small mutations make the winning variable obvious.

### 3. Gate by Value, Not Novelty
- Promote a pattern only when it improves speed, quality, or reliability across at least three comparable uses.
- Unproven ideas stay tentative in `experiments.md`.

### 4. Keep Local Evidence
- Record the trigger, mutation, outcome, and next action for every experiment.
- Tell the user before the first persistent write that this skill keeps concise local notes for repeat improvement.
- Promote durable rules into `memory.md` only after evidence repeats.

### 5. Prefer Promotion Over Rewrite
- Convert winners into short rules, checklists, or retrieval triggers.
- Stable systems compound by accumulation, not by starting over.

### 6. Respect Hard Boundaries
- Follow `boundaries.md` before storing data or changing behavior.
- Never modify the installed skill files, exfiltrate unrelated data, or run hidden experiments on the user.

## Common Traps

| Trap | Why It Fails | Better Move |
|------|--------------|-------------|
| Rewriting the whole workflow after one mistake | You cannot isolate what actually helped | Test one mutation and compare against the previous baseline |
| Promoting an idea after one good run | Lucky wins become noisy defaults | Wait for three comparable wins before promotion |
| Logging vague lessons like "be smarter" | Future retrieval becomes useless | Write the exact trigger, decision, and expected outcome |
| Optimizing for novelty instead of value | The system churns without compounding | Keep only behaviors that measurably save time or reduce errors |
| Learning from silence | Lack of complaint is not proof | Require explicit feedback or repeated success evidence |

## Security & Privacy

**Data that leaves your machine:**
- None by default

**Data that stays local:**
- Stable rules, guardrails, and activation notes in `<workspace>/.self-evolving/memory.md`
- Tentative experiments and outcomes in `<workspace>/.self-evolving/experiments.md`
- First-time local storage should be announced before the first write

**This skill does NOT:**
- Call external APIs
- Read or store credentials
- Modify its own installed instructions
- Read unrelated files outside the active task plus `<workspace>/.self-evolving/`

## Related Skills
Install with `clawhub install <slug>` if user confirms:
- `self-improving` — learn from corrections and compound execution quality over time
- `memory` — keep durable long-term context and retrieval patterns
- `decide` — compare options and commit to a clear next move
- `learning` — structure deliberate practice and feedback loops
- `proactivity` — follow through on next steps once a better pattern is chosen

## Feedback

- If useful: `clawhub star self-evolving`
- Stay updated: `clawhub sync`
