import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";

import { loginUser, logoutUser, registerUser } from "./auth";

// This module is the ONLY one allowed to build requests towards `/auth/*` (NFR-01). Every test
// mocks the transport boundary (`apiRequest`, Block 2) the same way `expense-form.test.tsx`
// mocks it -- no test here ever touches the network.
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  mockedApiRequest.mockReset();
});

describe("registerUser (Block 3)", () => {
  it("maps 201 to outcome 'created' with the returned userId", async () => {
    mockedApiRequest.mockResolvedValue(jsonResponse(201, { userId: "user-1" }));

    const result = await registerUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "created", userId: "user-1" });
    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
    });
  });

  it("maps 409 to outcome 'duplicate_email'", async () => {
    mockedApiRequest.mockResolvedValue(
      jsonResponse(409, { error: "email_already_registered" }),
    );

    const result = await registerUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "duplicate_email" });
  });

  it("maps 400 to outcome 'validation_error'", async () => {
    mockedApiRequest.mockResolvedValue(
      jsonResponse(400, { error: "validation_error", details: [] }),
    );

    const result = await registerUser("a@b.com", "short");

    expect(result).toEqual({ outcome: "validation_error" });
  });

  it("maps an unexpected status to outcome 'unknown_error'", async () => {
    mockedApiRequest.mockResolvedValue(jsonResponse(500, {}));

    const result = await registerUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "unknown_error" });
  });

  it("maps a network failure (apiRequest rejects) to outcome 'unknown_error' without throwing", async () => {
    mockedApiRequest.mockRejectedValue(new Error("network down"));

    await expect(registerUser("a@b.com", "password123")).resolves.toEqual({
      outcome: "unknown_error",
    });
  });

  it("maps a 201 with a malformed (non-JSON) body to outcome 'unknown_error' without throwing", async () => {
    mockedApiRequest.mockResolvedValue(
      new Response("not valid json", {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(registerUser("a@b.com", "password123")).resolves.toEqual({
      outcome: "unknown_error",
    });
  });
});

describe("loginUser (Block 3)", () => {
  it("maps 200 to outcome 'success' with the returned userId", async () => {
    mockedApiRequest.mockResolvedValue(jsonResponse(200, { userId: "user-1" }));

    const result = await loginUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "success", userId: "user-1" });
    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
    });
  });

  it("maps 401 to outcome 'invalid_credentials'", async () => {
    mockedApiRequest.mockResolvedValue(
      jsonResponse(401, { error: "invalid_credentials" }),
    );

    const result = await loginUser("a@b.com", "wrong-password");

    expect(result).toEqual({ outcome: "invalid_credentials" });
  });

  it("maps 429 to outcome 'too_many_attempts'", async () => {
    mockedApiRequest.mockResolvedValue(
      jsonResponse(429, { error: "too_many_attempts" }),
    );

    const result = await loginUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "too_many_attempts" });
  });

  it("maps 400 to outcome 'validation_error'", async () => {
    mockedApiRequest.mockResolvedValue(
      jsonResponse(400, { error: "validation_error", details: [] }),
    );

    const result = await loginUser("not-an-email", "password123");

    expect(result).toEqual({ outcome: "validation_error" });
  });

  it("maps an unexpected status to outcome 'unknown_error'", async () => {
    mockedApiRequest.mockResolvedValue(jsonResponse(500, {}));

    const result = await loginUser("a@b.com", "password123");

    expect(result).toEqual({ outcome: "unknown_error" });
  });

  it("maps a network failure (apiRequest rejects) to outcome 'unknown_error' without throwing", async () => {
    mockedApiRequest.mockRejectedValue(new Error("network down"));

    await expect(loginUser("a@b.com", "password123")).resolves.toEqual({
      outcome: "unknown_error",
    });
  });

  it("maps a 200 with a malformed (non-JSON) body to outcome 'unknown_error' without throwing", async () => {
    mockedApiRequest.mockResolvedValue(
      new Response("not valid json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(loginUser("a@b.com", "password123")).resolves.toEqual({
      outcome: "unknown_error",
    });
  });
});

describe("logoutUser (Block 3)", () => {
  it("maps 204 to outcome 'success'", async () => {
    mockedApiRequest.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await logoutUser();

    expect(result).toEqual({ outcome: "success" });
    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
    });
  });

  it("maps an unexpected status to outcome 'unknown_error'", async () => {
    mockedApiRequest.mockResolvedValue(jsonResponse(500, {}));

    const result = await logoutUser();

    expect(result).toEqual({ outcome: "unknown_error" });
  });

  it("maps a network failure (apiRequest rejects) to outcome 'unknown_error' without throwing", async () => {
    mockedApiRequest.mockRejectedValue(new Error("network down"));

    await expect(logoutUser()).resolves.toEqual({ outcome: "unknown_error" });
  });
});
