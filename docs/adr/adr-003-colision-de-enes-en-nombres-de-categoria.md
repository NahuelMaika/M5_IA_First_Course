# ADR-003: Se acepta la colisión de `ñ` y `n` en nombres de categoría

| Field | Value |
|-------|-------|
| Date | 2026-08-18 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

`kb.md:34` define la normalización como minúsculas + NFD + descarte de marcas diacríticas. La `ñ` se
descompone en `n` + U+0303, así que el descarte se la lleva: `niño` normaliza a `nino`.

Sobre las **palabras clave** eso no tiene ningún efecto: se verificó durante la auditoría del bloque
2 que **ninguna de las 258 palabras clave contiene `ñ`**. Las únicas palabras con `ñ` en todo `kb.md`
—`año`, `tamaño`, `señales`, `español`— están en prosa.

El efecto aparece en los **nombres de categoría**. `kb.md:183` admite explícitamente `ñ` en los
marcadores `#nombre`, y `kb.md:186-189` obliga a que la resolución use **la misma** normalización que
define la unicidad de nombres — *"es obligatorio que sea la misma"*. Consecuencia directa: `#año` y
`#ano` resuelven a la misma categoría, igual que `#niño` y `#nino`.

Es una colisión visible para el usuario, producida por una regla normativa. No es un defecto de la
implementación.

## Options considered

### Option 1: aceptar la colisión
- **Pros:** respeta `kb.md` tal como está. Sin código adicional. El caso real —alguien que quiera dos
  categorías distintas llamadas `año` y `ano`— es implausible en una app de gastos personales.
- **Cons:** dos nombres que el usuario percibe como distintos resuelven al mismo lugar, sin
  explicación visible.

### Option 2: normalizar los nombres de categoría distinto que las palabras clave
- **Pros:** elimina la colisión.
- **Cons:** contradice `kb.md:186-189` de forma directa. Además reintroduce el problema que esa regla
  existe para evitar: dos normalizaciones que hoy difieren en la `ñ` y mañana difieren en otra cosa,
  con la unicidad de nombres decidida por una y el matching por otra.

### Option 3: cambiar `kb.md` para preservar la `ñ`
- **Pros:** arregla la causa en la fuente normativa.
- **Cons:** `AGENTS.md` prohíbe tocar `kb.md` sin volver a medir la precisión de categorización, y
  `kb.md` está cerrado y versionado. Cambiar la normalización afecta el matching de las 258 palabras
  clave, no solo los nombres de categoría — se paga una re-medición de RNF-02 completa para resolver
  un caso que hoy no tiene impacto medible.

## Decision

**Opción 1.** Se acepta la colisión.

Lo determinante es la asimetría de costos: el daño es un caso improbable y recuperable —el usuario
ve su gasto en una categoría con nombre parecido y lo corrige—, mientras que las opciones 2 y 3
cuestan, respectivamente, romper una regla normativa explícita y re-medir la precisión de todo el
categorizador.

### Riesgo aceptado (formato F-TM-04)

- **Quién acepta:** el usuario/dueño del producto, en la fase CODE de FEAT-001a (2026-08-18).
- **Justificación:** impacto nulo sobre las 258 palabras clave (verificado); sobre nombres de
  categoría el caso es implausible en el dominio del producto y el usuario puede corregirlo. Las
  alternativas cuestan contradecir `kb.md` o re-medir RNF-02.
- **Condición de revisión:** si el producto incorpora categorías compartidas entre usuarios,
  importación de categorías desde una fuente externa, o si aparece una palabra clave con `ñ` en una
  ampliación de la tabla de `kb.md`. Cualquiera de las tres invalida el análisis.

## Consequences

- `packages/categorization/src/normalize.ts` queda como está: implementa `kb.md:34` literalmente.
- El bloque 6 (`category-name.ts`) usa esa misma `normalize`, según exige `kb.md:186-189`. La
  colisión es comportamiento esperado, no un defecto a reportar en VERIFY.
- El bloque 6 debe incluir un test que **documente** la colisión (`#año` y `#ano` resuelven a la
  misma categoría), para que un cambio futuro de la normalización la haga visible en vez de
  silenciosa.
- Este ADR no está reflejado en `docs/daw/security/threat-FEAT-001a.md`, que es el artefacto del gate
  `threat` y no se modifica desde CODE. Queda como deuda para el loop VERIFY→CODE: el threat model
  debería referenciar este riesgo aceptado junto a RA-01 y RA-02.
- Se relaciona con [[adr-001-tokenizacion-compartida-en-categorization]]: ambos derivan de que
  `kb.md` exige una única normalización compartida por todo el pipeline.
