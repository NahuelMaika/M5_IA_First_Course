# Spec FEAT-002: Alta de gasto vía API — auth stub + persistencia + motor de extracción/categorización

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| PRD | docs/daw/prd/prd-FEAT-002.md |
| Tier | FEATURE |
| Date | 2026-08-19 |
| Spec loops | 0 |

## Summary

Se crea `apps/api` (Fastify 5) desde cero, con su primer `schema.prisma` (`User`, `Category`,
`Expense`) y una única ruta `POST /expenses`. La ruta identifica al usuario vía el header
`x-user-id` (mecanismo transitorio, riesgo aceptado — ver `docs/daw/security/threat-FEAT-002.md`),
valida el body con Zod, invoca `parseExpense` de `@ggasia/domain` (compilado) con el categorizador de
`@ggasia/categorization` (compilado) vía su puerto, resuelve/crea la categoría reutilizando
`resolveCategoryName` (recién expuesto en el barrel de `categorization`, ADR-004) y persiste el gasto
en PostgreSQL siguiendo `routes → service → repository`. Un seed provee las 11 categorías
predefinidas de kb.md y un usuario de prueba, sustituyendo la ausencia de un ticket de autenticación
real.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 10 |
| FR-02 | Block 6 |
| FR-03 | Block 6 |
| FR-04 | Block 9 |
| FR-05 | Block 9, Block 10 |
| FR-06 | Block 5, Block 8, Block 9 |
| FR-07 | Block 2, Block 9 |
| FR-08 | Block 2, Block 9 |
| FR-09 | Block 2, Block 9 |
| FR-10 | Block 7 |
| FR-11 | Block 3 |
| FR-12 | Block 3 |
| FR-13 | Block 10 |
| NFR-01 | Strategy: sin llamadas de red externas en el camino crítico — todo el trabajo es local (parseExpense en memoria + 1-3 queries Prisma indexadas); no hay cola, caché ni servicio externo que introduzca latencia variable |
| NFR-02 | Block 2 (tipo `Decimal(12,2)` de Prisma) |
| NFR-03 | Block 1 (`env.ts`, `process.exit` antes de registrar rutas) |
| NFR-04 | Block 1, Block 8 (`fastify.prisma` inyectado, nunca singleton) |

| Acceptance Criterion | Covered by |
|---|---|
| AC-01 | Block 9, Block 10 |
| AC-02 | Block 9, Block 10 |
| AC-03 | Block 6 |
| AC-04 | Block 9 |
| AC-05 | Block 9 |
| AC-06 | Block 9 |
| AC-07 | Block 9 |
| AC-08 | Block 9 |
| AC-09 | Block 7 |
| AC-10 | Block 2, Block 3 |

## Dependencies between blocks

- Block 1 (scaffolding) → habilita 2, 4, 6, 7, 10.
- Block 2 (schema) → habilita 3 (seed necesita las tablas), 8 (repositorios).
- Block 3 (seed) → habilita 11 (datos sembrados para los tests end-to-end).
- Block 4 (plugin Prisma) → habilita 8, 11.
- Block 5 (barrel categorization + ADR-004) → habilita 9 (`resolveCategoryName` disponible).
- Block 6, 7, 8, 9 → habilitan 10 (la ruta encadena los cuatro).
- Block 10 → habilita 11 (tests end-to-end contra la ruta completa).

Orden de ejecución sugerido: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.

## Riesgo de seguridad aceptado (referencia obligatoria)

El header `x-user-id` es un mecanismo de identificación sin sesión real, trivialmente falsificable.
Es un **riesgo aceptado**, con los tres campos de F-TM-04 completos en
`docs/daw/security/threat-FEAT-002.md` (confirmado por el usuario el 2026-08-19): quién lo acepta,
la justificación (el ticket de autenticación real reemplaza este mecanismo, no lo complementa) y las
condiciones de revisión (obligatoria al iniciar el ticket de autenticación; `apps/api` no se despliega
públicamente sin documentar esta limitación). Todo bloque que toque el auth stub (Block 6) referencia
este riesgo, no lo reabre.

---

## Block 1 — Scaffolding `apps/api`

**Files**
- `apps/api/package.json` (new) — `"name": "@ggasia/api"`, `dependencies`: `@ggasia/domain: workspace:*`, `@ggasia/categorization: workspace:*`, `fastify`, `@prisma/client`, `zod`; `devDependencies`: `prisma`, `vitest`, `@types/node`, `typescript`. Scripts: `build`, `typecheck`, `test` (mismo patrón que `packages/domain`/`packages/categorization`: `typecheck && vitest run`).
- `apps/api/tsconfig.json` (new) — extiende `tsconfig.base.json`.
- `apps/api/tsconfig.test.json` (new) — incluye tests, mismo patrón que los paquetes hermanos.
- `apps/api/vitest.config.ts` (new).
- `apps/api/src/env.ts` (new) — schema Zod para `DATABASE_URL` (string, URL de Postgres), `APP_TIMEZONE` (string, IANA tz), `API_PORT` (number, coercido). Al fallar el parse, loguea el motivo y `process.exit(1)` — nunca deja el proceso en un estado que atienda requests con configuración inválida.
- `apps/api/src/app.ts` (new) — factory `buildApp(options?: { prismaClient?: PrismaClient }): FastifyInstance`. Fija `bodyLimit: 16384` (16 KB) explícito en las opciones de Fastify — mitigación threat #1 (DoS por body grande antes del rechazo por longitud). No escucha puerto.
- `apps/api/src/server.ts` (new) — entrypoint: `buildApp().listen({ port: env.API_PORT })`.
- `package.json` (root, modified) — agrega `"build:api": "pnpm --filter @ggasia/api run build"`.

**Logic**
`env.ts` se importa y parsea al arrancar `server.ts`, antes de construir la app. `app.ts` registra
únicamente el plugin de Prisma (Block 4) y la ruta de expenses (Block 10) — sin lógica propia más
allá del wiring y el `bodyLimit`.

**Input validation**
N/A (scaffolding puro; la validación de env se detalla arriba).

**Error handling**
- Env inválida/faltante → log a stderr con el campo que falló (nunca el valor, por si es un secreto) + `process.exit(1)`. Cero requests atendidas (NFR-03, RNF-15 del PRD-001).

**Required tests**
- [ ] `env.ts` parsea correctamente un `.env` de test válido — valida NFR-03 (camino feliz).
- [ ] `env.ts` llama a `process.exit(1)` cuando falta `DATABASE_URL` — valida NFR-03/RNF-15 (camino triste).
- [ ] `buildApp()` sin puerto puede recibir requests vía `fastify.inject` en un test.

**Completion criterion**
`pnpm --filter @ggasia/api run build` compila sin errores de TypeScript. Un test puede levantar
`buildApp({ prismaClient: <mock o real de test> })` e inyectar una request sin necesidad de un
puerto real escuchando.

---

## Block 2 — `prisma/schema.prisma`

**Files**
- `apps/api/prisma/schema.prisma` (new).
- `apps/api/prisma/migrations/<timestamp>_init/migration.sql` (new, generado por `prisma migrate dev --create-only` y editado a mano para agregar los dos índices únicos parciales).

**Data model**

`User`
| Field | Type | Constraints |
|---|---|---|
| id | String (uuid) | PK, default `uuid()` |
| email | String (`citext`) | unique, not null |
| createdAt | DateTime | default `now()` |

`Category`
| Field | Type | Constraints |
|---|---|---|
| id | String (uuid) | PK, default `uuid()` |
| name | String | not null — tal como se escribió (seed o marcador del usuario) |
| nameNormalized | String | not null — calculado en la app con `normalize()` de `@ggasia/categorization` antes de insertar, NUNCA recalculado en SQL |
| ownerId | String (uuid) | FK → `User.id`, **nullable** (`null` = predefinida) |
| active | Boolean | not null, default `true` |
| createdAt | DateTime | default `now()` |

Índices (F-SPEC-08):
- Único parcial sobre `(nameNormalized)` `WHERE owner_id IS NULL` — evita predefinidas duplicadas (AC-10).
- Único parcial sobre `(owner_id, nameNormalized)` `WHERE owner_id IS NOT NULL` — evita duplicadas por usuario.
- Ambos se agregan a mano en el SQL de migración: el DSL de `schema.prisma` no soporta índices parciales/condicionales. El archivo de migración lleva un comentario explicando por qué la edición manual es necesaria, para que quien la lea después no la revierta por error en la próxima `migrate dev`.

`Expense`
| Field | Type | Constraints |
|---|---|---|
| id | String (uuid) | PK, default `uuid()` |
| userId | String (uuid) | FK → `User.id`, not null |
| amount | Decimal(12,2) | not null — nunca `Float` (NFR-02) |
| place | String | not null |
| when | DateTime | not null |
| categoryId | String (uuid) | FK → `Category.id`, not null |
| categoryOrigin | Enum(`automatica`, `marcador`) | not null |
| description | String | not null, default `""` |
| name | String | not null |
| type | Enum(`Personal`) | not null, default `Personal` |
| currency | String | not null, default `"ARS"` — columna, no literal disperso en lógica (FR-08) |
| rawInput | String | not null, max 500 caracteres |
| channel | Enum(`texto`) | not null, default `texto` |
| createdAt | DateTime | default `now()` |

**Error handling**
- Violación de constraint único (predefinida duplicada, categoría propia duplicada) → `PrismaClientKnownRequestError` código `P2002`, capturado por el repositorio que la origina (Block 8), nunca propagado crudo (mitigación threat #3, detallado en Block 9/10).

**Required tests**
- [ ] `prisma migrate dev` aplica limpio contra `DATABASE_URL_TEST` sin errores.
- [ ] Insertar 2 categorías con `ownerId: null` y el mismo `nameNormalized` vía SQL directo de test falla por el índice único parcial — valida AC-10.
- [ ] Insertar 2 categorías con el mismo `ownerId` y el mismo `nameNormalized` falla por el segundo índice; el mismo `nameNormalized` con `ownerId` distinto NO falla (categorías propias de usuarios distintos pueden compartir nombre).

**Completion criterion**
La migración aplica limpio contra `DATABASE_URL_TEST`; los tres tests de arriba pasan.

---

## Block 3 — `prisma/seed.ts`

**Files**
- `apps/api/prisma/seed.ts` (new).
- `apps/api/package.json` (modified) — agrega `"prisma": { "seed": "tsx prisma/seed.ts" }` o equivalente ESM-compatible (ADR-002).

**Logic**
Inserta, en este orden normativo exacto (kb.md, "Categorías Predefinidas"): Comida, Transporte,
Entretenimiento, Servicios, Salud, Alquiler, Indumentaria, Hogar, "Cuidado personal", Mascotas, Otros
— cada una con `ownerId: null`, `active: true`, `nameNormalized` calculado con `normalize()` de
`@ggasia/categorization`. Inserta un usuario de prueba con un id fijo conocido, exportado como
constante `TEST_USER_ID` desde `seed.ts` (para que el Block 11 lo reutilice sin recalcularlo), y un
email de prueba fijo. Usa `upsert` (por `nameNormalized`/id fijo) para que correr el seed dos veces
seguidas no falle ni duplique — pero si el índice único parcial del Block 2 SÍ rechaza un insert (una
corrida corrupta, un id de seed cambiado a mano), el script no atrapa ese error: se propaga y el
proceso termina con exit ≠0 (FR-11, FR-12, AC-10 — "el sistema debe fallar antes de atender
requests").

**Error handling**
- Violación real de unicidad (no la del upsert idempotente, sino una inconsistencia genuina) → el seed no la silencia, termina con exit ≠0.

**Required tests**
- [ ] Correr el seed contra una DB de test limpia crea las 11 categorías en el orden normativo + el usuario de prueba con `TEST_USER_ID` — valida FR-11, FR-12.
- [ ] Correr el seed dos veces seguidas no duplica filas ni falla (idempotencia vía upsert).

**Completion criterion**
Los dos tests de arriba pasan contra `DATABASE_URL_TEST`.

---

## Block 4 — Plugin Fastify `src/plugins/prisma.ts`

**Files**
- `apps/api/src/plugins/prisma.ts` (new) — plugin de `fastify-plugin` que decora `fastify.prisma` con un `PrismaClient`; si `buildApp()` recibió `options.prismaClient` (Block 1), usa ese en vez de instanciar uno nuevo (permite inyectar el cliente de test contra `DATABASE_URL_TEST`). Cierra la conexión en el hook `onClose` de Fastify.

**Error handling**
- Si `PrismaClient` no puede conectar al arrancar, el error se propaga (Fastify no debe quedar "medio arriba" — consistente con NFR-03: sin config/conexión válida, no atiende requests).

**Required tests**
- [ ] `fastify.prisma` queda decorado y accesible desde una ruta de prueba.
- [ ] Al cerrar el server (`fastify.close()`), la conexión de Prisma se cierra (no quedan conexiones abiertas entre tests — evita agotar el pool de `DATABASE_URL_TEST` en la suite completa).

**Completion criterion**
Un test de integración levanta `buildApp({ prismaClient: testClient })` y ejecuta una query real
contra `DATABASE_URL_TEST` a través de `fastify.prisma`.

---

## Block 5 — Barrel de `@ggasia/categorization` + ADR-004

**Files**
- `packages/categorization/src/index.ts` (modified) — agrega:
  ```ts
  export { resolveCategoryName } from "./category-name.ts";
  export type { VisibleCategory, CategoryNameResolution } from "./category-name.ts";
  ```
  Sin ningún otro cambio — `category-name.ts` no se toca, cero cambio de lógica.
- `packages/categorization/tests/port.test.ts` (modified) — el test que verifica la forma exacta del
  barrel pasa a esperar `["createCategorizer", "normalize", "resolveCategoryName", "tokenize"]`
  (orden alfabético, según el patrón ya usado por ese test).
- `docs/adr/adr-004-ampliacion-superficie-publica-de-categorization.md` (new) — documenta la decisión:
  contexto (FEAT-002 necesita resolver categoría por marcador sin reimplementar `normalize()`, lo que
  kb.md prohíbe explícitamente como "exactamente el drift que prohíbe"), opciones consideradas
  (reimplementar en `apps/api` vs. exponer lo ya existente), decisión (exponer), referencia explícita
  a ADR-001 (lo extiende, no lo contradice — ADR-001 ya preveía revisar la decisión ante un tercer
  caso de primitiva compartida).

**Error handling**
N/A — cambio de superficie pública únicamente, sin I/O ni validación nueva.

**Required tests**
- [ ] `port.test.ts` actualizado pasa con el nuevo export incluido.
- [ ] Un test nuevo en `apps/api` (Block 9) importa `resolveCategoryName` desde
  `@ggasia/categorization` (paquete compilado) y lo usa — confirma que el `dist/` recompilado expone
  el símbolo correctamente vía `exports` del `package.json`.

**Completion criterion**
`pnpm --filter @ggasia/categorization run test` y `run build` pasan limpio con el barrel actualizado.

---

## Block 6 — Auth stub

**Files**
- `apps/api/src/plugins/auth.ts` (new) — `preHandler` de Fastify (registrado solo en la ruta de
  expenses, Block 10) que lee el header `x-user-id`, llama a
  `userRepository.findById(id)` (Block 8). Si el header falta o `findById` devuelve `null`, responde
  `401` con el cuerpo genérico `{ error: "unauthorized" }` — **el mismo cuerpo en ambos casos**,
  mitigación threat #3 del reporte (no confirmar/negar existencia de un id). Si resuelve, decora
  `request.userId` con el id validado y continúa.

**API contract**
- No es un endpoint propio; se aplica como `preHandler` de `POST /expenses` (Block 10).
- Auth: header `x-user-id` (string, uuid del `User`). Riesgo aceptado documentado arriba — no hay
  verificación de sesión.

**Input validation**
- El header debe ser un string no vacío; no se valida formato UUID explícitamente porque
  `findById` con un valor no-UUID simplemente no encuentra match (Prisma lo trata como "no existe",
  mismo camino 401 — no hace falta una validación Zod separada para esto).

**Error handling**
- Header ausente → 401 (cuerpo genérico).
- Header presente, usuario inexistente → 401 (mismo cuerpo genérico).
- En ningún caso de 401 se invoca `parseExpense` ni ninguna lógica del service (FR-03, AC-03).

**Required tests**
- [ ] Request sin `x-user-id` → 401, cuerpo `{ error: "unauthorized" }` — valida AC-03.
- [ ] Request con `x-user-id` de un id inexistente → 401, mismo cuerpo — valida AC-03 y la mitigación de no distinguir motivo.
- [ ] Request con `x-user-id` de `TEST_USER_ID` (sembrado por Block 3) → pasa al siguiente handler con `request.userId` seteado.
- [ ] En los dos casos de 401, un spy sobre `parseExpense` confirma que NUNCA se llamó — valida FR-03 ("sin invocar el motor de extracción").

**Completion criterion**
Los 4 tests de arriba pasan.

---

## Block 7 — Validación Zod del body

**Files**
- `apps/api/src/schemas/expense.ts` (new) — `export const createExpenseBodySchema = z.object({ input: z.string().min(1) });`.

**API contract**
- Se aplica en `POST /expenses` (Block 10), después del auth stub y antes del service.

**Input validation**
- `input`: string, no vacío. El tope de 500 caracteres (RNF-07) NO se valida acá — ya lo valida
  `parseExpense` como Step 1 de su pipeline (FEAT-001b); duplicarlo en Zod sería reimplementar una
  regla que ya vive en `packages/domain`.

**Error handling**
- Body sin `input`, `input` vacío, o `input` no-string → `400` con el detalle de Zod (formato
  estándar de error de validación), sin invocar `parseExpense` (FR-10, AC-09).

**Required tests**
- [ ] Body `{}` (sin `input`) → 400 — valida AC-09.
- [ ] Body `{ input: "" }` → 400 — valida AC-09.
- [ ] Body `{ input: 123 }` (no-string) → 400 — valida AC-09.
- [ ] Body `{ input: "café 1500" }` → pasa la validación, llega al service.
- [ ] En los 3 casos de 400, un spy sobre `parseExpense` confirma que NUNCA se llamó.

**Completion criterion**
Los 5 tests de arriba pasan.

---

## Block 8 — Repositorios

**Files**
- `apps/api/src/repositories/user-repository.ts` (new) — `findById(prisma: PrismaClient, id: string): Promise<{ id: string; email: string } | null>`.
- `apps/api/src/repositories/category-repository.ts` (new) — `findVisibleForUser(prisma, userId): Promise<VisibleCategory[]>` (predefinidas `ownerId: null` + propias del usuario, mapeadas a `{ name, active }` — la forma que `resolveCategoryName` espera); `create(prisma, { name, nameNormalized, ownerId }): Promise<Category>`; `findPredefinedByName(prisma, name): Promise<Category | null>` (lookup exacto por `name`, usado en el camino de categoría automática — el nombre que devuelve el categorizador SIEMPRE coincide literal con el `name` sembrado por Block 3, porque ambos derivan de la misma tabla de kb.md).

**Logic**
Cada repositorio recibe `PrismaClient` como parámetro (nunca lo importa como singleton — NFR-04);
en las rutas/servicio se les pasa `fastify.prisma`. No contienen lógica de negocio: solo mapean
filas de Prisma a los tipos que el service (Block 9) consume.

**Error handling**
- `category-repository.create`: si el índice único parcial (Block 2) rechaza el insert
  (`P2002`), el repositorio no lo silencia ni lo traduce a un valor por defecto — lo re-lanza tal
  cual hacia el service, que decide qué hacer (Block 9 documenta que este caso no debería ocurrir en
  el camino normal porque `resolveCategoryName` ya chequeó existencia antes de crear; si ocurre, es
  una condición de carrera y el service la trata como error interno → 500, mitigación threat #3
  aplicada en la capa de arriba, no acá).

**Required tests**
- [ ] `userRepository.findById` con `TEST_USER_ID` devuelve el usuario sembrado; con un id inexistente devuelve `null`.
- [ ] `categoryRepository.findVisibleForUser` devuelve las 11 predefinidas + 0 propias para un usuario recién sembrado.
- [ ] `categoryRepository.create` crea una categoría propia y la deja visible en una siguiente llamada a `findVisibleForUser`.
- [ ] `categoryRepository.create` con un `nameNormalized` que ya existe para ese `ownerId` lanza el error de Prisma (`P2002`) sin transformarlo.
- [ ] `categoryRepository.findPredefinedByName` encuentra "Comida" (sembrada) y devuelve `null` para un nombre que no existe.
- [ ] `expenseRepository.create` persiste un gasto con `amount` como `Decimal` verificable (`toString()` con 2 decimales exactos) — valida NFR-02.

**Completion criterion**
Los 6 tests de arriba pasan contra `DATABASE_URL_TEST` con datos sembrados por Block 3.

---

## Block 9 — `expense-service.ts`

**Files**
- `apps/api/src/services/expense-service.ts` (new) — `createExpense(deps, userId: string, rawInput: string): Promise<ExpenseServiceResult>`, donde `deps` incluye el `PrismaClient` (para pasarlo a los repositorios) y `ExpenseServiceResult` es un tipo discriminado:
  ```ts
  type ExpenseServiceResult =
    | { outcome: "created"; expense: PersistedExpense }
    | { outcome: "rejected"; reason: RejectionReason }
    | { outcome: "internal_error" };
  ```

**Logic**
1. Construye `referenceDate = new Date()` — el reloj del propio servidor de `apps/api`, interpretado
   en `APP_TIMEZONE` (env, Block 1). **Nunca se lee de `rawInput` ni de ningún campo del body** —
   esto es lo que cierra el trust boundary B2 que `threat-FEAT-001b.md` dejó explícitamente abierto
   ("su validación en origen es responsabilidad de la capa API, fuera de este ticket"): esa capa es
   este bloque.
2. Invoca `parseExpense(rawInput, referenceDate, createCategorizer())` de `@ggasia/domain` /
   `@ggasia/categorization` (ambos compilados, importados desde su `dist/`).
3. Si `{ ok: false }` → devuelve `{ outcome: "rejected", reason: rejection.reason }` (FR-05, AC-02).
   No se toca la base de datos en ningún punto de este camino.
4. Si `{ ok: true }`, resuelve la categoría:
   - `categoryOrigin === "marcador"`: llama
     `resolveCategoryName(category, await categoryRepository.findVisibleForUser(prisma, userId))`
     (de `@ggasia/categorization`, Block 5). Si `outcome: "resolved"`, usa esa categoría existente
     (FR-06, AC-05). Si `outcome: "must_create"`, crea la categoría propia vía
     `categoryRepository.create` (FR-06, AC-04). Si `outcome: "rejected"` (nombre vacío tras
     normalizar, o > 60 caracteres) — este camino no debería alcanzarse porque `parseExpense` ya
     habría rechazado un marcador inválido antes de llegar acá; si ocurre, se trata como
     `internal_error`.
   - `categoryOrigin === "automatica"`: busca la categoría predefinida vía
     `categoryRepository.findPredefinedByName(prisma, category)` (FR-06, AC-06). Debe existir
     siempre por construcción del seed (Block 3) — si no existe, es `internal_error` (el categorizador
     de `@ggasia/categorization` y el seed de `apps/api` divergieron, un bug de despliegue, no un
     input inválido del usuario).
5. Persiste el gasto vía `expenseRepository.create` con: `amount`, `place`, `when`, `categoryId`
   (resuelto en el paso 4), `categoryOrigin`, `description`, `name`, `type` del `ParsedExpense`;
   `currency: "ARS"` fijo (FR-08), `channel: "texto"` fijo (FR-09), `rawInput` tal cual llegó
   (AC-08); `userId`.
6. Cualquier error no controlado de Prisma en los pasos 4-5 se captura en un `try/catch` alrededor
   de la orquestación y se traduce a `{ outcome: "internal_error" }` — el mensaje/stack de Prisma
   nunca sale de este bloque (mitigación threat #3; el mapeo a HTTP 500 vive en Block 10, que además
   loguea el detalle real server-side vía `fastify.log`, sin incluir `rawInput` en el log —
   precedente heredado de `threat-FEAT-001b.md`).

**API contract**
N/A — es la capa de servicio, no expone HTTP directamente (ver Block 10).

**Error handling**
Ver Logic paso 6. Tabla resumen:

| Origen | Resultado del service | Mapeo HTTP (Block 10) |
|---|---|---|
| `parseExpense` rechaza | `{ outcome: "rejected", reason }` | 422 |
| Categoría predefinida ausente en DB (bug de despliegue) | `{ outcome: "internal_error" }` | 500 |
| Error de Prisma no controlado | `{ outcome: "internal_error" }` | 500 |
| Todo OK | `{ outcome: "created", expense }` | 201 |

**Required tests**
- [ ] Input válido sin marcador ni categoría → gasto creado con categoría automática correcta — valida AC-01, AC-06.
- [ ] Input que `parseExpense` rechaza (cualquier `RejectionReason`) → `{ outcome: "rejected" }`, cero filas nuevas en `Expense`/`Category` — valida AC-02.
- [ ] Input con `#nombre` de categoría inexistente y resto válido → crea la categoría propia y el gasto — valida AC-04.
- [ ] Input con `#nombre` que normaliza igual a una predefinida o propia ya vigente → reusa esa categoría, no crea una duplicada — valida AC-05.
- [ ] Input con `#nombre` de categoría inexistente Y monto indeterminado → el gasto se rechaza completo y la categoría del marcador NO queda creada (se verifica contando filas de `Category` antes/después) — valida AC-07, consistente con RF-32/AC-39 del PRD-001.
- [ ] Input válido → el gasto persistido tiene `currency: "ARS"`, `channel: "texto"`, `rawInput` igual al input enviado — valida AC-08.
- [ ] `referenceDate` usado por `parseExpense` es `new Date()` del server, verificable inyectando un reloj fake en el test y confirmando que un campo de fecha en el body NO lo sobreescribe (el servicio no lee ningún campo de fecha del body porque el schema de Block 7 no lo expone).
- [ ] Categoría automática sin fila predefinida correspondiente en DB (seed desincronizado, simulado borrando la fila en el test) → `{ outcome: "internal_error" }`, no un rechazo de usuario.
- [ ] `expenseRepository.create` lanzando una excepción de Prisma (mockeada) → `{ outcome: "internal_error" }`, sin que el mensaje/objeto de error de Prisma aparezca en el resultado del service.

**Completion criterion**
Los 9 tests de arriba pasan contra `DATABASE_URL_TEST` con el seed de Block 3 aplicado.

---

## Block 10 — Ruta `POST /expenses` + manejo de errores

**Files**
- `apps/api/src/routes/expenses.ts` (new) — registra `POST /expenses` con `preHandler: [authPreHandler]` (Block 6), valida el body contra `createExpenseBodySchema` (Block 7), invoca
  `expenseService.createExpense` (Block 9), mapea el resultado a la respuesta HTTP.

**API contract**
- Method + path: `POST /expenses`
- Auth: header `x-user-id` (ver Block 6 — riesgo aceptado documentado)
- Request body: `{ input: string }` (no vacío)
- Response 201: `{ amount: string, place: string, when: string (ISO), category: string, categoryOrigin: "automatica" | "marcador", description: string, name: string, type: "Personal", currency: string }` (FR-13)
- Response 401: `{ error: "unauthorized" }` — header ausente o usuario inexistente
- Response 400: error de validación Zod — body inválido
- Response 422: `{ reason: RejectionReason }` — `parseExpense` rechazó el input
- Response 500: `{ error: "internal_error" }` — genérico, sin detalle de Prisma

**Error handling**
- `{ outcome: "rejected" }` del service → 422 con `{ reason }`.
- `{ outcome: "internal_error" }` del service → 500 con cuerpo genérico; el error real (incluyendo
  cualquier excepción de Prisma) se loguea vía `fastify.log.error` SIN incluir `rawInput` en el log
  (mitigación threat #3, y precedente de `threat-FEAT-001b.md` sobre no filtrar el input crudo).
- Body que excede `bodyLimit` (16 KB, Block 1) → Fastify responde `413` automáticamente, antes de
  que la ruta se ejecute — ningún código de este bloque necesita manejarlo explícitamente, pero el
  test de abajo confirma que el límite está activo.

**Required tests**
- [ ] Happy path completo (auth OK, body OK, input válido) → 201 con el shape de FR-13 — valida AC-01.
- [ ] Sin `x-user-id` → 401.
- [ ] Body inválido (sin `input`) → 400.
- [ ] Input que `parseExpense` rechaza → 422 con `{ reason }` — valida AC-02.
- [ ] Body mayor a 16 KB → 413 (bodyLimit activo, mitigación threat #1).
- [ ] Un error interno forzado (mock del repository lanzando) → 500 con cuerpo genérico, sin ningún fragmento del mensaje de error de Prisma en la respuesta.

**Completion criterion**
Los 6 tests de arriba pasan.

---

## Block 11 — Tests de integración end-to-end

**Files**
- `apps/api/tests/expenses.integration.test.ts` (new) — corre contra `DATABASE_URL_TEST`. `beforeAll`
  corre las migraciones + el seed (Block 3); `afterEach` limpia las tablas `Expense` y las categorías
  creadas por marcador durante el test (vía `TRUNCATE ... CASCADE` o transacción por test, decisión
  documentada en un comentario al inicio del archivo) — las 11 predefinidas y el usuario de prueba
  persisten entre tests, no se recrean en cada uno.

**Logic**
Ejercita la app completa (`buildApp` con Prisma real) vía `fastify.inject`, sin mocks de
`parseExpense`, `resolveCategoryName` ni Prisma — es la única capa que prueba el flujo de punta a
punta que el Goal del PRD describe ("un gasto ingerido por texto quede persistido, categorizado y
recuperable en base de datos").

**Required tests**
- [ ] AC-01 — input con Monto y Lugar válidos → 201, gasto recuperable en DB con los campos resueltos.
- [ ] AC-02 — input que dispara cada uno de los 8 `RejectionReason` (`empty_left_segment`, `amount_indeterminate`, `amount_malformed`, `amount_zero`, `empty_place`, `future_date`, `date_out_of_window`, `length_exceeded`) → 422, cero filas creadas por caso.
- [ ] AC-03 — sin header / header inválido → 401, `parseExpense` no invocado.
- [ ] AC-04 — marcador de categoría inexistente → categoría propia creada y asociada.
- [ ] AC-05 — marcador que normaliza a una vigente → reuso, sin duplicar.
- [ ] AC-06 — sin marcador → categoría automática predefinida correcta.
- [ ] AC-07 — marcador inexistente + monto indeterminado → rechazo total, categoría no creada.
- [ ] AC-08 — gasto creado con `currency: "ARS"`, `channel: "texto"`, `rawInput` fiel al input.
- [ ] AC-09 — body sin `input` / vacío / no-string → 400.
- [ ] AC-10 — el seed corrido dos veces no rompe (idempotencia) y una violación real de unicidad aborta el arranque (test que simula el índice único parcial rechazando un insert directo).

**Completion criterion**
`pnpm --filter @ggasia/api run test` corre limpio (0 fallos) contra `DATABASE_URL_TEST`, sin dejar
estado sucio entre corridas sucesivas de la suite completa.

---

## Rollback considerations (W-SPEC-03)

Es la primera migración del proyecto (no hay estado previo que preservar). El rollback es trivial:
`prisma migrate reset` contra el entorno afectado revierte el schema completo — no hay datos de
producción en juego todavía porque este ticket es el que crea la primera tabla. Si una migración
posterior necesitara revertir solo esta, el camino estándar de Prisma (`migrate resolve --rolled-back`
+ una migración inversa) aplica sin consideraciones especiales de este ticket.

## Final verification

- `pnpm build:packages && pnpm build:api` compila sin errores.
- `pnpm --filter @ggasia/categorization run test`, `pnpm --filter @ggasia/api run test` pasan limpio.
- Los 10 AC del PRD (AC-01 a AC-10) tienen al menos un test pasando contra `DATABASE_URL_TEST`.
- Las 6 mitigaciones de `docs/daw/security/threat-FEAT-002.md` están implementadas (bodyLimit, TLS
  documentado, 401 genérico, error handler sin detalle de Prisma, `referenceDate` del servidor, nota
  de riesgo aceptado presente en este spec).
- `daw-validate-arch` (CODE phase) no encuentra violaciones de `routes → service → repository` ni de
  consumo no-compilado de `@ggasia/domain`/`@ggasia/categorization`.
