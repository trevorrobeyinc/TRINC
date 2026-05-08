import { execSync } from "node:child_process";

execSync("npx vitest run tests/unit/contract.test.ts tests/unit/compat-aliases.test.ts", {
  stdio: "inherit",
  cwd: process.cwd(),
});
