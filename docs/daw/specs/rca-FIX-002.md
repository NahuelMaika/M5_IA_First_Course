# RCA FIX-002: Select popup mal posicionado dentro de Dialog (Categoría en editor de gastos)

| Field | Value |
|-------|-------|
| Ticket | FIX-002 |
| Tracker | none |
| Date | 2026-08-24 |

## Symptom

Al editar un gasto, el desplegable de Categoría abre su popup en la posición correcta respecto del
trigger, pero visualmente queda **detrás** del `Dialog`. Como consecuencia, el puntero nunca llega a
las opciones del listado: el click "atraviesa" hacia el `Dialog` y este lo interpreta como un click
fuera de su contenido (outside press), cerrándose antes de que se pueda seleccionar nada.

## Root cause

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

## Affected component

`apps/web/src/app/layout.tsx` (root layout) — afecta a todo componente basado en `Portal` de
`@base-ui/react` (Dialog, Select, y cualquier futuro Popover/Tooltip), no solo al caso puntual de
Categoría en el editor de gastos.

## Related PRD

`prd-FEAT-005a.md` — revisado, sin gap: es un defecto puro de implementación (misma categoría que el
bug de z-index de FEAT-005a loop 2, documentado en su momento como "pure implementation defect, no
PRD change needed"). No requiere FR/AC nuevos.

## Fix (preview, se detalla en el fix-plan de PLAN)

Agregar `isolation: isolate` (clase Tailwind `isolate`) al `<body>` de
`apps/web/src/app/layout.tsx`.
