import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeGeneratedNote } from "@/tools/videoTranscribeFlow";

describe("writeGeneratedNote", () => {
  const tempRoot = path.join(os.tmpdir(), `video-transcribe-flow-${Date.now()}`);

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("writes markdown content directly into the vault path", async () => {
    const notePath = "Video Downloads/test-folder/source note.md";
    const content = "# Source Note\n\nGenerated locally.";

    await writeGeneratedNote(tempRoot, notePath, content);

    const written = await fs.readFile(path.join(tempRoot, ...notePath.split("/")), "utf-8");
    expect(written).toBe(content);
  });
});
