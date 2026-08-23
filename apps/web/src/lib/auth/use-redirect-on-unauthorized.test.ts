import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRedirectOnUnauthorized } from "./use-redirect-on-unauthorized";

// Block 7 (spec-FEAT-004b): the ONLY place that decides "401 from apps/api means expired/absent
// session -> /login". `expense-list.tsx` (this block) and `expense-form.tsx` (Block 8) both
// consume this hook instead of duplicating the condition or the redirect target.
const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

function responseWithStatus(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  mockedPush.mockClear();
});

describe("useRedirectOnUnauthorized", () => {
  it("redirects to /login and returns true for a 401 response", () => {
    const { result } = renderHook(() => useRedirectOnUnauthorized());

    const redirected = result.current(responseWithStatus(401));

    expect(redirected).toBe(true);
    expect(mockedPush).toHaveBeenCalledWith("/login");
    expect(mockedPush).toHaveBeenCalledTimes(1);
  });

  it("does not navigate and returns false for a non-401 response", () => {
    const { result } = renderHook(() => useRedirectOnUnauthorized());

    const redirected = result.current(responseWithStatus(500));

    expect(redirected).toBe(false);
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
