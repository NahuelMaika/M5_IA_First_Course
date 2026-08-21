import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUTTON_SOURCE_PATH = path.join(CURRENT_DIR, "./button.tsx");

// Convention lint (spec-FEAT-003b.md Block 3, AC-01): no component installed under
// src/components/ui may declare its own color, typography or spacing values. It must
// resolve exclusively through the shared tokens declared once in globals.css.
describe("Button does not declare its own color, typography or spacing (AC-01)", () => {
  const source = readFileSync(BUTTON_SOURCE_PATH, "utf-8");

  it("does not use an inline style prop", () => {
    expect(source).not.toMatch(/style=\{/);
  });

  it("does not hardcode a hex, rgb() or hsl() color literal", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
  });

  it("does not hardcode a pixel/rem/em arbitrary Tailwind value for color, font or spacing", () => {
    // e.g. bg-[#fff], text-[16px], p-[13px], w-[2rem] — arbitrary literal values bypass tokens.
    // Matches the number anywhere inside the brackets, not just right after `[`, so a literal
    // nested in a function call (e.g. `rounded-[min(var(--radius-md),10px)]`) is still caught —
    // that exact pattern shipped from the shadcn CLI generator and slipped past a stricter regex.
    expect(source).not.toMatch(/\[[^\]]*[0-9.]+(px|rem|em)[^\]]*\]/);
  });

  it("renders without an inline style attribute on the DOM node", () => {
    const { getByRole } = render(<Button>Guardar</Button>);
    const button = getByRole("button");
    expect(button).not.toHaveAttribute("style");
  });
});
