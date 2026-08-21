import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/ggasia",
  APP_TIMEZONE: "America/Argentina/Buenos_Aires",
  API_PORT: "3001",
  // spec-FEAT-003b Block 2 -- see tests/cors.test.ts for WEB_ORIGIN's own dedicated sad-path
  // coverage (missing, trailing slash, path); this file only needs a valid value to keep its
  // pre-existing happy/sad path assertions about the OTHER fields green.
  WEB_ORIGIN: "https://app.ggasia.test",
};

const originalEnv = { ...process.env };

function resetProcessEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

describe("env.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    resetProcessEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProcessEnv();
  });

  it("parses a valid environment (happy path of NFR-03)", async () => {
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.APP_TIMEZONE = REQUIRED_ENV.APP_TIMEZONE;
    process.env.API_PORT = REQUIRED_ENV.API_PORT;
    process.env.WEB_ORIGIN = REQUIRED_ENV.WEB_ORIGIN;

    const { env } = await import("../src/env.ts");

    expect(env.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL);
    expect(env.APP_TIMEZONE).toBe(REQUIRED_ENV.APP_TIMEZONE);
    expect(env.API_PORT).toBe(3001);
    expect(env.WEB_ORIGIN).toBe(REQUIRED_ENV.WEB_ORIGIN);
  });

  it("exits the process with code 1 when DATABASE_URL is missing (sad path of NFR-03/RNF-15)", async () => {
    delete process.env.DATABASE_URL;
    process.env.APP_TIMEZONE = REQUIRED_ENV.APP_TIMEZONE;
    process.env.API_PORT = REQUIRED_ENV.API_PORT;
    process.env.WEB_ORIGIN = REQUIRED_ENV.WEB_ORIGIN;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => {
        throw new Error("process.exit called");
      }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(import("../src/env.ts")).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    const loggedMessage = errorSpy.mock.calls.map((call) => String(call[0])).join(" ");
    expect(loggedMessage).toContain("DATABASE_URL");
    expect(loggedMessage).not.toContain(REQUIRED_ENV.DATABASE_URL);
  });
});
