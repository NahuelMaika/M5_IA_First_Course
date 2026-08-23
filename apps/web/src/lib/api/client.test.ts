import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./client";

const ORIGINAL_ENV = { ...process.env };

describe("apiRequest (Block 2 — API client with session cookie)", () => {
  beforeEach(() => {
    process.env["NEXT_PUBLIC_API_URL"] = "http://localhost:3001";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sends every request towards /expenses with credentials: 'include' so the session cookie travels", async () => {
    await apiRequest("/expenses", { method: "GET" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://localhost:3001/expenses");
    expect(init?.credentials).toBe("include");
  });

  it("does NOT attach the x-user-id header under any circumstance", async () => {
    await apiRequest("/expenses", { method: "GET" });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.has("x-user-id")).toBe(false);
  });

  it("sad path: throws before building the request when NEXT_PUBLIC_API_URL is not configured", async () => {
    delete process.env["NEXT_PUBLIC_API_URL"];

    await expect(apiRequest("/expenses", { method: "GET" })).rejects.toThrow(
      /NEXT_PUBLIC_API_URL/,
    );

    expect(fetch).not.toHaveBeenCalled();
  });
});

// FIX-001 regression guard: Next.js only inlines NEXT_PUBLIC_* env vars into the browser bundle
// when it finds a LITERAL dot-notation access (`process.env.NEXT_PUBLIC_API_URL`) somewhere in the
// source during its static build analysis -- a dynamic/bracket access (`process.env[name]`) is
// invisible to that analysis, so the var never gets inlined and every browser call throws instead
// of hitting `fetch` (see docs/daw/specs/rca-FIX-001.md). This can't be caught by mocking
// `process.env` under Vitest/Node, since Node evaluates both notations identically: the ONLY way to
// prove the fix works is to run the real Next.js compiler and inspect what it actually emitted --
// exactly the technique the RCA used to confirm the original bug. Points `next build` at an
// isolated `distDir` (via `NEXT_BUILD_VERIFY_DIST_DIR`, read by next.config.ts) so it never
// touches the `.next` a live `next dev` process relies on, and cleans that directory up
// afterwards either way.
describe("readRequiredEnvVar bundle inlining (FIX-001 regression guard)", () => {
  const webRoot = join(import.meta.dirname, "..", "..", "..");
  const distDir = ".next-fix001-verify";
  const distPath = join(webRoot, distDir);
  const probeUrl = "http://fix-001-build-verify.invalid:4321";

  afterEach(() => {
    rmSync(distPath, { recursive: true, force: true });
  });

  it(
    "a real `next build` inlines NEXT_PUBLIC_API_URL's literal value into the client bundle",
    () => {
      execFileSync(join(webRoot, "node_modules", ".bin", "next"), ["build"], {
        cwd: webRoot,
        env: {
          ...process.env,
          NEXT_BUILD_VERIFY_DIST_DIR: distDir,
          NEXT_PUBLIC_API_URL: probeUrl,
        },
        stdio: "pipe",
      });

      const chunksDir = join(distPath, "static", "chunks");
      expect(existsSync(chunksDir)).toBe(true);

      const chunkFiles = readdirSync(chunksDir).filter((name) => name.endsWith(".js"));
      const inlinedSomewhere = chunkFiles.some((name) =>
        readFileSync(join(chunksDir, name), "utf-8").includes(probeUrl),
      );

      expect(inlinedSomewhere).toBe(true);
    },
    120_000,
  );
});
