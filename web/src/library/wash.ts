/** White header text must stay at least this readable against the wash (WCAG AA for normal text). */
export const MIN_CONTRAST = 4.5;

type Rgb = [number, number, number];

function parse(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [parse(a), parse(b)].map((c) => (c ? luminance(c) : 0));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const [r, g, b] = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  return "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

/** Very dark covers are lifted to this lightness so the header still reads as a colour, not as a hole. */
const MIN_LIGHTNESS = 0.2;

/**
 * The header colour for a cover: its dominant colour with the lightness clamped, so white text on
 * it always reaches 4.5:1. Hue and saturation are kept. Without a usable colour, null.
 */
export function washColor(dominant: string | undefined | null): string | null {
  const rgb = dominant ? parse(dominant) : null;
  if (!rgb) return null;
  const [h, s, l] = toHsl(rgb);
  let lightness = Math.max(l, MIN_LIGHTNESS);
  let color = fromHsl(h, s, lightness);
  while (contrastRatio("#ffffff", color) < MIN_CONTRAST && lightness > 0) {
    lightness -= 0.01;
    color = fromHsl(h, s, Math.max(lightness, 0));
  }
  return color;
}
