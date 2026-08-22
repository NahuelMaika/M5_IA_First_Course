import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./client";

const ORIGINAL_ENV = { ...process.env };

describe("apiRequest (Block 5 — API client with stub x-user-id)", () => {
  beforeEach(() => {
    process.env["NEXT_PUBLIC_API_URL"] = "http://localhost:3001";
    process.env["NEXT_PUBLIC_STUB_USER_ID"] = "00000000-0000-4000-8000-000000000001";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("attaches x-user-id with the configured value to every request it builds towards /expenses, without the caller passing it", async () => {
    await apiRequest("/expenses", { method: "GET" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://localhost:3001/expenses");

    const headers = new Headers(init?.headers);
    expect(headers.get("x-user-id")).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("sad path: throws before building the request when NEXT_PUBLIC_STUB_USER_ID is not configured, instead of sending an empty or 'undefined' header", async () => {
    delete process.env["NEXT_PUBLIC_STUB_USER_ID"];

    await expect(apiRequest("/expenses", { method: "GET" })).rejects.toThrow(
      /NEXT_PUBLIC_STUB_USER_ID/,
    );

    expect(fetch).not.toHaveBeenCalled();
  });
});
