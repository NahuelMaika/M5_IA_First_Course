# Spec FEAT-004a: Registro, login y logout — API

| Field | Value |
|-------|-------|
| Ticket | FEAT-004a |
| PRD | docs/daw/prd/prd-FEAT-004a.md |
| Tier | FEATURE |
| Date | 2026-08-22 |
| Spec loops | 0 |

## Summary

Se reemplaza el stub `x-user-id` (spec-FEAT-002 Block 6) por autenticación real: `POST /auth/register`
y `POST /auth/login` crean una sesión respaldada por una tabla `Session` en Postgres y la exponen
como cookie httpOnly (token opaco de 256 bits, hasheado con SHA-256 antes de guardarse); el
`authPreHandler` reescrito valida esa cookie contra la tabla en cada request. Los passwords se
hashean con argon2 (defaults de la librería). El throttle de login (5 intentos fallidos por email
cada 15 minutos) vive en memoria del proceso. `GET`/`POST /expenses` quedan repuntadas al
`authPreHandler` nuevo sin ningún camino de vuelta a `x-user-id`.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 4, Block 8, Block 10 |
| FR-02 | Block 8 |
| FR-03 | Block 1, Block 2, Block 9 |
| FR-04 | Block 4, Block 9, Block 10 |
| FR-05 | Block 9, Block 10 |
| FR-06 | Block 4, Block 9, Block 10 |
| FR-07 | Block 3, Block 6, Block 9, Block 10 |
| FR-08 | Block 9 |
| FR-09 | Block 5, Block 9 |
| FR-10 | Block 9, Block 10 |
| FR-11 | Block 3, Block 9, Block 10 |
| FR-12 | Block 7 |
| FR-13 | Block 7, Block 11 |
| NFR-01 | Strategy: Block 6 branca `secure`/`sameSite` sobre `NODE_ENV`, mismo patrón que `webOrigin` en `app.ts` |
| NFR-02 | Strategy: Block 3 fija `expiresAt = now + 7 días` en `session-repository.create` |
| NFR-03 | Strategy: Block 2 usa argon2 (defaults de librería, sin parámetros de costo debilitados) |
| NFR-04 | Strategy: Block 5 usa el email (normalizado a lowercase) como única clave del throttle, nunca IP |
| NFR-05 | Strategy: ningún bloque loguea `password` ni el token crudo; nota para logging futuro en Block 6 |

## Dependencies between blocks

Block 1 (schema) no depende de nada y bloquea a todos los demás (Prisma Client se regenera desde
`schema.prisma`). Block 2 (hashing) y Block 5 (throttle) son independientes entre sí y de Block 1
más allá del tipo que consumen. Block 3 (session-repo) y Block 4 (user-repo) dependen de Block 1.
Block 6 (cookie plugin) es independiente. Block 7 (authPreHandler) depende de Block 3 y Block 6.
Block 8 (schemas Zod) es independiente. Block 9 (auth-service) depende de 2, 3, 4, 5. Block 10
(rutas) depende de 6, 8, 9. Block 11 (tests de regresión) depende de 7 y 10 ya mergeados.

Orden sugerido: 1 → 2 → 4 → 5 → 3 → 6 → 8 → 9 → 7 → 10 → 11.

## Block 1 — Prisma schema, migración y fixtures existentes

**Files**
- `apps/api/prisma/schema.prisma` (modified) — agrega `passwordHash` a `User`, agrega modelo
  `Session`.
- `apps/api/prisma/migrations/<timestamp>_add_password_and_sessions/migration.sql` (new).
- `apps/api/prisma/seed.ts` (modified) — `upsertTestUser` setea `passwordHash`.
- `apps/api/tests/prisma-schema.test.ts` (modified) — los `INSERT INTO users` crudos (líneas
  ~155-159) incluyen `password_hash`.
- `apps/api/tests/expenses.integration.test.ts` (modified) — los `prisma.user.create` (líneas
  ~464/467) incluyen `passwordHash`.
- `apps/api/tests/repositories/expense-repository.test.ts` (modified) — el `prisma.user.create`
  (línea ~121) incluye `passwordHash`.
- `apps/api/package.json` (modified) — agrega `argon2` a `dependencies`.

**Logic**

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique @db.Citext
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at")

  ownedCategories Category[]
  expenses        Expense[]
  sessions        Session[]

  @@map("users")
}

model Session {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  // SHA-256 hex digest del token, NUNCA el token crudo (threat-FEAT-004a.md, R2).
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@map("sessions")
}
```

`passwordHash` es `NOT NULL` desde el día uno: no hay usuarios reales en producción todavía (el
único `User` existente es el fijo de `seed.ts`), así que no hace falta una migración en dos pasos
(nullable → backfill → NOT NULL) — se actualizan `seed.ts` y los 3 fixtures de test en el mismo
bloque que la migración, para que nada quede insertando `User` sin `password_hash`.

`seed.ts`: hashear con argon2 una password de test fija y documentada en un comentario (ej.
`"test-password-only-for-seed"`), nunca en texto plano en el propio archivo más que en ese
comentario explícito de uso local.

**Data model**

Ver bloque Prisma arriba. `Session.token` tiene índice único (usado por `findValid`/`invalidate`
en Block 3). `Session.userId` es FK a `User.id`, sin índice adicional (volumen esperado bajo, no
hay query por `userId` en este ticket).

**Error handling**

La migración falla si algún `INSERT`/`create` de `User` no provee `password_hash` — por eso los 4
archivos de fixtures se actualizan en el mismo bloque, no después.

**Required tests**

- [ ] `apps/api/tests/prisma-schema.test.ts` sigue pasando con `password_hash` agregado a los
  `INSERT` crudos.
- [ ] `apps/api/tests/expenses.integration.test.ts` y
  `apps/api/tests/repositories/expense-repository.test.ts` siguen pasando con `passwordHash`
  agregado a sus `prisma.user.create`.
- [ ] `apps/api/tests/seed.test.ts` (si ejercita `upsertTestUser`) sigue pasando.

**Completion criterion**

`pnpm --filter @ggasia/api exec prisma migrate dev` aplica limpio contra la DB de test, y los 3
archivos de test + `seed.ts` corren sin fallos de constraint `NOT NULL`.

## Block 2 — Utilidad de hashing de passwords

**Files**
- `apps/api/src/lib/password.ts` (new).
- `apps/api/tests/lib/password.test.ts` (new).

**Logic**

```ts
import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
```

Sin parámetros de costo custom — los defaults de `argon2` (variante `argon2id`) ya cumplen los
lineamientos vigentes (threat-FEAT-004a.md nota sobre NFR-03).

**Error handling**

Sin manejo especial: `hash` siempre proviene de `hashPassword` (único punto de escritura en todo el
código), así que `argon2.verify` nunca recibe un formato inesperado en la práctica — no hay una
rama de error propia de este módulo que requiera prueba dedicada.

**Required tests**

- [ ] `hashPassword` produce un hash que `verifyPassword` valida como correcto para el mismo plain.
- [ ] `verifyPassword` devuelve `false` para un plain incorrecto.
- [ ] El hash resultante nunca es igual al plain (sanity check anti no-op).

**Completion criterion**

Los 3 tests pasan; ningún otro módulo importa `argon2` directamente (todo pasa por este archivo).

## Block 3 — Repositorio de sesiones

**Files**
- `apps/api/src/repositories/session-repository.ts` (new).
- `apps/api/tests/repositories/session-repository.test.ts` (new).

**Logic**

```ts
import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.ts";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // NFR-02

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function create(
  prisma: PrismaClient,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { userId, token: hashToken(rawToken), expiresAt },
  });

  return { token: rawToken, expiresAt };
}

export async function findValid(
  prisma: PrismaClient,
  rawToken: string,
): Promise<{ userId: string } | null> {
  const session = await prisma.session.findUnique({ where: { token: hashToken(rawToken) } });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return { userId: session.userId };
}

export async function invalidate(prisma: PrismaClient, rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: hashToken(rawToken) } });
}
```

`invalidate` usa `deleteMany` (no `delete`) para no lanzar si el token ya no existe (logout
idempotente).

**Error handling**

Ninguno de los tres necesita distinguir errores propios — cualquier fallo de Prisma se propaga tal
cual al caller (mismo criterio que `user-repository.ts`).

**Required tests**

- [ ] `create` devuelve un `token` crudo que NO coincide con lo guardado en `Session.token` (queda
  guardado el hash).
- [ ] `create` fija `expiresAt` a 7 días desde el momento de creación (± tolerancia de segundos) —
  regresión directa de NFR-02/AC-04.
- [ ] `findValid` con un token recién creado devuelve el `userId` correcto.
- [ ] `findValid` con un token inexistente devuelve `null`.
- [ ] `findValid` con un token cuya `expiresAt` ya pasó devuelve `null` (sesión expirada).
- [ ] `invalidate` hace que un `findValid` posterior con el mismo token devuelva `null`.
- [ ] `invalidate` sobre un token inexistente no lanza (idempotente).

**Completion criterion**

Los 7 tests pasan contra la DB de test real (mismo patrón que `user-repository.test.ts`).

## Block 4 — Extender user-repository

**Files**
- `apps/api/src/repositories/user-repository.ts` (modified).
- `apps/api/tests/repositories/user-repository.test.ts` (modified).

**Logic**

```ts
export async function create(
  prisma: PrismaClient,
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const user = await prisma.user.create({ data: { email, passwordHash } });
  return { id: user.id, email: user.email };
}

export async function findByEmail(
  prisma: PrismaClient,
  email: string,
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email, passwordHash: user.passwordHash };
}
```

`findByEmail` es el único punto del repo que devuelve `passwordHash` — `findById` (existente) sigue
sin exponerlo, porque lo usa `authPreHandler`/rutas que no necesitan el hash.

**Error handling**

`create` propaga el error de constraint único de Postgres (`P2002`) si el email ya existe — el
caller (Block 9) debe chequear `findByEmail` ANTES de llamar a `create` para devolver el error de
negocio (FR-04) en vez de dejar que ese `P2002` llegue crudo.

**Required tests**

- [ ] `create` inserta un `User` con `passwordHash` y lo devuelve sin exponer el hash.
- [ ] `findByEmail` con un email existente devuelve el registro con `passwordHash`.
- [ ] `findByEmail` con un email inexistente devuelve `null`.
- [ ] `findByEmail` es case-insensitive (aprovecha `@db.Citext`) — buscar con distinta capitalización
  encuentra el mismo usuario.

**Completion criterion**

Los 4 tests nuevos pasan; los tests existentes de `findById` siguen pasando sin cambios.

## Block 5 — Throttle de login

**Files**
- `apps/api/src/lib/login-throttle.ts` (new).
- `apps/api/tests/lib/login-throttle.test.ts` (new).

**Logic**

```ts
const MAX_ATTEMPTS = 5; // FR-09
const WINDOW_MS = 15 * 60 * 1000; // FR-09

interface ThrottleEntry {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, ThrottleEntry>();

function normalize(email: string): string {
  return email.toLowerCase(); // threat-FEAT-004a.md R1 -- Citext es case-insensitive en DB, un Map de JS no
}

function pruneIfExpired(key: string): void {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.windowStart >= WINDOW_MS) {
    attempts.delete(key);
  }
}

export function isBlocked(email: string): boolean {
  const key = normalize(email);
  pruneIfExpired(key);
  const entry = attempts.get(key);
  return entry !== undefined && entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(email: string): void {
  const key = normalize(email);
  pruneIfExpired(key);
  const entry = attempts.get(key);

  if (entry) {
    entry.count += 1;
  } else {
    attempts.set(key, { count: 1, windowStart: Date.now() });
  }
}

export function reset(email: string): void {
  attempts.delete(normalize(email));
}
```

Sin cron ni scheduler (AGENTS.md) — la ventana vencida se descarta de forma perezosa, solo cuando
ese email vuelve a consultarse.

**Error handling**

N/A — módulo puramente en memoria, sin I/O que pueda fallar.

**Required tests**

- [ ] `isBlocked` es `false` para un email sin intentos previos.
- [ ] Tras 5 `recordFailure` para el mismo email, `isBlocked` es `true`.
- [ ] Tras 4 `recordFailure`, `isBlocked` sigue siendo `false`.
- [ ] `reset` limpia el contador — `isBlocked` vuelve a `false` inmediatamente después.
- [ ] `recordFailure`/`isBlocked` con distinta capitalización del mismo email (`Test@mail.com` vs.
  `test@mail.com`) comparten el mismo contador (mitigación R1 — regresión explícita del hallazgo
  del threat model).
- [ ] Pasada la ventana de 15 minutos (con `vi.useFakeTimers`), el contador se resetea solo.

**Completion criterion**

Los 6 tests pasan, incluido el de case-insensitivity que reproduce específicamente R1.

## Block 6 — Plugin de cookies

**Files**
- `apps/api/package.json` (modified) — agrega `@fastify/cookie`.
- `apps/api/src/app.ts` (modified) — registra el plugin, define atributos de cookie.
- `apps/api/tests/app.test.ts` (modified) — cubre el registro del plugin y los atributos por
  `NODE_ENV`.

**Logic**

```ts
import cookie from "@fastify/cookie";

export const SESSION_COOKIE_NAME = "ggasia_session";

// Mismo patrón que DEFAULT_TEST_WEB_ORIGIN/webOrigin de este archivo: producción exige explícito,
// fuera de producción cae a un default seguro para dev local por HTTP plano.
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "none" | "lax";
  path: "/";
} {
  const isProduction = process.env["NODE_ENV"] === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
}
```

```ts
app.register(cookie); // sin `secret` -- el token es opaco, validado por hash contra la DB (threat-FEAT-004a.md, decisión de no firmar)
```

`sessionCookieOptions()` se exporta para que Block 10 (rutas) lo use al hacer `reply.setCookie`.

**Error handling**

N/A — configuración estática, sin input externo.

**Required tests**

- [ ] `buildApp()` registra el plugin de cookies (una request de prueba puede leer/escribir
  cookies).
- [ ] `sessionCookieOptions()` con `NODE_ENV=production` devuelve `secure: true, sameSite: "none"`.
- [ ] `sessionCookieOptions()` sin `NODE_ENV=production` devuelve `secure: false, sameSite: "lax"`.

**Completion criterion**

Los 3 tests pasan; `@fastify/cookie` no tiene opción `secret` configurada en ningún punto.

## Block 7 — Reescritura de authPreHandler

**Files**
- `apps/api/src/plugins/auth.ts` (modified).
- `apps/api/tests/plugins/auth.test.ts` (modified).

**Logic**

```ts
import type { FastifyReply, FastifyRequest } from "fastify";
import { findValid } from "../repositories/session-repository.ts";
import { SESSION_COOKIE_NAME } from "../app.ts";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

const UNAUTHORIZED_BODY = { error: "unauthorized" } as const;

export async function authPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];

  if (!token) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  const session = await findValid(request.server.prisma, token);

  if (!session) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  request.userId = session.userId;
}
```

Cero referencias a `x-user-id` en el archivo (threat-FEAT-004a.md R5) — se llama a
`session-repository.findValid` directamente, sin pasar por un service, igual que la versión
anterior llamaba a `user-repository.findById` directamente (decisión intencional, no una desviación
nueva — confirmado en la auditoría de arquitectura de esta misma fase).

**Error handling**

Mismo cuerpo genérico `{ error: "unauthorized" }` tanto si falta la cookie como si el token no es
válido — ninguna rama distingue el motivo (mismo principio que ya aplicaba al stub).

**Required tests**

- [ ] Request sin cookie de sesión → 401, `UNAUTHORIZED_BODY`.
- [ ] Request con cookie de sesión inválida/inexistente → 401, mismo cuerpo.
- [ ] Request con cookie de sesión expirada → 401, mismo cuerpo.
- [ ] Request con cookie de sesión válida → `request.userId` queda seteado con el `userId` correcto,
  la cadena continúa (sin reply propio de este preHandler).
- [ ] Request que envía SOLO `x-user-id` (sin cookie) → 401 (regresión explícita — el header ya no
  autentica nada).

**Completion criterion**

Los 5 tests pasan; `grep -rn "x-user-id" apps/api/src/plugins/auth.ts` no devuelve resultados.

## Block 8 — Schemas de auth

**Files**
- `apps/api/src/schemas/auth.ts` (new).
- `apps/api/tests/schemas/auth.test.ts` (new).

**Logic**

```ts
import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email(), // FR-01
  password: z.string().min(8), // FR-02
});

export const loginBodySchema = z.object({
  email: z.string().email(), // FR-06
  password: z.string().min(1), // el mínimo de 8 se valida solo en registro, no en login
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
```

`loginBodySchema` no exige mínimo de 8 caracteres: un password histórico o de test podría no
cumplirlo, y el rechazo real de credenciales incorrectas ya lo hace `auth-service` de forma
uniforme (FR-08) — exigir 8 acá filtraría intentos con un status code distinto (400 en vez de 401),
lo cual es una fuga de información sutil que el schema de login debe evitar.

**Input validation**

- `email`: formato válido de email (Zod `.email()`), ambos schemas.
- `password` de registro: mínimo 8 caracteres (FR-02/AC-02).
- `password` de login: solo no-vacío.

**Error handling**

N/A — el manejo del `safeParse` que falla vive en Block 10 (rutas), mismo patrón que
`schemas/expense.ts`.

**Required tests**

- [ ] `registerBodySchema` acepta `{ email, password }` válidos.
- [ ] `registerBodySchema` rechaza un `password` de menos de 8 caracteres.
- [ ] `registerBodySchema` rechaza un `email` con formato inválido.
- [ ] `loginBodySchema` acepta `{ email, password }` válidos, incluso con `password` corto.

**Completion criterion**

Los 4 tests pasan.

## Block 9 — Servicio de auth

**Files**
- `apps/api/src/services/auth-service.ts` (new).
- `apps/api/tests/services/auth-service.test.ts` (new).

**Logic**

```ts
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { FastifyBaseLogger } from "fastify";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import * as userRepository from "../repositories/user-repository.ts";
import * as sessionRepository from "../repositories/session-repository.ts";
import * as loginThrottle from "../lib/login-throttle.ts";

// Hash argon2 fijo de un valor que nunca es un password real -- solo existe para que
// verifyPassword tarde lo mismo en la rama "email no existe" que en la rama "password incorrecto"
// (threat-FEAT-004a.md R3).
const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing-safety-only");

interface Deps {
  prisma: PrismaClient;
  logger: FastifyBaseLogger;
}

export type RegisterResult =
  | { outcome: "created"; token: string; expiresAt: Date; userId: string }
  | { outcome: "duplicate_email" };

export async function register(deps: Deps, email: string, password: string): Promise<RegisterResult> {
  const existing = await userRepository.findByEmail(deps.prisma, email);

  if (existing) {
    return { outcome: "duplicate_email" }; // FR-04
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create(deps.prisma, email, passwordHash);
  const session = await sessionRepository.create(deps.prisma, user.id); // FR-05, auto-login

  return { outcome: "created", token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export type LoginResult =
  | { outcome: "success"; token: string; expiresAt: Date; userId: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "throttled" };

export async function login(deps: Deps, email: string, password: string): Promise<LoginResult> {
  if (loginThrottle.isBlocked(email)) {
    return { outcome: "throttled" }; // FR-09/FR-10, chequeado ANTES de tocar DB/argon2
  }

  const user = await userRepository.findByEmail(deps.prisma, email);

  if (!user) {
    await verifyPassword(await DUMMY_HASH_PROMISE, password); // R3: mismo costo que la rama de abajo
    loginThrottle.recordFailure(email);
    return { outcome: "invalid_credentials" }; // FR-08 -- mismo outcome que password incorrecto
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (!passwordMatches) {
    loginThrottle.recordFailure(email);
    return { outcome: "invalid_credentials" }; // FR-08 -- mismo outcome que email inexistente
  }

  loginThrottle.reset(email);
  const session = await sessionRepository.create(deps.prisma, user.id); // R4: token siempre nuevo

  return { outcome: "success", token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export async function logout(deps: Deps, token: string): Promise<void> {
  await sessionRepository.invalidate(deps.prisma, token);
}
```

`register`/`login` no reciben ni leen ninguna cookie entrante — el `token` que devuelven es
SIEMPRE el de una `Session` recién creada (R4, anti session-fixation).

**Error handling**

Ninguna excepción propia de este módulo: `userRepository`/`sessionRepository`/`hashPassword` son
los únicos puntos de I/O, y sus errores (incluida una eventual carrera de `P2002` en `create`) se
dejan propagar sin capturar — el manejo real de esa propagación ocurre en Block 10 (ver su sección
de Error handling), que es donde la respuesta HTTP se decide.

**Required tests**

- [ ] `register` con un email nuevo crea el usuario, hashea el password, devuelve `outcome:
  "created"` con `token`/`expiresAt`.
- [ ] `register` con un email ya existente devuelve `outcome: "duplicate_email"` SIN crear un
  segundo usuario.
- [ ] `login` con credenciales correctas devuelve `outcome: "success"` con un `token` nuevo.
- [ ] `login` con email inexistente devuelve `outcome: "invalid_credentials"`.
- [ ] `login` con password incorrecto devuelve `outcome: "invalid_credentials"` (mismo shape que el
  caso anterior).
- [ ] `login` incrementa el throttle en AMBAS ramas de fallo (email inexistente y password
  incorrecto) — verificar que tras 5 fallos de cualquier combinación, `isBlocked` es `true`.
- [ ] `login` devuelve `outcome: "throttled"` sin tocar `userRepository`/`sessionRepository` cuando
  ya está bloqueado (verificar con un mock/spy que esos repos no se llaman).
- [ ] `login` exitoso llama a `loginThrottle.reset`.
- [ ] `logout` invalida la sesión — un `findValid` posterior con el mismo token devuelve `null`.

**Completion criterion**

Los 9 tests pasan; el test de timing-safety (dummy verify) se confirma por cobertura de la rama, no
por medición de tiempo real (medir tiempo en CI es no determinístico).

## Block 10 — Rutas de auth

**Files**
- `apps/api/src/routes/auth.ts` (new).
- `apps/api/src/app.ts` (modified) — registra `authRoutes`.
- `apps/api/tests/routes/auth.test.ts` (new).

**Logic**

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerBodySchema, loginBodySchema } from "../schemas/auth.ts";
import { register, login, logout } from "../services/auth-service.ts";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../app.ts";

async function handleRegister(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bodyResult = registerBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const result = await register(
    { prisma: request.server.prisma, logger: request.log },
    bodyResult.data.email,
    bodyResult.data.password,
  );

  if (result.outcome === "duplicate_email") {
    reply.code(409).send({ error: "email_already_registered" }); // FR-04
    return;
  }

  reply
    .setCookie(SESSION_COOKIE_NAME, result.token, { ...sessionCookieOptions(), expires: result.expiresAt })
    .code(201)
    .send({ userId: result.userId });
}

async function handleLogin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bodyResult = loginBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const result = await login(
    { prisma: request.server.prisma, logger: request.log },
    bodyResult.data.email,
    bodyResult.data.password,
  );

  if (result.outcome === "throttled") {
    reply.code(429).send({ error: "too_many_attempts" }); // FR-10 -- explícito, permitido
    return;
  }

  if (result.outcome === "invalid_credentials") {
    reply.code(401).send({ error: "invalid_credentials" }); // FR-08 -- genérico
    return;
  }

  reply
    .setCookie(SESSION_COOKIE_NAME, result.token, { ...sessionCookieOptions(), expires: result.expiresAt })
    .code(200)
    .send({ userId: result.userId });
}

async function handleLogout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];

  if (token) {
    await logout({ prisma: request.server.prisma, logger: request.log }, token);
  }

  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" }).code(204).send();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.route({ method: "POST", url: "/auth/register", handler: handleRegister });
  app.route({ method: "POST", url: "/auth/login", handler: handleLogin });
  app.route({ method: "POST", url: "/auth/logout", handler: handleLogout });
}
```

`handleLogout` no exige estar autenticado (sin `authPreHandler`): si no hay cookie, simplemente no
hay nada que invalidar y responde 204 igual (logout idempotente, evita filtrar si había o no una
sesión activa).

**API contract**

- `POST /auth/register` — Request: `{ email: string, password: string }`. Response 201:
  `{ userId: string }` + `Set-Cookie`. Response 409: `{ error: "email_already_registered" }`.
  Response 400: `{ error: "validation_error", details: [...] }`. Auth: ninguna (endpoint público).
- `POST /auth/login` — Request: `{ email: string, password: string }`. Response 200:
  `{ userId: string }` + `Set-Cookie`. Response 401: `{ error: "invalid_credentials" }`. Response
  429: `{ error: "too_many_attempts" }`. Response 400: igual que register. Auth: ninguna.
- `POST /auth/logout` — Request: sin body. Response 204: sin body, cookie limpiada. Auth: ninguna
  requerida (idempotente sin sesión).

**Error handling**

Cualquier excepción no capturada en `register`/`login`/`logout` (ej. Prisma caído, o una carrera de
`P2002` si dos requests concurrentes registran el mismo email entre el `findByEmail` y el `create`
de Block 9) se deja propagar al error handler global de Fastify, que responde 500 genérico — mismo
criterio que `routes/expenses.ts`, que tampoco atrapa errores de infraestructura a nivel de ruta. El
caso normal, sin carrera, sigue devolviendo 409 correctamente vía `duplicate_email`.

**Required tests**

- [ ] `POST /auth/register` con datos válidos responde 201 y setea la cookie.
- [ ] `POST /auth/register` con email duplicado responde 409, sin cookie.
- [ ] `POST /auth/register` con password corto responde 400.
- [ ] `POST /auth/login` con credenciales correctas responde 200 y setea la cookie.
- [ ] `POST /auth/login` con credenciales incorrectas responde 401 genérico.
- [ ] `POST /auth/login` bloqueado por throttle responde 429.
- [ ] `POST /auth/logout` con cookie válida responde 204 y limpia la cookie; una request posterior
  con esa misma cookie a una ruta protegida da 401.
- [ ] `POST /auth/logout` sin cookie responde 204 igual (idempotente).
- [ ] En `NODE_ENV=production`, la cookie seteada por register/login lleva `Secure` y
  `SameSite=None`; fuera de producción, `Secure` ausente y `SameSite=Lax`.
- [ ] `POST /auth/register` cuando `userRepository.create` lanza `P2002` (mockeado, simulando la
  carrera entre `findByEmail` y `create`) responde 500 genérico, no 409.

**Completion criterion**

Los 10 tests pasan; `authRoutes` queda registrada en `app.ts` junto a `expensesRoutes`.

## Block 11 — Tests de regresión del boundary de auth

**Files**
- `apps/api/tests/routes/expenses.test.ts` (modified).

**Logic**

Sin cambios de código de producción — solo tests nuevos que ejercitan `GET`/`POST /expenses` con
`x-user-id` presente pero SIN cookie de sesión, para dejar registrado que el stub quedó
completamente muerto (AC-09/threat-FEAT-004a.md R5), no solo despriorizado.

**Required tests**

- [ ] `GET /expenses` con solo `x-user-id` (usuario válido, sin cookie) → 401.
- [ ] `POST /expenses` con solo `x-user-id` (usuario válido, sin cookie) → 401.
- [ ] `GET /expenses` con cookie de sesión válida (sin `x-user-id`) → 200, funciona igual que antes.

**Completion criterion**

Los 3 tests pasan; ningún test existente que dependía de `x-user-id` para autenticar queda sin
actualizar (revisar `apps/api/tests/routes/expenses.test.ts` completo por usos previos del header).

## Final verification

Con los 11 bloques completos: `pnpm --filter @ggasia/api test` pasa completo (incluye typecheck +
vitest); `grep -rn "x-user-id" apps/api/src` no devuelve resultados; un flujo manual
register→login→`GET /expenses` con cookie→logout→`GET /expenses` (401) funciona de punta a punta
contra la DB de test. El SAST de CODE (`daw-security-sast`) corre sobre el resultado final antes de
cerrar el ticket.

**Reversión de la migración (Block 1):** dado que no hay usuarios reales en producción todavía
(único `User` es el fijo de `seed.ts`), revertir es trivial — `prisma migrate resolve`/una migración
`down` que dropea `passwordHash` y la tabla `Session`. No hace falta backfill porque no hay datos
reales que preservar en este punto del proyecto.
