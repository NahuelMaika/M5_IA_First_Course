# Spec FEAT-003a: Listado de gastos vía API — GET /expenses

| Field | Value |
|-------|-------|
| Ticket | FEAT-003a |
| PRD | docs/daw/prd/prd-FEAT-003a.md |
| Tier | FEATURE |
| Date | 2026-08-20 |
| Spec loops | 0 |

## Summary

Agrega `GET /expenses` a `apps/api`, el primer endpoint de lectura del proyecto. Sigue el mismo
camino `routes → service → repository` que `POST /expenses` (FEAT-002) y reutiliza su
`authPreHandler` sin modificarlo. Suma el primer query param validado con Zod del repo (`limit`,
1-200, default 50) y el primer método de lectura de `expense-repository`, que resuelve el nombre de
la categoría con un `include` en vez del JOIN en memoria que hace el POST. Ordena por `when` DESC
con `createdAt` DESC como desempate estable, respaldado por un índice compuesto nuevo — hoy
`expenses` no tiene ningún índice más allá de su PK, así que sin él el filtro por usuario haría seq
scan.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 2, Block 3, Block 4 |
| FR-02 | Block 4 |
| FR-03 | Block 3, Block 4 |
| NFR-01 | Estrategia: índice compuesto `(userId, when DESC, createdAt DESC)` del Block 1 cubre exactamente el `WHERE` + `ORDER BY` del query; sin él el plan haría seq scan sobre toda la tabla. El tope de 200 filas de FR-03 acota el peor caso de serialización. |
| NFR-02 | Estrategia: la route del Block 4 lee `request.server.prisma` y lo pasa como dependencia al service; el service (Block 3) recibe `deps: { prisma }` y nunca importa un singleton; el repository (Block 2) recibe `prisma: PrismaClient` como primer parámetro. Idéntico al camino de `POST /expenses`. |

## Dependencies between blocks

Estrictamente secuencial: **Block 1 → Block 2 → Block 3 → Block 4 → Block 5**.

- Block 2 (repository) necesita el índice y la migración del Block 1 aplicados para que sus tests
  corran contra el schema correcto.
- Block 3 (service) consume la función que expone el Block 2.
- Block 4 (route + schema Zod) consume el service del Block 3.
- Block 5 (tests de integración end-to-end) necesita el endpoint completo de los Blocks 1-4.

## Block 1 — Índice compuesto sobre `expenses` y su migración

**Files**
- `apps/api/prisma/schema.prisma` (modificado) — agrega `@@index` al modelo `Expense`.
- `apps/api/prisma/migrations/{timestamp}_expenses_user_when_index/migration.sql` (nuevo) —
  `CREATE INDEX` generado por Prisma.

**Logic**

El modelo `Expense` no declara hoy ningún índice, y las dos FK (`user_id`, `category_id`) no generan
uno automáticamente en PostgreSQL. El query del listado filtra por `userId` y ordena por
`when DESC, createdAt DESC`; sin un índice que cubra esa combinación, PostgreSQL hace seq scan sobre
toda la tabla más un sort en memoria.

Se agrega un índice compuesto en ese orden exacto — `userId` como columna de igualdad primero, luego
las dos de ordenamiento con su dirección — de modo que el planner pueda satisfacer `WHERE` y
`ORDER BY` recorriendo el índice.

**Data model**
- Entidad: `Expense` (tabla `expenses`), sin cambios de columnas.
- Índice nuevo: `@@index([userId, when(sort: Desc), createdAt(sort: Desc)])`.
- No hay cambios de tipo, nullability, constraint ni default: la migración es puramente aditiva y no
  reescribe filas existentes.

**Error handling**
- Migración no aplicada: el índice no existe en la base. El test de este bloque que consulta
  `pg_indexes` falla explícitamente en vez de dejar el listado degradado a seq scan en silencio.
- La migración es aditiva (solo `CREATE INDEX`), de modo que no existe el caso de falla por datos
  preexistentes incompatibles.

**Required tests**
- [ ] `prisma-schema.test.ts`: el modelo `Expense` declara el índice `(userId, when, createdAt)` con
      las direcciones esperadas — valida la estrategia de NFR-01.
- [ ] `prisma-schema.test.ts`: la migración aplicada crea el índice en la base real (consulta a
      `pg_indexes` por la tabla `expenses`) — sad path: el índice no existe porque la migración no
      corrió.

**Completion criterion**

`prisma migrate deploy` aplica la migración sin error contra la base de test, y una consulta a
`pg_indexes` sobre `expenses` devuelve el índice compuesto con sus tres columnas en el orden
declarado.

## Block 2 — Método de lectura en `expense-repository`

**Files**
- `apps/api/src/repositories/expense-repository.ts` (modificado) — agrega `findManyForUser`.
- `apps/api/tests/repositories/expense-repository.test.ts` (modificado) — tests del método nuevo.

**Logic**

`expense-repository.ts` hoy solo expone `create`. Se agrega `findManyForUser(prisma, { userId, limit })`
que devuelve las filas del usuario ordenadas por `when DESC, createdAt DESC`, acotadas por `limit`.

A diferencia del POST —que tiene el nombre de la categoría en memoria porque acaba de resolverlo—
el listado lee filas que ya existen y solo tiene el `categoryId`. Se usa un `include` de la relación
`category` para traer su nombre en el mismo query, en vez de emitir un query por fila.

El repository no aplica default ni validación sobre `limit`: recibe un número ya validado. Mantener
la regla de negocio fuera del repository es la misma separación que respeta `create`.

**Data model**
- Lee `Expense` con la relación `category` incluida. No escribe nada.
- El tipo de retorno expone `amount` como `Prisma.Decimal` (nunca `number`), consistente con
  `CreateExpenseInput`.

**Input validation**
- `userId`: string (UUID), provisto por la capa superior tras resolver la sesión.
- `limit`: entero ya validado en rango 1-200 por el Block 4; el repository lo usa tal cual como
  `take`.

**Error handling**
- Un `userId` que no corresponde a ningún usuario devuelve lista vacía, no error: el 401 por usuario
  inexistente lo resuelve `authPreHandler` antes de llegar acá.
- Los errores de Prisma (conexión caída, query inválido) se propagan sin capturar; traducirlos a un
  `outcome` es responsabilidad del service (Block 3). Un repository que los tragara devolvería lista
  vacía ante una base caída, indistinguible de un usuario sin gastos.

**Required tests**
- [ ] Devuelve solo los gastos del `userId` pedido, nunca los de otro usuario — valida el
      aislamiento que AC-01 asume.
- [ ] Ordena por `when` descendente: un gasto con `when` más viejo cargado después aparece debajo de
      uno con `when` más nuevo — valida la decisión de ordenamiento de AC-01.
- [ ] Desempata por `createdAt` descendente cuando dos gastos comparten el mismo `when` — el orden
      es estable entre corridas.
- [ ] Respeta `limit`: con más filas que el límite, devuelve exactamente `limit` filas, las más
      recientes.
- [ ] Incluye el nombre de la categoría de cada gasto en el resultado.
- [ ] Sad path: un usuario sin gastos devuelve un array vacío, no `null` ni error — valida AC-04.
- [ ] Sad path: cuando Prisma lanza, el error se propaga al llamador en vez de convertirse en lista
      vacía — una base caída no debe volverse indistinguible de un usuario sin gastos.

**Completion criterion**

Los siete tests pasan contra la base de test real, y `findManyForUser` no importa ningún
`PrismaClient` — lo recibe como primer parámetro, igual que `create`.

## Block 3 — `listExpenses` en `expense-service`

**Files**
- `apps/api/src/services/expense-service.ts` (modificado) — agrega `listExpenses`.
- `apps/api/tests/services/expense-service.test.ts` (modificado) — tests del método nuevo.

**Logic**

Se agrega `listExpenses(deps, userId, limit)` siguiendo la firma de `createExpense`: recibe
`deps: { prisma, logger? }` como primer parámetro y devuelve una unión discriminada por `outcome`.

Como el listado no tiene reglas de rechazo de negocio —la validación de `limit` ocurre antes, en la
route— los outcomes posibles son `"listed"` e `"internal_error"`. El service llama a
`findManyForUser` del Block 2 y mapea cada fila a la forma de presentación que la route serializa,
resolviendo el nombre de la categoría desde la relación incluida.

Mantener el mapeo acá y no en la route replica la decisión de `createExpense`, que ya devuelve
`category` como nombre resuelto para que la route no toque Prisma por presentación.

**Input validation**
- `userId`: string (UUID), ya resuelto contra un usuario existente por `authPreHandler` antes de
  llegar acá. El service no lo revalida: hacerlo duplicaría la regla en dos capas y abriría la
  posibilidad de que diverjan.
- `limit`: entero, ya acotado al rango 1-200 por el schema Zod del Block 4. El service lo pasa tal
  cual al repository sin reaplicar el default ni el clamp — la validación vive en el borde HTTP,
  que es donde entra el dato del usuario.

**Error handling**
- Todo error de Prisma se captura y se devuelve como `{ outcome: "internal_error" }`, logueando el
  error real vía `deps.logger` sin exponer su mensaje ni su stack en la respuesta — mismo patrón que
  `createExpense`.
- El log no incluye `rawInput` de ningún gasto, para no volcar texto del usuario en los logs.

**Required tests**
- [ ] Devuelve `{ outcome: "listed" }` con los gastos mapeados a su forma de presentación, con el
      nombre de la categoría resuelto.
- [ ] Propaga el orden que devuelve el repository sin reordenar por su cuenta.
- [ ] Sad path: cuando el repository lanza, devuelve `{ outcome: "internal_error" }` y no deja
      escapar el mensaje del error de Prisma.
- [ ] Sad path: un usuario sin gastos produce `{ outcome: "listed" }` con lista vacía, nunca un
      error — valida AC-04.
- [ ] Sad path: cuando el repository lanza, el log emitido por `deps.logger` no contiene el
      `rawInput` de ningún gasto — el texto que escribió el usuario no debe terminar en los logs.

**Completion criterion**

Los cinco tests pasan y `listExpenses` no importa `PrismaClient`: lo recibe dentro de `deps`, igual
que `createExpense`.

## Block 4 — Route `GET /expenses` y validación del query param

**Files**
- `apps/api/src/schemas/expense.ts` (modificado) — agrega `listExpensesQuerySchema`.
- `apps/api/src/routes/expenses.ts` (modificado) — agrega el `app.route` del GET.
- `apps/api/tests/routes/expenses.test.ts` (modificado) — tests de la capa HTTP con Prisma fakeado.

**Logic**

`app.ts` ya registra `expensesRoutes`, así que el GET se suma como un segundo `app.route({...})`
dentro de esa misma función: no hay que tocar `app.ts`.

Este es el primer query param validado del repo — todo lo existente valida `body`. Se sigue el mismo
patrón: un schema Zod en `schemas/expense.ts` y un `safeParse` en el handler, ahora sobre
`request.query` en vez de `request.body`. El schema coacciona el string del querystring a entero y
lo acota al rango 1-200, con default 50 cuando el param está ausente. Un valor fuera de rango, no
numérico o no entero cae en el mismo 400 que ya usa el POST para su body inválido: se rechaza, nunca
se ajusta en silencio (FR-03).

El handler encadena `authPreHandler` → validación Zod del query → `listExpenses` → mapeo a HTTP,
exactamente el orden del POST.

**API contract**
- Método + path: `GET /expenses`
- Request: query param opcional `limit` (entero, 1-200, default 50). Sin body.
- Response 200: `{ expenses: [...] }`, cada elemento con `id` (string UUID), `amount` (string con 2
  decimales), `place` (string), `when` (ISO string), `category` (string, el nombre), `categoryOrigin`,
  `description` (string), `name` (string), `type`, `currency` (string).
- Error codes: `400` (query param inválido), `401` (no identificado), `500` (error interno).
- Auth: `authPreHandler` — header `x-user-id` resuelto contra un usuario existente. Header ausente o
  usuario inexistente devuelven el mismo body genérico `{ error: "unauthorized" }`, sin distinguir
  cuál de los dos casos fue.

**Input validation**
- `limit`: entero, mínimo 1, máximo 200, default 50 si el param no viene. Un valor no numérico, con
  decimales o fuera de rango se rechaza con 400.
- No hay body: un body enviado en un GET se ignora, no se valida.

**Error handling**
- Query param inválido → 400 con el detalle de las issues de Zod, sin invocar el service.
- `request.userId` ausente → 401 genérico (rama defensiva; `authPreHandler` ya respondió antes).
- `outcome === "internal_error"` → 500 con `{ error: "internal_error" }`, sin log adicional en la
  route: el service ya logueó el error real.

**Required tests**
- [ ] 200 con la lista de gastos serializada: `amount` como string de 2 decimales, `when` como ISO
      string, `category` como nombre — valida AC-01.
- [ ] Sin `limit`, invoca el service con 50 — valida el default de FR-03.
- [ ] Con `limit=200`, invoca el service con 200; con `limit=1`, con 1 — los bordes del rango son
      válidos.
- [ ] Sad path: `limit=0`, `limit=201` y `limit=abc` devuelven 400 y no invocan el service — valida
      AC-02.
- [ ] Sad path: sin header `x-user-id` devuelve 401 y no invoca el service — valida AC-03.
- [ ] Sad path: con `x-user-id` de un usuario inexistente devuelve 401 con el mismo body genérico —
      valida AC-03.
- [ ] Sad path: cuando el service devuelve `internal_error`, responde 500 sin exponer el error
      interno.

**Completion criterion**

Los siete tests pasan, `GET /expenses` responde 200 con la forma declarada en el contrato, y la route
no importa Prisma: lee `request.server.prisma` y lo pasa al service.

## Block 5 — Tests de integración end-to-end

**Files**
- `apps/api/tests/expenses.integration.test.ts` (modificado) — agrega el bloque de tests del GET.

**Logic**

Los tests de este archivo corren contra PostgreSQL real (`DATABASE_URL_TEST`) sin mocks. Siguen las
restricciones ya vigentes del archivo: `fileParallelism: false` garantiza que la migración aplicada
por `prisma-schema.test.ts` ya corrió, el cleanup es por id propio en `afterEach` (nunca `TRUNCATE`,
porque la base es compartida entre archivos), y cada fila se marca con un `randomUUID()` embebido
para no colisionar con corridas previas.

El escenario end-to-end crea varios gastos vía `POST /expenses` —con fechas deliberadamente
desordenadas respecto del orden de creación— y después los pide vía `GET /expenses`, verificando que
el orden resultante es por `when`, no por orden de carga. Es el único test que puede demostrar la
decisión de ordenamiento de punta a punta.

**Error handling**
- `limit` fuera del rango 1-200 contra la app real: 400 sin tocar la base, verificando end-to-end
  que el rechazo ocurre antes del query y no después de traer filas.
- Pedido de un usuario contra los gastos de otro: el listado devuelve solo los propios. No es un
  error explícito sino una ausencia, y por eso necesita su propio test — un bug de aislamiento no
  levanta ninguna excepción, devuelve datos de más.
- Higiene de la suite (no son caminos de error del endpoint): todo gasto y categoría creados se
  registran en las listas de ids que el `afterEach` ya limpia, y los timeouts de red están cubiertos
  por el `testTimeout`/`hookTimeout` de 30 s ya configurados.

**Required tests**
- [ ] End-to-end: crear tres gastos con fechas desordenadas respecto del orden de carga y verificar
      que `GET /expenses` los devuelve ordenados por `when` descendente — valida AC-01 con datos
      reales.
- [ ] End-to-end: un usuario sin gastos recibe 200 con lista vacía — valida AC-04 contra la base
      real.
- [ ] End-to-end: `limit` acota el resultado — con más gastos que el límite pedido, se reciben
      exactamente `limit`, los más recientes por `when`.
- [ ] Sad path end-to-end: `limit` fuera de rango devuelve 400 contra la app real, sin tocar la base.
- [ ] Sad path end-to-end: los gastos de un usuario no aparecen en el listado de otro usuario —
      valida el aislamiento por usuario con dos usuarios reales en la base.

**Completion criterion**

Los cinco tests pasan contra la base real, `afterEach` deja la base sin filas nuevas, y la suite
completa de `apps/api` sigue en verde.

## Final verification

- `GET /expenses` responde 200 con los gastos del usuario identificado, ordenados por `when` DESC y
  desempatados por `createdAt` DESC, con hasta `limit` elementos (default 50, máximo 200).
- Un `limit` fuera del rango 1-200 devuelve 400, nunca un resultado ajustado en silencio.
- Un pedido sin `x-user-id` válido devuelve 401 con el mismo body genérico que el POST, sin
  distinguir header ausente de usuario inexistente.
- Un usuario sin gastos recibe 200 con lista vacía.
- Un usuario nunca ve gastos de otro usuario.
- El camino completo respeta `routes → service → repository`: ninguna capa importa un `PrismaClient`
  singleton.
- El índice compuesto existe en la base y cubre el `WHERE` + `ORDER BY` del listado.
- `pnpm test` de `apps/api` pasa completo, incluida la suite preexistente de FEAT-002 sin
  modificaciones.
