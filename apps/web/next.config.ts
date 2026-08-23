import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FIX-001: lets the build-verification regression test (client.test.ts) point a real
  // `next build` at an isolated output directory, so it never writes into the `.next` a live
  // `next dev` process relies on. Unset -- the default path -- in every normal `next dev`/
  // `next build` run; only the test sets this env var.
  ...(process.env.NEXT_BUILD_VERIFY_DIST_DIR
    ? { distDir: process.env.NEXT_BUILD_VERIFY_DIST_DIR }
    : {}),
};

export default nextConfig;
