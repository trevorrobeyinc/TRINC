import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// vitest 4+ no longer excludes dist/ by default, so without this it also collects the compiled
// dist/tests/*.spec.js copies (CommonJS, which vitest refuses to load).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    // The audit sink binds its file when its module loads, and the default is the real audit.jsonl that OSSEC
    // tails. Every spec gets a temporary file instead, so none can write the real trail; a spec that reads its
    // own audit events still sets TREVCLAW_AUDIT_LOG in vi.hoisted, which runs later and wins (2026-11-25).
    env: {
      TREVCLAW_AUDIT_LOG: path.join(os.tmpdir(), `obsidian-copilot-bridge-vitest-audit-${process.pid}.jsonl`),
    },
  },
});
