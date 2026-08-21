/**
 * `apps/api` entrypoint (spec-FEAT-002 Block 1). `env.ts` is imported before
 * `buildApp` so the process aborts on invalid configuration (NFR-03) before
 * any listener is opened.
 *
 * `webOrigin` is passed explicitly (spec-FEAT-003b Block 2) instead of letting `app.ts` import
 * `env.ts` itself -- see `BuildAppOptions.webOrigin`'s comment in `app.ts` for why.
 */

import { buildApp } from "./app.ts";
import { env } from "./env.ts";

const app = buildApp({ webOrigin: env.WEB_ORIGIN });

app.listen({ port: env.API_PORT }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
