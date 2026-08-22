import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, relativeLuminance } from "./contrast";
import { parseColorTokens } from "./parse-tokens";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = path.join(CURRENT_DIR, "../../app/globals.css");

// WCAG 2.1 AA thresholds (PRD.md RNF-10 / spec-FEAT-003b.md Block 3, NFR-04).
const AA_NORMAL_TEXT_MIN_RATIO = 4.5;
const AA_LARGE_TEXT_MIN_RATIO = 3;

describe("contrast ratio formula", () => {
  it("computes maximum contrast for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("computes minimum contrast for identical colors", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#0F172A", "#F8FAFC");
    const b = contrastRatio("#F8FAFC", "#0F172A");
    expect(a).toBeCloseTo(b, 5);
  });

  it("converts a hex color to its RGB channels", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("computes relative luminance 1 for white and 0 for black", () => {
    expect(relativeLuminance(hexToRgb("#FFFFFF"))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb("#000000"))).toBeCloseTo(0, 5);
  });
});

describe("shared color tokens meet WCAG AA contrast (NFR-04, RNF-10)", () => {
  const tokens = parseColorTokens(readFileSync(GLOBALS_CSS_PATH, "utf-8"));

  // Every text/background pair declared as a shared token. Each entry names the two
  // custom properties (without the "--color-" prefix) and the minimum ratio that pair
  // must satisfy given how it is used (normal text vs. large text).
  //
  // Note: this palette has no `--destructive-foreground` token because no component fills a
  // solid destructive background -- `text-destructive` is always read directly against the
  // page background (see Button's destructive variant: `bg-destructive/10 text-destructive`).
  const pairs: Array<{ foreground: string; background: string; minRatio: number }> = [
    { foreground: "foreground", background: "background", minRatio: AA_NORMAL_TEXT_MIN_RATIO },
    { foreground: "foreground", background: "card", minRatio: AA_NORMAL_TEXT_MIN_RATIO },
    {
      foreground: "muted-foreground",
      background: "background",
      minRatio: AA_NORMAL_TEXT_MIN_RATIO,
    },
    {
      foreground: "primary-foreground",
      background: "primary",
      minRatio: AA_NORMAL_TEXT_MIN_RATIO,
    },
    {
      foreground: "secondary-foreground",
      background: "secondary",
      minRatio: AA_NORMAL_TEXT_MIN_RATIO,
    },
    {
      foreground: "accent-foreground",
      background: "accent",
      minRatio: AA_NORMAL_TEXT_MIN_RATIO,
    },
    { foreground: "destructive", background: "background", minRatio: AA_NORMAL_TEXT_MIN_RATIO },
    { foreground: "foreground", background: "muted", minRatio: AA_LARGE_TEXT_MIN_RATIO },
  ];

  it.each(pairs)(
    "$foreground on $background meets a $minRatio:1 ratio",
    ({ foreground, background, minRatio }) => {
      const fg = tokens[foreground];
      const bg = tokens[background];
      expect(fg, `token --color-${foreground} must be declared in globals.css`).toBeDefined();
      expect(bg, `token --color-${background} must be declared in globals.css`).toBeDefined();

      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(minRatio);
    },
  );
});
