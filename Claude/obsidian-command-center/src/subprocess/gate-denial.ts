/**
 * Classify the engine's fail-closed operator-approve refusal (added 2026-10-07).
 *
 * `scripts/run-workflow.js` prints exactly one line, `Operator-approve denied: <reason>`, and exits 1
 * before any workflow exists, so nothing was spent. The reason text comes from
 * openclaw-bridge/core/operator-approve-gate.js and is one of:
 *   - "not armed — run: operator-approve-gate arm ..."
 *   - "armed token expired (Ns > 300s) — re-run: operator-approve-gate arm"
 *   - "armed token does not match sealed nonce (tampered/stale) — re-run: ..."
 *
 * Until now only "not armed" was recognised, so an expired token (the likely failure when the arm
 * ceremony and the run call are separated by more than five minutes) came back as the unhelpful
 * `engine_exited_before_start`. Each case now gets its own code. `operator_gate_not_armed` keeps its
 * exact spelling because the Copilot agent's tool results and prompts already refer to it.
 *
 * Pure module, erasable TypeScript only (see post-run-ledger.ts).
 */

export type GateDenialCode =
  | "operator_gate_not_armed"
  | "operator_gate_expired"
  | "operator_gate_token_mismatch"
  | "operator_gate_denied";

const DENIED_LINE = /Operator-approve denied:\s*([^\r\n]*)/i;

/** Returns the denial code for an engine stderr tail, or null when it holds no gate denial. */
export function classifyGateDenial(stderr: string): GateDenialCode | null {
  const match = DENIED_LINE.exec(stderr);
  if (!match) return null;
  const reason = match[1].trim().toLowerCase();
  if (reason.startsWith("not armed")) return "operator_gate_not_armed";
  if (reason.startsWith("armed token expired")) return "operator_gate_expired";
  if (reason.startsWith("armed token does not match")) return "operator_gate_token_mismatch";
  return "operator_gate_denied";
}

/** True when `message` starts with one of the codes above (the runner prefixes its errors with it). */
export function gateCodeFromMessage(message: string | null | undefined): GateDenialCode | null {
  if (!message) return null;
  const match = /^(operator_gate_[a-z_]+)/.exec(message);
  if (!match) return null;
  switch (match[1]) {
    case "operator_gate_not_armed":
    case "operator_gate_expired":
    case "operator_gate_token_mismatch":
    case "operator_gate_denied":
      return match[1];
    default:
      return null;
  }
}

const REARM =
  "The operator arms a fresh token with `operator-approved-gate arm openclaw` (YubiKey PIN + touch), " +
  "then you re-send the same request within 5 minutes. One token = one run.";

/** What the caller should do next, phrased for an agent reading a tool result. */
export function gateDenialAction(code: GateDenialCode): string {
  switch (code) {
    case "operator_gate_not_armed":
      return `No operator-approve token was armed; nothing was started or spent. ${REARM}`;
    case "operator_gate_expired":
      return `The armed token was older than 300 s; nothing was started or spent. ${REARM}`;
    case "operator_gate_token_mismatch":
      return (
        "The armed token no longer matches the sealed nonce (stale, or already used by another run); " +
        `nothing was started or spent. ${REARM}`
      );
    case "operator_gate_denied":
      return `The engine's operator gate refused the run for a reason this plugin does not recognise; nothing was started or spent. ${REARM}`;
  }
}
