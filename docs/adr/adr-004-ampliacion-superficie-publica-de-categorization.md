# ADR-004: Se amplía la superficie pública de `@ggasia/categorization` con `resolveCategoryName`

| Field | Value |
|-------|-------|
| Date | 2026-08-19 |
| Ticket | FEAT-002 |
| Status | Accepted |

## Context

FEAT-002 necesita resolver, en `apps/api`, el nombre de categoría marcado con `#nombre` contra las
categorías visibles del usuario, para decidir si reutiliza una existente o crea una nueva
(`resolveCategoryName`, `packages/categorization/src/category-name.ts`, ya construido en FEAT-001a).

Esa resolución depende de `normalize()` — la misma normalización que decide la unicidad de nombres
de categoría (`kb.md:186-189`: "es obligatorio que sea la misma"). `category-name.ts` ya la usa
internamente. Si `apps/api` necesitara este comportamiento sin poder importar `resolveCategoryName`
desde el paquete, la única alternativa sería reimplementar esa lógica de resolución en la capa de
servicio de la API — lo que exigiría reimplementar también, de un modo u otro, la normalización que
la sostiene. Es exactamente el drift que `kb.md` prohíbe: "cada etapa admitiría su propia
interpretación" si la normalización se reimplementa en más de un lugar (la misma preocupación que
ya motivó [[adr-001-tokenizacion-compartida-en-categorization]]).

`resolveCategoryName` ya existe, completo y probado, en `packages/categorization`. El único cambio
que falta es exponerlo por el barrel del paquete (`src/index.ts`) — hoy solo exporta `Categorizer`,
`createCategorizer`, `normalize` y `tokenize`.

## Options considered

### Option 1: reimplementar la resolución de nombre de categoría en `apps/api`
- **Pros:** ninguno que sobreviva al análisis — `packages/categorization` no cambia.
- **Cons:** duplica lógica ya escrita y probada (`category-name.ts`), y esa lógica depende de
  `normalize()`. Reimplementarla en `apps/api` es exactamente el caso que ADR-001 ya identificó como
  descartado sin más análisis (Option 3 de ADR-001): "es exactamente el drift que `kb.md` prohíbe".

### Option 2: exponer `resolveCategoryName` en el barrel de `@ggasia/categorization`
- **Pros:** cero cambio de lógica — `category-name.ts` no se toca. `apps/api` consume la resolución
  ya construida y probada, sin duplicar la dependencia sobre `normalize()`. Consistente con la
  decisión de ADR-001 de mantener las primitivas compartidas en un único lugar.
- **Cons:** amplía otra vez la superficie pública del paquete más allá de lo que su nombre sugiere a
  primera vista — el mismo costo nominal que ADR-001 ya aceptó para `tokenize`/`normalize`.

## Decision

**Opción 2.** Se agrega al barrel:

```ts
export { resolveCategoryName } from "./category-name.ts";
export type { VisibleCategory, CategoryNameResolution } from "./category-name.ts";
```

Sin ningún otro cambio en `category-name.ts`.

Esta decisión **extiende** [[adr-001-tokenizacion-compartida-en-categorization]], no la contradice:
ADR-001 ya dejó registrado que, "si en el futuro aparece un tercer paquete de primitivas puras
compartidas, esta decisión se revisa: el argumento que la sostiene es la ausencia de un lugar mejor,
no la pertenencia conceptual". Acá no aparece un tercer paquete, pero sí un tercer caso de primitiva
compartida (`resolveCategoryName`, después de `tokenize`/`normalize`) que depende de la misma
normalización única que ADR-001 ya centralizó en `categorization`. El mismo argumento — ausencia de
un lugar mejor — aplica sin cambios.

## Consequences

- `packages/categorization/src/index.ts` exporta además `resolveCategoryName`, `VisibleCategory` y
  `CategoryNameResolution`.
- `packages/categorization/tests/port.test.ts` pasa a esperar
  `["createCategorizer", "normalize", "resolveCategoryName", "tokenize"]` como forma exacta del
  barrel.
- `apps/api` (Block 9 de `spec-FEAT-002.md`) importa `resolveCategoryName` desde
  `@ggasia/categorization` compilado, en vez de reimplementar la resolución de nombre de categoría.
- La tabla de 258 palabras clave (`keywords.ts`) sigue privada — esta ampliación no la afecta.
- Si aparece un cuarto caso de primitiva compartida, esta decisión (y ADR-001) se vuelven a revisar
  bajo el mismo criterio: ausencia de un lugar mejor, no pertenencia conceptual del nombre del
  paquete.
