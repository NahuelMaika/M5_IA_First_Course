/**
 * Block 3 (spec-FEAT-006) -- the project's first external HTTP client (Groq's OpenAI-compatible
 * audio transcription endpoint). Pure `fetch`: no Fastify, no Prisma, consumed by the (later)
 * `/expenses/audio` route the same way `parseExpense`/`resolveCategoryName` are consumed --
 * receives data, returns data, never talks to the framework or the database directly.
 */
import { env } from "../env.ts";

export type TranscriptionResult = { outcome: "transcribed"; text: string } | { outcome: "error" };

/**
 * Minimal logger shape this module needs -- same interface as `expense-service.ts`'s
 * `MinimalLogger`, kept local rather than imported so this module has zero dependency on
 * anything under `services/` that isn't itself a pure HTTP client.
 */
export interface MinimalLogger {
  error: (obj: unknown, msg: string) => void;
}

export interface TranscriptionClientDeps {
  logger?: MinimalLogger;
}

interface TranscriptionResponseBody {
  text: string;
}

/**
 * Sends `buffer` to Groq for transcription and returns its text, or `{ outcome: "error" }` if
 * anything along the way goes wrong. Never throws.
 *
 * 6s timeout (NFR-01): leaves ~2s of margin over the 8s p95 budgeted for the rest of the
 * `/expenses/audio` pipeline (parsing, categorization, persistence).
 *
 * `buffer` is only ever used as the request body -- never written to disk or logged (FR-03),
 * and becomes eligible for GC as soon as this function returns.
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  deps: TranscriptionClientDeps = {},
): Promise<TranscriptionResult> {
  const formData = new FormData();
  // `Buffer`'s underlying `ArrayBufferLike` isn't assignable to `BlobPart` (it may be backed by a
  // `SharedArrayBuffer`) -- `Uint8Array.from` copies into a fresh, plain `ArrayBuffer`-backed
  // array that satisfies `BlobPart`.
  formData.set("file", new Blob([Uint8Array.from(buffer)], { type: mimeType }), filename);
  formData.set("model", env.TRANSCRIPTION_MODEL);

  let response: Response;
  try {
    response = await fetch(`${env.TRANSCRIPTION_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TRANSCRIPTION_API_KEY}` },
      body: formData,
      signal: AbortSignal.timeout(6000),
    });
  } catch (error) {
    // Network error or the 6s AbortSignal timeout firing -- never the response body, which
    // could reflect part of the transcribed audio.
    deps.logger?.error({ err: error }, "transcription request failed (network/timeout)");
    return { outcome: "error" };
  }

  if (!response.ok) {
    deps.logger?.error({ status: response.status }, "transcription provider returned a non-OK response");
    return { outcome: "error" };
  }

  try {
    const data = (await response.json()) as TranscriptionResponseBody;
    return { outcome: "transcribed", text: data.text };
  } catch (error) {
    // Malformed JSON body on an otherwise-OK response (spec loop 1, F-SPEC-16).
    deps.logger?.error({ err: error }, "transcription provider returned a malformed JSON body");
    return { outcome: "error" };
  }
}
