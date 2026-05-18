# Vendor Notes — Self-Evolving (ivangdavila)

## Source

- Marketplace page: https://clawhub.ai/ivangdavila/self-evolving
- Canonical API: `https://clawhub.ai/api/v1/skills/self-evolving/file?path=<name>`
- Upstream version: 1.0.0 (per SKILL.md frontmatter)
- Vendored: 2026-05-08

## Provenance

Files were fetched directly from the ClawHub `/api/v1/skills/<slug>/file?path=<path>` endpoint that the SkillDetailPage SPA uses internally. Each was placed in /tmp first, read, audited, then copied here byte-for-byte.

| File | Bytes | HTTP |
|------|-------|------|
| SKILL.md | 4633 | 200 |
| setup.md | 2141 | 200 |
| memory-template.md | 1250 | 200 |
| memory.md | 350 | 200 |
| experiments.md | 949 | 200 |
| evolution-loop.md | 851 | 200 |
| boundaries.md | 794 | 200 |

## Audit Findings (static review)

- **No executable content.** All seven files are markdown prose; no shell, JS, Python, or eval-able content.
- **No foreign URLs in bundle bodies.** Only the `homepage` frontmatter field in SKILL.md references `https://clawic.com/skills/self-evolving` — `clawic.com` is typosquat-shaped vs `clawhub.ai`. Passive metadata only; not auto-fetched. Worth a sniff-test before trusting that domain.
- **No credential reads, no API calls, no network.** Bundle is consistent with its own claim of "no external APIs."
- **boundaries.md** explicitly forbids modifying installed skill files, reading unrelated secrets, expanding mutations beyond one lever, and treating silence as success — closely aligned with the user's existing Auto Mode Boundaries.
- **Scope mismatch worth flagging.** The skill's runtime memory location is `~/self-evolving/` (in $HOME), not project-local. If activated, writes would land outside this monorepo. Vendoring here does not fix that — only the runtime activation choice does.

## What was NOT done

- No `clawhub` CLI installed.
- No `openclaw` CLI installed.
- No `~/self-evolving/` directory created.
- No global skill registered in `~/.claude/skills/`.
- No edits to project `CLAUDE.md`, `MEMORY.md`, or any settings file.
- No git changes; no commits.

## Open Decisions

1. **Activation.** Files are at `<project>/.claude/skills/self-evolving/`. Whether Claude Code auto-discovers project-scope skills here depends on harness behavior; if you do NOT want this skill auto-loaded, move the bundle to a non-discovery path (e.g., `vendor/clawhub-skills/self-evolving/`).
2. **Runtime memory scope.** If you decide to activate, override the documented `~/self-evolving/` path so memory writes stay inside the project (e.g., `<project>/.self-evolving/`). This requires either editing the vendored copies or a wrapper.
3. **CLI vetting.** Defer until you decide to install the `clawhub` CLI; the canonical install path was not verified in this session.
4. **Overlap with existing self-improving system.** The global `~/.claude/CLAUDE.md` Self-Improvement System and `~/.claude/skills/self-improving-agent/` already cover most of this skill's surface. Activating both could produce conflicting "promote a rule after N wins" thresholds.

## Re-fetch / refresh

```
for f in SKILL.md setup.md memory-template.md memory.md experiments.md evolution-loop.md boundaries.md; do
  curl -sSL "https://clawhub.ai/api/v1/skills/self-evolving/file?path=${f}" -o "${f}"
done
```

- `curl -sSL "https://clawhub.ai/api/v1/skills/self-evolving/file?path=<name>" -o "<name>"` — fetch a single file from the canonical API.
- The loop above re-pulls all seven bundle files into the current directory.

## Local edits applied (2026-05-08)

Two authorized changes to the upstream bundle:

1. **Typosquat removed.** Deleted the `homepage: https://clawic.com/skills/self-evolving` line from `SKILL.md` frontmatter. `clawic.com` is typosquat-shaped vs `clawhub.ai`; passive metadata is still a defense-in-depth concern.
2. **Memory path made workspace-routed.** All references to `~/self-evolving/` (the original $HOME path) replaced with `<workspace>/.self-evolving/`. A new "Memory Path Resolution" section in `SKILL.md` defines `<workspace>` as the deepest ancestor of the active cwd matching one of `Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`, `trevor-robey-inc/`, or — fallback — the monorepo root `TrevClaw-Obsidianodus/`. Hard rule: never write outside the monorepo. Skills activated with cwd outside the monorepo must escalate, not write.

Rationale: keeping memory project-global (never in `$HOME`) AND routed to whichever sub-workspace observed the friction. Self-improvement memory does its job best when learnings live next to the code they describe.

### sha256 diff vs upstream

| File | Upstream sha256 | After edits |
|------|-----------------|-------------|
| SKILL.md | `d8d226ab5845111d0666613baab0d369167ec916db08a94f2037e0349671763b` | `45793f5b21d337b210f57fbf1f28cfadf05899182818b19eb7a009525659cc21` |
| setup.md | `9b4e431c1133b38f7726983e22325eac784cdff0bde033b86abe66bb0b927949` | `74c65b1479b00d7ecfd2700057d8b94e656871e12cc3787e14cd9f1b6e5b5238` |
| memory-template.md | `e4dcb1e1a530c79f748a9ac455597874551aa5ecc154c029459ffbdd9a9a1443` | `1b1e85ebf3af3a7775bf567ccb92cb5372a93126031339a4bec445014eb5eb1a` |
| memory.md | `b2f6ed52f885f75c00485048b5dfa9874b7101e93183a3c2d3788d0968dc90e3` | `b2f6ed52f885f75c00485048b5dfa9874b7101e93183a3c2d3788d0968dc90e3` (unchanged) |
| experiments.md | `6077e66c8323256aa61bf302134118a11e119a33687f29234bfc30d8e30a060c` | `d83ff89c7e2825ca13a2098c04529a367034574e6be398fbc02786ef774370e1` |
| evolution-loop.md | `dd7d1bade587f0b59d23f215d3d809b427aab4119d4325d314632360637def87` | `dd7d1bade587f0b59d23f215d3d809b427aab4119d4325d314632360637def87` (unchanged) |
| boundaries.md | `485d77a04bfedfdb00694f025e42f8afedfad692b02649420db308cd3442adef` | `78d623c141153741b1b34aa0671f373341b6945f2bda4ac666c33eab71772f36` |

### Diff against a fresh upstream pull

```
mkdir -p /tmp/se-upstream && cd /tmp/se-upstream && for f in SKILL.md setup.md memory-template.md memory.md experiments.md evolution-loop.md boundaries.md; do curl -sSL "https://clawhub.ai/api/v1/skills/self-evolving/file?path=${f}" -o "${f}"; done && for f in SKILL.md setup.md memory-template.md memory.md experiments.md evolution-loop.md boundaries.md; do echo "=== $f ==="; diff -u "$f" "/Users/trevorrobey/TrevClaw-Obsidianodus/.claude/skills/self-evolving/$f"; done
```

- The loop fetches each upstream file fresh into `/tmp/se-upstream/` and `diff -u` against the local copy. memory.md and evolution-loop.md should produce no output; the other five should show only the documented edits.

## Conformance edits applied (2026-05-08, second pass)

Triggered by /debug findings that the upstream frontmatter shape did not match Claude Code's discovery convention used by working global skills (`~/.claude/skills/{self-improving-agent,feynman-breakdown,claude-skill-discovery}/SKILL.md`). Three further edits to `SKILL.md`:

1. **Frontmatter conformed.** Renamed `name: Self-Evolving` → `name: self-evolving` (lowercase-hyphenated, matching the slug and matching every working global skill on this machine). Stripped the four upstream-only fields: `slug`, `version`, `changelog`, `metadata`. The remaining frontmatter is `name` + `description` only.
2. **Description rewritten with explicit triggers** so Claude Code's skill matcher has surface area to bind against. The description now includes "Use when..." trigger phrases distilled from the existing "When to Use" body and explicitly defers single-shot LRN/ERR/FEAT capture to the global `.learnings/` system.
3. **Two new SKILL.md sections.** "File-vs-cwd tiebreak" inside Memory Path Resolution to handle the case where cwd resolves to the monorepo root but the friction is observed in a sub-workspace; "Coexistence with Existing Self-Improvement Systems" to make the lane split explicit so this skill and the global Self-Improvement System / `self-improving-agent` skill don't double-write.

### Live discovery confirmed

After the rename was written, Claude Code's available-skills index re-loaded mid-session and `self-evolving` appeared in the skills system reminder with the exact description above. End-to-end discovery is verified — no fresh-session restart required.

### sha256 diff (this pass)

| File | Pre-conformance sha256 | Post-conformance sha256 | Status |
|------|------------------------|--------------------------|--------|
| SKILL.md | `45793f5b21d337b210f57fbf1f28cfadf05899182818b19eb7a009525659cc21` | `a0136dc3955ff36467193537496d233c4defafb35ea49e5404e570eeeb271c4c` | edited |
| setup.md | `74c65b1479b00d7ecfd2700057d8b94e656871e12cc3787e14cd9f1b6e5b5238` | unchanged | byte-identical |
| memory-template.md | `1b1e85ebf3af3a7775bf567ccb92cb5372a93126031339a4bec445014eb5eb1a` | unchanged | byte-identical |
| memory.md | `b2f6ed52…c90e3` | unchanged | matches upstream |
| experiments.md | `d83ff89c7e2825ca13a2098c04529a367034574e6be398fbc02786ef774370e1` | unchanged | byte-identical |
| evolution-loop.md | `dd7d1bad…637def87` | unchanged | matches upstream |
| boundaries.md | `78d623c141153741b1b34aa0671f373341b6945f2bda4ac666c33eab71772f36` | unchanged | byte-identical |

### Discovery verification command (for future fresh sessions)

```
ls /Users/trevorrobey/TrevClaw-Obsidianodus/.claude/skills/self-evolving/SKILL.md && /usr/bin/awk '/^---$/{c++; if(c==2)exit} c>=1' /Users/trevorrobey/TrevClaw-Obsidianodus/.claude/skills/self-evolving/SKILL.md
```

- `ls .../SKILL.md` — confirms file exists at the project-scope discovery path.
- `awk '/^---$/...'` — prints the YAML frontmatter so you can verify `name: self-evolving` and the description string Claude Code's matcher will see.
- After running these, expect Claude Code's skill list to include a `self-evolving:` entry whose description begins "Improve reusable agent workflows..."
