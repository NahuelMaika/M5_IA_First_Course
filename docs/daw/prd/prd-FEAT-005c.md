# PRD FEAT-005c: Resúmenes diarios y mensuales

| Field | Value |
|-------|-------|
| Ticket | FEAT-005c |
| Tracker | none |
| Date | 2026-08-23 |
| PRD loops | 0 |

## Context and Problem

`PRD.md` prometió, desde el objetivo original del producto, un resumen diario (gastos del día +
acumulado del mes) y uno mensual (total por categoría, comparado contra el mes anterior). Ninguno de
los dos existe todavía: no hay modelo de datos, ni endpoint, ni pantalla.

Este es el tercer sub-ticket del split de FEAT-005 (ver `prd-FEAT-005.md`). Es independiente de
`prd-FEAT-005a.md` y `prd-FEAT-005b.md` — no reutiliza ni requiere ninguno de sus componentes, y
puede implementarse en paralelo a `prd-FEAT-005b.md`.

## Goals

- Generar el resumen de un día ya cerrado la primera vez que el usuario lo consulta, con el detalle
  de sus gastos y el acumulado del mes.
- Generar el resumen de un mes ya cerrado con el total por categoría, ordenado de mayor a menor y
  comparado contra el mes anterior.
- Que cada resumen, una vez generado, quede congelado — editar o eliminar un gasto de un período ya
  resumido no lo altera.

## Functional Requirements

- FR-01: El sistema debe generar el resumen de un día ya cerrado la primera vez que el usuario lo
  consulta con posterioridad a ese cierre (FR-14 de `prd-FEAT-005.md`; RF-09 de `PRD.md`).
- FR-02: El resumen diario debe incluir el detalle de los gastos de ese día y el total acumulado del
  mes hasta ese día (FR-15 de `prd-FEAT-005.md`; RF-10 de `PRD.md`).
- FR-03: El sistema debe generar, para cada mes ya cerrado, un resumen con el total gastado por
  categoría ordenado de mayor a menor, incluyendo la comparación de cada categoría contra el mes
  anterior (FR-16 de `prd-FEAT-005.md`; RF-11 de `PRD.md`).
- FR-04: El sistema debe generar como máximo un resumen por usuario, tipo y período; una vez
  generado, el resumen queda congelado — editar o eliminar un gasto de un período ya resumido no
  regenera ni modifica ese resumen (FR-17 de `prd-FEAT-005.md`; RF-38 de `PRD.md`).
- FR-05: El sistema debe limitar la generación retroactiva de resúmenes a los 7 días cerrados y los
  12 meses cerrados más recientes (FR-18 de `prd-FEAT-005.md`; RF-39 de `PRD.md`).
- FR-06: El sistema debe calcular los límites de día y de mes en una única zona horaria de negocio
  configurada para toda la aplicación (FR-19 de `prd-FEAT-005.md`; RF-40 de `PRD.md`).
- FR-07: El sistema debe presentar cada resumen en una superficie propia, con su tipo y período como
  encabezado y el total del período como su dato de mayor peso visual (FR-22 de
  `prd-FEAT-005.md`; RF-73 de `PRD.md`).

## Non-Functional Requirements

- NFR-01: El listado de resúmenes debe devolver 30 elementos por consulta de forma predeterminada,
  admitiendo hasta 100; un valor fuera de rango debe rechazarse, no ajustarse en silencio (NFR-03 de
  `prd-FEAT-005.md`; RNF-14 de `PRD.md`).
- NFR-02: Cada endpoint nuevo (`GET /summaries`) debe seguir la separación de capas
  `routes → service → repository` de `AGENTS.md`, leyendo `fastify.prisma` en vez de un singleton
  importado (NFR-04 de `prd-FEAT-005.md`).

## Acceptance Criteria

- AC-01 (FR-01, FR-02): WHEN un usuario autenticado con gastos en un día ya cerrado consulta sus
  resúmenes, THE system SHALL generar (una única vez) el resumen de ese día con el detalle de sus
  gastos y el total acumulado del mes.
- AC-02 (FR-01): IF un usuario autenticado no registró ningún gasto en un día ya cerrado, THEN no
  SHALL existir resumen para ese día.
- AC-03 (FR-03): WHEN un usuario autenticado con gastos en un mes ya cerrado consulta sus
  resúmenes, THE system SHALL generar (una única vez) el resumen mensual con el total por categoría
  ordenado de mayor a menor y la comparación contra el mes anterior.
- AC-04 (FR-03): IF es el primer mes de uso del usuario y no existe mes anterior con el cual
  comparar, THEN no SHALL existir resumen para ese mes.
- AC-05 (FR-04): WHEN ya existe un resumen generado para un usuario/tipo/período y luego se edita o
  elimina un gasto de ese período (en otro ticket), THE system SHALL mantener ese resumen sin
  cambios.
- AC-06 (FR-05): IF se solicita un resumen fuera de la ventana de retroactividad (7 días cerrados o
  12 meses cerrados), THEN THE system SHALL NOT generarlo.
- AC-07 (FR-06): WHEN el sistema calcula los límites de un día o un mes, THE system SHALL usar una
  única zona horaria de negocio configurada de forma consistente.
- AC-08 (FR-07): WHEN un usuario autenticado visualiza la pantalla de resúmenes, THE system SHALL
  presentar cada resumen en una superficie propia con su tipo y período como encabezado y el total
  del período como su dato de mayor peso visual.

## Out of Scope

- Edición y eliminación de gastos (`prd-FEAT-005a.md`) y ABM de categorías (`prd-FEAT-005b.md`) —
  este ticket sólo lee gastos y categorías ya existentes, no los modifica.
- Notificaciones push, email o cualquier mecanismo proactivo — los resúmenes son consultados
  on-demand (`AGENTS.md` prohíbe cron jobs y background jobs).
- Recalcular o regenerar un resumen ya generado (FR-04) — es una foto congelada por diseño.
- Cualquier filtro, búsqueda o tipo de resumen distinto al diario y al mensual ya especificados.

## Risks and Mitigations

- **Riesgo**: no existe precedente de un modelo `Summary` en el schema de Prisma; su diseño de
  unicidad (usuario + tipo + período) y almacenamiento es una decisión de PLAN, no de este PRD.
  **Mitigación**: ninguna en DEFINE — queda explícitamente delegado a PLAN.
- **Riesgo**: FR-04 (resumen congelado) puede sorprender a un usuario que edita o borra un gasto en
  `prd-FEAT-005a.md` esperando ver el resumen del período actualizado. **Mitigación**: decisión
  explícita del usuario durante DEFINE de `prd-FEAT-005.md`; a evaluar en PLAN si conviene alguna
  señal en la UI que lo explicite.

## Dependencies

- `PRD.md` (PRD-001) — origen de todos los RF/RNF/AC citados sin prefijo de ticket.
- `prd-FEAT-005.md` — PRD padre (índice) de este split.
- `prd-FEAT-003a.md` — lee los gastos ya persistidos por ese ticket.
- `prd-FEAT-004a.md` / `prd-FEAT-004b.md` — autenticación y sesión real, requisito para identificar
  al usuario dueño de cada resumen.
- `packages/domain/src/temporal.ts` — ya implementa el piso de retroactividad de 12 meses
  (`retroactivityFloor`), reutilizable para FR-05.
- `AGENTS.md` — convención `routes → service → repository`; prohibición de cron/background jobs
  que acota el alcance a generación on-demand.

## Historial de Cambios

- **v1.0** — versión inicial, sub-ticket c del split de FEAT-005.
