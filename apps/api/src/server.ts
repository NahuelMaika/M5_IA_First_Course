/**
 * `apps/api` entrypoint (spec-FEAT-002 Block 1). `env.ts` is imported before
 * `buildApp` so the process aborts on invalid configuration (NFR-03) before
 * any listener is opened.
 */

import { buildApp } from "./app.ts";
import { env } from "./env.ts";

const app = buildApp();

app.listen({ port: env.API_PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
