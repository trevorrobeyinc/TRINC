import { defineConfig } from "vitest/config";

// vitest 4+ no longer excludes dist/ by default, so without this it also collects the compiled
// dist/tests/*.spec.js copies (CommonJS, which vitest refuses to load).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
  },
});
