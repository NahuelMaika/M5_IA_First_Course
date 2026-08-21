import type { ReactNode } from "react";

// Minimal App Router root layout. Real theming and shared tokens land in Block 3.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
