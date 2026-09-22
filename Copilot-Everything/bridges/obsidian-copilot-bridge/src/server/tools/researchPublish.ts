import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { RuntimeContext } from "../context";
import type { BackendId, ToolResult } from "../../types";
import { guardVaultRelativePath } from "../../fs/pathGuard";
import { AppError } from "../errors";
import { ERROR_CODES } from "../errorCodes";

/**
 * research_publish — agent-side workflow output → vault.
 *
 * Reads `<sourceDir>/output.md` and `<sourceDir>/wiki-links.json` (the shape
 * already produced by trevor-robey-inc-agents for every research task), then:
 *
 *   1. Writes the main note to `Research-Output/<YYYY-MM-DD>/<taskId>/output.md`.
 *   2. Materializes one stub note per wikilink target under
 *      `OpenClaw/atlas/<TYPE_DIR>/<identifier>.md` (matches the existing
 *      `scripts/atlas-stub-creator.js` convention so wikilinks resolve
 *      cleanly in Obsidian's Local Graph View).
 *   3. Publishes a `research_arrived` event on the `research` SSE stream so
 *      any subscribed clients (e.g. the Copilot plugin) can render a chat
 *      bubble and open the new tab.
 *
 * This is the only tool that emits SSE events today.
 *
 * ⚠️ DORMANT SCHEME — TOMBSTONED 2026-09-22 (Obsidian re-integration plan, decision D2).
 * `Research-Output/` + `OpenClaw/atlas/` is NOT the vault's research scheme. The one scheme is
 * `OpenClaw/<template_id>/<date> <input label>/`, written by the research engine itself after
 * every gate-PASS run (Trevor Robey Intelligence Network Citations/openclaw-bridge/vault/
 * workflow-vault-publisher.js) and rehydrated by the Command Center plugin. The engine-side
 * caller of this tool (scripts/publish-to-vault.js) is tombstoned too. The tool stays registered
 * so the bridge's contract does not change under existing clients, but nothing in the pipeline
 * calls it; the chat bubble is `research_notify`.
 */

const schema = z.object({
  taskId: z.string().min(1),
  sourceDir: z.string().min(1),
  vault: z.string().min(1),
  vaultRoot: z.string().min(1),
  title: z.string().min(1).optional(),
  mode: z.enum(["create", "overwrite"]).default("create"),
});

type Mode = "create" | "overwrite";

interface WikiLink {
  type?: string;
  target?: string;
  display?: string;
  count?: number;
}

interface WikiLinksFile {
  links?: WikiLink[];
}

interface ResearchPublishOutput {
  taskId: string;
  mainNotePath: string;
  stubNotesCreated: number;
  stubNotesSkipped: number;
  totalLinks: number;
  paths: string[];
}

const TYPE_DIR: Record<string, string> = {
  entity: "entity",
  PMID: "PMID",
  NCT: "NCT",
  ChEMBL: "ChEMBL",
  "PubChem CID": "PubChem",
  DrugBank: "DrugBank",
  UniProt: "UniProt",
  DOI: "DOI",
};

const VERIFY_URL: Record<string, (id: string) => string> = {
  PMID: (id) => `https://pubmed.ncbi.nlm.nih.gov/${id.replace(/^PMID-/, "")}/`,
  NCT: (id) => `https://clinicaltrials.gov/study/${id}`,
  ChEMBL: (id) => `https://www.ebi.ac.uk/chembl/compound_report_card/${id}/`,
  "PubChem CID": (id) =>
    `https://pubchem.ncbi.nlm.nih.gov/compound/${id.replace(/^CID-/, "")}`,
  DrugBank: (id) => `https://go.drugbank.com/drugs/${id}`,
  UniProt: (id) =>
    `https://www.uniprot.org/uniprotkb/${id.replace(/^UniProt-/, "")}/entry`,
  DOI: (id) => `https://doi.org/${id.replace(/^DOI-/, "").replace(/_/g, "/")}`,
};

const TYPE_BLURB: Record<string, string> = {
  entity:
    "Workflow entity (drug, indication, mechanism, target). First materialized from",
  PMID: "PubMed article ID. Verify at",
  NCT: "ClinicalTrials.gov trial registration. Verify at",
  ChEMBL: "ChEMBL bioactivity record. Verify at",
  "PubChem CID": "PubChem compound. Verify at",
  DrugBank: "DrugBank drug record. Verify at",
  UniProt: "UniProt protein record. Verify at",
  DOI: "Document Object Identifier. Verify at",
};

function buildStubContent(
  link: WikiLink,
  ctx: { taskId: string; runDate: string; synthNoteBasename: string }
): string {
  const type = link.type || "entity";
  const target = link.target || "";
  const display = link.display || target;
  const verify = VERIFY_URL[type] ? VERIFY_URL[type](target) : "";
  const blurb = TYPE_BLURB[type] || "Atlas entry. First materialized from";
  const tags = [
    "openclaw",
    "atlas",
    type.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  ];

  const fmLines = [
    "---",
    `type: ${type}`,
    `identifier: ${target}`,
    `display: ${display}`,
    `source_task: ${ctx.taskId}`,
    `run_date: ${ctx.runDate}`,
    verify ? `verify_url: ${verify}` : null,
    `tags: [${tags.join(", ")}]`,
    "---",
    "",
  ].filter((l): l is string => l !== null);

  const body = [
    `# ${display}`,
    "",
    verify
      ? `${blurb} ${verify}`
      : `${blurb} [[${ctx.synthNoteBasename}]].`,
    "",
    `Referenced from [[${ctx.synthNoteBasename}]] (count: ${link.count ?? 0}).`,
    "",
  ];

  return fmLines.join("\n") + body.join("\n");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function writeFileGuarded(
  vaultRoot: string,
  relPath: string,
  content: string,
  mode: Mode
): { written: boolean; relativePath: string } {
  const guarded = guardVaultRelativePath(vaultRoot, relPath);
  fs.mkdirSync(path.dirname(guarded.absolutePath), { recursive: true });
  if (fs.existsSync(guarded.absolutePath) && mode !== "overwrite") {
    return { written: false, relativePath: guarded.relativePath };
  }
  fs.writeFileSync(guarded.absolutePath, content, "utf8");
  return { written: true, relativePath: guarded.relativePath };
}

export async function researchPublishTool(
  runtime: RuntimeContext,
  requestId: string,
  _epochId: number | undefined,
  _backendHint: BackendId | undefined,
  input: unknown
): Promise<ToolResult<ResearchPublishOutput>> {
  const startedAt = Date.now();

  if (runtime.config.readOnlyMode) {
    throw new AppError(
      ERROR_CODES.NO_CAPABLE_BACKEND,
      "Server is in read-only mode."
    );
  }

  const payload = schema.parse(input);

  // Validate vault root is allow-listed.
  if (!runtime.config.allowedVaultRoots.includes(payload.vaultRoot)) {
    throw new AppError(
      ERROR_CODES.PATH_OUTSIDE_VAULT,
      "vaultRoot is not in allowedVaultRoots."
    );
  }

  // Read source files from agents workspace.
  const sourceDir = path.resolve(payload.sourceDir);
  const outputMdPath = path.join(sourceDir, "output.md");
  const wikiLinksPath = path.join(sourceDir, "wiki-links.json");

  if (!fs.existsSync(outputMdPath)) {
    throw new AppError(
      ERROR_CODES.NOTE_NOT_FOUND,
      `output.md not found at ${outputMdPath}.`
    );
  }
  const mainContent = fs.readFileSync(outputMdPath, "utf8");

  let wikiLinks: WikiLink[] = [];
  if (fs.existsSync(wikiLinksPath)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(wikiLinksPath, "utf8")
      ) as WikiLinksFile;
      wikiLinks = Array.isArray(parsed.links) ? parsed.links : [];
    } catch {
      // Bad JSON is non-fatal — proceed without stubs.
      wikiLinks = [];
    }
  }

  const runDate = todayIso();
  const taskFolder = `Research-Output/${runDate}/${payload.taskId}`;
  const mainRel = `${taskFolder}/output.md`;
  const main = writeFileGuarded(
    payload.vaultRoot,
    mainRel,
    mainContent,
    payload.mode
  );

  if (!main.written) {
    throw new AppError(
      ERROR_CODES.ALREADY_EXISTS,
      "Main research note already exists. Re-run with mode=overwrite to replace.",
      false,
      { path: main.relativePath }
    );
  }

  const synthNoteBasename = path.basename(main.relativePath, ".md");
  const ctx = {
    taskId: payload.taskId,
    runDate,
    synthNoteBasename,
  };

  const createdPaths: string[] = [main.relativePath];
  let stubNotesCreated = 0;
  let stubNotesSkipped = 0;

  for (const link of wikiLinks) {
    const dirName = TYPE_DIR[link.type || ""];
    if (!dirName || !link.target) {
      stubNotesSkipped++;
      continue;
    }
    const stubRel = `OpenClaw/atlas/${dirName}/${link.target}.md`;
    const result = writeFileGuarded(
      payload.vaultRoot,
      stubRel,
      buildStubContent(link, ctx),
      // Stubs are never overwritten — they're additive.
      "create"
    );
    if (result.written) {
      stubNotesCreated++;
      createdPaths.push(result.relativePath);
    } else {
      stubNotesSkipped++;
    }
  }

  // Publish event so subscribed clients (Copilot plugin) can react.
  runtime.eventBus.publish({
    type: "research_arrived",
    stream: "research",
    taskId: payload.taskId,
    title: payload.title || synthNoteBasename,
    vault: payload.vault,
    mainNotePath: main.relativePath,
    stubNotesCreated,
    totalLinks: wikiLinks.length,
    ts: new Date().toISOString(),
  });

  runtime.logger.info("research_publish_completed", {
    requestId,
    taskId: payload.taskId,
    mainNotePath: main.relativePath,
    stubNotesCreated,
    stubNotesSkipped,
    totalLinks: wikiLinks.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    ok: true,
    data: {
      taskId: payload.taskId,
      mainNotePath: main.relativePath,
      stubNotesCreated,
      stubNotesSkipped,
      totalLinks: wikiLinks.length,
      paths: createdPaths,
    },
    meta: {
      requestId,
      durationMs: Date.now() - startedAt,
      consistencyHint: "strict-fifo-per-note",
    },
  };
}
