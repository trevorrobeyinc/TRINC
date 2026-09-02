export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Rough text width at a given font size for layout math (0.6em per char is a
 * serviceable average for system-ui). Rendering never depends on exactness —
 * labels get headroom from margins.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

/** Tick/label formatting: trim float noise, thousands separators for big values. */
export function fmtNum(value: number, decimals?: number): string {
  const fixed =
    decimals !== undefined
      ? value.toFixed(decimals)
      : String(Math.round(value * 1e6) / 1e6);
  const [int, frac] = fixed.split(".");
  const negative = int.startsWith("-");
  const digits = negative ? int.slice(1) : int;
  const grouped =
    digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : digits;
  const head = `${negative ? "-" : ""}${grouped}`;
  return frac !== undefined && Number(frac) !== 0 ? `${head}.${frac.replace(/0+$/, "")}` : head;
}

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
  decimals: number;
}

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

/** Heckbert nice-tick scale: human-friendly bounds and ~targetCount ticks. */
export function niceScale(min: number, max: number, targetCount = 5): NiceScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error("Scale bounds must be finite numbers");
  }
  if (min === max) {
    if (min === 0) max = 1;
    else if (min > 0) { min = 0; } else { max = 0; }
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (targetCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Number(v.toFixed(decimals + 2)));
  }
  return { min: niceMin, max: niceMax, step, ticks, decimals };
}
