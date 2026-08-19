import { describe, expect, it } from "vitest";
import { splitDescription } from "../src/separator.ts";

/**
 * Tests for Block 2's Descripción separator cut (spec-FEAT-001b Block 2,
 * kb.md "Extracción de Campos desde Texto Libre" Paso 0).
 */
describe("splitDescription", () => {
  it("AC-01: cuts at the first ' - ' into left segment and description", () => {
    const result = splitDescription("milanesas 18000 - con los pibes");

    expect(result.left).toBe("milanesas 18000");
    expect(result.description).toBe("con los pibes");
  });

  it("AC-02: an empty right segment yields an empty description", () => {
    const result = splitDescription("milanesas 18000 - ");

    expect(result.left).toBe("milanesas 18000");
    expect(result.description).toBe("");
  });

  it("AC-03: a separator at the start yields an empty left segment", () => {
    const result = splitDescription("- solo un comentario");

    expect(result.left).toBe("");
    expect(result.description).toBe("solo un comentario");
  });

  it("returns the whole input as the left segment when there is no separator", () => {
    const result = splitDescription("nafta 8000 ayer");

    expect(result.left).toBe("nafta 8000 ayer");
    expect(result.description).toBe("");
  });

  it("does not treat an em-dash as the separator", () => {
    const result = splitDescription("milanesas 18000 — con los pibes");

    expect(result.left).toBe("milanesas 18000 — con los pibes");
    expect(result.description).toBe("");
  });

  it("does not treat a typographic en-dash as the separator", () => {
    const result = splitDescription("milanesas 18000 – con los pibes");

    expect(result.left).toBe("milanesas 18000 – con los pibes");
    expect(result.description).toBe("");
  });

  it("does not treat a non-breaking space around the hyphen as the separator", () => {
    const nbsp = "\u00A0";
    const input = `milanesas 18000${nbsp}-${nbsp}con los pibes`;
    const result = splitDescription(input);

    expect(result.left).toBe(input);
    expect(result.description).toBe("");
  });

  it("takes only the first ' - ' when several are present", () => {
    const result = splitDescription("a - b - c");

    expect(result.left).toBe("a");
    expect(result.description).toBe("b - c");
  });

  it("recognizes multiple spaces or a tab around the hyphen as whitespace", () => {
    const result = splitDescription("milanesas 18000  -\tcon los pibes");

    expect(result.left).toBe("milanesas 18000");
    expect(result.description).toBe("con los pibes");
  });

  it("does not treat a hyphen as the separator when it is the last character with no whitespace after it", () => {
    const result = splitDescription("milanesas 18000 -");

    expect(result.left).toBe("milanesas 18000 -");
    expect(result.description).toBe("");
  });
});
