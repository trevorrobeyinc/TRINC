/**
 * Dependency-free SVG sanitizer for agent-authored (or mermaid-generated)
 * markup, built on the renderer's own DOMParser/XMLSerializer.
 *
 * Threat model: an SVG written into the vault is later displayed by Obsidian
 * (embed) or rasterized onto a canvas here. Scripts, event handlers, embedded
 * documents, and external references must not survive — external refs would
 * also taint the rasterization canvas and break PNG export.
 */

const MAX_SVG_CHARS = 800_000;

const BLOCKED_ELEMENTS = new Set(["script", "foreignobject", "iframe", "embed", "object"]);

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,/i;

export interface SanitizeResult {
  svg: string;
  warnings: string[];
}

function hrefOf(el: Element): string | null {
  return el.getAttribute("href") ?? el.getAttribute("xlink:href");
}

function scrubCss(css: string): { css: string; changed: boolean } {
  let changed = false;
  let out = css.replace(/@import[^;]*;?/gi, () => {
    changed = true;
    return "";
  });
  out = out.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (match, _q, target: string) => {
    if (target.trim().startsWith("#")) return match;
    changed = true;
    return "none";
  });
  return { css: out, changed };
}

export function sanitizeSvg(input: string): SanitizeResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("svg must be a non-empty string of SVG markup");
  }
  if (input.length > MAX_SVG_CHARS) {
    throw new Error(`SVG too large: ${input.length} chars (limit ${MAX_SVG_CHARS})`);
  }

  const doc = new DOMParser().parseFromString(input, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    const detail = (parseError.textContent ?? "malformed markup").replace(/\s+/g, " ").trim();
    throw new Error(`SVG parse error: ${detail.slice(0, 300)}`);
  }
  if (doc.documentElement.tagName.toLowerCase() !== "svg") {
    throw new Error(`Root element must be <svg>, got <${doc.documentElement.tagName}>`);
  }

  const warnings: string[] = [];
  const elements = Array.from(doc.querySelectorAll("*"));
  for (const el of elements) {
    if (!el.isConnected) continue; // parent already removed
    const tag = el.tagName.toLowerCase();

    if (BLOCKED_ELEMENTS.has(tag)) {
      el.remove();
      warnings.push(`removed <${tag}> element`);
      continue;
    }
    if (tag === "use") {
      const href = hrefOf(el);
      if (!href || !href.startsWith("#")) {
        el.remove();
        warnings.push(`removed <use> with non-local reference`);
        continue;
      }
    }
    if (tag === "image") {
      const href = hrefOf(el);
      if (!href || !DATA_IMAGE_RE.test(href)) {
        el.remove();
        warnings.push(`removed <image> with non-data: source`);
        continue;
      }
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        warnings.push(`stripped ${attr.name} event handler`);
        continue;
      }
      if (
        (name === "href" || name === "xlink:href") &&
        tag !== "use" &&
        tag !== "image" &&
        !value.startsWith("#")
      ) {
        el.removeAttribute(attr.name);
        warnings.push(`stripped external ${attr.name} on <${tag}>`);
        continue;
      }
      if (value.toLowerCase().includes("javascript:")) {
        el.removeAttribute(attr.name);
        warnings.push(`stripped javascript: value in ${attr.name}`);
        continue;
      }
      if (name === "style") {
        const { css, changed } = scrubCss(value);
        if (changed) {
          el.setAttribute(attr.name, css);
          warnings.push(`scrubbed external url() in inline style`);
        }
      }
    }
  }

  // <style> blocks stay (mermaid output depends on them) minus external pulls.
  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    const { css, changed } = scrubCss(styleEl.textContent ?? "");
    if (changed) {
      styleEl.textContent = css;
      warnings.push("scrubbed external reference in <style> block");
    }
  }

  return { svg: new XMLSerializer().serializeToString(doc.documentElement), warnings };
}

/**
 * Insert an opaque background rect as the first paintable child, unless the
 * document already starts with a full-size rect. Used for mermaid exports so
 * dark-theme embeds stay readable (mermaid "neutral" renders dark-on-transparent).
 */
export function ensureBackgroundRect(svg: string, color: string): string {
  if (color === "transparent") return svg;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svg;
  const root = doc.documentElement;
  const first = root.firstElementChild;
  if (
    first &&
    first.tagName.toLowerCase() === "rect" &&
    (first.getAttribute("width") === "100%" || first.getAttribute("fill") === color)
  ) {
    return svg;
  }
  const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", color);
  root.insertBefore(rect, root.firstChild);
  return new XMLSerializer().serializeToString(root);
}
