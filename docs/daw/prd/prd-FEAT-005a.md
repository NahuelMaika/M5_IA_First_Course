# PRD FEAT-005a: ABM de gastos — edición y eliminación

| Field | Value |
|-------|-------|
| Ticket | FEAT-005a |
| Tracker | none |
| Date | 2026-08-23 |
| PRD loops | 0 |

## Context and Problem

FEAT-002 dejó `POST /expenses` (alta) y FEAT-003a/b dejaron `GET /expenses` y su listado en UI. Con
eso el usuario puede cargar y ver sus gastos, pero no corregir uno mal cargado ni eliminarlo. Este es
el primer sub-ticket del split de FEAT-005 (ver `prd-FEAT-005.md`): agrega edición y eliminación de
gastos, junto con el diálogo modal de edición y el diálogo de confirmación destructiva que
`prd-FEAT-005b.md` (ABM de categorías) va a reutilizar.

Es el primero de la cadena porque construye los dos componentes de UI genéricos (modal de edición,
confirmación destructiva) que el ABM de categorías necesita — sin depender a su vez de nada nuevo de
este ticket.

## Goals

- Permitir editar Monto, Lugar y Fecha de un gasto propio, y reasignar su categoría manualmente, sin
  disparar categorización automática.
- Permitir eliminar un gasto propio de forma permanente, con confirmación previa.
- Dejar construidos el diálogo modal de edición y el diálogo de confirmación destructiva como
  componentes reutilizables por el resto del split.

## Functional Requirements

- FR-01: El sistema debe permitir a un usuario autenticado modificar Monto, Lugar y Fecha de un
  gasto propio (FR-01 de `prd-FEAT-005.md`; RF-02 de `PRD.md`).
- FR-02: El sistema debe permitir a un usuario autenticado reasignar manualmente la categoría de un
  gasto propio como parte de su edición, sin disparar categorización automática (FR-02 de
  `prd-FEAT-005.md`; RF-42 de `PRD.md`).
- FR-03: El sistema debe conservar la categoría vigente de un gasto cuando sólo se modifica su campo
  Lugar (FR-03 de `prd-FEAT-005.md`; RF-33 de `PRD.md`).
- FR-04: El sistema debe permitir a un usuario autenticado eliminar un gasto propio, solicitando
  confirmación antes de ejecutar la baja (FR-04 de `prd-FEAT-005.md`; RF-03, RF-04 de `PRD.md`).
- FR-05: El sistema debe eliminar el gasto de forma permanente tras la confirmación, sin conservar
  copia recuperable (FR-05 de `prd-FEAT-005.md`; RF-44 de `PRD.md`).
- FR-06: El sistema debe editar un gasto en un diálogo modal, con los campos precargados con los
  valores vigentes, cerrándolo automáticamente tras un guardado exitoso y descartando cambios sin
  confirmación adicional al cancelar, presionar `Escape` o hacer clic afuera (FR-20 de
  `prd-FEAT-005.md`; RF-58, RF-78, RF-59 de `PRD.md`).
- FR-07: El sistema debe confirmar la eliminación de un gasto dentro de su propia interfaz (nunca
  con el diálogo nativo del navegador), identificando por nombre al gasto afectado, con foco inicial
  en la acción destructiva y los verbos "Eliminar"/"Cancelar" (FR-21 de `prd-FEAT-005.md`; RF-55,
  RF-56, RF-57, RF-77 de `PRD.md`).
- FR-08: El sistema debe denegar el acceso, la modificación o la eliminación de un gasto que no
  pertenece al usuario autenticado (FR-24 de `prd-FEAT-005.md`; RF-02, RF-03 de `PRD.md`).

## Non-Functional Requirements

- NFR-01: La modificación y la eliminación de un gasto deben completarse en menos de 3 segundos,
  medido en p95 (NFR-01 de `prd-FEAT-005.md`; RNF-01 de `PRD.md`).
- NFR-02: Cada endpoint nuevo (`PATCH /expenses/:id`, `DELETE /expenses/:id`) debe seguir la
  separación de capas `routes → service → repository` de `AGENTS.md`, leyendo `fastify.prisma` en
  vez de un singleton importado (NFR-04 de `prd-FEAT-005.md`).
- NFR-03: El modal de edición y el diálogo de confirmación deben cumplir contraste WCAG 2.1 AA y
  destino táctil mínimo de 24×24 px CSS (NFR-05 de `prd-FEAT-005.md`; RNF-10, RNF-11 de `PRD.md`).

## Acceptance Criteria

- AC-01 (FR-01): WHEN un usuario autenticado edita Monto, Lugar y/o Fecha de un gasto propio y
  confirma, THE system SHALL actualizarlo con los nuevos valores en menos de 3 segundos.
- AC-02 (FR-08): IF un usuario autenticado intenta editar un gasto que no le pertenece, THEN THE
  system SHALL denegar la operación y SHALL NOT modificarlo.
- AC-03 (FR-03): WHEN un usuario autenticado edita únicamente el Lugar de un gasto propio, THE
  system SHALL conservar su categoría vigente sin cambios.
- AC-04 (FR-02): WHEN un usuario autenticado reasigna manualmente la categoría de un gasto propio
  durante su edición, THE system SHALL actualizar esa asociación.
- AC-05 (FR-04, FR-05): WHEN un usuario autenticado confirma la eliminación de un gasto propio, THE
  system SHALL eliminarlo de forma permanente y SHALL quitarlo de la lista en menos de 3 segundos.
- AC-06 (FR-04): IF un usuario autenticado cancela la confirmación de eliminación de un gasto, THEN
  THE gasto SHALL permanecer sin cambios.
- AC-07 (FR-08): IF un usuario autenticado intenta eliminar un gasto que no le pertenece, THEN THE
  system SHALL denegar la operación y SHALL NOT eliminarlo.
- AC-08 (FR-06): WHEN un usuario autenticado abre el diálogo de edición de un gasto, THE system
  SHALL precargar los valores vigentes y SHALL cerrar el diálogo automáticamente tras un guardado
  exitoso.
- AC-09 (FR-06): IF un usuario autenticado cancela el diálogo de edición, presiona `Escape` o hace
  clic afuera, THEN THE system SHALL descartar los cambios sin guardar sin pedir confirmación
  adicional.
- AC-10 (FR-07): WHEN un usuario autenticado abre la confirmación de eliminar un gasto, THE system
  SHALL identificar el gasto afectado por su nombre y SHALL ubicar el foco inicial en la acción
  destructiva.

## Out of Scope

- Alta de gastos (RF-01 de `PRD.md`, ya cubierto por FEAT-002).
- Listado de gastos (RF-48 de `PRD.md`, ya cubierto por FEAT-003a/b).
- ABM de categorías (FR-06 a FR-13, FR-23, FR-25 de `prd-FEAT-005.md`) — cubierto por
  `prd-FEAT-005b.md`, que reutiliza el modal y la confirmación que este ticket construye.
- Resúmenes diarios y mensuales (FR-14 a FR-19, FR-22 de `prd-FEAT-005.md`) — cubierto por
  `prd-FEAT-005c.md`.
- Login, registro y sesión (ya cubiertos por FEAT-004a/b).

## Risks and Mitigations

- **Riesgo**: al construir el modal de edición y la confirmación destructiva como componentes
  reutilizables, un diseño demasiado acoplado a "gasto" obligaría a duplicar código en
  `prd-FEAT-005b.md`. **Mitigación**: PLAN debe definir estos dos componentes con una interfaz
  genérica (título, campos, acción de guardado/eliminación) desde el principio.

## Dependencies

- `PRD.md` (PRD-001) — origen de todos los RF/RNF/AC citados sin prefijo de ticket.
- `prd-FEAT-005.md` — PRD padre (índice) de este split.
- `prd-FEAT-002.md` — alta de gastos, mecanismo de categorización automática que FR-03 preserva.
- `prd-FEAT-003a.md` / `prd-FEAT-003b.md` — listado de gastos (API + UI) que este ticket extiende.
- `prd-FEAT-004a.md` / `prd-FEAT-004b.md` — autenticación y sesión real, base del control de acceso
  de FR-08.
- `AGENTS.md` — convención `routes → service → repository`.

## Historial de Cambios

- **v1.0** — versión inicial, sub-ticket a del split de FEAT-005.
