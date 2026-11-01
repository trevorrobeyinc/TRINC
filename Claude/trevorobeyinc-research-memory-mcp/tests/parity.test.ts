import { describe, it, expect } from "vitest";
import { checkParity, resolveSourcePath, type ParityPoint } from "../src/parity.js";

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

describe("resolveSourcePath", () => {
  it("maps the source_uri forms the store writes", () => {
    expect(resolveSourcePath("file:///Users/myhome/x.md")).toBe("/Users/myhome/x.md");
    expect(resolveSourcePath("obsidian://My%20Digital%20Garden/OpenClaw/a.md")).toBe("/Users/myhome/My Digital Garden/OpenClaw/a.md");
    expect(resolveSourcePath("/tmp/plain.md")).toBe("/tmp/plain.md");
    expect(resolveSourcePath("")).toBeNull();
  });
});
