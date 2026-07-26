// Deploy the built plugin into the live Obsidian vault plugin directory.
//
// The plugin's runtime copy lives in the vault at
// <vault>/.obsidian/plugins/obsidian-bridge-launcher/, OUTSIDE this monorepo,
// so `npm run build` alone never updates what Obsidian actually loads. Run
// `npm run deploy` (build + this copy) after any source change so the deployed
// build can't silently drift from source again (as it did: the vault ran a
// stale May-2026 build for weeks after source moved forward).
//
// Only main.js + manifest.json are copied — data.json is user settings and is
// never overwritten. Override the target with BRIDGE_LAUNCHER_VAULT_DIR.
import { copyFileSync } from "node:fs";
import process from "node:process";

const target =
  process.env.BRIDGE_LAUNCHER_VAULT_DIR ||
  "/Users/myhome/My Digital Garden/.obsidian/plugins/obsidian-bridge-launcher";

for (const file of ["main.js", "manifest.json"]) {
  copyFileSync(file, `${target}/${file}`);
}
console.log(`deployed main.js + manifest.json -> ${target}`);
