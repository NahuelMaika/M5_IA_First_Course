# Fix-plan FIX-002: Select popup mal posicionado dentro de Dialog

| Field | Value |
|-------|-------|
| Ticket | FIX-002 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-002.md |
| Date | 2026-08-24 |
| Spec loops | 0 |

## Problem

Al editar un gasto, el desplegable de Categoría abre su popup en la posición correcta respecto del
trigger, pero visualmente queda por detrás del `Dialog`. El puntero nunca llega a las opciones del
listado: el click "atraviesa" hacia el `Dialog`, que lo interpreta como un click fuera de su
contenido (outside press) y se cierra antes de que se pueda seleccionar nada.

## Root cause

`apps/web/src/app/layout.tsx` no declara `isolation: isolate` en el `<body>` raíz. Tanto `Dialog`
como `Select` usan `@base-ui/react`'s `Portal`, anexado por defecto a `document.body`. Sin un
stacking context común garantizado en la raíz del documento, el `z-index` de cada popup (`z-50`
Dialog, `z-[60]` Select) no se compara de forma confiable entre ambos árboles — la doc oficial de
Base UI recomienda explícitamente `isolation: isolate` en el layout raíz de la app para este
escenario. Detalle completo en `docs/daw/specs/rca-FIX-002.md`.

## Solution — steps

1. `apps/web/src/app/layout.tsx:16` — agregar la clase Tailwind `isolate` al elemento `<body>`
   (equivalente a `isolation: isolate`). Único archivo a modificar: el impact scan de PLAN confirmó
   que es el único `<body>`/root layout del árbol, y que los 4 componentes que usan Portal (`Select`,
   `Dialog`, `ConfirmDialog`, `Toast` — todos en `apps/web/src/components/ui/`) se benefician sin
   necesitar cambios individuales, porque todos anexan al mismo `document.body`.

2. `apps/web/src/app/layout.test.tsx` (nuevo) — test de regresión que renderiza `RootLayout` y
   verifica que el elemento `<body>` resultante carga la clase `isolate`. Esto prueba directamente
   la causa raíz, a diferencia de un test de click en jsdom (ver nota abajo).

## Dependencies between steps

Ninguna — un solo cambio de una línea, con su test acompañante.

## Error handling

No aplica: `isolation: isolate` es una propiedad CSS estándar soportada en todos los navegadores
modernos (Baseline desde 2017), sin fallback necesario ni modo de fallo.

## Tests

- [ ] **Regression test** — `apps/web/src/app/layout.test.tsx`: renderiza `RootLayout` y verifica
      que el `<body>` tiene la clase `isolate`. Falla ANTES del fix (la clase no existe), pasa
      DESPUÉS.
- [ ] Confirmar que la suite existente de `apps/web/src/components/ui/select.test.tsx` sigue en
      verde, en particular el test `"select-popup carries a z-* class with a numeric value greater
      than dialog-popup's z-50"` (Loop 2 de FEAT-005a) y `"is clickable when mounted inside an open
      Dialog"`.

> **Nota — límite conocido de los tests unitarios para este bug:** el test "is clickable when
> mounted inside an open Dialog" (`select.test.tsx`) usa `userEvent.click()` sobre jsdom, que
> despacha el evento directamente sobre el nodo del DOM sin hit-testing real de stacking/pintura —
> por eso ese test pasaba incluso antes de este fix, sin detectar el bug real que reportó el
> usuario en el navegador. `isolation: isolate` no es verificable end-to-end con la suite de Vitest
> actual (no hay Playwright/e2e en el proyecto); el test de `layout.test.tsx` verifica la causa raíz
> (la clase CSS aplicada), que es lo que sí es determinístico en jsdom. Esto no bloquea el fix — es
> una limitación de cobertura pre-existente en el proyecto, no introducida por este ticket.

## Regression risk

**Low.** Cambio de una sola clase CSS en el `<body>` raíz, sin lógica, sin datos, sin cambio de
comportamiento fuera del stacking context. Impact scan confirmó que ningún test existente hace
snapshot del layout raíz o de sus clases.

## Rollback plan

Trivial: revertir el commit (una línea, sin migraciones ni datos involucrados). No hay indicadores
de monitoreo aplicables — es un cambio visual verificable inmediatamente en el navegador o con el
test de regresión.
