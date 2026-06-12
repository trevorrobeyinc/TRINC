# Recovery lessons (Phase 1)

- **Machine identity differs from the plan.** The handoff prompt hardcoded `/Users/trevorrobey`; this
  machine is user `myhome` with the repo on the external volume `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus`.
  Every absolute path (launchd plist node binary, mkcert CA, logs) must be adapted to `/Users/myhome`.
  The repo's own docs (CLAUDE.md health-check block, LEARNINGS) still contain `/Users/trevorrobey` paths —
  left as-is (historical / minimal-diff); only operational artifacts we create use the adapted paths.

- **Fetched `git stash` doesn't show in `git stash list`.** `git fetch <bundle> '+refs/stash:refs/stash'`
  restores the ref, but `git stash list` reads the stash *reflog*, which a fetched ref lacks — and
  `git stash store` reported success without creating the reflog. Fix that worked: delete the ref then
  recreate with a reflog —
  `git update-ref -d refs/stash && git update-ref --create-reflog -m "..." refs/stash <sha>`.
  (A same-value `update-ref` is a no-op that doesn't log; the null-old-value form `... <sha> 0000…`
  fails with "reference already exists".) The stash content (`a7fc6a0`) was always recoverable via
  `git stash apply refs/stash` regardless.

- **macOS has no `timeout(1)`.** Don't wrap commands in `timeout …`; it's "command not found". Use the
  Bash tool's own timeout, or `gtimeout` from coreutils if installed.

- **Task 1 annotation strategy.** The acceptance asked for "no live reference," but the bridge is
  referenced across CLAUDE.md prose and two historical `.specify` spec docs. Deleting all of it would be
  a large lossy diff against the senior-dev minimal-diff / no-drive-by-refactor bar. Resolution:
  rewrite the **topology blocks** (the explicit acceptance items) cleanly, and **annotate** every other
  reference with a RETIRED banner pointing to `Claude/.archive/` + the deletion log. Surfaced as a
  reasoned deviation.

- **`obsidian-stdio-adapter/node_modules` is a committed symlink**, not a dir — it points to
  `../obsidian-copilot-bridge/node_modules` (the adapter shares the bridge's install; that's why it has
  no lockfile). Running `npm install` there clobbers the symlink with a real dir + generates a lockfile.
  Fix: `rm -rf node_modules package-lock.json && git checkout -- <path>` to restore the symlink. The dep
  (`@modelcontextprotocol/sdk`) resolves through it once the bridge is installed. **Don't `npm install`
  the adapter** — install the bridge and the symlink does the rest.

- **ARCHITECTURE.md is already stale** (still lists TrevNodus, chrome-devtools, backend emulator :8789)
  and self-declares the root `CLAUDE.md` as the source of truth. Only the targeted topology line was
  edited; unrelated drift was intentionally left alone (out of scope).
