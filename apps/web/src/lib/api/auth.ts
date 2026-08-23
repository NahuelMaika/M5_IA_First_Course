/**
 * `/auth/*` client (Block 3 — spec-FEAT-004b).
 *
 * The ONLY module in `apps/web` allowed to build a request towards `/auth/*` (NFR-01, same
 * criterion Block 5 of spec-FEAT-003b applied to `/expenses`). Wraps `apiRequest` (Block 2) and
 * turns every business-status response (401/409/429/400 included) into a discriminated-union
 * result instead of throwing -- only a `fetch` failure (network down) is caught and mapped to
 * `"unknown_error"`. Consumers (Block 4/5/6) branch on `outcome`, never on a raw status code.
 */
import { apiRequest } from "@/lib/api/client";

export type RegisterResult =
  | { outcome: "created"; userId: string }
  | { outcome: "duplicate_email" }
  | { outcome: "validation_error" }
  | { outcome: "unknown_error" };

export type LoginResult =
  | { outcome: "success"; userId: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "too_many_attempts" }
  | { outcome: "validation_error" }
  | { outcome: "unknown_error" };

export type LogoutResult = { outcome: "success" } | { outcome: "unknown_error" };

/**
 * `POST /auth/register`. Maps 201 -> `"created"`, 409 -> `"duplicate_email"`, 400 ->
 * `"validation_error"`, any other status (or a rejected `apiRequest`) -> `"unknown_error"`.
 */
export async function registerUser(
  email: string,
  password: string,
): Promise<RegisterResult> {
  let response: Response;

  try {
    response = await apiRequest("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { outcome: "unknown_error" };
  }

  if (response.status === 201) {
    try {
      const body = (await response.json()) as { userId: string };
      return { outcome: "created", userId: body.userId };
    } catch {
      return { outcome: "unknown_error" };
    }
  }

  if (response.status === 409) {
    return { outcome: "duplicate_email" };
  }

  if (response.status === 400) {
    return { outcome: "validation_error" };
  }

  return { outcome: "unknown_error" };
}

/**
 * `POST /auth/login`. Maps 200 -> `"success"`, 401 -> `"invalid_credentials"`, 429 ->
 * `"too_many_attempts"`, 400 -> `"validation_error"`, any other status (or a rejected
 * `apiRequest`) -> `"unknown_error"`.
 */
export async function loginUser(email: string, password: string): Promise<LoginResult> {
  let response: Response;

  try {
    response = await apiRequest("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { outcome: "unknown_error" };
  }

  if (response.status === 200) {
    try {
      const body = (await response.json()) as { userId: string };
      return { outcome: "success", userId: body.userId };
    } catch {
      return { outcome: "unknown_error" };
    }
  }

  if (response.status === 401) {
    return { outcome: "invalid_credentials" };
  }

  if (response.status === 429) {
    return { outcome: "too_many_attempts" };
  }

  if (response.status === 400) {
    return { outcome: "validation_error" };
  }

  return { outcome: "unknown_error" };
}

/**
 * `POST /auth/logout`. Maps 204 -> `"success"`, any other status (or a rejected `apiRequest`) ->
 * `"unknown_error"`. No body to parse either way (204 has none, the API never returns a body for
 * this route).
 */
export async function logoutUser(): Promise<LogoutResult> {
  let response: Response;

  try {
    response = await apiRequest("/auth/logout", { method: "POST" });
  } catch {
    return { outcome: "unknown_error" };
  }

  if (response.status === 204) {
    return { outcome: "success" };
  }

  return { outcome: "unknown_error" };
}
