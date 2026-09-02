/**
 * UI mockups in the visualize/CDS component language — flat white surfaces,
 * 0.5px hairlines, 8px radius (12px cards), pre-styled 36px form controls,
 * outline-default buttons (one accent-filled per view), pale role tints for
 * badges, avatar initials on the accent tint. Deterministic SVG: a typed
 * block vocabulary stacked vertically inside an optional device frame, so an
 * agent can sketch a screen without writing SVG.
 */
import { CHART_FONT } from "./palette";
import { escapeXml, estimateTextWidth } from "./svgUtils";
import { ACCENT, CHROME, RAMPS } from "./vizTokens";

type Variant = "primary" | "secondary" | "accent";
type Role = "accent" | "success" | "warning" | "danger" | "neutral";

export interface MockupBlock {
  type:
    | "header"
    | "metric_row"
    | "field"
    | "select"
    | "button_row"
    | "text"
    | "list"
    | "badge_row"
    | "image"
    | "divider";
  // header
  title?: string;
  subtitle?: string;
  initials?: string;
  // metric_row
  metrics?: { label: string; value: string }[];
  // field / select
  label?: string;
  placeholder?: string;
  value?: string;
  // button_row
  buttons?: { label: string; variant?: Variant }[];
  // text
  lines?: string[];
  /** Wireframe mode: draw N grey placeholder bars instead of real text. */
  placeholderLines?: number;
  // list
  items?: { title: string; meta?: string; initials?: string }[];
  // badge_row
  badges?: { label: string; role?: Role }[];
  // image
  height?: number;
}

export interface MockupSpec {
  title?: string;
  frame: "none" | "browser" | "phone" | "card";
  blocks: MockupBlock[];
  background: string;
  warnings: string[];
}

const ROLE_TINTS: Record<Role, { bg: string; text: string }> = {
  accent: { bg: ACCENT.bg, text: ACCENT.text },
  success: { bg: RAMPS.green.s50, text: RAMPS.green.s600 },
  warning: { bg: RAMPS.amber.s50, text: RAMPS.amber.s600 },
  danger: { bg: RAMPS.red.s50, text: RAMPS.red.s600 },
  neutral: { bg: RAMPS.gray.s50, text: RAMPS.gray.s600 },
};

const MAX_BLOCKS = 30;

export function resolveMockup(input: Record<string, unknown>): MockupSpec {
  const warnings: string[] = [];
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined;
  const frame = (input.frame as string | undefined) ?? "browser";
  if (!["none", "browser", "phone", "card"].includes(frame)) {
    throw new Error(`frame must be none, browser, phone, or card (got ${JSON.stringify(input.frame)})`);
  }
  const raw = input.blocks;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("blocks must be a non-empty array of typed mockup blocks");
  }
  if (raw.length > MAX_BLOCKS) throw new Error(`blocks is capped at ${MAX_BLOCKS} (got ${raw.length})`);
  const kinds = [
    "header",
    "metric_row",
    "field",
    "select",
    "button_row",
    "text",
    "list",
    "badge_row",
    "image",
    "divider",
  ];
  const blocks = raw.map((b, i) => {
    if (!b || typeof b !== "object") throw new Error(`blocks[${i}] must be an object`);
    const block = b as Record<string, unknown>;
    if (!kinds.includes(block.type as string)) {
      throw new Error(`blocks[${i}].type must be one of ${kinds.join(", ")} (got ${JSON.stringify(block.type)})`);
    }
    return block as unknown as MockupBlock;
  });
  const accentFills = blocks
    .flatMap((b) => b.buttons ?? [])
    .filter((btn) => btn.variant === "primary" || btn.variant === "accent").length;
  if (accentFills > 1) {
    warnings.push(`accent rule: ${accentFills} filled buttons in one view — the spec allows at most one`);
  }
  const opts = (input.options ?? {}) as Record<string, unknown>;
  const background =
    typeof opts.background === "string" && opts.background.trim()
      ? opts.background.trim()
      : CHROME.surface1;
  return { title, frame: frame as MockupSpec["frame"], blocks, background, warnings };
}

export function renderMockup(spec: MockupSpec): { svg: string; width: number; height: number } {
  const phone = spec.frame === "phone";
  const contentW = phone ? 320 : 600;
  const pad = 20;
  const innerW = contentW - pad * 2;
  const body: string[] = [];
  // Content is drawn into a local coordinate space, then translated into the frame.
  let y = pad;
  const f = (v: number) => Math.round(v * 10) / 10;

  const text = (
    tx: number,
    ty: number,
    content: string,
    size: number,
    color: string,
    weight?: number,
    anchor?: string
  ) =>
    `<text x="${f(tx)}" y="${f(ty)}"${anchor ? ` text-anchor="${anchor}"` : ""} font-family="${CHART_FONT}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${color}">${escapeXml(content)}</text>`;

  for (const block of spec.blocks) {
    switch (block.type) {
      case "header": {
        const hasAvatar = Boolean(block.initials);
        const tx = pad + (hasAvatar ? 56 : 0);
        if (hasAvatar) {
          body.push(
            `<circle cx="${pad + 22}" cy="${y + 22}" r="22" fill="${ACCENT.bg}"/>`,
            text(pad + 22, y + 27, (block.initials as string).slice(0, 2).toUpperCase(), 14, ACCENT.text, 500, "middle")
          );
        }
        body.push(text(tx, y + 18, block.title ?? "Untitled", 15, CHROME.textPrimary, 500));
        if (block.subtitle) body.push(text(tx, y + 36, block.subtitle, 13, CHROME.textSecondary));
        y += 44 + 16;
        break;
      }
      case "metric_row": {
        const metrics = (block.metrics ?? []).slice(0, 4);
        if (metrics.length === 0) throw new Error("metric_row needs metrics: [{label, value}]");
        const gap = 12;
        const cardW = (innerW - gap * (metrics.length - 1)) / metrics.length;
        metrics.forEach((m, i) => {
          const x = pad + i * (cardW + gap);
          body.push(
            `<rect x="${f(x)}" y="${y}" width="${f(cardW)}" height="64" rx="8" fill="${CHROME.surface1}" stroke="${CHROME.border}" stroke-width="0.5"/>`,
            text(x + 12, y + 22, m.label, 12, CHROME.textMuted),
            text(x + 12, y + 48, m.value, 22, CHROME.textPrimary, 500)
          );
        });
        y += 64 + 16;
        break;
      }
      case "field":
      case "select": {
        if (block.label) {
          body.push(text(pad, y + 12, block.label, 12, CHROME.textSecondary));
          y += 20;
        }
        body.push(
          `<rect x="${pad}" y="${y}" width="${innerW}" height="36" rx="8" fill="${CHROME.surface2}" stroke="${CHROME.borderStrong}" stroke-width="0.5"/>`
        );
        const content = block.value ?? block.placeholder ?? "";
        if (content) {
          body.push(
            text(pad + 12, y + 23, content, 13, block.value ? CHROME.textPrimary : CHROME.textMuted)
          );
        }
        if (block.type === "select") {
          const cx = pad + innerW - 18;
          body.push(
            `<path d="M${f(cx - 4)} ${f(y + 16)} L${f(cx)} ${f(y + 21)} L${f(cx + 4)} ${f(y + 16)}" fill="none" stroke="${CHROME.textMuted}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
          );
        }
        y += 36 + 12;
        break;
      }
      case "button_row": {
        const buttons = (block.buttons ?? []).slice(0, 4);
        if (buttons.length === 0) throw new Error("button_row needs buttons: [{label, variant?}]");
        let x = pad;
        for (const btn of buttons) {
          const w = Math.max(estimateTextWidth(btn.label, 13) + 32, 72);
          const variant: Variant = btn.variant ?? "secondary";
          if (variant === "secondary") {
            body.push(
              `<rect x="${f(x)}" y="${y}" width="${f(w)}" height="36" rx="8" fill="${CHROME.surface2}" stroke="${CHROME.borderStrong}" stroke-width="0.5"/>`,
              text(x + w / 2, y + 23, btn.label, 13, CHROME.textPrimary, 500, "middle")
            );
          } else {
            const fill = variant === "primary" ? CHROME.textPrimary : ACCENT.fill;
            body.push(
              `<rect x="${f(x)}" y="${y}" width="${f(w)}" height="36" rx="8" fill="${fill}"/>`,
              text(x + w / 2, y + 23, btn.label, 13, "#ffffff", 500, "middle")
            );
          }
          x += w + 10;
        }
        y += 36 + 16;
        break;
      }
      case "text": {
        if (block.title) {
          body.push(text(pad, y + 14, block.title, 14, CHROME.textPrimary, 600));
          y += 24;
        }
        if (block.placeholderLines && block.placeholderLines > 0) {
          const n = Math.min(block.placeholderLines, 12);
          for (let i = 0; i < n; i++) {
            const w = innerW * (i === n - 1 ? 0.55 : 0.92 + (i % 3) * 0.025);
            body.push(
              `<rect x="${pad}" y="${y}" width="${f(w)}" height="9" rx="4.5" fill="${RAMPS.gray.s100}"/>`
            );
            y += 17;
          }
          y += 8;
        } else {
          for (const line of (block.lines ?? []).slice(0, 20)) {
            body.push(text(pad, y + 12, line, 13, CHROME.textSecondary));
            y += 20;
          }
          y += 8;
        }
        break;
      }
      case "list": {
        const items = (block.items ?? []).slice(0, 10);
        if (items.length === 0) throw new Error("list needs items: [{title, meta?, initials?}]");
        // Restraint rule: dense lists are bordered rows, not rounded-rect cards.
        items.forEach((item, i) => {
          const rowY = y + i * 48;
          if (i > 0) {
            body.push(
              `<line x1="${pad}" y1="${f(rowY)}" x2="${pad + innerW}" y2="${f(rowY)}" stroke="${CHROME.border}" stroke-width="0.5"/>`
            );
          }
          let tx = pad;
          if (item.initials) {
            body.push(
              `<circle cx="${pad + 16}" cy="${f(rowY + 24)}" r="16" fill="${ACCENT.bg}"/>`,
              text(pad + 16, rowY + 28.5, item.initials.slice(0, 2).toUpperCase(), 11, ACCENT.text, 500, "middle")
            );
            tx += 44;
          }
          body.push(text(tx, rowY + 21, item.title, 13, CHROME.textPrimary, 500));
          if (item.meta) body.push(text(tx, rowY + 37, item.meta, 12, CHROME.textMuted));
        });
        y += items.length * 48 + 12;
        break;
      }
      case "badge_row": {
        const badges = (block.badges ?? []).slice(0, 6);
        if (badges.length === 0) throw new Error("badge_row needs badges: [{label, role?}]");
        let x = pad;
        for (const badge of badges) {
          const tint = ROLE_TINTS[badge.role ?? "neutral"];
          const w = estimateTextWidth(badge.label, 12) + 24;
          body.push(
            `<rect x="${f(x)}" y="${y}" width="${f(w)}" height="24" rx="8" fill="${tint.bg}"/>`,
            text(x + w / 2, y + 16, badge.label, 12, tint.text, 500, "middle")
          );
          x += w + 8;
        }
        y += 24 + 14;
        break;
      }
      case "image": {
        const h = Math.min(Math.max(block.height ?? 140, 60), 400);
        body.push(
          `<rect x="${pad}" y="${y}" width="${innerW}" height="${h}" rx="8" fill="${CHROME.surface1}" stroke="${CHROME.border}" stroke-width="0.5"/>`,
          `<line x1="${pad}" y1="${y}" x2="${pad + innerW}" y2="${y + h}" stroke="${CHROME.gridline}" stroke-width="1"/>`,
          `<line x1="${pad + innerW}" y1="${y}" x2="${pad}" y2="${y + h}" stroke="${CHROME.gridline}" stroke-width="1"/>`
        );
        y += h + 16;
        break;
      }
      case "divider": {
        body.push(
          `<line x1="${pad}" y1="${f(y + 4)}" x2="${pad + innerW}" y2="${f(y + 4)}" stroke="${CHROME.border}" stroke-width="0.5"/>`
        );
        y += 16;
        break;
      }
    }
  }
  const contentH = y + pad - 12;

  // Frame the content. Contained mockups sit on a surface so they don't
  // float naked (mockup presentation rule).
  const parts: string[] = [];
  let width: number;
  let height: number;
  if (spec.frame === "browser") {
    const chromeH = 40;
    const margin = 24;
    width = contentW + margin * 2;
    height = contentH + chromeH + margin * 2;
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(spec.background)}"/>`);
    parts.push(
      `<rect x="${margin}" y="${margin}" width="${contentW}" height="${contentH + chromeH}" rx="10" fill="${CHROME.surface2}" stroke="${CHROME.borderStrong}" stroke-width="0.5"/>`,
      `<line x1="${margin}" y1="${margin + chromeH}" x2="${margin + contentW}" y2="${margin + chromeH}" stroke="${CHROME.border}" stroke-width="0.5"/>`
    );
    // Traffic lights + address pill.
    const dotY = margin + chromeH / 2;
    ["#e34948", "#eda100", "#1baf7a"].forEach((c, i) => {
      parts.push(`<circle cx="${margin + 20 + i * 18}" cy="${dotY}" r="5" fill="${c}" fill-opacity="0.85"/>`);
    });
    parts.push(
      `<rect x="${margin + 80}" y="${margin + 10}" width="${contentW - 100}" height="20" rx="10" fill="${CHROME.surface1}"/>`,
      text(margin + 92, dotY + 4, spec.title ?? "app.example", 11, CHROME.textMuted)
    );
    parts.push(`<g transform="translate(${margin}, ${margin + chromeH})">${body.join("")}</g>`);
  } else if (spec.frame === "phone") {
    const bezel = 14;
    const margin = 24;
    width = contentW + bezel * 2 + margin * 2;
    height = contentH + bezel * 2 + margin * 2 + 24;
    const px = margin;
    const py = margin;
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(spec.background)}"/>`);
    parts.push(
      `<rect x="${px}" y="${py}" width="${contentW + bezel * 2}" height="${contentH + bezel * 2 + 24}" rx="36" fill="${CHROME.surface2}" stroke="${CHROME.borderStrong}" stroke-width="1"/>`,
      `<rect x="${px + (contentW + bezel * 2) / 2 - 40}" y="${py + 10}" width="80" height="16" rx="8" fill="${RAMPS.gray.s100}"/>`
    );
    parts.push(`<g transform="translate(${px + bezel}, ${py + bezel + 24})">${body.join("")}</g>`);
  } else if (spec.frame === "card") {
    const margin = 24;
    width = contentW + margin * 2;
    height = contentH + margin * 2;
    parts.push(`<rect width="100%" height="100%" fill="${escapeXml(spec.background)}"/>`);
    parts.push(
      `<rect x="${margin}" y="${margin}" width="${contentW}" height="${contentH}" rx="12" fill="${CHROME.surface2}" stroke="${CHROME.border}" stroke-width="0.5"/>`
    );
    parts.push(`<g transform="translate(${margin}, ${margin})">${body.join("")}</g>`);
  } else {
    width = contentW;
    height = contentH;
    if (spec.background !== "transparent") {
      parts.push(`<rect width="100%" height="100%" fill="${escapeXml(spec.background)}"/>`);
    }
    parts.push(`<g>${body.join("")}</g>`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${f(height)}" viewBox="0 0 ${width} ${f(height)}" role="img"${
      spec.title ? ` aria-label="${escapeXml(spec.title)}"` : ""
    }>` +
    parts.join("") +
    "</svg>";
  return { svg, width, height: Math.ceil(height) };
}
