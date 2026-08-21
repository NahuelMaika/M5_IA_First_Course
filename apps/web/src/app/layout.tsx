import type { ReactNode } from "react";
import "./globals.css";

// Root App Router layout. Typography comes from the system font stack declared as the
// `--font-sans` token in globals.css (no next/font/google: that would add a network dependency
// at build/test time for a font this project never asked for).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
