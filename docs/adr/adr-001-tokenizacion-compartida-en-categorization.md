# ADR-001: La tokenización compartida vive en `packages/categorization`

| Field | Value |
|-------|-------|
| Date | 2026-08-17 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

`kb.md` define una única noción de token —el guion entre letras no corta, el resto de la puntuación
sí y se descarta— y exige explícitamente que **las seis etapas del pipeline comparen igual**, porque
sin una definición compartida "cada etapa admitiría su propia interpretación".

De esas seis etapas, una sola pertenece a este ticket (el matching de palabras clave). Las otras
cinco —fechas, marcador `#nombre`, numerales en palabras, desempate del monto, descarte de
muletillas— son de `packages/domain`, que construye FEAT-001b.

El paquete se llama `categorization`, y exportar desde ahí una primitiva genérica que consume
mayormente otro paquete se lee mal a primera vista. De ahí este registro.

## Options considered

### Option 1: `tokenize`/`normalize` en `packages/domain`, importados por `categorization`
- **Pros:** el nombre del paquete coincide con lo que contiene; la primitiva vive donde están 5 de
  sus 6 consumidores.
- **Cons:** FEAT-001b ya obliga a `domain → categorization` (consume el categorizador por su
  puerto). Agregar `categorization → domain` para que el categorizador tokenice su propio input
  cierra un **ciclo entre paquetes**. Además invierte el orden de entrega: `domain` nace vacío en
  este ticket, así que la primitiva no tendría dónde vivir cuando se la necesita.

### Option 2: `tokenize`/`normalize` en `packages/categorization`, exportados en su API pública
- **Pros:** sin ciclo — la dependencia queda en una sola dirección, `domain → categorization`.
  Cumple el mandato de `kb.md` sin duplicar la regla. Disponible desde el primer commit.
- **Cons:** el nombre del paquete no describe todo lo que expone. Amplía la superficie pública más
  allá del puerto del categorizador.

### Option 3: reimplementar la tokenización en cada paquete
- **Pros:** cada paquete queda cohesivo y sin dependencias cruzadas.
- **Cons:** es exactamente el drift que `kb.md` prohíbe. Descartada sin más análisis.

## Decision

**Opción 2.** Con solo dos paquetes en juego, es la única que no cierra un ciclo. El costo es
nominal —un paquete que expone algo más genérico que su nombre—; el de la opción 1 es estructural, y
un ciclo entre paquetes no se arregla después sin mover código.

La tabla de 258 palabras clave **no** se exporta: es dato normativo de este paquete, no una
primitiva compartida. El test que `kb.md` exige entre keywords y muletillas queda registrado en el
spec como obligación diferida a FEAT-001b.

## Consequences

- `packages/categorization/src/index.ts` exporta el puerto, la factory, `tokenize` y `normalize`.
- `packages/categorization/src/keywords.ts` queda privado al paquete.
- FEAT-001b consume la tokenización desde `@ggasia/categorization`; no la reimplementa.
- Se acepta que el nombre del paquete no describa la totalidad de su API pública.
- Si en el futuro aparece un tercer paquete de primitivas puras compartidas, esta decisión se revisa:
  el argumento que la sostiene es la ausencia de un lugar mejor, no la pertenencia conceptual.
