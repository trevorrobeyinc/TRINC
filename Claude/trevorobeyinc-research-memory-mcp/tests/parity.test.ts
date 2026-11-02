import { describe, it, expect } from "vitest";
import {
  checkParity,
  reembed,
  resolveSourcePath,
  restoreVectors,
  type ParityPoint,
  type VectorBackup,
} from "../src/parity.js";

function unit(v: number[]): number[] {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

function point(id: string, vector: number[] | undefined, source: string, hash: string): ParityPoint {
  return {
    id,
    vector,
    payload: { pack_id: id, pack_title: `Pack ${id}`, source_uri: source, content_sha256: hash, model_name: "m" },
  };
}

const sources: Record<string, string> = { "file:///a.md": "alpha", "file:///b.md": "beta", "file:///c.md": "gamma" };
const deps = (embedFor: Record<string, number[]>) => ({
  readSource: async (uri: string) => sources[uri] ?? null,
  hash: (md: string) => `h:${md}`,
  embed: async (md: string) => embedFor[md],
});

describe("checkParity", () => {
  it("passes when every comparable pack re-embeds to its stored vector", async () => {
    const v = unit([1, 2, 3]);
    const r = await checkParity([point("a", v, "file:///a.md", "h:alpha")], deps({ alpha: v }));
    expect(r.pass).toBe(true);
    expect(r.compared).toBe(1);
    expect(r.rows[0].status).toBe("match");
    expect(r.min_cosine).toBeCloseTo(1, 12);
  });

  it("fails on drift below the threshold and reports the cosine", async () => {
    const stored = unit([1, 0, 0]);
    const fresh = unit([1, 0.2, 0]);
    const r = await checkParity([point("a", stored, "file:///a.md", "h:alpha")], deps({ alpha: fresh }));
    expect(r.pass).toBe(false);
    expect(r.rows[0].status).toBe("drift");
    expect(r.rows[0].cosine!).toBeLessThan(0.999);
  });

  it("uses the threshold as an inclusive bar", async () => {
    const stored = unit([1, 0, 0]);
    const fresh = unit([1, 0.1, 0]);
    const c = 1 / Math.hypot(1, 0.1);
    const r = await checkParity([point("a", stored, "file:///a.md", "h:alpha")], deps({ alpha: fresh }), c);
    expect(r.pass).toBe(true);
  });

  it("skips packs whose source is gone or changed, and packs without a vector", async () => {
    const v = unit([3, 1, 2]);
    const r = await checkParity(
      [
        point("a", v, "file:///a.md", "h:alpha"),
        point("gone", v, "file:///missing.md", "h:x"),
        point("edited", v, "file:///b.md", "h:old-beta"),
        point("novec", undefined, "file:///c.md", "h:gamma"),
      ],
      deps({ alpha: v }),
    );
    expect(r.rows.map((x) => x.status)).toEqual(["match", "source_missing", "source_changed", "no_vector"]);
    expect(r.compared).toBe(1);
    expect(r.pass).toBe(true);
  });

  it("does not pass when nothing could be compared", async () => {
    const r = await checkParity([point("gone", unit([1, 1]), "file:///missing.md", "h:x")], deps({}));
    expect(r.compared).toBe(0);
    expect(r.pass).toBe(false);
    const empty = await checkParity([], deps({}));
    expect(empty.pass).toBe(false);
  });

  it("treats a dimension mismatch as drift, not a crash", async () => {
    const r = await checkParity([point("a", unit([1, 2, 3]), "file:///a.md", "h:alpha")], deps({ alpha: unit([1, 2]) }));
    expect(r.rows[0].status).toBe("drift");
    expect(r.rows[0].cosine).toBe(0);
  });
});

describe("checkParity onCompared", () => {
  it("hands back the fresh vector of compared packs only, keyed by point id", async () => {
    const v = unit([1, 2, 3]);
    const seen: [string, number[]][] = [];
    const r = await checkParity(
      [point("a", v, "file:///a.md", "h:alpha"), point("gone", v, "file:///missing.md", "h:x")],
      { ...deps({ alpha: v }), onCompared: (id, fresh) => seen.push([id, fresh]) },
    );
    expect(seen).toEqual([["a", v]]);
    expect(r.rows.map((x) => x.point_id)).toEqual(["a", "gone"]);
  });
});

/** In-memory stand-in for the Qdrant collection, recording every write in order. */
function memoryStore(initial: ParityPoint[]) {
  const pts = new Map(initial.map((p) => [p.id, { ...p }]));
  const log: string[] = [];
  return {
    log,
    pts,
    store: {
      loadAll: async () => [...pts.values()].map((p) => ({ ...p })),
      updateVectors: async (points: { id: string; vector: number[] }[]) => {
        log.push(`update:${points.map((p) => p.id).join(",")}`);
        for (const p of points) pts.get(p.id)!.vector = p.vector;
      },
    },
  };
}

describe("reembed", () => {
  const stored = unit([1, 0, 0]);
  const fresh = unit([1, 0.1, 0]);
  const opts = (log: string[], saved: VectorBackup[]) => ({
    collection: "packs",
    modelName: "m",
    nowIso: () => "2026-11-02T00:00:00.000Z",
    writeBackup: async (b: VectorBackup) => {
      log.push("backup");
      saved.push(b);
      return "/backups/x.json";
    },
  });

  it("backs up the old vectors first, rewrites only comparable packs, and re-checks to a pass", async () => {
    const m = memoryStore([
      point("a", stored, "file:///a.md", "h:alpha"),
      point("gone", stored, "file:///missing.md", "h:x"),
    ]);
    const saved: VectorBackup[] = [];
    const r = await reembed(m.store, deps({ alpha: fresh }), opts(m.log, saved));

    expect(m.log).toEqual(["backup", "update:a"]);
    expect(saved[0]).toEqual({
      collection: "packs",
      model_name: "m",
      created_at: "2026-11-02T00:00:00.000Z",
      points: [{ id: "a", pack_id: "a", vector: stored }],
    });
    expect(m.pts.get("a")!.vector).toEqual(fresh);
    expect(m.pts.get("gone")!.vector).toEqual(stored);
    expect(r.before.pass).toBe(false);
    expect(r.after.pass).toBe(true);
    expect(r.updated).toBe(1);
    expect(r.backup_path).toBe("/backups/x.json");
  });

  it("writes nothing and saves no backup when nothing is comparable", async () => {
    const m = memoryStore([point("gone", stored, "file:///missing.md", "h:x")]);
    const saved: VectorBackup[] = [];
    const r = await reembed(m.store, deps({}), opts(m.log, saved));
    expect(m.log).toEqual([]);
    expect(r.updated).toBe(0);
    expect(r.backup_path).toBeNull();
  });

  it("changes no vector when the backup cannot be written", async () => {
    const m = memoryStore([point("a", stored, "file:///a.md", "h:alpha")]);
    const failing = { ...opts(m.log, []), writeBackup: async () => Promise.reject(new Error("disk full")) };
    await expect(reembed(m.store, deps({ alpha: fresh }), failing)).rejects.toThrow("disk full");
    expect(m.log).toEqual([]);
    expect(m.pts.get("a")!.vector).toEqual(stored);
  });
});

describe("restoreVectors", () => {
  const backup: VectorBackup = {
    collection: "packs",
    model_name: "m",
    created_at: "t",
    points: [{ id: "a", pack_id: "a", vector: [1, 0] }],
  };

  it("puts the backed-up vectors back", async () => {
    const m = memoryStore([point("a", [0, 1], "file:///a.md", "h:alpha")]);
    expect(await restoreVectors(m.store, backup, "packs")).toBe(1);
    expect(m.pts.get("a")!.vector).toEqual([1, 0]);
  });

  it("refuses a backup from another collection or without valid points", async () => {
    const m = memoryStore([]);
    await expect(restoreVectors(m.store, backup, "other")).rejects.toThrow(/collection/);
    await expect(restoreVectors(m.store, { ...backup, points: [{ id: "", pack_id: "", vector: [] }] }, "packs")).rejects.toThrow(/valid/);
    expect(m.log).toEqual([]);
  });
});

describe("resolveSourcePath", () => {
  it("maps the source_uri forms the store writes", () => {
    expect(resolveSourcePath("file:///Users/myhome/x.md")).toBe("/Users/myhome/x.md");
    expect(resolveSourcePath("obsidian://My%20Digital%20Garden/OpenClaw/a.md")).toBe("/Users/myhome/My Digital Garden/OpenClaw/a.md");
    expect(resolveSourcePath("/tmp/plain.md")).toBe("/tmp/plain.md");
    expect(resolveSourcePath("")).toBeNull();
  });
});
