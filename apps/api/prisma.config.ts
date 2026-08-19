/**
 * Prisma 7 config (spec-FEAT-002 Block 2).
 *
 * Prisma 7 removed connection URLs from `schema.prisma` -- `url` is no longer accepted in the
 * datasource block (see the comment atop `prisma/schema.prisma`). Migrate/CLI commands read the
 * connection string from here instead; `PrismaClient` itself never reads this file -- it connects
 * through a driver adapter passed to its constructor (Block 4).
 *
 * `datasource.url` here deliberately points at `DIRECT_URL` (the non-pooled connection), NOT
 * `DATABASE_URL` (the pgbouncer-pooled one). Migrate runs DDL, and DDL against a transaction-mode
 * PgBouncer pooler is a known problem case for Postgres -- Supabase's own guidance is to run
 * migrations against the direct connection and reserve the pooled one for the app's runtime
 * queries. `PrismaClient` (Block 4) uses `DATABASE_URL` for that runtime traffic; this file never
 * feeds it, so the two are free to differ. Note: Prisma 7's `Datasource` config type only exposes
 * `url`/`shadowDatabaseUrl` -- there is no `directUrl` field on this object (that option was
 * removed from `prisma.config.ts` in v7); pointing `url` itself at the direct connection is how
 * Migrate is told to bypass the pooler.
 *
 * This app has no `.env` of its own -- the monorepo keeps a single one at the repo root. The
 * Prisma CLI's cwd is `apps/api`, so we resolve and load that root `.env` explicitly instead of
 * relying on `dotenv`'s default cwd-relative lookup. Values already present in `process.env` are
 * NOT overridden (dotenv's default `override: false`) -- this is what lets migrations run against
 * `DIRECT_URL_TEST` by exporting it into `DIRECT_URL` at invocation time, without ever editing
 * this file or the root `.env`.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
