/**
 * Interactive explainer documents — the visualize "interactive" module,
 * translated to the one surface where interactivity can actually live for a
 * vault: a SELF-CONTAINED .html file opened in the browser. The wrapper
 * carries the CDS tokens as real CSS custom properties (light + dark via
 * prefers-color-scheme), the spec's pre-styled bare form controls (36px
 * inputs, 4px-track/18px-thumb range sliders, outline-default buttons),
 * metric cards, and raised cards — so agent-authored fragments "write bare
 * tags" exactly like the host module.
 *
 * Security posture: a strict CSP meta (default-src 'none'; inline script and
 * style only; data: images) makes the document NETWORK-INERT — fetch/XHR/
 * WebSocket/external src all fail in-browser regardless of what the script
 * says. The sanitizer additionally strips external references and container
 * elements up front and reports every removal in warnings.
 */
import { CDS_HTML_TOKENS } from "./vizTokens";

export interface InteractiveDocSpec {
  title: string;
  /** Body HTML fragment (bare pre-styled tags welcome). */
  body: string;
  /** Inline JS (runs after the DOM; sendPrompt is stubbed). */
  script?: string;
  /** Extra CSS appended after the base stylesheet. */
  css?: string;
}

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;";

const BASE_CSS = `
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 2rem 1.5rem; max-width: 720px;
  background: var(--surface-1); color: var(--text-primary);
  font-family: var(--font-sans); font-size: 15px; line-height: 1.55;
}
h1 { font-size: 22px; font-weight: 600; margin: 0 0 1rem; }
h2 { font-size: 17px; font-weight: 600; margin: 2rem 0 0.75rem; }
h3 { font-size: 14px; font-weight: 600; margin: 1.5rem 0 0.5rem; }
p { margin: 0 0 1rem; color: var(--text-secondary); }
label { font-size: 14px; color: var(--text-secondary); }
input[type="text"], input[type="number"], select, textarea {
  height: 36px; padding: 0 12px; font: inherit; font-size: 14px;
  color: var(--text-primary); background: var(--surface-2);
  border: 0.5px solid var(--border-strong); border-radius: var(--radius);
}
textarea { height: auto; min-height: 72px; padding: 8px 12px; }
input:focus, select:focus, textarea:focus, button:focus-visible {
  outline: none; box-shadow: 0 0 0 2px var(--bg-accent), 0 0 0 3px var(--fill-accent);
}
button {
  height: 36px; padding: 0 16px; font: inherit; font-size: 14px; font-weight: 500;
  color: var(--text-primary); background: transparent;
  border: 0.5px solid var(--border-strong); border-radius: var(--radius); cursor: pointer;
}
button:hover { background: var(--surface-2); }
button:active { transform: scale(0.98); }
button.primary { background: var(--fill-accent); border-color: var(--fill-accent); color: var(--on-accent); }
input[type="range"] {
  -webkit-appearance: none; appearance: none; height: 18px; background: transparent; padding: 0;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px; background: var(--gridline);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; margin-top: -7px;
  border-radius: 50%; background: var(--fill-accent); border: none; cursor: pointer;
}
input[type="range"]::-moz-range-track { height: 4px; border-radius: 2px; background: var(--gridline); }
input[type="range"]::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%; background: var(--fill-accent); border: none; cursor: pointer;
}
.card {
  background: var(--surface-2); border: 0.5px solid var(--border);
  border-radius: 12px; padding: 1rem 1.25rem; margin: 0 0 1rem;
}
.metric {
  background: var(--surface-2); border-radius: var(--radius); padding: 1rem; border: 0.5px solid var(--border);
}
.metric .label { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
.metric .value { font-size: 24px; font-weight: 500; color: var(--text-primary); }
.hero { font-family: var(--font-voice); font-size: 48px; font-weight: 500; font-variant-numeric: tabular-nums lining-nums; }
.badge {
  display: inline-block; font-size: 12px; font-weight: 500; padding: 4px 12px;
  border-radius: var(--radius); background: var(--bg-accent); color: var(--text-accent);
}
.row { display: flex; align-items: center; gap: 12px; margin: 0 0 1.5rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 0 0 1.5rem; }
hr { border: none; border-top: 0.5px solid var(--border); margin: 1.5rem 0; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td, th { padding: 6px 8px; text-align: left; border-bottom: 0.5px solid var(--border); }
`;

/** sendPrompt exists only inside Claude's host; outside it, degrade loudly but harmlessly. */
const SEND_PROMPT_STUB = `window.sendPrompt = window.sendPrompt || function (text) {
  var n = document.createElement("div");
  n.textContent = "sendPrompt is only live inside Claude — prompt was: " + text;
  n.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:0.5px solid var(--border-strong);border-radius:8px;padding:8px 16px;font-size:13px;color:var(--text-secondary);max-width:80%;";
  document.body.appendChild(n);
  setTimeout(function () { n.remove(); }, 4000);
};`;

const EXTERNAL_URL = /(?:https?:)?\/\/[^\s"'()<>]+/i;

/** Strip network-reaching and container constructs; report every removal. */
export function sanitizeHtmlFragment(
  html: string,
  warnings: string[],
  where: string
): string {
  let out = html;
  const drop = (re: RegExp, label: string) => {
    out = out.replace(re, () => {
      warnings.push(`${where}: removed ${label}`);
      return "";
    });
  };
  drop(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script\s*>/gi, "external <script src>");
  drop(/<(?:iframe|frame|object|embed|applet|base|link|meta)\b[^>]*\/?>(?:\s*<\/(?:iframe|frame|object|embed|applet)\s*>)?/gi, "embedded/external element");
  // Inline on* handlers stay — the CSP already makes the document
  // network-inert, and the visualize patterns lean on onclick="sendPrompt(…)".
  // External src/href attributes (data: images and #fragments stay).
  out = out.replace(
    /\b(src|href|xlink:href|action|poster|formaction)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match, attr, _q, dq, sq) => {
      const value: string = dq ?? sq ?? "";
      if (value.startsWith("#") || value.startsWith("data:image/")) return match;
      warnings.push(`${where}: removed ${attr}="${value.slice(0, 60)}"`);
      return "";
    }
  );
  drop(/@import\b[^;]+;/gi, "@import");
  out = out.replace(/url\(\s*(?:"|')?\s*(?:https?:)?\/\/[^)]*\)/gi, () => {
    warnings.push(`${where}: removed external url()`);
    return "none";
  });
  return out;
}

export function buildInteractiveDoc(spec: InteractiveDocSpec): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  if (!spec.title.trim()) throw new Error("title must be a non-empty string");
  if (!spec.body.trim()) throw new Error("body must be a non-empty HTML fragment");
  const body = sanitizeHtmlFragment(spec.body, warnings, "body");
  const css = spec.css ? sanitizeHtmlFragment(spec.css, warnings, "css") : "";
  let script = spec.script ?? "";
  if (script) {
    if (/<\/script/i.test(script)) throw new Error("script must be raw JS, not a <script> tag");
    for (const token of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "navigator.sendBeacon", "import("]) {
      if (script.includes(token)) {
        warnings.push(`script: contains ${token} — the CSP blocks all network access, this call will fail`);
      }
    }
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${escapeHtml(spec.title)}</title>
<style>
${CDS_HTML_TOKENS}
${BASE_CSS}
${css}
</style>
</head>
<body>
<h1>${escapeHtml(spec.title)}</h1>
${body}
<script>
${SEND_PROMPT_STUB}
${script}
</script>
</body>
</html>
`;
  return { html, warnings };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
