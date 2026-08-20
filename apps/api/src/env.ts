/**
 * Environment validation (spec-FEAT-002 Block 1, NFR-03/RNF-15).
 *
 * Parsed eagerly on import. If validation fails, the process logs which
 * field failed -- never the value, since it could be a secret (e.g. a
 * connection string with credentials) -- and exits with code 1. The API
 * must never start in a degraded state that would attend requests with
 * invalid configuration.
 */

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .url({ protocol: /^postgres(ql)?$/ })
    .refine((url) => !/sslmode=disable/i.test(url), {
      message:
        "DATABASE_URL must not disable TLS via sslmode=disable -- Supabase pooler connections enforce TLS by default (threat-FEAT-002.md, sensitive data section); this check only guards against it being turned off explicitly",
    }),
  APP_TIMEZONE: z.string().min(1),
  API_PORT: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const failedFields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    console.error(`[env] Invalid environment configuration. Failing field(s): ${failedFields}`);
    process.exit(1);
    // process.exit terminates the process in production. In tests it may be
    // mocked and not actually stop execution, so we return a value typed as
    // Env to keep this function's type honest without ever reaching here.
    return undefined as unknown as Env;
  }

  return result.data;
}

export const env = loadEnv(process.env);
