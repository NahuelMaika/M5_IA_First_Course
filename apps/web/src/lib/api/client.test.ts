import { readFileSync } from "node:fs";
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
// `process.env` under Vitest/Node, since Node evaluates both notations identically -- only reading
// the actual source text catches a regression back to the dynamic form.
describe("readRequiredEnvVar source shape (FIX-001 regression guard)", () => {
  it("reads NEXT_PUBLIC_API_URL via a literal dot-notation access, not a dynamic/bracket one", () => {
    const source = readFileSync(join(import.meta.dirname, "client.ts"), "utf-8");

    expect(source).toMatch(/process\.env\.NEXT_PUBLIC_API_URL/);
    expect(source).not.toMatch(/process\.env\[\s*name\s*\]/);
  });
});
