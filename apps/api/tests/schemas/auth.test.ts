import { describe, expect, it } from "vitest";

import { loginBodySchema, registerBodySchema } from "../../src/schemas/auth.ts";

describe("registerBodySchema (spec-FEAT-004a Block 8)", () => {
  it("accepts a valid { email, password }", () => {
    const result = registerBodySchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerBodySchema.safeParse({
      email: "user@example.com",
      password: "short1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    const result = registerBodySchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });
});

describe("loginBodySchema (spec-FEAT-004a Block 8)", () => {
  it("accepts { email, password } even with a short password", () => {
    const result = loginBodySchema.safeParse({
      email: "user@example.com",
      password: "short1",
    });

    expect(result.success).toBe(true);
  });
});
