const workspaceRoot = "/Users/trevorrobey/Code/THE Copilot in Obsidian Everything";

// Phase D: backend-emulator (:8789) and 3 zk-* cron jobs retired 2026-04-11.
// ZettelkastenService now runs in-process via the vault-zettelkasten Obsidian plugin.
// Scheduled tasks (orphan scan, health digest, serendipity digest) handled by the plugin's Scheduler.

module.exports = {
  apps: [
    // mcp-bridge entry removed 2026-05-03: bridge ownership migrated to the
    // obsidian-bridge-launcher Obsidian plugin (Code/Claude/obsidian-bridge-launcher).
    // The plugin spawns dist/index.js as a child process tied to Obsidian's
    // lifecycle: bridge dies when Obsidian quits; restart is plugin-toggle.
    // bridge-start.sh remains in scripts/ for manual / dev invocation.
    //
    // openclaw-bridge entry removed 2026-04-26: managed by launchd LaunchAgent
    // ~/Library/LaunchAgents/ai.openclaw.gateway.plist (label: ai.openclaw.gateway).
    // PM2 was double-managing and the start-server.sh referenced here never existed.
  ],
};
// workspaceRoot kept above for documentation / future re-introduction.
void workspaceRoot;
