# PRD FEAT-003a: Listado de gastos vía API — GET /expenses

| Field | Value |
|-------|-------|
| Ticket | FEAT-003a |
| Tracker | none |
| Date | 2026-08-20 |
| PRD loops | 0 |

## Context and Problem

FEAT-002 dejó `POST /expenses` como único endpoint de `apps/api`: se puede crear un gasto, pero no
hay forma de recuperarlo salvo consultando la base de datos directamente. Este es el primer
sub-ticket del split de FEAT-003 (ver `prd-FEAT-003.md`): agrega `GET /expenses`, el primer
endpoint de lectura del proyecto, siguiendo el mismo mecanismo de identificación y la misma
separación de capas que FEAT-002.

Es un ticket chico, independiente y desplegable por sí solo: no depende de que exista ninguna
interfaz para ser correcto ni verificable — se prueba con tests de integración igual que
`POST /expenses`.

## Goals

- Exponer el listado de gastos de un usuario identificado, ordenado con los más recientes primero.
- Reutilizar el mecanismo `x-user-id` de FEAT-002 sin introducir un segundo esquema de
  identificación.
- Dejar la paginación acotada por cantidad (RNF-14 de `PRD.md`) desde el primer momento, sin un
  valor por defecto implícito que un cliente pueda asumir mal.

## Functional Requirements

- FR-01: El sistema debe exponer `GET /expenses`, que devuelve los gastos del usuario identificado
  ordenados con los más recientes primero (RF-48 de `PRD.md`).
- FR-02: El sistema debe identificar al usuario de `GET /expenses` con el mismo mecanismo
  `x-user-id` de FEAT-002 (FR-02/FR-03 de `prd-FEAT-002.md`), respondiendo 401 en las mismas
  condiciones — header ausente o sin usuario correspondiente.
- FR-03: El sistema debe devolver 50 gastos por consulta a `GET /expenses` de forma predeterminada,
  admitiendo un parámetro de cantidad de hasta 200; un valor fuera de ese rango debe rechazarse con
  400, nunca ajustarse en silencio (RNF-14 de `PRD.md`).

## Non-Functional Requirements

- NFR-01: La consulta del listado debe completarse en menos de 3 segundos, medido en el percentil
  95 (p95) de las requests (RNF-01 de `PRD.md`).
- NFR-02: El endpoint debe seguir la separación de capas `routes → service → repository` de
  `AGENTS.md`, leyendo `fastify.prisma` en vez de un singleton importado — misma convención que
  `POST /expenses`.

## Acceptance Criteria

- AC-01 (FR-01, FR-02): WHEN un usuario identificado pide su listado de gastos sin indicar cantidad,
  THE system SHALL devolver hasta 50 gastos ordenados con los más recientes primero.
- AC-02 (FR-03): IF la cantidad pedida a `GET /expenses` está fuera del rango 1-200, THEN THE system
  SHALL responder 400 y SHALL NOT ajustarla en silencio.
- AC-03 (FR-02): IF el header `x-user-id` está ausente o no corresponde a un usuario existente,
  THEN `GET /expenses` SHALL responder 401 y SHALL NOT devolver ningún gasto.
- AC-04 (FR-01): WHEN un usuario identificado no tiene ningún gasto cargado, THE system SHALL
  responder 200 con una lista vacía, sin error.

## Out of Scope

- Login, registro y sesión real (RF-08, RF-12, RF-13, RNF-06 de `PRD.md`) — el header `x-user-id`
  sigue siendo el mecanismo transitorio de FEAT-002; reemplazado en FEAT-004.
- Cualquier interfaz de usuario (RF-49 a RF-81 de `PRD.md`) — este ticket es exclusivamente backend;
  la consume `prd-FEAT-003b.md`.
- Modificación y eliminación de gastos (RF-02, RF-03, RF-04, RF-44 de `PRD.md`).
- Filtros, búsqueda u ordenamiento distinto al de más reciente primero.
- Resúmenes diarios y mensuales (RF-09 a RF-11 de `PRD.md`).

## Risks and Mitigations

- **Riesgo**: sin paginación por cursor, un usuario con exactamente 200 gastos no tiene forma de ver
  el resto desde este endpoint. **Mitigación**: aceptado — RNF-14 de `PRD.md` fija el tope en 200
  sin exigir cursor; se revisita si el uso real lo requiere.

## Dependencies

- `PRD.md` (PRD-001) — origen de RF-48 y RNF-14, citados sin prefijo de ticket.
- `prd-FEAT-002.md` — define el mecanismo `x-user-id` y el usuario de seed que FR-02 reutiliza.
- `AGENTS.md` — convención `routes → service → repository`.
- `apps/api` (FEAT-002), ya mergeado a `main` — este ticket le agrega `GET /expenses`.

## Historial de Cambios

- **v1.0** — versión inicial, sub-ticket a del split de FEAT-003.
