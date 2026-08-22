# Threat Model FEAT-003a: Listado de gastos vía API — GET /expenses

| Field | Value |
|-------|-------|
| Ticket | FEAT-003a |
| Component | `apps/api` — ruta `GET /expenses`, `listExpensesQuerySchema`, `listExpenses` en `expense-service`, `findManyForUser` en `expense-repository`, índice compuesto sobre `expenses` |
| Date | 2026-08-20 |

## Attack surfaces identified

1. **Query param `limit` de `GET /expenses`** — primera entrada por querystring del proyecto; todo
   lo existente valida `body`. Alimenta directamente el `take` de un query de Prisma.
2. **Header `x-user-id`** — mismo mecanismo de identificación transitorio de FEAT-002, ahora usado
   para decidir **qué filas se leen y devuelven**, no solo bajo qué usuario se escribe. La superficie
   cambia de naturaleza: en FEAT-002 un `x-user-id` falsificado permitía escribir como otro; acá
   permite **leer los gastos de otro**.
3. **Cuerpo de la respuesta 200** — primera superficie de lectura del proyecto: expone filas de
   `expenses` ya persistidas, incluidos campos que hasta ahora nunca salieron de la base.
4. **Query de lectura sobre PostgreSQL** — nuevo camino de acceso a datos (`findManyForUser` con
   `include` de la relación `category`), sumado al `create` que ya existía.

No hay superficie nueva de audio, de servicio externo, de escritura ni de frontend: este ticket es
exclusivamente backend y de solo lectura.

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 | Querystring de `GET /expenses` (`limit`) | Fastify — validado por `listExpensesQuerySchema` (Zod) antes de llegar al service. El valor coaccionado a entero y acotado a 1-200 es lo único que cruza; nunca el string crudo |
| B2 | Header `x-user-id` | `authPreHandler` — lo trata como una afirmación de identidad NO verificada. Boundary heredado de FEAT-002 (B3 de `threat-FEAT-002.md`), reutilizado sin modificar. Ver riesgo CRÍTICO abajo, que en este ticket cambia de escritura a lectura |
| B3 | `apps/api` (Fastify/Node) | PostgreSQL — el listado usa exclusivamente la API de query de Prisma (`findMany` con `where`/`orderBy`/`take`/`include`), parametrizada; no se construye SQL crudo ni se interpola ningún valor del usuario en una consulta |
| B4 | `expense-service` | Cliente HTTP — el service decide qué campos de la fila se mapean a la respuesta. Todo campo persistido que no esté en ese mapeo explícito no sale de la base |

## STRIDE por componente

**Ruta `GET /expenses` + `listExpensesQuerySchema`**

| Categoría | Evaluación |
|---|---|
| Spoofing | Cubierto por `authPreHandler` (componente separado abajo). El GET no introduce un mecanismo propio |
| Tampering | El querystring se valida con Zod antes de tocar el service. `limit` se coacciona a entero y se acota a 1-200; un valor no numérico, decimal o fuera de rango se rechaza con 400 y nunca llega al query. No hay body ni estado que modificar: el endpoint es de solo lectura |
| Repudiation | Una consulta de listado no muta estado, así que no hay acción que repudiar. El log de error del service registra la falla sin `rawInput` |
| Information Disclosure | **La superficie principal de este ticket.** Ver riesgos abajo: el conjunto de campos devueltos y el aislamiento por usuario |
| Denial of Service | El tope de 200 filas (FR-03) acota el costo por request y la memoria de serialización. El índice compuesto del Block 1 evita el seq scan que haría cada request O(tabla). No hay rate-limiting, igual que en FEAT-002 |
| Elevation of Privilege | No hay roles: todo usuario es titular de su cuenta (PRD-001). La única escalada posible es leer los gastos de otro usuario, cubierta por el riesgo de aislamiento abajo |

**`listExpenses` + `findManyForUser`**

| Categoría | Evaluación |
|---|---|
| Spoofing | El `userId` que llega al `where` viene de `request.userId`, decorado por `authPreHandler` tras resolverlo contra la base — nunca de un campo que el cliente controle directamente en el query |
| Tampering | Solo lectura; no hay escritura que manipular |
| Repudiation | N/A (sin mutación) |
| Information Disclosure | El `where: { userId }` es la única barrera entre los gastos de un usuario y los de otro. Un olvido acá no lanza excepción: devuelve datos de más silenciosamente. Ver riesgo HIGH |
| Denial of Service | El `take` acotado y el índice compuesto mantienen el query en O(limit) en vez de O(tabla) |
| Elevation of Privilege | N/A — sin roles |

**Índice compuesto sobre `expenses` (Block 1)**

| Categoría | Evaluación |
|---|---|
| Spoofing / Tampering / Repudiation / Elevation | N/A — un índice no cambia semántica ni permisos, solo el plan de ejecución |
| Information Disclosure | N/A — no expone datos nuevos |
| Denial of Service | **Mitiga** el riesgo de DoS por seq scan: sin el índice, cada request del listado recorre toda la tabla `expenses`, de modo que el costo crece con el total de gastos de **todos** los usuarios, no solo los del solicitante |

## Clasificación de datos sensibles (F-TM-05)

| Dato expuesto por el listado | Clasificación | Tratamiento |
|---|---|---|
| `amount`, `currency` | **Financiero** | Es el propósito del endpoint. Solo se devuelve al dueño de la fila (`where: { userId }`). En tránsito viaja sobre HTTPS, que es responsabilidad del despliegue, no del código |
| `place`, `name`, `description` | **PII indirecta** — revelan hábitos, ubicaciones y rutina de una persona | Mismo tratamiento: solo al dueño. No se loguean |
| `when`, `createdAt` | PII indirecta (patrón temporal) | Ídem |
| `id`, `categoryId` | Identificadores internos (UUID v4) | UUID aleatorios, no enumerables ni secuenciales: exponer el `id` no permite adivinar el de otro gasto |
| `rawInput` | **PII directa** — el texto tal como lo escribió la persona | **No se devuelve en el listado ni se loguea.** Ver mitigación 2 |
| Credenciales | — | El modelo `User` no tiene campo de contraseña todavía (llega en FEAT-004); este ticket no toca `User` más allá de la resolución de identidad que ya hacía FEAT-002 |

**Cifrado (F-TM-07):** en tránsito, HTTPS provisto por la plataforma de despliegue (fuera del código,
igual que en FEAT-002). En reposo, el cifrado de disco del proveedor de PostgreSQL. Este ticket no
introduce ningún almacenamiento nuevo: solo lee filas que FEAT-002 ya persistía bajo las mismas
condiciones.

## Riesgos clasificados

| Riesgo | STRIDE | Likelihood | Impact | Mitigación propuesta |
|---|---|---|---|---|
| El header `x-user-id` permite a cualquier cliente **leer los gastos de cualquier usuario**, sin prueba de posesión de credenciales. En FEAT-002 el mismo stub permitía escribir como otro; acá el impacto pasa a ser divulgación de datos financieros y de hábitos ajenos | S / I | High | Critical | **Riesgo aceptado y heredado** — ver sección siguiente. La mitigación es FEAT-004, declarada fuera de alcance en el PRD |
| Un olvido o error en el `where: { userId }` de `findManyForUser` devuelve gastos de otros usuarios sin lanzar ninguna excepción: un bug de aislamiento se ve como una respuesta 200 normal | I | Medium | Critical | **Mitigación 1**: test de aislamiento explícito en dos capas — unitario en Block 2 (el repository nunca devuelve filas de otro `userId`) y end-to-end en Block 5, con dos usuarios reales en la base. Un fallo de aislamiento debe romper la suite, no pasar desapercibido |
| El listado devuelve `rawInput` (el texto crudo que escribió la persona) por copiar la fila completa de Prisma a la respuesta en vez de mapear campos explícitamente | I | Medium | Medium | **Mitigación 2**: el service mapea campo por campo a la forma de presentación (Block 3, boundary B4); `rawInput` queda deliberadamente fuera del mapeo. El contrato del Block 4 enumera exactamente los campos devueltos |
| Un `limit` muy grande (o negativo, o no numérico) llega al `take` de Prisma y produce una respuesta enorme o un error de driver expuesto al cliente | D / I | Medium | Medium | **Mitigación 3**: `listExpensesQuerySchema` acota `limit` a entero 1-200 **antes** de invocar el service (FR-03); fuera de rango es 400, nunca un clamp silencioso. Ya está en el diseño del Block 4 |
| Sin el índice compuesto, cada request del listado hace seq scan sobre toda la tabla `expenses`: el costo de una request de un usuario crece con los gastos de todos, y unas pocas requests concurrentes degradan la base | D | Medium | Medium | **Mitigación 4**: índice `(userId, when DESC, createdAt DESC)` del Block 1, con test que verifica su existencia en la base real contra `pg_indexes` |
| Un error de Prisma (conexión caída, timeout) se propaga al cliente con su mensaje original, revelando nombres de tabla/columna o la topología de la base | I | Medium | Medium | **Mitigación 5**: el service captura todo error y devuelve `{ outcome: "internal_error" }`; la route lo mapea a `{ error: "internal_error" }` sin detalle. Mismo patrón que `createExpense`. El log del error real no incluye `rawInput` (test explícito en Block 3) |
| El 401 responde distinto según si el header falta o si el id no existe, confirmando qué ids de usuario son válidos | I | Low | Low | **Heredada de FEAT-002**: `authPreHandler` ya devuelve un único body genérico `{ error: "unauthorized" }` para ambos casos. Este ticket lo reutiliza sin modificar; dos tests del Block 4 lo verifican para el GET |
| Ausencia de rate-limiting: un cliente identificado puede pedir el listado en bucle | D | Low | Low | **Riesgo aceptado** — ningún RF/RNF del PRD-001 exige rate-limiting, y el tope de 200 filas acota el costo por request. Corresponde a un ticket de rate-limiting, no a éste. Mismo criterio ya aplicado en `threat-FEAT-002.md` |

## Riesgo aceptado — `x-user-id` como mecanismo de identificación, ahora en lectura (F-TM-04)

Riesgo heredado de `threat-FEAT-002.md`, **re-evaluado** porque este ticket cambia su naturaleza: el
stub deja de gobernar solo qué se escribe y pasa a gobernar qué se lee y se devuelve.

| Campo | Valor |
|---|---|
| Quién lo acepta | Nahuel Maiká (product owner / dueño del repo) |
| Justificación | El ticket de autenticación real (RF-08/RF-12/RF-13/RNF-06 del PRD-001) todavía no existe: el modelo `User` ni siquiera tiene campo de contraseña. Bloquear FEAT-003a hasta que exista invertiría el orden de entrega — el listado es la dependencia directa de FEAT-003b, que es la primera pantalla del producto. El PRD de este ticket declara el reemplazo explícitamente (`Out of Scope` → "siguiente ticket: FEAT-004"), de modo que la deuda tiene dueño y número, no queda como un pendiente sin asignar |
| Condiciones de revisión | **FEAT-004** (login y sesión reales) reemplaza `x-user-id` por una sesión verificada en `authPreHandler`, tanto para `POST` como para `GET /expenses`. Hasta que ese ticket cierre, **ningún despliegue de esta API es apto para usuarios reales con datos reales**: el entorno con el stub queda restringido a desarrollo y demo. Esta condición se reevalúa si aparece cualquier intención de desplegar a usuarios reales antes de FEAT-004 — en ese caso el orden de tickets se invierte y FEAT-004 pasa primero |

## Mitigations to fold into the spec

Las cinco mitigaciones ya están reflejadas en `docs/daw/specs/spec-FEAT-003a.md`; se listan acá para
trazabilidad:

1. **Aislamiento por usuario testeado en dos capas** — Block 2 (test unitario: nunca devuelve filas
   de otro `userId`) y Block 5 (test end-to-end con dos usuarios reales en la base).
2. **Mapeo explícito de campos en el service** — Block 3; `rawInput` queda fuera de la respuesta.
   El contrato del Block 4 enumera exactamente qué campos salen.
3. **Validación de `limit` en el borde HTTP** — Block 4; entero 1-200, 400 fuera de rango, sin clamp
   silencioso.
4. **Índice compuesto con test de existencia** — Block 1; verifica contra `pg_indexes` en la base
   real.
5. **Errores internos genéricos y log sin `rawInput`** — Block 3 (captura + log) y Block 4 (mapeo a
   500 sin detalle), con test explícito de que el log no filtra el texto del usuario.

## Verdict

```
┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling FEAT-003a — PASSED                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Attack surfaces identified: 4                           │
│  Trust boundaries declared: 4                            │
│                                                          │
│  Riesgos:                                                │
│    🔴 CRITICAL: x-user-id permite leer gastos ajenos     │
│       — Riesgo aceptado (F-TM-04 completo), mitiga        │
│         FEAT-004                                          │
│    🔴 CRITICAL: bug de aislamiento en el where silencioso │
│       — Mitigación 1 (tests en dos capas)                 │
│    🟡 MEDIUM: rawInput filtrado en la respuesta           │
│       — Mitigación 2 (mapeo explícito)                    │
│    🟡 MEDIUM: limit sin acotar                            │
│       — Mitigación 3 (Zod 1-200, 400 fuera de rango)      │
│    🟡 MEDIUM: seq scan por falta de índice                │
│       — Mitigación 4 (índice compuesto + test)            │
│    🟡 MEDIUM: error de Prisma expuesto al cliente         │
│       — Mitigación 5 (internal_error genérico)            │
│    🟢 LOW: 401 distinguible — heredada de FEAT-002        │
│    🟢 LOW: sin rate-limiting — aceptado                   │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  Risks: C:2 H:0 M:4 L:2                                  │
│  Report: docs/daw/security/threat-FEAT-003a.md           │
└─────────────────────────────────────────────────────────┘
```
