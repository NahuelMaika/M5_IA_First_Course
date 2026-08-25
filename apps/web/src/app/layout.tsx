import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Root App Router layout. Typography comes from the system font stack declared as the
// `--font-sans` token in globals.css (no next/font/google: that would add a network dependency
// at build/test time for a font this project never asked for).
//
// `<Toaster>` mounts here (not per-screen) so it subscribes once to the same `toast` manager
// singleton that `src/lib/notifications/notifications.ts` (Block 4) drives -- without this, that
// module's `notify()` calls update its own in-memory state correctly but render nothing, since no
// `<Toaster>` was ever mounted to read from the manager.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="font-sans">
      {/* isolate: gives Base UI's Dialog and Select portals (both appended to this <body>) a
          shared stacking context, so their z-index compares reliably against each other --
          see docs/daw/specs/rca-FIX-002.md. */}
      <body className="isolate">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
