/**
 * WCAG 2.1 relative luminance / contrast ratio calculation, implemented from the spec formula
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) so token pairs can be validated in a
 * plain Node test, without a real browser (spec-FEAT-003b.md Block 3, NFR-04 / PRD.md RNF-10).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses a `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` hex color into its 0-255 RGB channels. */
export function hexToRgb(hex: string): Rgb {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3 || normalized.length === 4
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  if (expanded.length !== 6 && expanded.length !== 8) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  return { r, g, b };
}

function toLinearChannel(channel8Bit: number): number {
  const channel = channel8Bit / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of an sRGB color, in the [0, 1] range (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const rLinear = toLinearChannel(r);
  const gLinear = toLinearChannel(g);
  const bLinear = toLinearChannel(b);
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * WCAG contrast ratio between two colors, in the [1, 21] range. Order-independent: the lighter
 * color is always treated as L1, per the spec formula.
 */
export function contrastRatio(colorA: string, colorB: string): number {
  const luminanceA = relativeLuminance(hexToRgb(colorA));
  const luminanceB = relativeLuminance(hexToRgb(colorB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}
