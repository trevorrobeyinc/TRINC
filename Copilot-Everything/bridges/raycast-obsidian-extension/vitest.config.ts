import { defineConfig } from "vitest/config";
import os from "os";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Keep fixture lines out of the real pipeline run log, which command-center and the Copilot
    // video-pipeline skill read to report runs (see runLogPath in src/tools/videoTranscribeFlow.ts).
    env: {
      VIDEO_PIPELINE_RUN_LOG: path.join(os.tmpdir(), "raycast-obsidian-vitest", "video-transcribe.log"),
    },
    coverage: {
      provider: "v8",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/__mocks__/**",
        "**/tests/**",
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/tools/**", // Exclude AI tools (for now, todo: add back when they get more complex)
        "**/components/**", // Exclude React components
        "**/*.tsx", // Exclude all TSX files (React components)
        "**/*.config.*",
        "**/constants.tsx",
        "**/*hooks.ts", // Can't easily test hooks with useEffect etc.
      ],
      include: ["src/**/*.ts"], // Only include .ts files in src
    },
  },
  resolve: {
    alias: {
      "@raycast/api": path.resolve(__dirname, "./src/__mocks__/@raycast/api.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
