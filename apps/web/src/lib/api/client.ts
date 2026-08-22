/**
 * API client with stub `x-user-id` auth (Block 5 — spec-FEAT-003b).
 *
 * This is the ONLY module in `apps/web` allowed to build a request towards `apps/api` -- no
 * component from later blocks constructs its own URL or attaches `x-user-id` by hand
 * (Block 5's completion criterion). It is a generic transport wrapper around `fetch`, not a place
 * for expense-specific business logic (create/list live in Block 7/Block 8, on top of this).
 *
 * Both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STUB_USER_ID` are read from `process.env` on every
 * call (never cached at module load) so a missing/empty value fails fast, at first use, instead of
 * silently building a request against `undefined` -- see `.env.example` for what each documents.
 */

function readRequiredEnvVar(name: "NEXT_PUBLIC_API_URL" | "NEXT_PUBLIC_STUB_USER_ID"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not configured. Set it in apps/web/.env.local (see apps/web/.env.example).`,
    );
  }

  return value;
}

/**
 * Sends a request to `apps/api`, attaching the stub `x-user-id` header. `path` is joined directly
 * to `NEXT_PUBLIC_API_URL` (e.g. `apiRequest("/expenses", { method: "POST", body: ... })`).
 *
 * Validation of both required env vars happens here, before `fetch` is ever called -- a missing
 * `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_STUB_USER_ID` throws instead of sending a request with an
 * empty or `"undefined"` value.
 */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = readRequiredEnvVar("NEXT_PUBLIC_API_URL");
  const stubUserId = readRequiredEnvVar("NEXT_PUBLIC_STUB_USER_ID");

  const headers = new Headers(init.headers);
  headers.set("x-user-id", stubUserId);

  return fetch(`${baseUrl}${path}`, { ...init, headers });
}
