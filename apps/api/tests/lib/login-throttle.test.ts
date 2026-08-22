import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlocked, recordFailure, reset } from "../../src/lib/login-throttle.ts";

describe("login-throttle.ts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isBlocked is false for an email with no previous attempts", () => {
    expect(isBlocked("nobody@mail.com")).toBe(false);
  });

  it("after 5 recordFailure calls for the same email, isBlocked is true", () => {
    const email = "five-fails@mail.com";

    for (let i = 0; i < 5; i++) {
      recordFailure(email);
    }

    expect(isBlocked(email)).toBe(true);
  });

  it("after 4 recordFailure calls, isBlocked is still false", () => {
    const email = "four-fails@mail.com";

    for (let i = 0; i < 4; i++) {
      recordFailure(email);
    }

    expect(isBlocked(email)).toBe(false);
  });

  it("reset clears the counter — isBlocked goes back to false immediately after", () => {
    const email = "reset-me@mail.com";

    for (let i = 0; i < 5; i++) {
      recordFailure(email);
    }
    expect(isBlocked(email)).toBe(true);

    reset(email);

    expect(isBlocked(email)).toBe(false);
  });

  it("recordFailure/isBlocked with different casing of the same email share the same counter (R1)", () => {
    recordFailure("Test@mail.com");
    recordFailure("test@mail.com");
    recordFailure("TEST@MAIL.COM");
    recordFailure("test@mail.com");
    recordFailure("Test@Mail.Com");

    expect(isBlocked("test@mail.com")).toBe(true);
    expect(isBlocked("TEST@MAIL.COM")).toBe(true);
  });

  it("after the 15-minute window passes, the counter resets itself", () => {
    vi.useFakeTimers();
    const email = "expires@mail.com";

    for (let i = 0; i < 5; i++) {
      recordFailure(email);
    }
    expect(isBlocked(email)).toBe(true);

    vi.advanceTimersByTime(15 * 60 * 1000);

    expect(isBlocked(email)).toBe(false);
  });
});
