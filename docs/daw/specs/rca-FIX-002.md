# RCA FIX-002: Select popup mal posicionado dentro de Dialog (Categoría en editor de gastos)

| Field | Value |
|-------|-------|
| Ticket | FIX-002 |
| Tracker | none |
| Date | 2026-08-24 |
| RCA loops | 1 |

## Symptom

Al editar un gasto, el desplegable de Categoría abre su popup en la posición correcta respecto del
trigger, pero visualmente queda **detrás** del `Dialog`. Como consecuencia, el puntero nunca llega a
las opciones del listado: el click "atraviesa" hacia el `Dialog` y este lo interpreta como un click
fuera de su contenido (outside press), cerrándose antes de que se pueda seleccionar nada.

## Root cause

### Loop 1 (incompleto — corregido en Loop 2 abajo)

`apps/web/src/app/layout.tsx` no declara `isolation: isolate` en el `<body>` raíz de la aplicación.

Tanto `Dialog` (`apps/web/src/components/ui/dialog.tsx`) como `Select`
(`apps/web/src/components/ui/select.tsx`) usan `@base-ui/react`'s `Portal`, que por defecto anexa su
contenido a `document.body`. Cada `Portal` es independiente: se monta en un momento distinto (el
Dialog al abrirse, el Select al abrir su desplegable, ya con el Dialog abierto) y, sin un stacking
context común garantizado en la raíz del documento, el `z-index` de cada popup (`z-50` para el
Dialog, `z-[60]` para el Select) no se compara de forma confiable entre ambos árboles — la
documentación oficial de Base UI señala esto explícitamente y recomienda `isolation: isolate` en el
layout raíz de la app precisamente para evitarlo (Quick start → Set up → Portals).

Esto es distinto del bug ya corregido en FEAT-005a loop 2 (commit `21092a6`), que subió el `z-index`
del Select de por debajo del Dialog a `z-[60]` — esa corrección es necesaria pero no suficiente sin
el `isolation: isolate` en la raíz, porque sin él el navegador no garantiza que ambos popups
comparen sus `z-index` en el mismo stacking context.

**Este diagnóstico es incompleto.** El fix de `isolate` en `<body>` se implementó y verificó (commit
`b499edb`), pero el bug persistió en pruebas manuales del PR #11. Ver Loop 2.

### Loop 2 — root cause real

El problema no está en la raíz del documento sino un nivel más abajo, en la estructura interna que
Base UI genera para `Select`.

`SelectPrimitive.Portal` no renderiza un único nodo con `z-index`: dentro de él hay un
`SelectPrimitive.Positioner` (el elemento flotante que Base UI posiciona con floating-ui) que
envuelve al `SelectPrimitive.Popup` (el elemento al que hoy le pusimos `z-[60]` en
`select.tsx:59`). El código fuente de Base UI (`SelectPositioner.mjs:23/29`, versión `1.7.0`)
confirma que el `Positioner` se renderiza con `position: 'fixed'` inline.

Un elemento `position: fixed` crea **su propio stacking context**, sin importar si tiene o no
`z-index` (a diferencia de `position: absolute/relative`, que solo lo crean con `z-index != auto`).
Como el `Positioner` no declara ningún `z-index`, esto significa que:

1. El `z-[60]` del `Popup` solo compite dentro del stacking context que crea el propio `Positioner`
   — nunca "sale" de él para compararse contra el Dialog.
2. El `Positioner` en sí, al no declarar `z-index`, se apila a nivel `auto` (equivalente a `0`)
   dentro del stacking context de la raíz (el mismo que `isolate` en `<body>` ya garantiza que sea
   compartido).
3. El `Dialog` sí tiene `z-50` puesto **directamente** en su propio elemento `fixed`
   (`dialog.tsx:31`), así que compite en ese mismo stacking context a nivel `50`.

Resultado: el `Positioner` completo del `Select` (con todo su contenido adentro, `z-[60]` incluido)
siempre queda por debajo del `Dialog`, sin importar el `isolate` en `<body>` ni el número de
`z-index` puesto en el `Popup`. El `isolate` de Loop 1 era necesario (evita que el orden de montaje
de los portales decida el resultado por casualidad) pero no suficiente: la clase de `z-index` estaba
en el nodo equivocado.

**Fix correcto:** mover (o agregar) la clase `z-[60]` al `SelectPrimitive.Positioner`, no solo al
`Popup`.

## Affected component

`apps/web/src/app/layout.tsx` (root layout) — afecta a todo componente basado en `Portal` de
`@base-ui/react` (Dialog, Select, y cualquier futuro Popover/Tooltip), no solo al caso puntual de
Categoría en el editor de gastos.

## Related PRD

`prd-FEAT-005a.md` — revisado, sin gap: es un defecto puro de implementación (misma categoría que el
bug de z-index de FEAT-005a loop 2, documentado en su momento como "pure implementation defect, no
PRD change needed"). No requiere FR/AC nuevos.

## Fix (preview, se detalla en el fix-plan de PLAN)

Loop 1 (ya aplicado, se mantiene): `isolation: isolate` (clase Tailwind `isolate`) en el `<body>` de
`apps/web/src/app/layout.tsx`.

Loop 2 (nuevo): agregar la clase `z-[60]` (o superior) al `SelectPrimitive.Positioner` en
`apps/web/src/components/ui/select.tsx`, no solo al `Popup` que la tiene hoy.
