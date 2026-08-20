# PRD FEAT-002: Alta de gasto vía API — persistencia + integración del motor de extracción/categorización

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Tracker | none |
| Date | 2026-08-19 |
| PRD loops | 0 |

## Context and Problem

FEAT-001a (categorizador) y FEAT-001b (extractor) ya están mergeados a `main` como dos paquetes
puros — `@ggasia/categorization` y `@ggasia/domain` — sin HTTP, sin base de datos y sin interfaz,
por decisión explícita del DEFINE original de FEAT-001. Interpretar una frase en un `ParsedExpense`
o un `RejectedExpense` funciona hoy solo en memoria, dentro de un test.

Este ticket cierra la primera vuelta completa del Objetivo 1 del PRD-001: "ingresar por escrito los
datos del gasto y que de forma automática se agregue y se clasifique el gasto". Levanta `apps/api`
(Fastify) y el schema de Prisma desde cero, y conecta un endpoint HTTP con el motor ya construido,
de modo que un gasto ingresado por texto quede persistido, categorizado y recuperable en base de
datos — el primer corte del producto que es, además, el primero desplegable.

No incluye autenticación real. `AGENTS.md` fija `routes → service → repository` y que
`packages/domain`/`packages/categorization` se consumen solo por su puerto compilado; ambas reglas
se respetan aquí.

## Goals

- Persistir un gasto interpretado a partir de una frase de texto libre, end-to-end, en PostgreSQL.
- Reutilizar el motor de FEAT-001a/b sin modificarlo: `apps/api` es su primer consumidor real.
- Dejar categorías predefinidas y un usuario de prueba disponibles vía seed, de modo que el flujo
  completo sea verificable con `pnpm test` de integración, sin depender de un ticket de auth que
  todavía no existe.
- Mantener el rechazo de input tan distinguible por motivo en la API como ya lo es en el dominio.

## Functional Requirements

- FR-01: El sistema debe exponer `POST /expenses`, que recibe el input de texto libre de un gasto y
  lo persiste si es válido.
- FR-02: El sistema debe identificar al usuario dueño del gasto mediante el header `x-user-id`,
  resuelto contra un usuario existente en base de datos — sin verificación de sesión real (ver
  Riesgos).
- FR-03: El sistema debe rechazar la request con 401 cuando el header `x-user-id` está ausente o no
  corresponde a ningún usuario existente, sin invocar el motor de extracción.
- FR-04: El sistema debe interpretar el input recibido invocando `parseExpense` de `@ggasia/domain`
  con la fecha actual del servidor en la zona horaria de negocio como `referenceDate`, y el
  categorizador de `@ggasia/categorization` vía su puerto (`Categorizer`), nunca la clase concreta.
- FR-05: El sistema debe rechazar la request con 422 y un código de motivo distinguible cuando
  `parseExpense` devuelve `{ ok: false }`, sin persistir ningún dato, incluyendo cuando el motivo es
  la creación fallida de una categoría de marcador (RF-32 del PRD-001).
- FR-06: El sistema debe resolver la categoría del gasto contra las categorías vigentes del usuario
  (predefinidas + propias) de la siguiente forma:
  - si `categoryOrigin = "marcador"`, busca una categoría cuyo nombre normalizado (minúsculas, sin
    acentos, espacios colapsados) coincida con el nombre del marcador; si no existe, la crea como
    categoría propia del usuario;
  - si `categoryOrigin = "automatica"`, busca la categoría predefinida cuyo nombre coincide con el
    devuelto por el categorizador.
- FR-07: El sistema debe persistir el gasto con: Monto, Lugar, Fecha, Categoría (id resuelto por
  FR-06), origen de la categoría, Descripción, Nombre, Tipo, Moneda, input crudo y canal de ingreso.
- FR-08: El sistema debe fijar Moneda = `"ARS"` en todo gasto creado por este ticket, sin que el
  campo quede hardcodeado en la lógica de negocio (modelado como columna, no como literal disperso
  en el código) — el input de texto no permite hoy expresar otra moneda.
- FR-09: El sistema debe fijar el canal del gasto en `"texto"` en todo gasto creado por este ticket
  — la entrada por audio (RF-34 del PRD-001) queda fuera de alcance.
- FR-10: El sistema debe validar con Zod la forma del body de `POST /expenses` (input no vacío, de
  tipo string) antes de invocar el motor de extracción.
- FR-11: El sistema debe proveer, vía seed, el conjunto cerrado de categorías predefinidas de
  kb.md ("Categorías Predefinidas"), en su orden normativo, disponibles para todo usuario.
- FR-12: El sistema debe proveer, vía seed, un usuario de prueba con id conocido, como mecanismo de
  identificación de este ticket — sustituido por sesión real en el ticket de autenticación.
- FR-13: El sistema debe responder 201 con el gasto creado — Monto, Lugar, Fecha, Categoría (nombre),
  origen de la categoría, Descripción, Nombre, Tipo y Moneda — cuando la creación es exitosa.

## Non-Functional Requirements

- NFR-01: La creación de un gasto debe completarse en menos de 3 segundos, medido en el percentil 95
  (p95) de las requests (RNF-01 del PRD-001).
- NFR-02: El Monto debe persistirse con precisión exacta de 2 decimales (tipo `Decimal`, nunca
  `float`), hasta 999.999.999,99 (RNF-08 del PRD-001).
- NFR-03: El proceso de `apps/api` debe abortar en el arranque si falta o es inválida una variable
  de entorno requerida (`DATABASE_URL`, zona horaria de negocio), sin atender ninguna solicitud
  (RNF-15 del PRD-001, ya vigente para todo el proyecto vía `AGENTS.md`).
- NFR-04: El endpoint debe seguir la separación de capas `routes → service → repository` de
  `AGENTS.md`, leyendo `fastify.prisma` en vez de un singleton importado.

## Acceptance Criteria

- AC-01 (FR-01, FR-04, FR-07, FR-13): WHEN un usuario identificado envía `POST /expenses` con un
  input que resuelve Monto y Lugar válidos, THE system SHALL crear el gasto con los campos
  resueltos y responder 201.
- AC-02 (FR-05): IF `parseExpense` rechaza el input (cualquier `RejectionReason`), THEN THE system
  SHALL responder 422 con el código de motivo correspondiente y SHALL NOT persistir ningún dato.
- AC-03 (FR-02, FR-03): IF el header `x-user-id` está ausente o no corresponde a un usuario
  existente, THEN THE system SHALL responder 401 y SHALL NOT invocar `parseExpense`.
- AC-04 (FR-06): WHEN el input incluye un marcador `#nombre` para una categoría inexistente y el
  resto del input es válido, THE system SHALL crear esa categoría como propia del usuario y
  asociarla al gasto.
- AC-05 (FR-06): WHEN el input incluye un marcador `#nombre` cuyo nombre normalizado coincide con
  una categoría predefinida o propia ya vigente, THE system SHALL reusar esa categoría y SHALL NOT
  crear una duplicada.
- AC-06 (FR-06, FR-11): WHEN el input no incluye marcador de categoría, THE system SHALL asignar la
  categoría predefinida devuelta por el categorizador determinista.
- AC-07 (FR-05, FR-06): IF el input trae un marcador `#nombre` de categoría inexistente pero el
  Monto no puede determinarse, THEN THE system SHALL rechazar el input completo y SHALL NOT crear
  la categoría del marcador (consistente con RF-32/AC-39 del PRD-001, verificado ahora también en
  la capa de persistencia).
- AC-08 (FR-07, FR-08, FR-09): WHEN la creación es exitosa, THE system SHALL persistir
  Moneda = `"ARS"`, canal = `"texto"` y el input crudo tal como fue enviado, sin permitir su
  edición desde este endpoint.
- AC-09 (FR-10): IF el body de la request no es un JSON con un campo de input de tipo string no
  vacío, THEN THE system SHALL responder 400 por validación de Zod, sin invocar `parseExpense`.
- AC-10 (FR-11, FR-12): WHEN el proceso de seed corre en el arranque, THE system SHALL fallar antes
  de atender requests si el seed de categorías predefinidas o del usuario de prueba viola una
  restricción de unicidad — la unicidad de nombres predefinidos se garantiza en la migración, no en
  runtime.

## Out of Scope

- Registro y login reales (RF-08, RF-12, RF-13 del PRD-001), cierre de sesión (RF-24), expiración de
  sesión (RNF-04) — el header `x-user-id` es un mecanismo de identificación transitorio para este
  ticket únicamente.
- Modificación y eliminación de gastos (RF-02, RF-03, RF-04, RF-44 del PRD-001).
- Listado de gastos (RF-48) y resúmenes diarios/mensuales (RF-09 a RF-11).
- Entrada por audio y su transcripción (RF-34 a RF-37).
- CRUD explícito de categorías vía API (RF-16 a RF-20) — en este ticket una categoría solo se crea
  de forma implícita a través del marcador `#nombre` (RF-14/RF-15).
- Corrección manual de categoría y su timestamp inmutable de primera corrección (RF-42) — pertenece
  al ticket de edición de gastos.
- Toda interfaz de usuario (RF-49 a RF-81 del PRD-001) — este ticket es exclusivamente backend.
- Soporte real de multi-moneda: el campo Moneda existe y no está hardcodeado en la lógica, pero
  ninguna moneda distinta de ARS es alcanzable desde este ticket porque el input de texto no la
  expresa.

## Risks and Mitigations

- **Riesgo**: identificar al usuario vía el header `x-user-id`, sin sesión, es trivialmente
  falsificable por cualquier cliente que lo envíe. **Mitigación**: aceptado de forma explícita y
  acotado a este ticket — el ticket de autenticación (RF-08/RF-12/RF-13/RNF-06 del PRD-001)
  reemplaza el header por una sesión real; ningún cliente de producción debe apoyarse en este
  mecanismo.
- **Riesgo**: el seed de categorías predefinidas y el de kb.md pueden desincronizarse si kb.md
  cambia sin una migración nueva. **Mitigación**: hereda el riesgo ya declarado en PRD-001
  ("reordenar categorías... exige volver a medir RNF-02"); todo cambio a kb.md debe traer su
  migración de seed en el mismo PR.
- **Riesgo**: sin CRUD de categorías todavía, una categoría creada por marcador con un nombre mal
  tipeado no tiene forma de corregirse desde la API. **Mitigación**: aceptado — el CRUD de
  categorías (RF-16 a RF-20) es un ticket separado y ya está declarado Fuera de Alcance.

## Dependencies

- `PRD.md` (PRD-001) — origen de todo RF-/RNF-/AC- citado sin prefijo de ticket en este documento
  (RF-01 a RF-48, RNF-01 a RNF-15).
- `kb.md` — anexo normativo de PRD-001; define el conjunto cerrado de categorías predefinidas
  usado por FR-11.
- `@ggasia/domain` y `@ggasia/categorization` (FEAT-001a/FEAT-001b), ya mergeados a `main`, se
  consumen compilados (`dist/`), nunca desde `src/`.
- PostgreSQL con extensión `citext` (`AGENTS.md`, ya declarado para email; se reutiliza el mismo
  motor de base de datos).
- Prisma 7 — este ticket crea el primer `schema.prisma` del proyecto (`User`, `Category`,
  `Expense`); no existe ninguno previo.
- Fastify 5 en `apps/api` — este ticket crea la app y su primer plugin/ruta; no existe ningún
  endpoint previo en el repo.

## Historial de Cambios

- **v1.0** — versión inicial.
