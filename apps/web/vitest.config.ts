import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" for Next.js's own compiler; Vite 8's default transformer
  // (oxc) reads that per-file and can't leave JSX untransformed, so it needs its own override here.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    // Mirrors tsconfig.json's "@/*" path alias (shadcn/ui's default import alias) -- Vite does
    // not read tsconfig "paths" on its own.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
