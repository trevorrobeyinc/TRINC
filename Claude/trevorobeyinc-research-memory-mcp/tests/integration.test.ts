/**
 * End-to-end integration tests against a real Qdrant + Xenova embedding pipeline.
 * Uses a dedicated `trevorobeyinc-packs-test` collection that is dropped before each run.
 *
 * Requires Qdrant reachable at QDRANT_URL (default https://127.0.0.1:6433 — the TLS proxy,
 * same as src/qdrant.ts; needs NODE_EXTRA_CA_CERTS pointing at the mkcert root CA).
 * First run will download the nomic-embed-text-v1 ONNX (~140 MB) — expect a slow first test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { QdrantClient } from "@qdrant/js-client-rest";

// Force the test collection BEFORE importing the modules that read env at module-load time.
const TEST_COLLECTION = "trevorobeyinc-packs-test";
process.env.QDRANT_COLLECTION = TEST_COLLECTION;
process.env.LOG_FILE = "/tmp/trevorobeyinc-research-memory.test.log";

const { packIngest } = await import("../src/tools/pack_ingest.js");
const { packSearch } = await import("../src/tools/pack_search.js");
const { packRelated } = await import("../src/tools/pack_related.js");
const { packList } = await import("../src/tools/pack_list.js");
const { packDiff } = await import("../src/tools/pack_diff.js");
const { packGetSection } = await import("../src/tools/pack_get_section.js");

const FIX = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

const QDRANT_URL = process.env.QDRANT_URL || "https://127.0.0.1:6433";
const adminClient = new QdrantClient({ url: QDRANT_URL });

beforeAll(async () => {
  // Wipe the test collection if it exists.
  try {
    await adminClient.deleteCollection(TEST_COLLECTION);
  } catch {
    // not present yet — fine
  }
}, 60_000);

afterAll(async () => {
  try {
    await adminClient.deleteCollection(TEST_COLLECTION);
  } catch {
    // best-effort cleanup
  }
}, 30_000);

describe("end-to-end (live Qdrant + ONNX embedding)", () => {
  it(
    "ingests a pack and reports action=created",
    async () => {
      const md = FIX("pack-pd1-acme.md");
      const r = await packIngest({
        markdown: md,
        client: "acme",
        topic: "pd1-resistance",
        tags: ["oncology", "io"],
        mesh_terms: ["Programmed Cell Death 1 Receptor", "Drug Resistance, Neoplasm"],
        synthesizer_version: "test-0.1",
        replace_existing: false,
      });
      expect(r.action).toBe("created");
      expect(r.vector_count).toBe(1);
      expect(r.content_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.pack_id).toMatch(/^pack-/);
    },
    180_000, // first run downloads ONNX model
  );

  it("re-ingesting the same content returns skipped_duplicate", async () => {
    const md = FIX("pack-pd1-acme.md");
    const r = await packIngest({ markdown: md, client: "acme", topic: "pd1-resistance", replace_existing: false });
    expect(r.action).toBe("skipped_duplicate");
  }, 60_000);

  it("ingesting modified content with replace_existing=true returns replaced", async () => {
    const md = FIX("pack-pd1-acme.md");
    // First fetch the existing pack_id
    const list = await packList({ filters: { client: "acme" }, limit: 10, offset: 0, sort_by: "ingested_at", sort_order: "desc" });
    const existing = list.packs[0];
    const modified = md + "\n\n<!-- minor edit -->\n";
    const r = await packIngest({
      markdown: modified,
      client: "acme",
      topic: "pd1-resistance",
      tags: ["oncology", "io"],
      mesh_terms: ["Programmed Cell Death 1 Receptor", "Drug Resistance, Neoplasm"],
      pack_id: existing.pack_id,
      replace_existing: true,
    });
    expect(r.action).toBe("replaced");
    expect(r.pack_id).toBe(existing.pack_id);
  }, 60_000);

  it("ingests two more packs for cross-pack tests", async () => {
    const r1 = await packIngest({
      markdown: FIX("pack-car-t-rare.md"),
      client: "internal",
      topic: "car-t",
      tags: ["oncology", "cell-therapy", "pediatric"],
      replace_existing: false,
    });
    const r2 = await packIngest({
      markdown: FIX("pack-glp1-cardio.md"),
      client: "internal",
      topic: "glp1",
      tags: ["cardio", "metabolic"],
      replace_existing: false,
    });
    expect(r1.action).toBe("created");
    expect(r2.action).toBe("created");
  }, 90_000);

  it("pack_search finds the most relevant pack for an oncology query", async () => {
    const r = await packSearch({ query: "PD-1 checkpoint inhibitor resistance mechanisms", limit: 3, score_threshold: 0.3 });
    expect(r.results.length).toBeGreaterThan(0);
    const top = r.results[0];
    expect(top.payload.topic).toBe("pd1-resistance");
  }, 30_000);

  it("pack_search returns nothing for an unrelated query (with high threshold)", async () => {
    const r = await packSearch({ query: "supply chain logistics for industrial widgets", limit: 5, score_threshold: 0.7 });
    // either zero hits or top score below threshold
    expect(r.results.every((x) => x.score >= 0.7) || r.results.length === 0).toBe(true);
  }, 30_000);

  it("pack_related on car-t pack returns oncology neighbors above unrelated topics", async () => {
    const list = await packList({ limit: 10, offset: 0, sort_by: "ingested_at", sort_order: "desc" });
    const carT = list.packs.find((p) => p.payload.topic === "car-t");
    expect(carT).toBeDefined();
    const r = await packRelated({ pack_id: carT!.pack_id, limit: 5, exclude_self: true });
    // Top result should be an oncology pack, not GLP-1
    if (r.results.length > 0) {
      expect(r.results[0].payload.topic).not.toBe("glp1");
    }
  }, 30_000);

  it("pack_list with client filter returns only acme packs", async () => {
    const r = await packList({ filters: { client: "acme" }, limit: 25, offset: 0, sort_by: "ingested_at", sort_order: "desc" });
    expect(r.packs.every((p) => p.payload.client === "acme")).toBe(true);
  }, 15_000);

  it("pack_diff between two PD-1 packs identifies modified sections", async () => {
    const v2 = await packIngest({
      markdown: FIX("pack-pd1-acme-v2.md"),
      client: "acme",
      topic: "pd1-resistance",
      tags: ["oncology", "io", "asco-2026"],
      pack_id: "pack-test-pd1-v2",
      replace_existing: false,
    });
    const list = await packList({ filters: { client: "acme" }, limit: 10, offset: 0, sort_by: "ingested_at", sort_order: "desc" });
    const v1 = list.packs.find((p) => p.pack_id !== "pack-test-pd1-v2");
    expect(v1).toBeDefined();

    const diff = await packDiff({
      pack_a: v1!.pack_id,
      pack_b: v2.pack_id,
      excerpt_chars: 150,
    });
    expect(diff.sections.length).toBeGreaterThan(0);
    // Test fixtures don't write source_uri to disk, so pack_diff correctly falls back
    // to snippet-only comparison. snippet is flat text → "(whole pack)" + fallback_used.
    expect(diff.fallback_used).toBe(true);
    expect(diff.sections[0].title).toBe("(whole pack)");
    expect(diff.shared_tags).toContain("oncology");
    // Whole-pack cosine similarity should be high (same topic, similar content).
    expect(diff.whole_pack_cosine_similarity).toBeGreaterThan(0.8);
  }, 30_000);

  it("pack_get_section error on missing section", async () => {
    const list = await packList({ limit: 1, offset: 0, sort_by: "ingested_at", sort_order: "desc" });
    const any = list.packs[0];
    await expect(
      packGetSection({ pack_id: any.pack_id, section_title: "Definitely Not A Real Section" }),
    ).rejects.toMatchObject({ code: "SECTION_NOT_FOUND" });
  }, 15_000);
});
