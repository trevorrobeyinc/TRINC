import { describe, expect, it } from "vitest";
import { ToolRouter } from "../../src/services/ToolRouter.js";
import type { McpToolBinding } from "../../src/types/mcp.js";

const searchTool: McpToolBinding = {
  runtimeName: "mcp_test_obsidian_search_notes",
  displayName: "Search Notes",
  description: "Search notes in the vault.",
  category: "mcp",
  bridge: { toolName: "obsidian_search_notes", serverId: "test", operation: "search_notes" },
};

const createToolAllowed: McpToolBinding = {
  runtimeName: "mcp_test_obsidian_create_note",
  displayName: "Create Note",
  description: "Create a new note.",
  category: "mcp",
  isMutating: true,
  requiresConfirmation: false,
  bridge: { toolName: "obsidian_create_note", serverId: "test", operation: "create_note" },
};

const createToolGated: McpToolBinding = {
  ...createToolAllowed,
  requiresConfirmation: true,
};

const appendToolAllowed: McpToolBinding = {
  runtimeName: "mcp_test_obsidian_append_note",
  displayName: "Append Note",
  description: "Append to a note.",
  category: "mcp",
  isMutating: true,
  requiresConfirmation: false,
  bridge: { toolName: "obsidian_append_note", serverId: "test", operation: "append_note" },
};

const router = new ToolRouter();

describe("augmentWithWriteIntent", () => {
  // --- True positives: should inject ---

  it("injects create_note for 'create a note' when tool is available and ungated", () => {
    const planned = [{ runtimeName: searchTool.runtimeName, args: { query: "leadership" } }];
    const { result, injected } = router.augmentWithWriteIntent(
      "Search for leadership notes. Create a note named test_note with a summary.",
      [searchTool, createToolAllowed],
      planned
    );
    expect(result).toHaveLength(2);
    expect(result[1].runtimeName).toBe(createToolAllowed.runtimeName);
    expect(result[1].args.path).toBe("test_note.md");
    expect(result[1].args.content).toBe("__PENDING_FROM_SEARCH_RESULTS__");
    expect(injected).toBe("obsidian_create_note");
  });

  it("injects append_note for 'append to the note' intent", () => {
    const planned = [{ runtimeName: searchTool.runtimeName, args: { query: "leadership" } }];
    const { result, injected } = router.augmentWithWriteIntent(
      "Search leadership notes. Append to the note called summary.",
      [searchTool, appendToolAllowed],
      planned
    );
    expect(result).toHaveLength(2);
    expect(result[1].runtimeName).toBe(appendToolAllowed.runtimeName);
    expect(injected).toBe("obsidian_append_note");
  });

  it("handles multiple create-intent phrasings", () => {
    const phrasings = [
      "Create a note about this topic",
      "Write a note summarizing the results",
      "Save this as a note in my vault",
      "Write this to a note please",
      "Make a note about the search results",
      "Search for leadership notes and create a summary note",
      "Create a new note about leadership",
      "Write a summary note",
      "Save this as a summary note",
      "Make a summary note with a synopsis",
    ];
    for (const phrase of phrasings) {
      const { result, injected } = router.augmentWithWriteIntent(phrase, [createToolAllowed], []);
      expect(result).toHaveLength(1);
      expect(result[0].runtimeName).toBe(createToolAllowed.runtimeName);
      expect(injected).toBeDefined();
    }
  });

  // --- False positives: must NOT inject ---

  it("does not inject for read-only requests and writeIntentDetected is false", () => {
    const planned = [{ runtimeName: searchTool.runtimeName, args: { query: "leadership" } }];
    const { result, writeIntentDetected } = router.augmentWithWriteIntent(
      "Search my vault for notes about leadership.",
      [searchTool, createToolAllowed],
      planned
    );
    expect(result).toEqual(planned);
    expect(writeIntentDetected).toBe(false);
  });

  it("does not inject for idiomatic 'note' usage", () => {
    const falsePositives = [
      "Please note that this is important",
      "Take note of the following changes",
      "What did I note about leadership last week",
      "Summarize the key notes from my vault",
      "Please make a note of this for later",
    ];
    for (const msg of falsePositives) {
      const { result, injected } = router.augmentWithWriteIntent(msg, [createToolAllowed], []);
      expect(injected).toBeUndefined();
      expect(result).toEqual([]);
    }
  });

  it("does not inject for 'save this as' without 'a note'", () => {
    const falsePositives = [
      "I want to save this as a PDF",
      "Can you save this as a bookmark",
      "Save this as a reminder",
    ];
    for (const msg of falsePositives) {
      const { result, injected } = router.augmentWithWriteIntent(msg, [createToolAllowed], []);
      expect(injected).toBeUndefined();
      expect(result).toEqual([]);
    }
  });

  it("does not inject for generic 'add this to' without 'note'", () => {
    const falsePositives = [
      "Add this to my reading list",
      "Add this to context",
      "Append to my understanding of this topic",
    ];
    for (const msg of falsePositives) {
      const { result, injected } = router.augmentWithWriteIntent(msg, [appendToolAllowed], []);
      expect(injected).toBeUndefined();
      expect(result).toEqual([]);
    }
  });

  // --- Gating and availability ---

  it("does not inject when create_note is gated, but detects write intent", () => {
    const planned = [{ runtimeName: searchTool.runtimeName, args: { query: "leadership" } }];
    const { result, injected, writeIntentDetected } = router.augmentWithWriteIntent(
      "Create a note named test_note with a summary.",
      [searchTool, createToolGated],
      planned
    );
    expect(result).toEqual(planned);
    expect(injected).toBeUndefined();
    expect(writeIntentDetected).toBe(true);
  });

  it("does not inject when planner already planned a write tool", () => {
    const planned = [
      { runtimeName: searchTool.runtimeName, args: { query: "leadership" } },
      { runtimeName: createToolAllowed.runtimeName, args: { path: "x.md", content: "y" } },
    ];
    const { result } = router.augmentWithWriteIntent(
      "Create a note named test_note.",
      [searchTool, createToolAllowed],
      planned
    );
    expect(result).toEqual(planned);
  });

  it("does not inject when no write tool is available", () => {
    const planned = [{ runtimeName: searchTool.runtimeName, args: { query: "leadership" } }];
    const { result } = router.augmentWithWriteIntent(
      "Create a note named test_note.",
      [searchTool],
      planned
    );
    expect(result).toEqual(planned);
  });

  // --- Name extraction ---

  it("extracts name from 'named X' pattern", () => {
    const { result } = router.augmentWithWriteIntent(
      "Create a note named _copilot_smoke_leadership_20260324 with a summary.",
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBe("_copilot_smoke_leadership_20260324.md");
  });

  it("extracts name from 'called X' pattern", () => {
    const { result } = router.augmentWithWriteIntent(
      "Make a note called daily-leadership-log about what you found.",
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBe("daily-leadership-log.md");
  });

  it("strips trailing punctuation from note names", () => {
    const { result } = router.augmentWithWriteIntent(
      "Create a note named my-note. Then summarize it.",
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBe("my-note.md");
  });

  it("handles quoted note names", () => {
    const { result } = router.augmentWithWriteIntent(
      'Create a note named "My Leadership Summary" with details.',
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBe("My Leadership Summary.md");
  });

  it("preserves folder paths in note names", () => {
    const { result } = router.augmentWithWriteIntent(
      "Create a note named copilot/summaries/leadership with a summary.",
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBe("copilot/summaries/leadership.md");
  });

  it("omits path when no name is specified", () => {
    const { result } = router.augmentWithWriteIntent(
      "Create a note with a summary of leadership topics.",
      [createToolAllowed],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0].args.path).toBeUndefined();
  });

  // --- Trace output ---

  it("returns injected tool name when augmentation fires", () => {
    const { injected } = router.augmentWithWriteIntent(
      "Create a note named test.",
      [createToolAllowed],
      []
    );
    expect(injected).toBe("obsidian_create_note");
  });

  it("returns undefined injected when augmentation does not fire", () => {
    const { injected } = router.augmentWithWriteIntent(
      "Search for leadership notes.",
      [searchTool, createToolAllowed],
      []
    );
    expect(injected).toBeUndefined();
  });
});
