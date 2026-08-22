/**
 * Database seed (spec-FEAT-002 Block 3).
 *
 * Inserts the 11 predefined categories of kb.md's "Categorias Predefinidas" (in that exact
 * normative order) plus a fixed test user, substituting the real authentication ticket this
 * project does not have yet (see the auth stub risk note in `docs/daw/specs/spec-FEAT-002.md`).
 *
 * `nameNormalized` is computed here with `normalize()` from `@ggasia/categorization` (consumed
 * compiled, from `dist/`, per AGENTS.md) -- it is NEVER recomputed in SQL, matching the same rule
 * `schema.prisma` documents for that column.
 *
 * Idempotency: `nameNormalized` is enforced unique only by the two partial indexes added by hand
 * in Block 2's migration SQL (`WHERE owner_id IS NULL` / `WHERE owner_id IS NOT NULL`) -- the
 * Prisma DSL cannot express a partial index as `@@unique`, so `nameNormalized` is not a field
 * Prisma's generated client recognizes as unique input for `.upsert()`. `upsertPredefinedCategory`
 * below reimplements the same idempotent intent by hand: find the existing row by
 * `(ownerId: null, nameNormalized)`, and only `create` when none exists. The partial unique index
 * remains the real backstop against a genuine race or a corrupted seed re-run with mismatched ids
 * -- `create()` is never wrapped in a try/catch here, so a `P2002` it raises propagates untouched
 * out of `seed()`, and `main()` below turns that into a non-zero exit code (FR-11, FR-12, AC-10).
 */
import { pathToFileURL } from "node:url";

import { normalize } from "@ggasia/categorization";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

import { PrismaClient } from "../src/generated/prisma/client.ts";

// kb.md "Categorias Predefinidas" -- normative order. Reordering this array is a behavior change
// (same rule AGENTS.md states for the keyword table) and is out of this block's scope.
export const PREDEFINED_CATEGORY_NAMES = [
  "Comida",
  "Transporte",
  "Entretenimiento",
  "Servicios",
  "Salud",
  "Alquiler",
  "Indumentaria",
  "Hogar",
  "Cuidado personal",
  "Mascotas",
  "Otros",
] as const;

// Fixed, known id/email for the test user this seed provides in place of a real auth ticket.
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_USER_EMAIL = "test-user@ggasia.local";
// Fixed test password, used ONLY to seed the local/test user above -- never a real credential.
// Documented here in plain text on purpose (spec-FEAT-004a Block 1) so local/test logins against
// this seeded user are reproducible; hashed with argon2 before it ever reaches the database.
const TEST_USER_PASSWORD = "test-password-only-for-seed";

async function upsertTestUser(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(TEST_USER_PASSWORD);

  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    // Also re-set on conflict, not just on create: this is what corrects the migration's
    // placeholder `password_hash` (spec-FEAT-004a Block 1's migration.sql) back to the real,
    // documented test password's hash on the very next seed run after that migration applies.
    update: { passwordHash },
    create: { id: TEST_USER_ID, email: TEST_USER_EMAIL, passwordHash },
  });
}

async function upsertPredefinedCategory(prisma: PrismaClient, name: string): Promise<void> {
  const nameNormalized = normalize(name);

  const existing = await prisma.category.findFirst({
    where: { ownerId: null, nameNormalized },
  });

  if (existing) {
    if (existing.name !== name || !existing.active) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { name, active: true },
      });
    }
    return;
  }

  // Not wrapped in try/catch on purpose -- see the module doc comment above.
  await prisma.category.create({
    data: { name, nameNormalized, ownerId: null, active: true },
  });
}

export async function seed(prisma: PrismaClient): Promise<void> {
  await upsertTestUser(prisma);

  for (const name of PREDEFINED_CATEGORY_NAMES) {
    await upsertPredefinedCategory(prisma, name);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    console.error("[seed] DATABASE_URL is required to run prisma/seed.ts directly.");
    process.exitCode = 1;
    return;
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only auto-run when invoked directly (`prisma db seed` / `node prisma/seed.ts`), never when this
// module is imported by a test that wants to reuse `seed()`/`TEST_USER_ID` against its own client.
const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  });
}
