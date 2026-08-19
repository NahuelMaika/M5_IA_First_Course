/**
 * Block 3 (spec-FEAT-002) -- prisma/seed.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`), never against `DATABASE_URL` (development).
 * Loads the root `.env` explicitly with `dotenv`, since vitest does not load it on its own and
 * this app has no `.env` of its own -- same pattern as `tests/prisma-schema.test.ts` (Block 2).
 *
 * The first test (category order) is pure and needs no database connection -- it just checks the
 * exported constant matches kb.md's normative order. The other two exercise `seed()` against a
 * live `DATABASE_URL_TEST` connection: they are not cleaned up in `afterAll` on purpose, because
 * Block 3's whole point is leaving the 11 predefined categories + the test user seeded for later
 * blocks (Block 11's end-to-end suite) to reuse without recomputing anything -- re-running this
 * suite is itself a live idempotency check, not something that needs teardown.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalize } from "@ggasia/categorization";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

// kb.md "Categorias Predefinidas" -- normative order, copied verbatim (FR-11, FR-12).
const EXPECTED_CATEGORY_NAMES = [
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
];

describe("prisma/seed.ts (Block 3, spec-FEAT-002)", () => {
  it("exports the 11 predefined category names in kb.md's normative order", async () => {
    const { PREDEFINED_CATEGORY_NAMES } = await import("../prisma/seed.ts");
    expect(PREDEFINED_CATEGORY_NAMES).toEqual(EXPECTED_CATEGORY_NAMES);
  });

  describe("running against a live DATABASE_URL_TEST connection", () => {
    let prisma: InstanceType<typeof import("../src/generated/prisma/client.ts").PrismaClient>;

    beforeAll(async () => {
      const { PrismaClient } = await import("../src/generated/prisma/client.ts");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
      prisma = new PrismaClient({ adapter });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it("creates the 11 predefined categories in normative order + the test user (FR-11, FR-12)", async () => {
      const { seed, TEST_USER_ID, TEST_USER_EMAIL } = await import("../prisma/seed.ts");

      await seed(prisma);

      const categories = await prisma.category.findMany({
        where: {
          ownerId: null,
          nameNormalized: { in: EXPECTED_CATEGORY_NAMES.map((name) => normalize(name)) },
        },
        orderBy: { createdAt: "asc" },
      });

      expect(categories).toHaveLength(11);
      expect(categories.map((category) => category.name)).toEqual(EXPECTED_CATEGORY_NAMES);
      expect(categories.every((category) => category.active)).toBe(true);
      expect(categories.every((category) => category.ownerId === null)).toBe(true);
      for (const category of categories) {
        expect(category.nameNormalized).toBe(normalize(category.name));
      }

      const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
      expect(user).not.toBeNull();
      expect(user?.email).toBe(TEST_USER_EMAIL);
    });

    it("running the seed twice in a row does not duplicate rows nor fail (idempotency)", async () => {
      const { seed, TEST_USER_ID } = await import("../prisma/seed.ts");

      await expect(seed(prisma)).resolves.toBeUndefined();

      const categories = await prisma.category.findMany({
        where: {
          ownerId: null,
          nameNormalized: { in: EXPECTED_CATEGORY_NAMES.map((name) => normalize(name)) },
        },
      });
      expect(categories).toHaveLength(11);

      const users = await prisma.user.findMany({ where: { id: TEST_USER_ID } });
      expect(users).toHaveLength(1);
    });
  });
});
