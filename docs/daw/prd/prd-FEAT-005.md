# Parent PRD: ABM de gastos, ABM de categorías y resúmenes diarios/mensuales

| Metric | Value |
|--------|-------|
| Ticket | FEAT-005 |
| Date | 2026-08-23 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-005a | ABM de gastos — edición y eliminación | prd-FEAT-005a.md | none | active |
| FEAT-005b | ABM de categorías | prd-FEAT-005b.md | depends on a (reutiliza modal/confirmación) | pending |
| FEAT-005c | Resúmenes diarios y mensuales | prd-FEAT-005c.md | independiente | pending |

## Suggested implementation order

a → b → c (c puede implementarse en paralelo a b, ya que no comparte componentes con a).

## Original context

FEAT-002 dejó alta de gastos, FEAT-003a/b listado, y FEAT-004a/b autenticación real. Faltaban tres
cosas que `PRD.md` ya especifica en detalle pero nunca se implementaron: edición/eliminación de
gastos, un ABM real de categorías (el motor ya las crea implícitamente vía el marcador `#`, pero no
hay rutas ni UI para administrarlas), y los resúmenes diarios/mensuales prometidos desde el objetivo
original del producto (RF-09 a RF-11 de `PRD.md`).

El PRD original cubría las tres áreas en un solo documento (28 ACs, 3 módulos distintos de
`apps/api`/`apps/web`/schema de Prisma) — muy por encima del umbral de Scope Control (5-7 ACs). Se
dividió en tres sub-tickets independientemente shippables, en la misma línea que FEAT-001, FEAT-003
y FEAT-004. El PRD completo (25 FR, 5 NFR, 28 AC, `daw-validate-prd` PASSED) queda en el historial de
git de este archivo como referencia; el contenido vivo está en cada sub-PRD.
