/**
 * Block 3 (spec-FEAT-006) -- src/services/transcription-client.ts.
 *
 * `fetch` is globally mocked -- this module is the project's first external HTTP client, so
 * there is no existing fetch-mocking precedent to mirror; the mock follows the same
 * `vi.fn()`-on-the-boundary style the Prisma-mocked service tests already use.
 *
 * Loads the root `.env` explicitly with `dotenv`, same pattern as `auth-service.test.ts`:
 * `env.ts` (imported transitively via `transcription-client.ts`) reads `process.env` eagerly at
 * import time and `process.exit(1)`s if `TRANSCRIPTION_*` are missing, and vitest does not load
 * `.env` on its own.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const { transcribeAudio } = await import("../../src/services/transcription-client.ts");

describe("transcribeAudio", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns transcribed text on a 200 response with a valid body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: "gaste 500 en el kiosco" }),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(result).toEqual({ outcome: "transcribed", text: "gaste 500 en el kiosco" });
  });

  it("returns an error outcome when the provider responds 401", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(result).toEqual({ outcome: "error" });
  });

  it("returns an error outcome when the provider responds 500", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(result).toEqual({ outcome: "error" });
  });

  it("returns an error outcome when fetch rejects (timeout/network error)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("The operation was aborted", "TimeoutError"),
    );

    const result = await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(result).toEqual({ outcome: "error" });
  });

  it("sends the request with the correct Authorization header and model field", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: "ok" }),
    });

    await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain("/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${process.env.TRANSCRIPTION_API_KEY}`,
    );

    const formData = init.body as FormData;
    expect(formData.get("model")).toBe(process.env.TRANSCRIPTION_MODEL);
    expect(formData.get("file")).toBeInstanceOf(Blob);
  });

  it("returns an error outcome when the 200 response body is not valid JSON", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token in JSON")),
    });

    const result = await transcribeAudio(Buffer.from("fake-audio"), "audio.webm", "audio/webm");

    expect(result).toEqual({ outcome: "error" });
  });
});
