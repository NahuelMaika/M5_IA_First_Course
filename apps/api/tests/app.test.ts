import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";

describe("buildApp", () => {
  it("builds an app that can be exercised via inject, without listening on a real port", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/route-that-does-not-exist" });

    expect(response.statusCode).toBe(404);

    await app.close();
  });
});
