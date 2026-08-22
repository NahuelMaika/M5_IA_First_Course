/**
 * Extracts the hex values of the color custom properties declared in `globals.css`'s `:root`
 * block (e.g. `--accent-foreground: #0F172A;`), keyed without the leading `--`.
 *
 * `:root` declares the actual hex values; `@theme inline` only re-exposes them under a
 * `--color-*` name via `var(...)` for Tailwind's utility generator, so it carries no literal
 * hex to parse. Reading the real CSS file (instead of duplicating hex values in TypeScript)
 * keeps the contrast test honest against the actual tokens shipped to the browser — there is no
 * second copy that can drift from globals.css.
 */
export function parseColorTokens(css: string): Record<string, string> {
  // Scoped to the `:root { ... }` block specifically -- a plain unanchored regex would also
  // silently pick up any future `.dark { ... }`/per-component hex override elsewhere in the
  // file and merge it into the same flat map with no way to tell the two apart.
  const rootBlockMatch = css.match(/:root\s*\{([^}]*)\}/);
  if (!rootBlockMatch) {
    throw new Error("parseColorTokens: no `:root { ... }` block found in the given CSS");
  }
  const rootBlock = rootBlockMatch[1] ?? "";

  const tokens: Record<string, string> = {};
  const pattern = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g;

  for (const match of rootBlock.matchAll(pattern)) {
    const [, name, hex] = match;
    tokens[name] = hex;
  }

  return tokens;
}
