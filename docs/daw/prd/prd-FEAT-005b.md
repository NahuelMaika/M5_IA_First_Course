# PRD FEAT-005b: ABM de categorías

| Field | Value |
|-------|-------|
| Ticket | FEAT-005b |
| Tracker | none |
| Date | 2026-08-23 |
| PRD loops | 0 |

## Context and Problem

El motor de categorización (FEAT-001a/b, FEAT-002) ya crea categorías propias implícitamente vía el
marcador `#nombre` al cargar un gasto, y `apps/api/src/repositories/category-repository.ts` ya tiene
la lógica de creación y de listado visible (predefinidas + propias). Lo que falta es exponerlo: no
hay rutas ni UI para que el usuario administre sus categorías directamente — crear una sin pasar por
un gasto, renombrarla o darla de baja.

Este es el segundo sub-ticket del split de FEAT-005 (ver `prd-FEAT-005.md`). Depende de
`prd-FEAT-005a.md`: reutiliza el diálogo modal de edición y el diálogo de confirmación destructiva
que ese ticket construye, en vez de duplicarlos para categorías.

## Goals

- Permitir crear, renombrar y dar de baja (lógica) una categoría propia, sin tocar el motor de
  categorización automática por keywords (`kb.md`, cerrado y versionado).
- Listar las categorías visibles para el usuario (predefinidas + propias), distinguiendo
  visualmente las predefinidas.
- Garantizar que ni las categorías predefinidas ni las de otro usuario puedan modificarse o darse
  de baja desde este ABM.

## Functional Requirements

- FR-01: El sistema debe listar, para un usuario autenticado, las categorías predefinidas y las
  propias (FR-06 de `prd-FEAT-005.md`; RF-21 de `PRD.md`).
- FR-02: El sistema debe permitir a un usuario autenticado crear una categoría propia indicando
  únicamente su nombre (FR-07 de `prd-FEAT-005.md`; RF-16 de `PRD.md`).
- FR-03: El sistema debe rechazar la creación de una categoría con nombre vacío (FR-08 de
  `prd-FEAT-005.md`; RF-19 de `PRD.md`).
- FR-04: El sistema debe rechazar la creación de una categoría cuyo nombre, tras normalizarse
  (minúsculas, sin acentos, espacios colapsados), coincida con el de otra categoría vigente visible
  para ese usuario (FR-09 de `prd-FEAT-005.md`; RF-20, RF-46, RF-47 de `PRD.md`).
- FR-05: El sistema debe permitir a un usuario autenticado renombrar una categoría propia, sin
  alterar la referencia de los gastos ya asociados a ella (FR-10 de `prd-FEAT-005.md`; RF-17 de
  `PRD.md`).
- FR-06: El sistema debe permitir a un usuario autenticado dar de baja (lógica) una categoría
  propia, solicitando confirmación antes de ejecutarla; los gastos que ya la tenían asignada
  conservan la referencia intacta (FR-11 de `prd-FEAT-005.md`; RF-18 de `PRD.md`).
- FR-07: El sistema debe rechazar la modificación o baja de una categoría predefinida o de una
  categoría propia de otro usuario (FR-12, FR-25 de `prd-FEAT-005.md`; RF-17, RF-18 de `PRD.md`).
- FR-08: Una categoría creada por el usuario a través de este ABM nunca participa de la
  categorización automática por palabra clave — sólo queda disponible para asignación manual (FR-13
  de `prd-FEAT-005.md`; no modifica `kb.md`).
- FR-09: El sistema debe distinguir una categoría predefinida con una marca visual separada de su
  nombre, perceptible por lector de pantalla y no dependiente sólo del color (FR-23 de
  `prd-FEAT-005.md`; RF-76 de `PRD.md`).

## Non-Functional Requirements

- NFR-01: El nombre de una categoría no debe superar los 60 caracteres (NFR-02 de
  `prd-FEAT-005.md`; RNF-07 de `PRD.md`).
- NFR-02: Cada endpoint nuevo (`POST /categories`, `PATCH /categories/:id`,
  `DELETE /categories/:id`, `GET /categories`) debe seguir la separación de capas
  `routes → service → repository` de `AGENTS.md`, leyendo `fastify.prisma` en vez de un singleton
  importado (NFR-04 de `prd-FEAT-005.md`).
- NFR-03: El ABM de categorías debe reutilizar el diálogo modal de edición y el diálogo de
  confirmación destructiva construidos por `prd-FEAT-005a.md`, sin duplicar su implementación.

## Acceptance Criteria

- AC-01 (FR-02, FR-03): IF un usuario autenticado intenta crear una categoría con nombre vacío,
  THEN THE system SHALL rechazar la operación y SHALL NOT crearla.
- AC-02 (FR-02, FR-04): IF un usuario autenticado intenta crear una categoría cuyo nombre
  normalizado coincide con el de otra categoría vigente visible para él, THEN THE system SHALL
  rechazar la operación y SHALL NOT crear el duplicado.
- AC-03 (FR-02): WHEN un usuario autenticado crea una categoría con nombre válido y único, THE
  system SHALL crearla y SHALL dejarla disponible para asignación manual.
- AC-04 (FR-05): WHEN un usuario autenticado renombra una categoría propia, THE system SHALL
  actualizar su nombre y los gastos ya asociados SHALL conservar la referencia.
- AC-05 (FR-06): WHEN un usuario autenticado confirma la baja de una categoría propia, THE system
  SHALL marcarla inactiva, SHALL dejarla fuera de la asignación a nuevos gastos, y los gastos que ya
  la tenían asignada SHALL conservar la referencia intacta.
- AC-06 (FR-06): IF un usuario autenticado cancela la confirmación de baja de una categoría propia,
  THEN THE categoría SHALL permanecer sin cambios.
- AC-07 (FR-07): IF un usuario autenticado intenta modificar o dar de baja una categoría
  predefinida o propia de otro usuario, THEN THE system SHALL denegar la operación.
- AC-08 (FR-01): WHEN un usuario autenticado consulta la lista de categorías, THE system SHALL
  incluir tanto las predefinidas como las propias.
- AC-09 (FR-08): WHEN un usuario autenticado crea una categoría propia vía el ABM, THE system SHALL
  NOT compararla nunca contra el Lugar de un gasto para categorización automática — sólo SHALL
  quedar disponible para asignación manual.
- AC-10 (FR-09): WHEN un usuario autenticado visualiza la lista de categorías, THE system SHALL
  marcar las predefinidas con un indicador visual distinguible independientemente del color y
  perceptible por lector de pantalla.

## Out of Scope

- Edición y eliminación de gastos (FR-01 a FR-05 de `prd-FEAT-005.md`), y los componentes de modal
  de edición / confirmación destructiva en sí mismos — cubiertos por `prd-FEAT-005a.md`, del que
  este ticket depende.
- Keywords propias para categorías creadas por el usuario, o cualquier cambio a `kb.md` (FR-08).
- Resúmenes diarios y mensuales (FR-14 a FR-19, FR-22 de `prd-FEAT-005.md`) — cubierto por
  `prd-FEAT-005c.md`.
- Desactivar o modificar categorías predefinidas desde cualquier flujo de usuario.

## Risks and Mitigations

- **Riesgo**: si `prd-FEAT-005a.md` no deja el modal/confirmación con una interfaz suficientemente
  genérica, este ticket se ve forzado a duplicarlos. **Mitigación**: bloqueante — PLAN de este
  ticket debe verificar la interfaz real que dejó FEAT-005a antes de diseñar la UI de categorías.

## Dependencies

- `PRD.md` (PRD-001) — origen de todos los RF/RNF/AC citados sin prefijo de ticket.
- `prd-FEAT-005.md` — PRD padre (índice) de este split.
- `prd-FEAT-005a.md` — **dependencia dura**: provee el modal de edición y el diálogo de
  confirmación destructiva que este ticket reutiliza (NFR-03).
- `prd-FEAT-002.md` — creación implícita de categoría vía marcador `#`,
  `apps/api/src/repositories/category-repository.ts` que este ticket extiende con rutas propias.
- `prd-FEAT-004a.md` / `prd-FEAT-004b.md` — autenticación y sesión real, base del control de acceso
  de FR-07.
- `AGENTS.md` — convención `routes → service → repository`; regla de `kb.md` cerrado y versionado
  que acota FR-08.
- `kb.md` — tabla de keywords de categorización automática, no modificada por este ticket.

## Historial de Cambios

- **v1.0** — versión inicial, sub-ticket b del split de FEAT-005.
