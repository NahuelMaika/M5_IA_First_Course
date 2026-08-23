import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Centralizes the "a 401 from apps/api means the session expired or is absent -> redirect to
 * /login" policy in a single place (Block 7, spec-FEAT-004b) -- same reasoning AGENTS.md applies
 * to `notifications.ts` for its own policy. Consumed by `expense-list.tsx` (this block) and
 * `expense-form.tsx` (Block 8), so neither duplicates the condition nor the redirect target.
 *
 * Returns a function that, given a `Response`, redirects and returns `true` only when
 * `status === 401`; any other status is left untouched (`false`, no side effect) so the caller's
 * existing non-2xx handling still applies.
 */
export function useRedirectOnUnauthorized(): (response: Response) => boolean {
  const router = useRouter();
  // A ref (not `router` itself) in the callback's closure keeps the returned function's identity
  // stable across renders. Depending on `router` directly is a trap here: consumers pass this
  // function into their own `useCallback` deps (e.g. `expense-list.tsx`'s `loadExpenses`, itself a
  // `useEffect` dependency) and `next/navigation`'s router object is not guaranteed referentially
  // stable across every render source (confirmed by this project's own test mocks, which return a
  // fresh object per call) -- an unstable identity here would cascade into that effect re-firing
  // every render, an infinite loop.
  const routerRef = React.useRef(router);
  routerRef.current = router;

  return React.useCallback((response: Response) => {
    if (response.status !== 401) return false;
    routerRef.current.push("/login");
    return true;
  }, []);
}
