"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logoutUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";

// Same text `expense-form.tsx`/`register-form.tsx`/`login-form.tsx` use (`GENERIC_ERROR_MESSAGE`)
// for the only non-success outcome `logoutUser` (Block 3) has.
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleClick() {
    setIsSubmitting(true);
    try {
      const result = await logoutUser();

      switch (result.outcome) {
        case "success":
          // AC-03. Redirecting only on a confirmed server-side success -- see the
          // "unknown_error" branch below for why a failed logout does NOT redirect anyway.
          router.push("/login");
          return;
        case "unknown_error":
          // If logout failed server-side, redirecting anyway would falsely tell the user
          // they're logged out while the session cookie may still be valid.
          notify("error", GENERIC_ERROR_MESSAGE);
          return;
      }
    } catch {
      // A rejected `logoutUser` promise is treated the same as its own "unknown_error" outcome.
      notify("error", GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button type="button" disabled={isSubmitting} onClick={() => void handleClick()}>
      {isSubmitting ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Cerrando sesión...
        </>
      ) : (
        "Cerrar sesión"
      )}
    </Button>
  );
}
