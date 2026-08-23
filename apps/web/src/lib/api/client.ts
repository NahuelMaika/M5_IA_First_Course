/**
 * API client that relies on the browser's session cookie (Block 2 — spec-FEAT-004b).
 *
 * This is the ONLY module in `apps/web` allowed to build a request towards `apps/api` -- no
 * component from later blocks constructs its own URL by hand (Block 5's completion criterion,
 * spec-FEAT-003b). It is a generic transport wrapper around `fetch`, not a place for
 * expense-specific business logic (create/list live in Block 7/Block 8, on top of this).
 *
 * `NEXT_PUBLIC_API_URL` is read from `process.env` on every call (never cached at module load) so
 * a missing/empty value fails fast, at first use, instead of silently building a request against
 * `undefined` -- see `.env.example` for what it documents. Authentication no longer travels as a
 * stub header: `credentials: "include"` makes the browser attach and honor the session cookie set
 * by `apps/api` on login (requires `apps/api`'s CORS config to allow credentials, see Block 1).
 */

function readRequiredEnvVar(name: "NEXT_PUBLIC_API_URL"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not configured. Set it in apps/web/.env.local (see apps/web/.env.example).`,
    );
  }

  return value;
}

/**
 * Sends a request to `apps/api`, including the session cookie via `credentials: "include"`.
 * `path` is joined directly to `NEXT_PUBLIC_API_URL` (e.g.
 * `apiRequest("/expenses", { method: "POST", body: ... })`).
 *
 * Validation of the required env var happens here, before `fetch` is ever called -- a missing
 * `NEXT_PUBLIC_API_URL` throws instead of sending a request against an empty or `"undefined"`
 * value.
 */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = readRequiredEnvVar("NEXT_PUBLIC_API_URL");

  const headers = new Headers(init.headers);

  return fetch(`${baseUrl}${path}`, { ...init, headers, credentials: "include" });
}
