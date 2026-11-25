// src/vaultIpc.ts against a fake vault (test/support/fakeVault.ts): the path guard, the command boundary and
// its audit trail, and the REST plugin's behaviour that each method keeps. Only a live Obsidian covers
// prepareSimpleSearch's real scoring, vault.process against an open editor, and the index catching up.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  guardPath,
  MAX_COMMAND_ID_CHARS,
  MAX_NOTE_BYTES,
  MAX_READ_BYTES,
  MAX_SEARCH_RESULTS,
  MAX_TAIL_CHARS,
  normalizeSearchFolder,
  serveVaultMethod,
  VaultIpcError,
} from "../src/vaultIpc.ts";
import { harness, runtime, sha256 } from "./support/fakeVault.ts";

const BACKSLASH = String.fromCharCode(92);
const BELL = String.fromCharCode(7);
const EMOJI = String.fromCodePoint(0x1f600);

async function refusal(promise: Promise<unknown>): Promise<VaultIpcError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof VaultIpcError, `expected a VaultIpcError, got ${String(error)}`);
    return error;
  }
  throw new Error("expected a refusal");
}

function call(h: ReturnType<typeof harness>, method: string, params: unknown): Promise<unknown> {
  return serveVaultMethod(method as never, params, h.deps as never);
}

function withHash(params: Record<string, unknown>): Record<string, unknown> {
  return { ...params, contentSha256: sha256(String(params.content ?? "")) };
}

describe("guardPath", () => {
  const refused: Array<[string, unknown, string]> = [
    ["empty", "", "not_vault_relative"],
    ["absolute", "/etc/passwd", "not_vault_relative"],
    ["backslash", `a${BACKSLASH}b.md`, "not_vault_relative"],
    ["control character", `a${BELL}b.md`, "not_vault_relative"],
    ["double slash", "a//b.md", "dot_or_empty_segment"],
    ["trailing slash", "a/", "dot_or_empty_segment"],
    ["parent segment", "../a.md", "dot_or_empty_segment"],
    ["inner parent segment", "a/../b.md", "dot_or_empty_segment"],
    ["dot segment", "./a.md", "dot_or_empty_segment"],
    ["config folder", ".obsidian/app.json", "dot_or_empty_segment"],
    ["hidden folder", "a/.git/config", "dot_or_empty_segment"],
    ["trash", ".trash/x.md", "dot_or_empty_segment"],
  ];
  for (const [name, input, detail] of refused) {
    test(`refuses ${name}`, () => {
      assert.throws(
        () => guardPath(input, ".obsidian", runtime),
        (error: unknown) => error instanceof VaultIpcError && error.reason === "path_refused" && error.detail === detail
      );
    });
  }

  test("refuses a config folder renamed to one without a dot, in any letter case", () => {
    for (const input of ["config", "config/app.json", "Config/app.json", "CONFIG"]) {
      assert.throws(
        () => guardPath(input, "config", runtime),
        (error: unknown) => error instanceof VaultIpcError && error.detail === "config_folder"
      );
    }
  });

  test("refuses a non-string and an over-long path as invalid_params", () => {
    for (const input of [42, null, undefined, "a".repeat(1025)]) {
      assert.throws(
        () => guardPath(input, ".obsidian", runtime),
        (error: unknown) => error instanceof VaultIpcError && error.reason === "invalid_params"
      );
    }
  });

  test("passes a vault-relative note path unchanged", () => {
    assert.equal(guardPath("Projects/Plan.md", ".obsidian", runtime), "Projects/Plan.md");
  });
});

describe("commands.execute", () => {
  test("refuses an id off the list, audits it by digest, and never reaches Obsidian", async () => {
    const h = harness({ registeredCommands: ["command-center:cancel-workflow"] });
    const id = "command-center:cancel-workflow";
    const error = await refusal(call(h, "commands.execute", { id }));
    assert.equal(error.reason, "command_refused");
    assert.match(error.message, /command-center:run-workflow/);
    assert.deepEqual(h.audits, [
      {
        eventType: "LAUNCHER_COMMAND_REFUSED",
        reason: "not_on_allowlist",
        commandIdLength: id.length,
        commandIdSha256: sha256(id),
        registered: true,
      },
    ]);
    assert.deepEqual(h.vault.calls, []);
  });

  test("never writes a refused id in clear, even one with the command shape", async () => {
    for (const id of ["a private sentence: not a command", "jane-doe-tested:positive-result"]) {
      const h = harness();
      await refusal(call(h, "commands.execute", { id }));
      assert.equal(h.audits.length, 1);
      assert.equal(h.audits[0].commandIdLength, id.length);
      assert.equal(h.audits[0].commandIdSha256, sha256(id));
      assert.equal(h.audits[0].registered, false);
      assert.ok(!JSON.stringify(h.audits).includes("private"));
      assert.ok(!JSON.stringify(h.audits).includes("jane"));
    }
  });

  test("refuses and audits a non-string, empty or over-long id as invalid_params", async () => {
    for (const id of [42, "", "x".repeat(MAX_COMMAND_ID_CHARS + 1)]) {
      const h = harness();
      const error = await refusal(call(h, "commands.execute", { id }));
      assert.equal(error.reason, "invalid_params");
      assert.equal(h.audits[0].eventType, "LAUNCHER_COMMAND_REFUSED");
      assert.equal(h.audits[0].reason, "invalid_id");
      assert.deepEqual(h.vault.calls, []);
    }
  });

  test("runs an allowed id once and audits that it ran", async () => {
    const h = harness();
    const result = await call(h, "commands.execute", { id: "command-center:toggle-pipeline-sidebar" });
    assert.deepEqual(result, { executed: true, id: "command-center:toggle-pipeline-sidebar" });
    assert.deepEqual(h.vault.calls, ["executeCommandById:command-center:toggle-pipeline-sidebar"]);
    assert.deepEqual(h.audits, [
      { eventType: "LAUNCHER_COMMAND_EXECUTED", commandId: "command-center:toggle-pipeline-sidebar", executed: true },
    ]);
  });

  test("reports executed:false when Obsidian declines", async () => {
    const h = harness();
    h.vault.commandResult = false;
    const result = await call(h, "commands.execute", { id: "command-center:analyze-current-note" });
    assert.deepEqual(result, { executed: false, id: "command-center:analyze-current-note" });
    assert.equal(h.audits[0].executed, false);
  });

  test("audits a command that throws, then lets the error through", async () => {
    const h = harness();
    h.vault.commandResult = new Error("callback failed");
    await assert.rejects(call(h, "commands.execute", { id: "command-center:run-workflow" }), /callback failed/);
    assert.deepEqual(h.audits, [
      { eventType: "LAUNCHER_COMMAND_EXECUTED", commandId: "command-center:run-workflow", executed: false, reason: "command_threw" },
    ]);
  });

  test("answers unavailable without a command registry", async () => {
    const h = harness();
    h.vault.removeCommandRegistry();
    const error = await refusal(call(h, "commands.execute", { id: "command-center:run-workflow" }));
    assert.equal(error.reason, "unavailable");
    assert.equal(h.audits[0].reason, "registry_unavailable");
  });
});

describe("refusals that got past the bridge are audited without the path's text", () => {
  test("a traversal attempt on vault.read", async () => {
    const h = harness({ notes: { "A.md": "a" } });
    const error = await refusal(call(h, "vault.read", { path: "../secrets.md" }));
    assert.equal(error.reason, "path_refused");
    assert.equal(h.audits.length, 1);
    assert.equal(h.audits[0].eventType, "LAUNCHER_VAULT_REFUSED");
    assert.equal(h.audits[0].method, "vault.read");
    assert.equal(h.audits[0].detail, "dot_or_empty_segment");
    assert.equal(h.audits[0].pathSha256, sha256("../secrets.md"));
    assert.ok(!JSON.stringify(h.audits).includes("secrets"));
  });

  test("ordinary mistakes are answered but not audited: a missing note, a folder as a note, a note as a folder, a large file", async () => {
    const h = harness({ notes: { "Projects/Plan.md": "plan", "big.md": "" } });
    h.vault.sizes.set("big.md", MAX_READ_BYTES + 1);
    assert.equal((await refusal(call(h, "vault.read", { path: "Nope.md" }))).reason, "not_found");
    assert.equal((await refusal(call(h, "vault.read", { path: "Projects" }))).reason, "path_refused");
    assert.equal((await refusal(call(h, "vault.search", { query: "x", path: "Projects/Plan.md" }))).reason, "path_refused");
    assert.equal((await refusal(call(h, "vault.read", { path: "big.md" }))).reason, "too_large");
    assert.deepEqual(h.audits, []);
  });
});

describe("content integrity", () => {
  test("nothing is written when the content does not match its sha256", async () => {
    const h = harness({ notes: { "A.md": "old" } });
    const content = `caf${String.fromCodePoint(0xfffd)}`;
    const error = await refusal(
      call(h, "vault.append", { path: "A.md", content, contentSha256: sha256(`caf${String.fromCodePoint(0xe9)}`) })
    );
    assert.equal(error.reason, "invalid_params");
    assert.equal(error.detail, "content_sha256_mismatch");
    assert.equal(h.vault.notes.get("A.md"), "old");
    assert.deepEqual(h.vault.calls, []);
    assert.equal(h.audits[0].detail, "content_sha256_mismatch");
  });

  test("a write without contentSha256 is refused", async () => {
    for (const method of ["vault.create", "vault.append"]) {
      const h = harness();
      const error = await refusal(call(h, method, { path: "N.md", content: "x" }));
      assert.equal(error.detail, "content_sha256_missing");
      assert.deepEqual(h.vault.calls, []);
    }
  });

  test("a body over MAX_NOTE_BYTES of UTF-8 is refused as too_large, though it is under the character limit", async () => {
    const content = String.fromCodePoint(0xe9).repeat(MAX_NOTE_BYTES / 2 + 1);
    assert.ok(content.length < MAX_NOTE_BYTES);
    for (const method of ["vault.create", "vault.append"]) {
      const h = harness();
      const error = await refusal(call(h, method, withHash({ path: "N.md", content })));
      assert.equal(error.reason, "too_large");
      assert.deepEqual(h.vault.calls, []);
    }
  });
});

describe("vault.append keeps the REST plugin's POST", () => {
  test("adds a newline first only when the note lacks one", async () => {
    const h = harness({ notes: { "A.md": "line", "B.md": "line\n" } });
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "A.md", content: "x" })), { path: "A.md", created: false });
    await call(h, "vault.append", withHash({ path: "B.md", content: "x" }));
    assert.equal(h.vault.notes.get("A.md"), "line\nx");
    assert.equal(h.vault.notes.get("B.md"), "line\nx");
  });

  test("creates a missing note holding exactly the content, with its folders in order", async () => {
    const h = harness();
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "New/Deep/N.md", content: "x" })), {
      path: "New/Deep/N.md",
      created: true,
    });
    assert.equal(h.vault.notes.get("New/Deep/N.md"), "x");
    assert.deepEqual(h.vault.calls, ["createFolder:New", "createFolder:New/Deep", "create:New/Deep/N.md"]);
  });

  test("refuses a parent that is a note", async () => {
    const h = harness({ notes: { "A.md": "a" } });
    assert.equal((await refusal(call(h, "vault.append", withHash({ path: "A.md/child.md", content: "x" })))).reason, "path_refused");
  });

  test("appends to the note whose path differs only in letter case", async () => {
    const h = harness({ notes: { "Projects/Log.md": "a" } });
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "projects/log.md", content: "b" })), {
      path: "Projects/Log.md",
      created: false,
    });
    assert.equal(h.vault.notes.get("Projects/Log.md"), "a\nb");
  });

  test("keeps the text of a note on disk that the index has not caught up with", async () => {
    const h = harness({ disk: { "Fresh.md": "old" } });
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "Fresh.md", content: "x" })), {
      path: "Fresh.md",
      created: false,
    });
    assert.equal(h.vault.disk.get("Fresh.md"), "old\nx");
    assert.deepEqual(h.vault.calls, ["adapter.process:Fresh.md"]);
  });

  test("refuses a not-yet-indexed file that matches only in another letter case", async () => {
    const h = harness({ disk: { "Fresh.md": "old" } });
    assert.equal((await refusal(call(h, "vault.append", withHash({ path: "fresh.md", content: "x" })))).reason, "path_refused");
    assert.equal(h.vault.disk.get("Fresh.md"), "old");
  });

  test("keeps the text of a file another writer created while the parent folders were being made", async () => {
    const h = harness();
    h.vault.onCreateFolder = (folder) => {
      if (folder === "New") h.vault.disk.set("New/N.md", "theirs");
    };
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "New/N.md", content: "mine" })), {
      path: "New/N.md",
      created: false,
    });
    assert.equal(h.vault.disk.get("New/N.md"), "theirs\nmine");
  });

  test("keeps the text of a file another writer created in the instant before vault.create", async () => {
    const h = harness();
    h.vault.raceOnCreate = { path: "N.md", content: "theirs" };
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "N.md", content: "mine" })), {
      path: "N.md",
      created: false,
    });
    assert.equal(h.vault.disk.get("N.md"), "theirs\nmine");
  });
});

describe("vault.create keeps the REST plugin's PUT", () => {
  test("creates a missing note", async () => {
    const h = harness();
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "N.md", content: "hi" })), { path: "N.md", created: true });
    assert.equal(h.vault.notes.get("N.md"), "hi");
  });

  test("refuses to replace a note unless overwrite is true", async () => {
    const h = harness({ notes: { "A.md": "keep" } });
    assert.equal((await refusal(call(h, "vault.create", withHash({ path: "A.md", content: "new" })))).reason, "already_exists");
    assert.equal(h.vault.notes.get("A.md"), "keep");
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "A.md", content: "new", overwrite: true })), {
      path: "A.md",
      created: false,
    });
    assert.equal(h.vault.notes.get("A.md"), "new");
  });

  test("replaces the note whose path differs only in letter case, and a file the index has not caught up with", async () => {
    const h = harness({ notes: { "Notes/Foo.md": "a" }, disk: { "Fresh.md": "b" } });
    await call(h, "vault.create", withHash({ path: "notes/foo.md", content: "A", overwrite: true }));
    await call(h, "vault.create", withHash({ path: "Fresh.md", content: "B", overwrite: true }));
    assert.equal(h.vault.notes.get("Notes/Foo.md"), "A");
    assert.equal(h.vault.disk.get("Fresh.md"), "B");
    assert.deepEqual(h.vault.calls, ["modify:Notes/Foo.md", "adapter.write:Fresh.md"]);
  });

  test("opens the note when asked, in a new tab for newtab", async () => {
    const h = harness();
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "N.md", content: "x", open: true })), {
      path: "N.md",
      created: true,
      opened: true,
    });
    await call(h, "vault.create", withHash({ path: "M.md", content: "x", open: true, newtab: true }));
    assert.deepEqual(h.vault.calls, ["create:N.md", "getLeaf:false", "openFile:N.md", "create:M.md", "getLeaf:tab", "openFile:M.md"]);
  });

  test("creates into a folder that is on disk but not indexed yet (the bridge's create_note makes it first)", async () => {
    const h = harness({ diskFolders: ["Fresh"] });
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "Fresh/N.md", content: "x" })), {
      path: "Fresh/N.md",
      created: true,
    });
    assert.equal(h.vault.notes.get("Fresh/N.md"), "x");
  });

  test("refuses, or replaces with overwrite, a file another writer created in the instant before vault.create", async () => {
    const h = harness();
    h.vault.raceOnCreate = { path: "N.md", content: "theirs" };
    assert.equal((await refusal(call(h, "vault.create", withHash({ path: "N.md", content: "mine" })))).reason, "already_exists");
    assert.equal(h.vault.disk.get("N.md"), "theirs");
    const h2 = harness();
    h2.vault.raceOnCreate = { path: "N.md", content: "theirs" };
    assert.deepEqual(await call(h2, "vault.create", withHash({ path: "N.md", content: "mine", overwrite: true })), {
      path: "N.md",
      created: false,
    });
    assert.equal(h2.vault.disk.get("N.md"), "mine");
  });

  test("a failed open does not fail the write", async () => {
    const h = harness();
    h.vault.failOpen = true;
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "N.md", content: "x", open: true })), {
      path: "N.md",
      created: true,
      opened: false,
    });
    assert.equal(h.vault.notes.get("N.md"), "x");
  });
});

describe("vault.read", () => {
  test("reads the exact path, another letter case, and a file the index has not caught up with", async () => {
    const h = harness({ notes: { "Projects/Plan.md": "plan" }, disk: { "Fresh.md": "fresh" } });
    assert.deepEqual(await call(h, "vault.read", { path: "Projects/Plan.md" }), { path: "Projects/Plan.md", content: "plan" });
    assert.deepEqual(await call(h, "vault.read", { path: "projects/plan.md" }), { path: "Projects/Plan.md", content: "plan" });
    assert.deepEqual(await call(h, "vault.read", { path: "Fresh.md" }), { path: "Fresh.md", content: "fresh" });
  });

  test("refuses a folder in any letter case, and answers not_found for a missing note", async () => {
    const h = harness({ notes: { "Projects/Plan.md": "plan" } });
    assert.equal((await refusal(call(h, "vault.read", { path: "Projects" }))).reason, "path_refused");
    const folded = await refusal(call(h, "vault.read", { path: "projects" }));
    assert.equal(folded.reason, "path_refused");
    assert.match(folded.message, /is the folder Projects/);
    assert.equal((await refusal(call(h, "vault.read", { path: "Missing.md" }))).reason, "not_found");
  });

  test("refuses a whole read of a file larger than MAX_READ_BYTES, indexed or on disk", async () => {
    const h = harness({ notes: { "big.mp4": "" }, disk: { "fresh.mp4": "" } });
    h.vault.sizes.set("big.mp4", MAX_READ_BYTES + 1);
    h.vault.sizes.set("fresh.mp4", MAX_READ_BYTES + 1);
    assert.equal((await refusal(call(h, "vault.read", { path: "big.mp4" }))).reason, "too_large");
    assert.equal((await refusal(call(h, "vault.read", { path: "fresh.mp4" }))).reason, "too_large");
  });

  test("a tail read returns the end of a Markdown note however large it grew, and no more", async () => {
    const body = `${"x".repeat(100)}<!-- marker -->`;
    const h = harness({ notes: { "log.md": body } });
    h.vault.sizes.set("log.md", MAX_READ_BYTES + 1);
    assert.equal((await refusal(call(h, "vault.read", { path: "log.md" }))).reason, "too_large");
    assert.deepEqual(await call(h, "vault.read", { path: "log.md", tailChars: 15 }), { path: "log.md", content: "<!-- marker -->" });
    assert.deepEqual(await call(h, "vault.read", { path: "log.md", tailChars: 64 * 1024 }), { path: "log.md", content: body });
  });

  test("a tail read never starts on half a surrogate pair, and is served for any file however large", async () => {
    const h = harness({ notes: { "e.md": `a${EMOJI}b`, "log.txt": "older lines\nlast line" } });
    h.vault.sizes.set("log.txt", MAX_READ_BYTES + 1);
    assert.deepEqual(await call(h, "vault.read", { path: "e.md", tailChars: 2 }), { path: "e.md", content: "b" });
    assert.deepEqual(await call(h, "vault.read", { path: "e.md", tailChars: 3 }), { path: "e.md", content: `${EMOJI}b` });
    assert.equal((await refusal(call(h, "vault.read", { path: "log.txt" }))).reason, "too_large");
    assert.deepEqual(await call(h, "vault.read", { path: "log.txt", tailChars: 9 }), { path: "log.txt", content: "last line" });
  });

  test("refuses a tailChars that is not an integer from 1 to MAX_TAIL_CHARS", async () => {
    const h = harness({ notes: { "a.md": "a" } });
    for (const tailChars of [0, -1, 1.5, "10", MAX_TAIL_CHARS + 1]) {
      assert.equal((await refusal(call(h, "vault.read", { path: "a.md", tailChars }))).reason, "invalid_params", String(tailChars));
    }
  });
});

describe("workspace.open", () => {
  test("answers for the open vault without a path", async () => {
    assert.deepEqual(await call(harness(), "workspace.open", {}), { opened: false, vault: "Test Vault" });
  });

  test("opens an exact path in the asked pane type", async () => {
    const h = harness({ notes: { "A.md": "a" } });
    assert.deepEqual(await call(h, "workspace.open", { path: "A.md", paneType: "tab" }), { opened: true, path: "A.md" });
    await call(h, "workspace.open", { path: "A.md", paneType: "bogus" });
    assert.deepEqual(h.vault.calls, ["getLeaf:tab", "openFile:A.md", "getLeaf:false", "openFile:A.md"]);
  });

  test("resolves link text: another case, no extension, a bare note name", async () => {
    const h = harness({ notes: { "Projects/Plan.md": "plan" } });
    for (const path of ["projects/plan.md", "Projects/Plan", "plan"]) {
      assert.deepEqual(await call(h, "workspace.open", { path }), { opened: true, path: "Projects/Plan.md" });
    }
  });

  test("refuses a missing note without leaving an empty tab behind", async () => {
    const h = harness();
    assert.equal((await refusal(call(h, "workspace.open", { path: "Missing.md", paneType: "tab" }))).reason, "not_found");
    assert.deepEqual(h.vault.calls, []);
  });

  test("waits briefly for the index to catch up with a note already on disk, then opens it", async () => {
    const h = harness({ disk: { "Fresh.md": "fresh" } });
    setTimeout(() => h.vault.indexFromDisk("Fresh.md"), 20);
    assert.deepEqual(await call(h, "workspace.open", { path: "Fresh.md" }), { opened: true, path: "Fresh.md" });
  });

  test("gives up on a note the index never picks up, and refuses a folder on disk", async () => {
    const h = harness({ disk: { "Fresh.md": "fresh" }, diskFolders: ["Inbox"] });
    const error = await refusal(call(h, "workspace.open", { path: "Fresh.md", paneType: "tab" }));
    assert.equal(error.reason, "not_found");
    assert.doesNotMatch(error.message, /retry/);
    assert.equal((await refusal(call(h, "workspace.open", { path: "Inbox" }))).reason, "path_refused");
    assert.deepEqual(h.vault.calls, []);
  });
});

describe("vault.search keeps the REST plugin's simple search", () => {
  test("reports a name match by the note's name, a text match with 100 characters either side", async () => {
    const body = `${"a".repeat(150)}needle${"b".repeat(150)}`;
    const h = harness({ notes: { "Notes/needle.md": "nothing here", "Notes/Other.md": body } });
    const result = (await call(h, "vault.search", { query: "needle" })) as { results: Array<{ path: string; text?: string }> };
    assert.deepEqual(result.results[0], { path: "Notes/needle.md", text: "needle" });
    assert.deepEqual(result.results[1], { path: "Notes/Other.md", text: `${"a".repeat(100)}needle${"b".repeat(100)}` });
  });

  test("skips the text of a match that straddles the name and the body", async () => {
    const straddling = {
      ...runtime,
      prepareSimpleSearch: () => (text: string) => {
        const offset = text.indexOf("\n\n") + 2;
        return { score: 1, matches: [[offset - 3, offset + 2]] as Array<[number, number]> };
      },
    };
    const h = harness({ notes: { "N.md": "body" } }, straddling);
    const result = (await call(h, "vault.search", { query: "x" })) as { results: unknown[] };
    assert.deepEqual(result.results, [{ path: "N.md" }]);
  });

  test("never cuts a surrogate pair at either end of the context", async () => {
    const h = harness({
      notes: {
        "End.md": `Q${"a".repeat(99)}${EMOJI}tail`,
        "Start.md": `${EMOJI}${"c".repeat(99)}Q`,
      },
    });
    const result = (await call(h, "vault.search", { query: "Q" })) as { results: Array<{ path: string; text?: string }> };
    const byPath = Object.fromEntries(result.results.map((r) => [r.path, r.text]));
    assert.equal(byPath["End.md"], `Q${"a".repeat(99)}${EMOJI}`);
    assert.equal(byPath["Start.md"], `${EMOJI}${"c".repeat(99)}Q`);
  });

  test("narrows to a folder, matched exactly or in another letter case", async () => {
    const h = harness({ notes: { "Research/a.md": "hit", "Other/b.md": "hit" } });
    for (const path of ["Research", "research"]) {
      const result = (await call(h, "vault.search", { query: "hit", path })) as { results: Array<{ path: string }> };
      assert.deepEqual(result.results.map((r) => r.path), ["Research/a.md"]);
    }
  });

  test("refuses a folder that does not exist, and a note given as the folder in any letter case", async () => {
    const h = harness({ notes: { "Research/a.md": "hit" } });
    assert.equal((await refusal(call(h, "vault.search", { query: "hit", path: "Nope" }))).reason, "not_found");
    assert.equal((await refusal(call(h, "vault.search", { query: "hit", path: "Research/a.md" }))).reason, "path_refused");
    assert.equal((await refusal(call(h, "vault.search", { query: "hit", path: "research/A.md" }))).reason, "path_refused");
  });

  test("an empty path means the whole vault", async () => {
    const h = harness({ notes: { "Research/a.md": "hit", "b.md": "hit" } });
    const result = (await call(h, "vault.search", { query: "hit", path: "" })) as { results: unknown[] };
    assert.equal(result.results.length, 2);
  });

  test("sorts by score, honours limit, and caps an unlimited search at MAX_SEARCH_RESULTS", async () => {
    const notes: Record<string, string> = { "late.md": "....hit", "early.md": "hit" };
    for (let i = 0; i < MAX_SEARCH_RESULTS + 5; i += 1) notes[`bulk/n${i}.md`] = `..........hit`;
    const h = harness({ notes });
    const limited = (await call(h, "vault.search", { query: "hit", limit: 2 })) as { results: Array<{ path: string }>; total: number };
    assert.deepEqual(limited.results.map((r) => r.path), ["early.md", "late.md"]);
    assert.equal(limited.total, MAX_SEARCH_RESULTS + 7);
    const unlimited = (await call(h, "vault.search", { query: "hit" })) as { results: unknown[] };
    assert.equal(unlimited.results.length, MAX_SEARCH_RESULTS);
  });

  test("never searches the config folder", async () => {
    const h = harness({ notes: { ".obsidian/snippets.md": "hit", "a.md": "hit" } });
    const result = (await call(h, "vault.search", { query: "hit" })) as { results: Array<{ path: string }> };
    assert.deepEqual(result.results.map((r) => r.path), ["a.md"]);
  });

  test("refuses an empty, blank or over-long query", async () => {
    for (const query of ["", "   ", "q".repeat(1025)]) {
      assert.equal((await refusal(call(harness(), "vault.search", { query }))).reason, "invalid_params");
    }
  });

  test("reads the usual spellings of a folder as that folder", async () => {
    const h = harness({ notes: { "Research/a.md": "hit", "b.md": "hit" } });
    for (const path of ["Research/", "/Research", "./Research", " Research ", "/./Research/", "Research/.", "Research//"]) {
      const result = (await call(h, "vault.search", { query: "hit", path })) as { results: Array<{ path: string }> };
      assert.deepEqual(result.results.map((r) => r.path), ["Research/a.md"], JSON.stringify(path));
    }
  });

  test("reads '/', '.', './' and blank as the whole vault", async () => {
    const h = harness({ notes: { "Research/a.md": "hit", "b.md": "hit" } });
    for (const path of ["/", ".", "./", "   "]) {
      const result = (await call(h, "vault.search", { query: "hit", path })) as { results: unknown[] };
      assert.equal(result.results.length, 2, JSON.stringify(path));
    }
  });

  test("still refuses a spelling that climbs out, names a hidden folder, or has an empty or backslash segment", async () => {
    const h = harness({ notes: { "Research/a.md": "hit" } });
    for (const path of ["../Research", "/../Research", "Research/..", ".obsidian", "a//b", `Research${BACKSLASH}a`]) {
      assert.equal((await refusal(call(h, "vault.search", { query: "hit", path }))).reason, "path_refused", JSON.stringify(path));
    }
  });

  test("an absolute file-system path names no vault folder, so it fails loudly instead of matching nothing", async () => {
    const h = harness({ notes: { "Research/a.md": "hit" } });
    const error = await refusal(call(h, "vault.search", { query: "hit", path: "/Users/someone/Vault/Research" }));
    assert.equal(error.reason, "not_found");
  });
});

describe("normalizeSearchFolder", () => {
  test("strips vault-rooted prefixes and trailing slashes, and maps the root to null", () => {
    const cases: Array<[string, string | null]> = [
      ["Research", "Research"],
      ["Research/", "Research"],
      ["/Research", "Research"],
      ["./Research", "Research"],
      ["//./Research/./", "Research"],
      ["  Projects/Plans  ", "Projects/Plans"],
      ["", null],
      ["/", null],
      [".", null],
      ["./", null],
      ["/.", null],
      ["..", ".."],
      ["../x", "../x"],
      ["a//b", "a//b"],
      [".obsidian", ".obsidian"],
    ];
    for (const [input, expected] of cases) assert.equal(normalizeSearchFolder(input), expected, JSON.stringify(input));
  });
});

describe("races with another writer, under a vault.create that would overwrite an unindexed file", () => {
  function racing(): ReturnType<typeof harness> {
    const h = harness();
    h.vault.createRefusesIndexedOnly = true;
    h.vault.onCreateFolder = (folder) => {
      if (folder === "New") h.vault.disk.set("New/N.md", "theirs");
    };
    return h;
  }

  test("an append keeps the other writer's text and never calls vault.create", async () => {
    const h = racing();
    assert.deepEqual(await call(h, "vault.append", withHash({ path: "New/N.md", content: "mine" })), {
      path: "New/N.md",
      created: false,
    });
    assert.equal(h.vault.disk.get("New/N.md"), "theirs\nmine");
    assert.deepEqual(h.vault.createAttempts, []);
  });

  test("a create refuses without overwrite, replaces with it, and never calls vault.create", async () => {
    const h = racing();
    assert.equal((await refusal(call(h, "vault.create", withHash({ path: "New/N.md", content: "mine" })))).reason, "already_exists");
    assert.equal(h.vault.disk.get("New/N.md"), "theirs");
    assert.deepEqual(h.vault.createAttempts, []);
    const h2 = racing();
    assert.deepEqual(await call(h2, "vault.create", withHash({ path: "New/N.md", content: "mine", overwrite: true })), {
      path: "New/N.md",
      created: false,
    });
    assert.equal(h2.vault.disk.get("New/N.md"), "mine");
    assert.ok(h2.vault.calls.includes("adapter.write:New/N.md"));
    assert.deepEqual(h2.vault.createAttempts, []);
  });
});

describe("what is audited, and what never is", () => {
  test("each refusal the bridge's guard should have made, and a damaged body, is audited once by detail and path digest", async () => {
    const cases: Array<{ detail: string; method: string; params: Record<string, unknown>; configDir?: string }> = [
      { detail: "not_vault_relative", method: "vault.read", params: { path: "/etc/secret-notes" } },
      { detail: "dot_or_empty_segment", method: "vault.read", params: { path: "../secret-notes.md" } },
      { detail: "config_folder", method: "vault.read", params: { path: "config/secret-notes.json" }, configDir: "config" },
      { detail: "content_sha256_missing", method: "vault.create", params: { path: "secret-notes.md", content: "x" } },
      {
        detail: "content_sha256_mismatch",
        method: "vault.append",
        params: { path: "secret-notes.md", content: "x", contentSha256: sha256("y") },
      },
    ];
    for (const { detail, method, params, configDir } of cases) {
      const h = harness(configDir ? { configDir } : {});
      assert.equal((await refusal(call(h, method, params))).detail, detail);
      assert.equal(h.audits.length, 1, detail);
      assert.equal(h.audits[0].eventType, "LAUNCHER_VAULT_REFUSED");
      assert.equal(h.audits[0].detail, detail);
      assert.equal(h.audits[0].pathSha256, sha256(String(params.path)));
      assert.ok(!JSON.stringify(h.audits).includes("secret-notes"), detail);
    }
  });

  test("an invalid command id is audited by type or digest, never its text", async () => {
    const h = harness();
    await refusal(call(h, "commands.execute", { id: 42 }));
    const long = `secret-${"x".repeat(MAX_COMMAND_ID_CHARS)}`;
    await refusal(call(h, "commands.execute", { id: long }));
    assert.equal(h.audits[0].commandIdType, "number");
    assert.equal(h.audits[1].commandIdLength, long.length);
    assert.equal(h.audits[1].commandIdSha256, sha256(long));
    assert.ok(!JSON.stringify(h.audits).includes("secret-"));
  });
});

describe("letter case, limits and link text", () => {
  test("two indexed entries that differ only in letter case are refused as ambiguous, never guessed between", async () => {
    const h = harness({ notes: { "Log.md": "a", "log.md": "b" }, folders: ["Research", "research"] });
    assert.equal((await refusal(call(h, "vault.read", { path: "LOG.md" }))).detail, "case_ambiguous");
    assert.equal((await refusal(call(h, "vault.append", withHash({ path: "LOG.md", content: "x" })))).detail, "case_ambiguous");
    assert.equal((await refusal(call(h, "vault.search", { query: "x", path: "RESEARCH" }))).detail, "case_ambiguous");
    assert.equal(h.vault.notes.get("Log.md"), "a");
    assert.equal(h.vault.notes.get("log.md"), "b");
  });

  test("the config folder is refused in any letter case, whatever the case of its own name", () => {
    const cases: Array<[string, string]> = [
      ["Config", "config/app.json"],
      ["MyConfig", "myconfig"],
      ["MyConfig", "MYCONFIG/x"],
      ["config", "CONFIG/x"],
    ];
    for (const [configDir, input] of cases) {
      assert.throws(
        () => guardPath(input, configDir, runtime),
        (error: unknown) => error instanceof VaultIpcError && error.detail === "config_folder",
        `${configDir}: ${input}`
      );
    }
  });

  test("a body of exactly MAX_NOTE_BYTES is written, and a whole read of exactly MAX_READ_BYTES is served", async () => {
    assert.equal(MAX_READ_BYTES, MAX_NOTE_BYTES);
    const h = harness();
    const content = "x".repeat(MAX_NOTE_BYTES);
    assert.deepEqual(await call(h, "vault.create", withHash({ path: "big.md", content })), { path: "big.md", created: true });
    assert.equal(h.vault.fileOf("big.md").stat.size, MAX_READ_BYTES);
    const read = (await call(h, "vault.read", { path: "big.md" })) as { content: string };
    assert.equal(read.content.length, MAX_NOTE_BYTES);
  });

  test("open waits for the exact note on disk rather than opening another note the same text links to", async () => {
    const h = harness({ notes: { "Archive/Summary.md": "old" }, disk: { "Summary.md": "new" } });
    setTimeout(() => h.vault.indexFromDisk("Summary.md"), 20);
    assert.deepEqual(await call(h, "workspace.open", { path: "Summary.md" }), { opened: true, path: "Summary.md" });
    assert.deepEqual(h.vault.calls, ["getLeaf:false", "openFile:Summary.md"]);
  });

  test("a folder path still opens the note its name links to", async () => {
    const h = harness({ notes: { "Projects.md": "p", "Projects/Plan.md": "plan" } });
    assert.deepEqual(await call(h, "workspace.open", { path: "Projects" }), { opened: true, path: "Projects.md" });
  });
});

describe("vault.info", () => {
  test("names the vault, the version, every method and the vault's folder", async () => {
    const info = (await call(harness(), "vault.info", {})) as Record<string, unknown>;
    assert.equal(info.vault, "Test Vault");
    assert.equal(info.version, "0.2.0");
    assert.equal(info.basePath, "/vaults/Test Vault");
    assert.deepEqual(info.methods, [
      "vault.info",
      "vault.read",
      "vault.create",
      "vault.append",
      "vault.search",
      "workspace.open",
      "commands.execute",
    ]);
  });
});
