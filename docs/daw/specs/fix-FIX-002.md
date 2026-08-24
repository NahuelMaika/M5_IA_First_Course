# Fix-plan FIX-002: Select popup mal posicionado dentro de Dialog

| Field | Value |
|-------|-------|
| Ticket | FIX-002 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-002.md |
| Date | 2026-08-24 |
| Spec loops | 1 |

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

### Loop 1 (implementado, se mantiene)

1. `apps/web/src/app/layout.tsx:16` — agregar la clase Tailwind `isolate` al elemento `<body>`
   (equivalente a `isolation: isolate`). Único archivo a modificar: el impact scan de PLAN confirmó
   que es el único `<body>`/root layout del árbol, y que los 4 componentes que usan Portal (`Select`,
   `Dialog`, `ConfirmDialog`, `Toast` — todos en `apps/web/src/components/ui/`) se benefician sin
   necesitar cambios individuales, porque todos anexan al mismo `document.body`.

2. `apps/web/src/app/layout.test.tsx` (nuevo) — test de regresión que renderiza `RootLayout` y
   verifica que el elemento `<body>` resultante carga la clase `isolate`. Esto prueba directamente
   la causa raíz, a diferencia de un test de click en jsdom (ver nota abajo).

**Insuficiente por sí solo** — ver `rca-FIX-002.md` Loop 2: el `isolate` en `<body>` era necesario
pero no alcanzaba, porque la clase `z-[60]` estaba en el nodo equivocado dentro del árbol del
`Select`.

### Loop 2 (nuevo)

3. `apps/web/src/components/ui/select.tsx:55` — agregar la clase `z-[60]` al
   `SelectPrimitive.Positioner` (hoy solo tiene `data-slot="select-positioner"` y `sideOffset={4}`,
   sin clase). El `Positioner` se renderiza con `position: fixed` (código fuente de
   `@base-ui/react` v1.7.0, `SelectPositioner.mjs:23/29`) y por lo tanto crea su propio stacking
   context; sin `z-index` ahí, el `z-[60]` que ya tiene el `Popup` hijo (`select.tsx:59`, sin
   cambios) nunca compite contra el `z-50` del `Dialog`. Se mantiene el `z-[60]` del `Popup` — no
   hace daño y documenta la intención en ese nivel también.

4. `apps/web/src/components/ui/select.test.tsx` — el test de regresión existente
   ("select-popup carries a z-* class...") solo assertea la clase sobre `[data-slot="select-popup"]`,
   no sobre `[data-slot="select-positioner"]` — el impact scan de PLAN señaló que ese test seguiría
   en verde aunque se borrara la clase del `Positioner` y quedara solo la del `Popup` (el defecto que
   causó este bug). Se agrega una aserción sobre `[data-slot="select-positioner"]` en el mismo test
   (o uno nuevo junto a él) para que la causa raíz real quede cubierta.

## Dependencies between steps

Ninguna entre los pasos 1-2 (loop 1, ya implementados) y 3-4 (loop 2): son cambios en archivos
distintos, sin overlap.

## Error handling

No aplica: `isolation: isolate` y `z-*` son propiedades CSS estándar soportadas en todos los
navegadores modernos, sin fallback necesario ni modo de fallo.

## Tests

- [ ] **Regression test loop 1** — `apps/web/src/app/layout.test.tsx`: renderiza `RootLayout` y
      verifica que el `<body>` tiene la clase `isolate`. Ya implementado, sigue en verde.
- [ ] **Regression test loop 2 (nuevo)** — `apps/web/src/components/ui/select.test.tsx`: agregar
      una aserción de que `[data-slot="select-positioner"]` carga la clase `z-[60]` (o superior).
      Falla ANTES del fix (la clase no existe en el Positioner), pasa DESPUÉS. Esto prueba la causa
      raíz real (loop 2), a diferencia del test existente que solo mira el `Popup`.
- [ ] Confirmar que la suite existente de `apps/web/src/components/ui/select.test.tsx` sigue en
      verde, en particular el test `"select-popup carries a z-* class with a numeric value greater
      than dialog-popup's z-50"` (Loop 2 de FEAT-005a) y `"is clickable when mounted inside an open
      Dialog"`.

> **Nota — límite conocido de los tests unitarios para este bug:** el test "is clickable when
> mounted inside an open Dialog" (`select.test.tsx`) usa `userEvent.click()` sobre jsdom, que
> despacha el evento directamente sobre el nodo del DOM sin hit-testing real de stacking/pintura —
> por eso ese test pasaba incluso antes de este fix (ambos loops), sin detectar el bug real que
> reportó el usuario en el navegador. Ni `isolation: isolate` ni el z-index computado real son
> verificables end-to-end con la suite de Vitest actual (no hay Playwright/e2e en el proyecto); los
> tests de `layout.test.tsx` y `select.test.tsx` verifican las causas raíz (las clases CSS
> aplicadas en los nodos correctos), que es lo determinístico en jsdom. Esto no bloquea el fix — es
> una limitación de cobertura pre-existente en el proyecto, no introducida por este ticket.

## Regression risk

**Low.** Dos clases CSS (`isolate` en `<body>`, `z-[60]` en el `Positioner`), sin lógica, sin datos,
sin cambio de comportamiento fuera del stacking context. Impact scan de loop 2 confirmó que
`select.tsx` es el único consumidor del patrón Portal+Positioner+Popup en el repo (Dialog y
ConfirmDialog no usan Positioner) y que el único call site de `Select`
(`apps/web/src/components/expense-edit-dialog.tsx`) no se ve afectado, porque el cambio no toca la
firma del componente. Ningún test existente hace
snapshot del layout raíz o de sus clases.

## Rollback plan

Trivial: revertir el commit del loop 2 (una línea de código de producción + una aserción de test),
sin migraciones ni datos involucrados. No hay indicadores de monitoreo aplicables — es un cambio
visual verificable inmediatamente en el navegador o con el test de regresión.
