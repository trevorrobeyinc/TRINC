import type { McpToolBinding } from "../types/mcp.js";

export interface PlannedToolCall {
  runtimeName: string;
  args: Record<string, unknown>;
}

const builtinMiyoSearchTool: McpToolBinding = {
  runtimeName: "miyo_search_context",
  displayName: "Miyo Semantic Search",
  description:
    "Search indexed vault context for note-aware questions before the final assistant response.",
  category: "mcp",
  bridge: {
    toolName: "miyo_search_context",
    serverId: "miyo-compat",
  },
};

const builtinZettelkastenTools: McpToolBinding[] = [
  {
    runtimeName: "zettelkasten_serendipity",
    displayName: "Serendipity Generator",
    description: "Surface unexpected connections, forgotten insights, and novel perspectives for a note. Args: {notePath, vault}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_serendipity", serverId: "zettelkasten-internal" },
  },
  {
    runtimeName: "zettelkasten_cross_domain",
    displayName: "Cross-Domain Connector",
    description: "Identify structural isomorphisms and cross-domain bridges for a note. Args: {notePath, vault}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_cross_domain", serverId: "zettelkasten-internal" },
  },
  {
    runtimeName: "zettelkasten_echo_chamber",
    displayName: "Echo Chamber Breaker",
    description: "Challenge assumptions and surface counterarguments for a note. Args: {notePath, vault}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_echo_chamber", serverId: "zettelkasten-internal" },
  },
  {
    runtimeName: "zettelkasten_semantic_linker",
    displayName: "Semantic Linker",
    description: "Classify typed relationships between a note and its semantic neighbors. Args: {notePath, vault}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_semantic_linker", serverId: "zettelkasten-internal" },
  },
  {
    runtimeName: "zettelkasten_orphan_rescue",
    displayName: "Orphan Rescuer",
    description: "Identify and rescue orphan notes by suggesting connections. Args: {notePath, vault, options: {batchMode}}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_orphan_rescue", serverId: "zettelkasten-internal" },
  },
  {
    runtimeName: "zettelkasten_vault_health",
    displayName: "Vault Health",
    description: "Compute vault connectivity health score: orphan ratio, connectivity, staleness. Args: {vault}",
    category: "mcp",
    bridge: { toolName: "zettelkasten_vault_health", serverId: "zettelkasten-internal" },
  },
];

export class ToolRouter {
  getPlanningTools(rawUserMessage: string, tools: McpToolBinding[]): McpToolBinding[] {
    if (!this.looksVaultIntent(rawUserMessage)) {
      return tools;
    }

    let augmented = tools;

    // Inject Miyo search if not present
    const hasMiyo = tools.some(
      (tool) =>
        tool.runtimeName === builtinMiyoSearchTool.runtimeName ||
        tool.bridge.toolName === builtinMiyoSearchTool.bridge.toolName
    );
    if (!hasMiyo) {
      augmented = [...augmented, builtinMiyoSearchTool];
    }

    // Inject Zettelkasten tools if Zettelkasten intent detected and not already present
    if (this.looksZettelkastenIntent(rawUserMessage)) {
      const existing = new Set(augmented.map((t) => t.runtimeName));
      const missing = builtinZettelkastenTools.filter((t) => !existing.has(t.runtimeName));
      if (missing.length > 0) {
        augmented = [...augmented, ...missing];
      }
    }

    return augmented;
  }

  private looksZettelkastenIntent(rawUserMessage: string): boolean {
    const lowered = rawUserMessage.toLowerCase();
    const keywords = [
      "zettelkasten",
      "orphan",
      "serendipity",
      "cross-domain",
      "cross domain",
      "echo chamber",
      "semantic link",
      "link suggestion",
      "challenge assumptions",
      "vault health",
      "knowledge graph",
      "rescue",
      "connections between",
      "find connections",
    ];
    return keywords.some((k) => lowered.includes(k));
  }

  describeTools(tools: McpToolBinding[]): string {
    if (tools.length === 0) {
      return "No MCP tools are available for this turn.";
    }

    return tools
      .map((tool) => {
        const confirmHint = tool.requiresConfirmation
          ? " (requires user confirmation — may be skipped)"
          : "";
        return `- ${tool.runtimeName}: ${tool.displayName}. ${tool.description}${confirmHint}. Bridge tool: ${tool.bridge.toolName}.`;
      })
      .join("\n");
  }

  looksVaultIntent(rawUserMessage: string): boolean {
    const lowered = rawUserMessage.toLowerCase();
    if (lowered.includes("@vault")) {
      return true;
    }

    const keywords = [
      "vault",
      "note",
      "notes",
      "search",
      "find",
      "related",
      "semantic",
      "index",
      "document",
      "documents",
      "pdf",
      "transcript",
      // Zettelkasten intent keywords
      "zettelkasten",
      "orphan",
      "serendipity",
      "cross-domain",
      "cross domain",
      "echo chamber",
      "semantic link",
      "link suggestion",
      "challenge assumptions",
      "vault health",
      "knowledge graph",
    ];
    return keywords.some((keyword) => lowered.includes(keyword));
  }

  /**
   * Check if a tool name is a Zettelkasten command.
   */
  isZettelkastenTool(toolName: string): boolean {
    return toolName.startsWith("zettelkasten_");
  }

  /**
   * Map a zettelkasten_* tool name to the command name.
   */
  resolveZettelkastenCommand(toolName: string): string | undefined {
    const map: Record<string, string> = {
      zettelkasten_serendipity: "serendipity",
      zettelkasten_cross_domain: "cross-domain",
      zettelkasten_echo_chamber: "echo-chamber",
      zettelkasten_semantic_linker: "semantic-linker",
      zettelkasten_orphan_rescue: "orphan-rescue",
      zettelkasten_vault_health: "health",
    };
    return map[toolName];
  }

  resolveBinding(toolName: string, tools: McpToolBinding[]): McpToolBinding | undefined {
    const normalized = toolName.trim().toLowerCase();

    return tools.find((tool) => {
      return (
        tool.runtimeName.toLowerCase() === normalized ||
        tool.bridge.toolName.toLowerCase() === normalized ||
        tool.displayName.toLowerCase() === normalized
      );
    });
  }

  /**
   * If the planner omitted a write tool but the user clearly asked for note creation/append,
   * inject the matching tool into the plan. Only fires when the tool is available and ungated.
   *
   * Returns { augmented, toolInjected } so callers can log when augmentation fired.
   */
  augmentWithWriteIntent(
    rawUserMessage: string,
    tools: McpToolBinding[],
    planned: PlannedToolCall[]
  ): { result: PlannedToolCall[]; injected?: string; writeIntentDetected: boolean } {
    const hasPlannedWrite = planned.some((p) => {
      const binding = this.resolveBinding(p.runtimeName, tools);
      return binding?.isMutating;
    });
    if (hasPlannedWrite) return { result: planned, writeIntentDetected: true };

    const lowered = rawUserMessage.toLowerCase();

    // Patterns require "note" as the object of creation, not idiomatic uses like "make a note of"
    // Allow an optional single adjective before "note" (e.g. "summary note", "new note", "disposable note")
    const createPatterns = [
      /\bcreate\s+(?:a\s+)?(?:\w+\s+)?note\b/,
      /\bmake\s+a\s+(?:\w+\s+)?note\s+(?:named|called|about|titled|in|with)\b/,
      /\bwrite\s+(?:a\s+)?(?:\w+\s+)?note\b/,
      /\bsave\s+(?:this\s+)?as\s+a\s+(?:\w+\s+)?note\b/,
      /\bwrite\s+(?:this\s+)?to\s+a\s+(?:\w+\s+)?note\b/,
    ];
    const appendPatterns = [
      /\bappend\s+to\s+(?:the\s+)?(?:note|file)\b/,
      /\badd\s+(?:this\s+)?to\s+(?:the\s+)?note\b/,
    ];

    const wantsCreate = createPatterns.some((p) => p.test(lowered));
    const wantsAppend = !wantsCreate && appendPatterns.some((p) => p.test(lowered));
    if (!wantsCreate && !wantsAppend) return { result: planned, writeIntentDetected: false };

    const targetOp = wantsCreate ? "create_note" : "append_note";

    // Check for ungated write tool first
    const writeTool = tools.find(
      (t) => t.bridge.toolName?.includes(targetOp) && !t.requiresConfirmation
    );
    if (!writeTool) {
      // Write intent detected but tool is gated or missing — signal for disclaimer
      return { result: planned, writeIntentDetected: true };
    }

    const notePath = this.extractNotePath(rawUserMessage);
    const args: Record<string, unknown> = {
      content: "__PENDING_FROM_SEARCH_RESULTS__",
    };
    if (notePath) {
      args.path = notePath;
    }

    return {
      result: [...planned, { runtimeName: writeTool.runtimeName, args }],
      injected: writeTool.bridge.toolName,
      writeIntentDetected: true,
    };
  }

  /**
   * Extract a note path from user message. Handles "named X", "called X", and quoted names.
   * Returns a .md path or undefined.
   */
  extractNotePath(rawUserMessage: string): string | undefined {
    // Try quoted name first: named "My Note Title" or called 'my-note'
    const quotedMatch = rawUserMessage.match(/(?:named?|called)\s+["']([^"']+)["']/i);
    if (quotedMatch) {
      return this.sanitizeNotePath(quotedMatch[1]);
    }

    // Try unquoted single-token name: named my_note or called daily-log
    const tokenMatch = rawUserMessage.match(/(?:named?|called)\s+([\w][\w./-]*[\w])/i);
    if (tokenMatch) {
      return this.sanitizeNotePath(tokenMatch[1]);
    }

    return undefined;
  }

  private sanitizeNotePath(raw: string): string {
    // Strip trailing punctuation that isn't part of the name
    let cleaned = raw.replace(/[.,;:!?]+$/, "");
    // Ensure .md extension
    if (!cleaned.endsWith(".md")) {
      cleaned = `${cleaned}.md`;
    }
    return cleaned;
  }

  /**
   * If the user references a specific note by name (e.g. 'the "Dev Sider OpenClaw" note')
   * but the planner didn't include a read_note call for it, inject one.
   */
  augmentWithReadIntent(
    rawUserMessage: string,
    tools: McpToolBinding[],
    planned: PlannedToolCall[]
  ): { result: PlannedToolCall[]; injectedReads: string[] } {
    const readTool = tools.find(
      (t) => t.bridge.toolName === "obsidian_read_note" && !t.requiresConfirmation
    );
    if (!readTool) return { result: planned, injectedReads: [] };

    // Check if the planner already planned a read_note
    const hasPlannedRead = planned.some((p) => {
      const binding = this.resolveBinding(p.runtimeName, tools);
      return binding?.bridge.toolName === "obsidian_read_note";
    });
    if (hasPlannedRead) return { result: planned, injectedReads: [] };

    const referencedNotes = this.extractReferencedNotes(rawUserMessage);
    if (referencedNotes.length === 0) return { result: planned, injectedReads: [] };

    const readCalls: PlannedToolCall[] = referencedNotes.map((noteName) => ({
      runtimeName: readTool.runtimeName,
      args: { path: this.sanitizeNotePath(noteName) },
    }));

    return {
      result: [...readCalls, ...planned],
      injectedReads: referencedNotes,
    };
  }

  /**
   * Extract note names that the user explicitly references.
   * Matches patterns like: the "Note Name" note, "Note Name" note, read/summarize "Note Name"
   */
  /**
   * Public accessor for extracting referenced note names from user message.
   * Returns raw note names (without .md extension).
   */
  extractReferencedNoteNames(rawUserMessage: string): string[] {
    return this.extractReferencedNotes(rawUserMessage);
  }

  private extractReferencedNotes(rawUserMessage: string): string[] {
    const notes: string[] = [];
    const seen = new Set<string>();

    // Match quoted note references: the "Note Name" note, "Note Name" note, summarize "Note Name"
    const quotedRefs = rawUserMessage.matchAll(
      /(?:the\s+)?["'\u201c\u201d]([^"'\u201c\u201d]+)["'\u201c\u201d]\s*note\b/gi
    );
    for (const match of quotedRefs) {
      const name = match[1].trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        notes.push(name);
      }
    }

    // Match "summarize/read/what is the X note" with quoted names not followed by "note"
    const actionRefs = rawUserMessage.matchAll(
      /(?:summarize|read|what\s+(?:is|does))\s+(?:the\s+)?["'\u201c\u201d]([^"'\u201c\u201d]+)["'\u201c\u201d]/gi
    );
    for (const match of actionRefs) {
      const name = match[1].trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        notes.push(name);
      }
    }

    // Filter out names that look like the note being created (from extractNotePath)
    const createdPath = this.extractNotePath(rawUserMessage);
    const createdName = createdPath?.replace(/\.md$/, "").toLowerCase();
    return notes.filter((n) => n.toLowerCase() !== createdName);
  }

  chooseFallbackTool(rawUserMessage: string, tools: McpToolBinding[]): PlannedToolCall[] {
    const lowered = rawUserMessage.toLowerCase();
    if (this.looksVaultIntent(rawUserMessage)) {
      const miyo = tools.find(
        (tool) =>
          tool.runtimeName === builtinMiyoSearchTool.runtimeName ||
          tool.bridge.toolName === builtinMiyoSearchTool.bridge.toolName
      );
      if (miyo) {
        return [
          {
            runtimeName: miyo.runtimeName,
            args: {
              query: rawUserMessage,
              limit: 5,
            },
          },
        ];
      }
    }

    const healthTool = tools.find((tool) => tool.bridge.toolName === "obsidian_health");
    if (
      healthTool &&
      (lowered.includes("health") || lowered.includes("bridge") || lowered.includes("mcp"))
    ) {
      return [{ runtimeName: healthTool.runtimeName, args: {} }];
    }

    return [];
  }
}
