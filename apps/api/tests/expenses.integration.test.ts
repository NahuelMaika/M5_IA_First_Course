/**
 * Block 11 (spec-FEAT-002) -- end-to-end integration tests for `POST /expenses`.
 * Block 5 (spec-FEAT-003a) adds the sibling end-to-end tests for `GET /expenses` below, reusing
 * the same `app`/`prisma`/`TEST_USER_ID` fixtures and cleanup convention documented in this header.
 *
 * Exercises the FULL app (`buildApp` with a real `PrismaClient`, adapter-driven, pointed at
 * `DATABASE_URL_TEST`) through `fastify.inject` -- no mocks of `parseExpense`, `resolveCategoryName`
 * or Prisma anywhere in this file. This is the only test in the suite that proves the whole chain
 * (auth -> body validation -> service -> repositories -> Postgres) is wired together correctly, per
 * the PRD Goal ("un gasto ingerido por texto quede persistido, categorizado y recuperable en base de
 * datos").
 *
 * `beforeAll` runs `seed()` (Block 3), which upserts the 11 predefined categories and the fixed
 * `TEST_USER_ID` -- both are read-only fixture data for this suite, never recreated or deleted per
 * test. It does NOT run `prisma migrate deploy` -- Block 2's own test file already applies it, and
 * `vitest.config.ts` runs test files serially (`fileParallelism: false`) precisely so that
 * ordering is reliable; spawning a second CLI process here was redundant real-network round-trip
 * work that used to push this hook past its timeout. Run the migration by hand first if this file
 * is ever executed in isolation.
 *
 * Cleanup strategy (documented per spec's Block 11 "decisión documentada en un comentario al inicio
 * del archivo"): this file does NOT use `TRUNCATE ... CASCADE`. `DATABASE_URL_TEST` is a SHARED,
 * live database that Blocks 2/3/8's own test files (`prisma-schema.test.ts`, `seed.test.ts`,
 * `repositories/*.test.ts`) also exercise against -- a blanket `TRUNCATE expenses` or
 * `DELETE FROM categories WHERE owner_id IS NOT NULL` here would silently destroy rows those other
 * files are asserting on mid-run. Every one of those sibling files instead follows "Rule #0"
 * (`testing.instructions.md`): each test creates its own rows and deletes them BY THEIR OWN ID in
 * `afterEach`, never a blanket statement. This file follows that same, already-established
 * convention instead of the spec text's literal `TRUNCATE` suggestion, for exactly the reason those
 * sibling files document. The 11 predefined categories and `TEST_USER_ID` are never touched.
 *
 * One deliberate exception to "by its own id, never a blanket statement": the `GET /expenses`
 * describe below clears `TEST_USER_ID`'s expenses by `userId` (not by tracked id) once in its own
 * `beforeAll`, as a defensive guard against an orphan row a failed assertion elsewhere in this file
 * could have left untracked -- see the comment at that call site for the full reasoning. It is
 * still scoped to one user and one table, never a cross-file `TRUNCATE`.
 *
 * Every test that needs a unique, locatable row embeds a `randomUUID()` either in the free-text
 * description (after the ` - ` separator, which `parseExpense` never re-parses) or, for category
 * markers, as the marker name itself (`#<uuid>` is a valid marker per `category-marker.ts`'s
 * character set: letters, digits, `-`, `_`) -- this guarantees no collision with rows other parallel
 * test files, or other runs of this same suite, might leave behind, and lets each test look its own
 * row up afterwards via `rawInput`/category name instead of asserting on a global count.
 *
 * Block 11 (spec-FEAT-004a) migrated every "logged in" request here from the dead `x-user-id`
 * header to a real session cookie: `beforeAll` (here, and in the nested `GET /expenses` describe
 * below for its two extra users) creates a real `Session` row via `sessionRepository.create`
 * (Block 3), mirroring `tests/repositories/session-repository.test.ts`'s own setup, and sends the
 * raw token back as `app.inject`'s `cookies` option. Every `Session` row this file creates is
 * deleted in the matching `afterAll`, alongside its `User` row, per Rule #0
 * (`testing.instructions.md`) -- `TEST_USER_ID`'s session is deleted before `app.close()`
 * disconnects `prisma` (Block 4's plugin `onClose` hook), since no query can run against `prisma`
 * after that.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RejectedExpense } from "@ggasia/domain";
import { create as createSession } from "../src/repositories/session-repository.ts";

// `RejectionReason` itself is not part of the barrel's public surface (only `RejectedExpense` is,
// per `@ggasia/domain`'s `index.ts`) -- derived the same way `expense-service.ts` (Block 9) does.
type RejectionReason = RejectedExpense["reason"];

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];
const TEST_DIRECT_URL = process.env["DIRECT_URL_TEST"];

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "DATABASE_URL_TEST/DIRECT_URL_TEST must be set (root .env) to run apps/api's Prisma tests.",
  );
}

const UNKNOWN_SESSION_TOKEN = "unknown-raw-session-token-for-integration-tests";

function formatDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

describe("expenses -- end-to-end (Block 11, spec-FEAT-002 + Block 5, spec-FEAT-003a)", () => {
  let prisma: InstanceType<typeof import("../src/generated/prisma/client.ts").PrismaClient>;
  let app: Awaited<ReturnType<typeof import("../src/app.ts").buildApp>>;
  let TEST_USER_ID: string;
  let SESSION_COOKIE_NAME: string;
  let testUserSessionToken: string;

  const createdExpenseIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    // Does NOT run `prisma migrate deploy` here: Block 2's own test (tests/prisma-schema.test.ts)
    // already applies it, and vitest.config.ts now runs test files serially (fileParallelism:
    // false) specifically so that ordering is reliable -- spawning a second full CLI process
    // (real network round-trip) here was redundant work that pushed this hook past its timeout
    // against the real Supabase test project. If this file is ever run in isolation without the
    // rest of the suite, run `pnpm exec prisma migrate deploy` by hand first.
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    const { seed, TEST_USER_ID: seededId } = await import("../prisma/seed.ts");
    await seed(prisma);
    TEST_USER_ID = seededId;

    const { buildApp, SESSION_COOKIE_NAME: cookieName } = await import("../src/app.ts");
    SESSION_COOKIE_NAME = cookieName;
    app = buildApp({ prismaClient: prisma });

    const { token } = await createSession(prisma, TEST_USER_ID);
    testUserSessionToken = token;
  });

  afterEach(async () => {
    if (createdExpenseIds.length > 0) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
      createdExpenseIds.length = 0;
    }
    if (createdCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
      createdCategoryIds.length = 0;
    }
  });

  afterAll(async () => {
    // Must run BEFORE `app.close()`: that call disconnects the injected `prisma` client (Block 4's
    // plugin `onClose` hook), and no query can run against it afterwards.
    await prisma.session.deleteMany({ where: { userId: TEST_USER_ID } });
    await app.close();
  });

  describe("AC-01, AC-06 -- valid input, automatic category, persisted and recoverable", () => {
    it("201s and leaves a recoverable, fully-resolved row in the database", async () => {
      const rawInput = `café 1500 - integration ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        amount: "1500.00",
        place: "café",
        category: "Comida",
        categoryOrigin: "automatica",
        type: "Personal",
        currency: "ARS",
      });

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);

      // `.toString()` on a Decimal read back through pg/@prisma's driver stack doesn't guarantee
      // a trailing zero from the column's declared scale (driver-level quirk, not precision loss
      // -- see tests/repositories/expense-repository.test.ts for the same finding). `.toFixed(2)`
      // is the actual guarantee NFR-02 and routes/expenses.ts rely on.
      expect(persisted.amount.toFixed(2)).toBe("1500.00");
      expect(persisted.place).toBe("café");
      expect(persisted.categoryOrigin).toBe("automatica");

      const category = await prisma.category.findUnique({ where: { id: persisted.categoryId } });
      expect(category?.name).toBe("Comida");
      expect(category?.ownerId).toBeNull();
    });
  });

  describe("AC-02 -- one 422 + zero rows created per RejectionReason", () => {
    const cases: Array<{ reason: RejectionReason; makeInput: () => string }> = [
      { reason: "empty_left_segment", makeInput: () => `- solo un comentario ${randomUUID()}` },
      { reason: "amount_indeterminate", makeInput: () => `sin monto - ${randomUUID()}` },
      { reason: "amount_malformed", makeInput: () => `cafe 1.5 - ${randomUUID()}` },
      { reason: "amount_zero", makeInput: () => `cafe 0 - ${randomUUID()}` },
      { reason: "empty_place", makeInput: () => `gaste 5000 en #almuerzos - ${randomUUID()}` },
      {
        reason: "future_date",
        makeInput: () => {
          const future = new Date();
          future.setFullYear(future.getFullYear() + 1);
          return `cafe 1500 ${formatDDMMYYYY(future)} - ${randomUUID()}`;
        },
      },
      {
        reason: "date_out_of_window",
        makeInput: () => {
          const past = new Date();
          past.setMonth(past.getMonth() - 14);
          return `cafe 1500 ${formatDDMMYYYY(past)} - ${randomUUID()}`;
        },
      },
      { reason: "length_exceeded", makeInput: () => "a".repeat(600) },
    ];

    it.each(cases)("$reason -> 422 with { reason }, zero rows created", async ({ reason, makeInput }) => {
      const rawInput = makeInput();

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ reason });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });
  });

  describe("AC-03 -- no cookie / unknown cookie -> 401, nothing persisted", () => {
    it("401s with no session cookie and creates no row", async () => {
      const rawInput = `café 1500 - ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });

    it("401s with a session cookie that matches no session and creates no row (same generic body)", async () => {
      const rawInput = `café 1500 - ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: UNKNOWN_SESSION_TOKEN },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });
  });

  describe("AC-04 -- marker naming a nonexistent category creates an own category and associates it", () => {
    it("creates the own category and the expense pointing at it", async () => {
      // `-` only survives inside a token between two LETTERS (tokenize.ts) -- a raw
      // `randomUUID()` has hyphens next to digits too, so it gets torn into separate tokens and
      // some of those loose digit fragments compete as Monto candidates, causing a spurious
      // rejection. Stripping the hyphens keeps it one token (mixed hex letters+digits, so it can
      // never match the all-digit amount pattern either) while staying unique per run.
      const markerName = randomUUID().replaceAll("-", "");
      const rawInput = `kiosco 1500 #${markerName}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.category).toBe(markerName);
      expect(body.categoryOrigin).toBe("marcador");

      const category = await prisma.category.findFirst({
        where: { ownerId: TEST_USER_ID, name: markerName },
      });
      if (!category) throw new Error("expected the own category to have been created");
      createdCategoryIds.push(category.id);

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);
      expect(persisted.categoryId).toBe(category.id);
      expect(persisted.categoryOrigin).toBe("marcador");
    });
  });

  describe("AC-05 -- marker normalizing to an already-visible category reuses it, no duplicate", () => {
    it("reuses the own category created by a first request when a second marker normalizes the same", async () => {
      // `-` only survives inside a token between two LETTERS (tokenize.ts) -- a raw `randomUUID()`
      // has hyphens next to digits too, which would tear the marker into separate tokens and leak
      // loose digit fragments into Monto detection (same reasoning as AC-04's marker). Strip its
      // hyphens before splicing it in; "Regalo-Integration" itself stays fine, its hyphen (from
      // the space replacement below) sits between two letters.
      const markerName = `Regalo Integration ${randomUUID().replaceAll("-", "")}`;
      const firstInput = `kiosco 1500 #${markerName.replaceAll(" ", "-")}`;

      const firstResponse = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: firstInput },
      });
      expect(firstResponse.statusCode).toBe(201);

      const firstExpense = await prisma.expense.findFirst({
        where: { userId: TEST_USER_ID, rawInput: firstInput },
      });
      if (!firstExpense) throw new Error("expected the first expense to have been persisted");
      createdExpenseIds.push(firstExpense.id);

      const ownedCategory = await prisma.category.findUnique({
        where: { id: firstExpense.categoryId },
      });
      if (!ownedCategory) throw new Error("expected the own category to have been created");
      expect(ownedCategory.ownerId).toBe(TEST_USER_ID);
      createdCategoryIds.push(ownedCategory.id);

      // Same normalized marker, different literal casing/whitespace-as-hyphen -- must resolve to the
      // SAME category row, not create a second one.
      const secondInput = `almacen 800 #${markerName.replaceAll(" ", "-").toUpperCase()}`;

      const secondResponse = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: secondInput },
      });
      expect(secondResponse.statusCode).toBe(201);

      const secondExpense = await prisma.expense.findFirst({
        where: { userId: TEST_USER_ID, rawInput: secondInput },
      });
      if (!secondExpense) throw new Error("expected the second expense to have been persisted");
      createdExpenseIds.push(secondExpense.id);

      expect(secondExpense.categoryId).toBe(ownedCategory.id);

      const duplicates = await prisma.category.count({
        where: { ownerId: TEST_USER_ID, nameNormalized: ownedCategory.nameNormalized },
      });
      expect(duplicates).toBe(1);
    });
  });

  describe("AC-07 -- unknown marker + indeterminate amount rejects everything, category not created", () => {
    it("422s and creates no category for the unresolved marker", async () => {
      // `-` only survives inside a token between two LETTERS (tokenize.ts) -- a raw `randomUUID()`
      // has hyphens next to digits too, so it gets torn into separate tokens and some of those
      // loose digit fragments can compete as a spurious Monto candidate, turning this into a
      // false 201 instead of the 422 this test exists to prove. Same fix as AC-04/AC-05: stripping
      // the hyphens keeps it one token that can never match the all-digit amount pattern, while
      // staying unique per run.
      const markerName = randomUUID().replaceAll("-", "");
      const rawInput = `kiosco #${markerName}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ reason: "amount_indeterminate" });

      const category = await prisma.category.findFirst({
        where: { ownerId: TEST_USER_ID, name: markerName },
      });
      expect(category).toBeNull();

      const expenseCount = await prisma.expense.count({ where: { rawInput } });
      expect(expenseCount).toBe(0);
    });
  });

  describe("AC-08 -- persisted currency, channel and rawInput fidelity", () => {
    it("persists currency ARS, channel texto and the exact rawInput sent", async () => {
      const rawInput = `supermercado 2500,50 - compra semanal ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ currency: "ARS" });

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);

      expect(persisted.currency).toBe("ARS");
      expect(persisted.channel).toBe("texto");
      expect(persisted.rawInput).toBe(rawInput);
    });
  });

  describe("AC-09 -- invalid body shapes -> 400, nothing persisted", () => {
    it.each([
      { label: "missing input", payload: {} },
      { label: "empty input", payload: { input: "" } },
      { label: "non-string input", payload: { input: 123 } },
    ])("$label -> 400", async ({ payload }) => {
      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("AC-10 -- seed idempotency and a genuine uniqueness violation aborting the boot path", () => {
    it("running the seed twice through the same wiring the app boots with does not throw or duplicate", async () => {
      const { seed } = await import("../prisma/seed.ts");

      await expect(seed(prisma)).resolves.toBeUndefined();

      const predefined = await prisma.category.findMany({ where: { ownerId: null } });
      expect(predefined).toHaveLength(11);

      const users = await prisma.user.findMany({ where: { id: TEST_USER_ID } });
      expect(users).toHaveLength(1);
    });

    it("a genuine uniqueness violation on the partial index rejects the raw insert (never silently swallowed)", async () => {
      const nameNormalized = `integration duplicate ${randomUUID()}`;
      const firstId = randomUUID();

      try {
        await prisma.$executeRaw`
          INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
          VALUES (${firstId}::uuid, ${nameNormalized}, ${nameNormalized}, NULL, true, now())
        `;

        const secondId = randomUUID();
        await expect(
          prisma.$executeRaw`
            INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
            VALUES (${secondId}::uuid, ${nameNormalized}, ${nameNormalized}, NULL, true, now())
          `,
        ).rejects.toThrow();
      } finally {
        await prisma.$executeRaw`DELETE FROM categories WHERE id = ${firstId}::uuid`;
      }
    });
  });

  describe("GET /expenses -- end-to-end (Block 5, spec-FEAT-003a)", () => {
    // Two extra real users, disjoint from the seeded TEST_USER_ID -- `authPreHandler` (Block 7,
    // spec-FEAT-004a) requires a valid session cookie, resolved to a userId via a real `Session`
    // row, so a random/never-created id (or a user with no session) would 401 instead of
    // exercising the 200-empty-list (AC-04) and per-user isolation (AC-01) paths below.
    let OTHER_USER_ID: string;
    let NO_EXPENSES_USER_ID: string;
    let otherUserSessionToken: string;
    let noExpensesUserSessionToken: string;
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      // Defensive cleanup: TEST_USER_ID's expenses are always supposed to be empty between tests
      // (each POST test above tracks its own row in `createdExpenseIds` and `afterEach` deletes it
      // by id) -- but a sibling test elsewhere in this file that throws before reaching its own
      // `createdExpenseIds.push(...)` call (e.g. an assertion failing before the cleanup-tracking
      // line runs) can leave an orphan row behind. The `FR-03 -- limit bounds the result` test below
      // asserts on an EXACT top-N by `when`, so any leftover row for TEST_USER_ID would silently
      // corrupt that assertion. Clearing here, once, before this describe's own fixtures run, keeps
      // this block's tests deterministic regardless of what happened earlier in the file.
      await prisma.expense.deleteMany({ where: { userId: TEST_USER_ID } });

      OTHER_USER_ID = randomUUID();
      NO_EXPENSES_USER_ID = randomUUID();
      await prisma.user.create({
        data: {
          id: OTHER_USER_ID,
          email: `other-${OTHER_USER_ID}@ggasia.local`,
          passwordHash: "test-hash",
        },
      });
      await prisma.user.create({
        data: {
          id: NO_EXPENSES_USER_ID,
          email: `no-expenses-${NO_EXPENSES_USER_ID}@ggasia.local`,
          passwordHash: "test-hash",
        },
      });
      createdUserIds.push(OTHER_USER_ID, NO_EXPENSES_USER_ID);

      otherUserSessionToken = (await createSession(prisma, OTHER_USER_ID)).token;
      noExpensesUserSessionToken = (await createSession(prisma, NO_EXPENSES_USER_ID)).token;
    });

    afterAll(async () => {
      if (createdUserIds.length > 0) {
        // Session rows first -- deleting the User row while its Session still points at it would
        // violate the FK (`Session.userId -> User.id` has no `onDelete: Cascade`, Block 1).
        await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
        createdUserIds.length = 0;
      }
    });

    describe("AC-01 -- real ordering by `when`, not load order", () => {
      it("returns three expenses loaded out of when-order, sorted by when descending", async () => {
        const marker = randomUUID();
        const today = new Date();
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const oldestInput = `kiosco 100 ${formatDDMMYYYY(threeDaysAgo)} - order ${marker} oldest`;
        const newestInput = `kiosco 100 ${formatDDMMYYYY(today)} - order ${marker} newest`;
        const middleInput = `kiosco 100 ${formatDDMMYYYY(oneDayAgo)} - order ${marker} middle`;

        // Load order deliberately mismatches `when` order: oldest first, then newest, then middle.
        for (const input of [oldestInput, newestInput, middleInput]) {
          const response = await app.inject({
            method: "POST",
            url: "/expenses",
            cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
            payload: { input },
          });
          expect(response.statusCode).toBe(201);
        }

        const [oldest, newest, middle] = await Promise.all(
          [oldestInput, newestInput, middleInput].map((rawInput) =>
            prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } }),
          ),
        );
        if (!oldest || !newest || !middle) {
          throw new Error("expected all three expenses to have been persisted");
        }
        createdExpenseIds.push(oldest.id, newest.id, middle.id);

        const listResponse = await app.inject({
          method: "GET",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        });

        expect(listResponse.statusCode).toBe(200);
        const ids = listResponse.json().expenses.map((expense: { id: string }) => expense.id);

        const newestIndex = ids.indexOf(newest.id);
        const middleIndex = ids.indexOf(middle.id);
        const oldestIndex = ids.indexOf(oldest.id);

        expect(newestIndex).toBeGreaterThanOrEqual(0);
        expect(middleIndex).toBeGreaterThanOrEqual(0);
        expect(oldestIndex).toBeGreaterThanOrEqual(0);
        expect(newestIndex).toBeLessThan(middleIndex);
        expect(middleIndex).toBeLessThan(oldestIndex);
      });
    });

    describe("AC-04 -- a user with no expenses", () => {
      it("returns 200 with an empty list", async () => {
        const response = await app.inject({
          method: "GET",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: noExpensesUserSessionToken },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ expenses: [] });
      });
    });

    describe("FR-03 -- limit bounds the result", () => {
      it("returns exactly `limit` expenses, the most recent by when", async () => {
        const marker = randomUUID();
        const oldestDate = new Date();
        oldestDate.setDate(oldestDate.getDate() - 5);
        const middleDate = new Date();
        middleDate.setDate(middleDate.getDate() - 2);
        const newestDate = new Date();

        const oldestInput = `kiosco 100 ${formatDDMMYYYY(oldestDate)} - limit ${marker} oldest`;
        const middleInput = `kiosco 100 ${formatDDMMYYYY(middleDate)} - limit ${marker} middle`;
        const newestInput = `kiosco 100 ${formatDDMMYYYY(newestDate)} - limit ${marker} newest`;

        for (const input of [oldestInput, middleInput, newestInput]) {
          const response = await app.inject({
            method: "POST",
            url: "/expenses",
            cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
            payload: { input },
          });
          expect(response.statusCode).toBe(201);
        }

        const [oldest, middle, newest] = await Promise.all(
          [oldestInput, middleInput, newestInput].map((rawInput) =>
            prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } }),
          ),
        );
        if (!oldest || !middle || !newest) {
          throw new Error("expected all three expenses to have been persisted");
        }
        createdExpenseIds.push(oldest.id, middle.id, newest.id);

        const response = await app.inject({
          method: "GET",
          url: "/expenses?limit=2",
          cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        });

        expect(response.statusCode).toBe(200);
        const ids = response.json().expenses.map((expense: { id: string }) => expense.id);
        expect(ids).toEqual([newest.id, middle.id]);
      });
    });

    describe("AC-02 -- invalid `limit` query param", () => {
      it.each([
        { label: "limit=0 (below the minimum)", query: "limit=0" },
        { label: "limit=201 (above the maximum)", query: "limit=201" },
        { label: "limit=abc (not numeric)", query: "limit=abc" },
      ])("$label -> 400 against the real app, no query-level side effect", async ({ query }) => {
        const response = await app.inject({
          method: "GET",
          url: `/expenses?${query}`,
          cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe("AC-01 -- per-user isolation", () => {
      it("a user's expenses never appear in another user's list", async () => {
        const marker = randomUUID();
        const mineInput = `kiosco 100 - isolation ${marker} mine`;
        const theirsInput = `kiosco 100 - isolation ${marker} theirs`;

        const mineResponse = await app.inject({
          method: "POST",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
          payload: { input: mineInput },
        });
        expect(mineResponse.statusCode).toBe(201);

        const theirsResponse = await app.inject({
          method: "POST",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: otherUserSessionToken },
          payload: { input: theirsInput },
        });
        expect(theirsResponse.statusCode).toBe(201);

        const [mine, theirs] = await Promise.all([
          prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput: mineInput } }),
          prisma.expense.findFirst({ where: { userId: OTHER_USER_ID, rawInput: theirsInput } }),
        ]);
        if (!mine || !theirs) {
          throw new Error("expected both expenses to have been persisted");
        }
        createdExpenseIds.push(mine.id, theirs.id);

        const mineList = await app.inject({
          method: "GET",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: testUserSessionToken },
        });
        const theirsList = await app.inject({
          method: "GET",
          url: "/expenses",
          cookies: { [SESSION_COOKIE_NAME]: otherUserSessionToken },
        });

        const mineIds = mineList.json().expenses.map((expense: { id: string }) => expense.id);
        const theirsIds = theirsList.json().expenses.map((expense: { id: string }) => expense.id);

        expect(mineIds).toContain(mine.id);
        expect(mineIds).not.toContain(theirs.id);
        expect(theirsIds).toContain(theirs.id);
        expect(theirsIds).not.toContain(mine.id);
      });
    });
  });
});
