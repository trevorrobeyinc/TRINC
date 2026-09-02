/**
 * SVG → PNG inside the Electron renderer: Blob URL → <img> → <canvas> →
 * toBlob("image/png"). Only sanitized, self-contained SVG may enter — external
 * references would taint the canvas and make toBlob throw a SecurityError.
 */

const MAX_PIXELS = 16_000_000;
const DECODE_TIMEOUT_MS = 5_000;

export interface RasterizeOptions {
  /** Integer scale multiplier (clamped to keep total pixels under 16 Mpx). */
  scale: number;
  /** CSS color painted behind the SVG; "transparent" leaves alpha. */
  background: string;
}

export interface RasterizeResult {
  buf: ArrayBuffer;
  width: number;
  height: number;
}

export interface IntrinsicSize {
  width: number;
  height: number;
  assumed: boolean;
}

function parseLength(raw: string | null): number | null {
  if (!raw) return null;
  const value = parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (/%\s*$/.test(raw)) return null; // percentage sizes have no intrinsic pixels
  return value;
}

/** Width/height attrs → viewBox → 800×600 fallback (flagged `assumed`). */
export function svgIntrinsicSize(svg: string): IntrinsicSize {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() === "svg") {
    const w = parseLength(root.getAttribute("width"));
    const h = parseLength(root.getAttribute("height"));
    if (w && h) return { width: w, height: h, assumed: false };
    const viewBox = root.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3], assumed: false };
      }
    }
  }
  return { width: 800, height: 600, assumed: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function rasterizeSvgToPng(
  svg: string,
  opts: RasterizeOptions
): Promise<RasterizeResult> {
  const { width, height } = svgIntrinsicSize(svg);
  if (width * height > MAX_PIXELS) {
    throw new Error(
      `SVG too large to rasterize: ${Math.round(width)}×${Math.round(height)} exceeds ${MAX_PIXELS} pixels`
    );
  }
  let scale = Math.max(1, Math.floor(opts.scale) || 1);
  while (scale > 1 && width * height * scale * scale > MAX_PIXELS) scale--;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    try {
      await withTimeout(
        img.decode(),
        DECODE_TIMEOUT_MS,
        `SVG did not decode within ${DECODE_TIMEOUT_MS / 1000}s`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `SVG failed to rasterize (${detail}). PNG export requires self-contained SVG — ` +
          `no external images, fonts, or stylesheets.`
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("Canvas 2D context unavailable in this renderer");

    if (opts.background !== "transparent") {
      ctx2d.fillStyle = opts.background;
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!pngBlob) throw new Error("PNG encoding failed (canvas.toBlob returned null)");
    return { buf: await pngBlob.arrayBuffer(), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
