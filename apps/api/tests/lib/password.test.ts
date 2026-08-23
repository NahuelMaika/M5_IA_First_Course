import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.ts";

describe("password.ts", () => {
  it("hashPassword produces a hash that verifyPassword validates as correct for the same plain", async () => {
    const plain = "correct-horse-battery-staple";

    const hash = await hashPassword(plain);

    await expect(verifyPassword(hash, plain)).resolves.toBe(true);
  });

  it("verifyPassword returns false for an incorrect plain", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("the resulting hash is never equal to the plain (anti no-op sanity check)", async () => {
    const plain = "correct-horse-battery-staple";

    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
  });
});
