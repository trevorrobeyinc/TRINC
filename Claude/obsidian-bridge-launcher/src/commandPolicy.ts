/**
 * Which Obsidian commands the vault bridge may run through the launcher (commands.execute on the fd-3 pipe).
 *
 * This is the authoritative check. The bridge's own obsidian_execute_command tool can narrow it (its
 * security.executeCommandAllowlist), never widen it: whatever the bridge sends, an id this function refuses
 * does not run, and the refusal is audited as LAUNCHER_COMMAND_REFUSED. It became the authority on 2026-11-25,
 * when the Local REST API, which ran any command, stopped being the bridge's backend; the bridge keeps its
 * shape check and its deny-list (runjs:*, app:delete*) as early refusals.
 *
 * The facts the list was decided from (2026-11-25):
 * - Command Center registers four commands: command-center:run-workflow (opens the workflow modal; the
 *   operator still picks and starts the run), command-center:cancel-workflow (cancels the running research
 *   run, no prompt), command-center:toggle-pipeline-sidebar, and command-center:analyze-current-note
 *   (Zettelkasten analysis of the open note). Command Center's own bridge allows its "command-center:" prefix.
 * - The Copilot fork's headless "to note" runners: copilot:super-summarize-to-note and
 *   copilot:summarize-to-note (Command Center's video pipeline runs these two in-process). Every Copilot
 *   custom prompt gets a "copilot:<name>-to-note" id too, so a suffix rule would admit any prompt added to the
 *   custom prompts folder later, and the bridge's own create_note can write that folder.
 * - The bridge's execute_command has had no real call since 2026-08-19.
 *
 * The decision (the operator, 2026-11-25): exact ids only. There is no prefix or suffix rule, so a command
 * registered later is refused until its id is added here. command-center:cancel-workflow is left out on
 * purpose: it stops a running research run without asking.
 *
 * What exact ids do not settle (the review of 2026-11-25): an id fixes WHICH command runs, not what it does.
 * The two Copilot ids run whatever prompt their notes hold, in the fork's custom-prompts folder
 * (copilot/copilot-custom-prompts by default), and the bridge's own create_note can rewrite those notes. So a
 * client can change what an admitted Copilot command does without a new id. The runner behind them is a chat
 * call with no tools (a prompt template and a chat model, the answer written to a note), so the reach is "a
 * prompt of the client's choosing through a configured model", not code execution. The operator was shown this
 * and kept all five ids (2026-11-25, "keep all five").
 */
const ALLOWED_COMMAND_IDS: ReadonlySet<string> = new Set([
  "copilot:super-summarize-to-note",
  "copilot:summarize-to-note",
  "command-center:run-workflow",
  "command-center:toggle-pipeline-sidebar",
  "command-center:analyze-current-note",
]);

/** Obsidian command ids are case-sensitive: the comparison is exact, never lowercased or trimmed. */
export function isCommandAllowed(id: string): boolean {
  return ALLOWED_COMMAND_IDS.has(id);
}

/** The allowed ids, in the order above: a refusal names them, so a client can correct itself. */
export function allowedCommandIds(): string[] {
  return [...ALLOWED_COMMAND_IDS];
}
