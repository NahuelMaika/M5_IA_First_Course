/**
 * Block 10 (spec-FEAT-002) -- src/routes/expenses.ts.
 *
 * Exercises `POST /expenses` end-to-end at the HTTP layer via `fastify.inject`, with only
 * `PrismaClient` faked (an in-memory `category`/`expense` store mirroring the shape the real
 * repositories -- Block 8 -- query against). `parseExpense` (from `@ggasia/domain`) and
 * `resolveCategoryName` (from `@ggasia/categorization`) run for real: this is the only layer where
 * the full request -> response chain (auth -> body validation -> service -> HTTP mapping) is
 * proven wired together, per Block 10's Required tests.
 *
 * Block 11 (spec-FEAT-004a) migrated every "logged in" request here from the dead `x-user-id`
 * header to a real session cookie: the fake Prisma client mocks `session.findUnique` (what
 * `authPreHandler`'s `findValid` actually calls, Block 7) instead of `user.findUnique`, same
 * pattern as `tests/plugins/auth.test.ts`'s own fake client. It also adds the 3 Required
 * regression tests proving `x-user-id` alone, without a cookie, no longer authenticates anything.
 */
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.ts";

// Block 5 (spec-FEAT-006) makes `src/routes/expenses.ts` import `transcription-client.ts`
// statically, which imports `env.ts` eagerly at module top level -- so a plain `import {
// SESSION_COOKIE_NAME } from "../../src/app.ts"` at this file's top would now fail with
// `process.exit(1)` (missing TRANSCRIPTION_*/DATABASE_URL/WEB_ORIGIN) before any test even runs,
// since ES module imports resolve before this file's own top-level statements. Loading the root
// `.env` first, then importing `app.ts` dynamically (top-level await), same pattern as
// `tests/services/transcription-client.test.ts`, fixes the ordering.
const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const { SESSION_COOKIE_NAME } = await import("../../src/app.ts");

// Some of these tests are the first in the process to transform/load the compiled
// `@ggasia/domain` module through `vi.mock`'s dynamic `importOriginal`, which can take longer
// than Vitest's 5s default on a cold run -- observed flaking at 30s too once the suite runs
// serially (vitest.config.ts's `fileParallelism: false`, needed to avoid racing DB-dependent
// files against each other), so this stays generous rather than masking a real hang.
const TEST_TIMEOUT_MS = 60_000;

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const VALID_SESSION_TOKEN = "valid-raw-session-token-for-route-tests";
const UNKNOWN_SESSION_TOKEN = "unknown-raw-session-token-for-route-tests";

// Same hashing algorithm as `session-repository.ts` (SHA-256 hex digest, threat-FEAT-004a.md R2) --
// duplicated here rather than imported, same pattern as `tests/plugins/auth.test.ts`, since the
// fake session row has to be keyed by what `findValid` actually looks up.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const FAKE_SESSIONS = [
  {
    token: hashToken(VALID_SESSION_TOKEN),
    userId: TEST_USER_ID,
    expiresAt: new Date(Date.now() + 60_000),
  },
];

// Spy on `parseExpense` while keeping its real implementation -- Block 10's Required tests demand
// proof that invalid-body (400) and unauthorized (covered by Block 6 already) requests never reach
// it. `importOriginal` keeps every other export of `@ggasia/domain` untouched.
vi.mock("@ggasia/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ggasia/domain")>();
  return {
    ...actual,
    parseExpense: vi.fn(actual.parseExpense),
  };
});

// `GET /expenses` tests (Block 4, spec-FEAT-003a) exercise the route layer only: `listExpenses`
// (Block 3) already has its own dedicated test suite, so it is mocked here to isolate query
// validation and HTTP response mapping without re-testing ordering/repository concerns.
// `PATCH`/`DELETE /expenses/:id` tests (Block 6, spec-FEAT-005a) follow the same reasoning:
// `updateExpense`/`deleteExpense` already have their own dedicated test suite
// (tests/services/expense-service.test.ts), so they are mocked here too, isolating param/body
// validation and HTTP response mapping.
vi.mock("../../src/services/expense-service.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/expense-service.ts")>();
  return {
    ...actual,
    listExpenses: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
  };
});

// `POST /expenses/audio` tests (Block 5, spec-FEAT-006) fully mock the transcription client --
// it is the project's first external HTTP client (Block 3 has its own dedicated test suite) and
// must never call the real Groq API from this route-level suite.
vi.mock("../../src/services/transcription-client.ts", () => ({
  transcribeAudio: vi.fn(),
}));

interface FakeCategory {
  id: string;
  name: string;
  nameNormalized: string;
  ownerId: string | null;
  active: boolean;
}

function fakePrismaClient(seedCategories: FakeCategory[]) {
  const categories: FakeCategory[] = [...seedCategories];
  const expenses: unknown[] = [];
  let expenseCreateImpl: ((data: Record<string, unknown>) => unknown) | null = null;

  return {
    __state: { categories, expenses },
    __setExpenseCreateImpl(impl: typeof expenseCreateImpl) {
      expenseCreateImpl = impl;
    },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    session: {
      findUnique: vi.fn(async ({ where: { token } }: { where: { token: string } }) => {
        return FAKE_SESSIONS.find((session) => session.token === token) ?? null;
      }),
    },
    category: {
      findMany: vi.fn(async ({ where }: { where: { OR: Array<{ ownerId: string | null }> } }) => {
        return categories.filter((category) =>
          where.OR.some((clause) => category.ownerId === clause.ownerId),
        );
      }),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { name: string; ownerId?: null; OR?: Array<{ ownerId: string | null }> };
        }) => {
          return (
            categories.find((category) => {
              if (category.name !== where.name) return false;
              if (where.OR) {
                return where.OR.some((clause) => category.ownerId === clause.ownerId);
              }
              return category.ownerId === where.ownerId;
            }) ?? null
          );
        },
      ),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        return categories.find((category) => category.id === id) ?? null;
      }),
      create: vi.fn(
        async ({ data }: { data: { name: string; nameNormalized: string; ownerId: string } }) => {
          const created: FakeCategory = {
            id: randomUUID(),
            name: data.name,
            nameNormalized: data.nameNormalized,
            ownerId: data.ownerId,
            active: true,
          };
          categories.push(created);
          return created;
        },
      ),
    },
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (expenseCreateImpl) {
          return expenseCreateImpl(data);
        }
        const created = { id: randomUUID(), createdAt: new Date(), ...data };
        expenses.push(created);
        return created;
      }),
    },
  };
}

function seedFor(overrides: Partial<FakeCategory>[] = []): FakeCategory[] {
  const base: FakeCategory = {
    id: randomUUID(),
    name: "Comida",
    nameNormalized: "comida",
    ownerId: null,
    active: true,
  };
  return [base, ...overrides.map((o) => ({ ...base, id: randomUUID(), ...o }))];
}

/**
 * Builds a raw `multipart/form-data` body for `app.inject()` by hand -- there is no `form-data`
 * helper package in this monorepo, and `fastify.inject` accepts a plain `Buffer` payload as long
 * as the matching `content-type` (with `boundary`) is set explicitly.
 */
function multipartAudioBody(fileContent: Buffer, filename = "audio.webm", mimetype = "audio/webm") {
  const boundary = "----ggasia-test-boundary";
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([header, fileContent, footer]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** An empty `multipart/form-data` body -- no file part at all (Block 5's 400 case). */
function emptyMultipartBody() {
  const boundary = "----ggasia-test-boundary-empty";
  return {
    payload: Buffer.from(`--${boundary}--\r\n`),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("POST /expenses/audio (Block 5, spec-FEAT-006)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the FR-13 shape and channel: audio for a valid recording (AC-01)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "transcribed", text: "café 1500" });

    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      amount: "1500.00",
      place: "café",
      category: "Comida",
      categoryOrigin: "automatica",
      description: "",
      name: "café",
      type: "Personal",
      currency: "ARS",
    });
    const createdExpense = prisma.__state.expenses[0] as Record<string, unknown>;
    expect(createdExpense["channel"]).toBe("audio");

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 400 when the multipart request carries no file", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = emptyMultipartBody();
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "validation_error" });
    expect(transcribeAudio).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when there is no session cookie (AC-07)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      headers,
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(transcribeAudio).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 413 for a file exceeding 25 MB, without ever invoking transcribeAudio (AC-04)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const oversizedFile = Buffer.alloc(25 * 1024 * 1024 + 1024, "a");
    const { payload, headers } = multipartAudioBody(oversizedFile);
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(413);
    expect(transcribeAudio).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 422 transcripcion_vacia when transcribeAudio returns an empty/blank text, without invoking createExpense (AC-03)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "transcribed", text: "   " });

    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ reason: "transcripcion_vacia" });
    // `createExpense` is never invoked -- proven indirectly via `parseExpense`, its first internal
    // call, which the domain-rejection test below shows this suite CAN observe directly.
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 422 with the same domain reason POST /expenses would return for the same text", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "transcribed", text: "sin monto" });

    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(422);
    // Same reason `POST /expenses` returns for the literal input "sin monto" (see that describe
    // block's own AC-02 test above) -- proves both channels share the same `parseExpense` rules.
    expect(response.json()).toEqual({ reason: "amount_indeterminate" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 502 when transcribeAudio fails, and creates no expense (AC-05)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "error" });

    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "transcription_failed" });
    expect(prisma.expense.create).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("never exposes the raw audio bytes or the transcribed text in an error response (AC-02)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    const SECRET_MARKER = "SECRET-AUDIO-MARKER-should-never-leak";
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "transcribed", text: "sin monto" });

    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from(SECRET_MARKER));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(422);
    expect(response.body).not.toContain(SECRET_MARKER);
    expect(response.body).not.toContain("sin monto");

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when createExpense reports internal_error, without leaking rawInput (spec loop 1)", async () => {
    const { transcribeAudio } = await import("../../src/services/transcription-client.ts");
    vi.mocked(transcribeAudio).mockResolvedValue({ outcome: "transcribed", text: "café 1500" });

    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseCreateImpl(() => {
      throw new Error("Prisma exploded: connection refused at db.internal:5432");
    });
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const { payload, headers } = multipartAudioBody(Buffer.from("fake-audio-bytes"));
    const response = await app.inject({
      method: "POST",
      url: "/expenses/audio",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers,
      payload,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.body).not.toContain("Prisma exploded");
    expect(response.body).not.toContain("db.internal");
    expect(response.body).not.toContain("café 1500");

    await app.close();
  }, TEST_TIMEOUT_MS);
});

describe("POST /expenses (Block 10, spec-FEAT-002)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the FR-13 shape for a full happy path (AC-01)", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      amount: "1500.00",
      place: "café",
      category: "Comida",
      categoryOrigin: "automatica",
      description: "",
      name: "café",
      type: "Personal",
      currency: "ARS",
    });
    expect(typeof body.when).toBe("string");
    expect(new Date(body.when).toISOString()).toBe(body.when);
    // The route reads the category name straight off the service's result -- it must never query
    // Prisma directly for presentation mapping (`routes -> service -> repository`).
    expect(prisma.category.findUnique).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when there is no session cookie", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when the session cookie is invalid/unknown, and never invokes parseExpense", async () => {
    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: UNKNOWN_SESSION_TOKEN },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(401);
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 400 when the body has no input, and never invokes parseExpense", async () => {
    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 422 with the rejection reason when parseExpense rejects the input (AC-02)", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    // "sin monto" is a non-empty string, so it passes Zod (Block 7) and reaches `parseExpense`,
    // which rejects it for lacking a determinable amount.
    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: { input: "sin monto" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ reason: "amount_indeterminate" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 413 when the body exceeds the 16 KB bodyLimit", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const oversizedInput = "a".repeat(20_000);

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ input: oversizedInput }),
    });

    expect(response.statusCode).toBe(413);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when the repository throws, without leaking the Prisma error", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseCreateImpl(() => {
      throw new Error("Prisma exploded: connection refused at db.internal:5432");
    });
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.body).not.toContain("Prisma exploded");
    expect(response.body).not.toContain("db.internal");

    await app.close();
  }, TEST_TIMEOUT_MS);
});

describe("GET /expenses (Block 4, spec-FEAT-003a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the serialized expense list (AC-01)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const when = new Date("2026-08-15T12:00:00.000Z");
    vi.mocked(listExpenses).mockResolvedValue({
      outcome: "listed",
      expenses: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          amount: new Prisma.Decimal("1500"),
          place: "café",
          when,
          category: "Comida",
          categoryOrigin: "automatica",
          description: "",
          name: "café",
          type: "Personal",
          currency: "ARS",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expenses).toHaveLength(1);
    expect(body.expenses[0]).toMatchObject({
      id: "11111111-2222-3333-4444-555555555555",
      amount: "1500.00",
      place: "café",
      category: "Comida",
      categoryOrigin: "automatica",
      description: "",
      name: "café",
      type: "Personal",
      currency: "ARS",
    });
    expect(body.expenses[0].when).toBe(when.toISOString());

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("invokes the service with limit 50 when the query param is absent", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenCalledWith(expect.any(Object), TEST_USER_ID, 50);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("invokes the service with the requested limit at both range edges (limit=200, limit=1)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    const responseUpper = await app.inject({
      method: "GET",
      url: "/expenses?limit=200",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });
    expect(responseUpper.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenLastCalledWith(expect.any(Object), TEST_USER_ID, 200);

    const responseLower = await app.inject({
      method: "GET",
      url: "/expenses?limit=1",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });
    expect(responseLower.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenLastCalledWith(expect.any(Object), TEST_USER_ID, 1);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 400 without invoking the service for limit=0, limit=201 and limit=abc (AC-02)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    for (const invalidLimit of ["0", "201", "abc"]) {
      const response = await app.inject({
        method: "GET",
        url: `/expenses?limit=${invalidLimit}`,
        cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 without invoking the service when there is no session cookie (AC-03)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({ method: "GET", url: "/expenses" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 with the same generic body when the session cookie is invalid/unknown (AC-03)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: UNKNOWN_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 without leaking the internal error when the service reports internal_error", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "internal_error" });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });

    await app.close();
  }, TEST_TIMEOUT_MS);
});

/**
 * Block 11 (spec-FEAT-004a) -- Required tests proving the `x-user-id` header is completely dead
 * (AC-09/threat-FEAT-004a.md R5): it no longer authenticates anything, even when it names a real
 * user, and only a valid session cookie does.
 */
describe("auth boundary regression -- x-user-id is fully dead (Block 11, spec-FEAT-004a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /expenses with only x-user-id (valid user, no cookie) -> 401", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("POST /expenses with only x-user-id (valid user, no cookie) -> 401", async () => {
    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("GET /expenses with a valid session cookie (no x-user-id) -> 200, works the same as before", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenCalledWith(expect.any(Object), TEST_USER_ID, 50);

    await app.close();
  }, TEST_TIMEOUT_MS);
});

describe("PATCH /expenses/:id (Block 6, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with an empty body, and never invokes updateExpense", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "PATCH",
      url: `/expenses/${randomUUID()}`,
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(updateExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when there is no session cookie, and never invokes updateExpense", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "PATCH",
      url: `/expenses/${randomUUID()}`,
      payload: { place: "kiosco" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(updateExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 422 when the service reports invalid_category", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(updateExpense).mockResolvedValue({ outcome: "invalid_category" });

    const response = await app.inject({
      method: "PATCH",
      url: `/expenses/${randomUUID()}`,
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: { categoryId: randomUUID() },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "invalid_category" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when the service reports internal_error, without leaking it", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(updateExpense).mockResolvedValue({ outcome: "internal_error" });

    const response = await app.inject({
      method: "PATCH",
      url: `/expenses/${randomUUID()}`,
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
      payload: { place: "kiosco" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });

    await app.close();
  }, TEST_TIMEOUT_MS);
});

describe("DELETE /expenses/:id (Block 6, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session cookie, and never invokes deleteExpense", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({ method: "DELETE", url: `/expenses/${randomUUID()}` });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(deleteExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when the service reports internal_error, without leaking it", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(deleteExpense).mockResolvedValue({ outcome: "internal_error" });

    const response = await app.inject({
      method: "DELETE",
      url: `/expenses/${randomUUID()}`,
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });

    await app.close();
  }, TEST_TIMEOUT_MS);
});
