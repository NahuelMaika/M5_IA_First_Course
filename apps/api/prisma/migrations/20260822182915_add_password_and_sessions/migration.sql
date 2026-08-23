-- AlterTable
--
-- ============================================================================
-- MANUAL EDIT (spec-FEAT-004a Block 1) -- DO NOT REVERT.
--
-- `prisma migrate diff` (schema-to-schema, no live DB) rendered a plain
-- `ADD COLUMN "password_hash" TEXT NOT NULL`, which Postgres rejects outright
-- on a non-empty table: there is no default to backfill existing rows with.
-- The only pre-existing row today is the fixed seed.ts test user (spec-FEAT-002
-- Block 3) -- this repo has no real users in production yet -- but "the only
-- row today" still has to survive `migrate deploy` against a database that
-- already has it. A two-step ADD COLUMN (nullable, backfill, SET NOT NULL) is
-- the standard non-destructive way to add a NOT NULL column to an existing
-- table without a runtime default; the placeholder value below is immediately
-- corrected by the next `prisma db seed` run, since `upsertTestUser` now also
-- sets `passwordHash` on the `update` branch of its upsert (prisma/seed.ts),
-- not only on `create`.
-- ============================================================================
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT;

-- Backfill placeholder for the single pre-existing row (the seed.ts test user).
-- This is not a usable argon2 hash on purpose -- it can never match a real
-- login attempt -- and gets overwritten by the very next seed run.
UPDATE "users" SET "password_hash" = 'migration-placeholder-overwritten-by-next-seed-run' WHERE "password_hash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
