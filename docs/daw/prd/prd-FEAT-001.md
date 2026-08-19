# Parent PRD: Motor de gastos — extracción de campos y categorización determinista

| Metric | Value |
|--------|-------|
| Ticket | FEAT-001 |
| Date | 2026-08-11 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-001a | Bootstrap del monorepo y categorizador determinista | prd-FEAT-001a.md | none | active |
| FEAT-001b | Motor de extracción de campos del gasto | prd-FEAT-001b.md | depends on a | pending |

## Suggested implementation order

a → b

## Original context

GGasIA no existe como código: el repositorio contiene el andamiaje de DAW, el PRD-001 del producto y
su anexo normativo `kb.md`, y nada más.

El valor central del producto es que el usuario escriba una sola frase —`gasté 18000 en milanesas
hoy`— y el sistema extraiga monto, lugar, fecha y categoría. Todo lo demás (resúmenes, audio,
pantallas) se apoya sobre esa interpretación.

Se decidió construir ese motor **aislado**, como dos paquetes puros del monorepo, sin HTTP, sin base
de datos y sin interfaz. Es el corte donde las reglas de `kb.md` se pueden verificar sin levantar
infraestructura, y donde la frontera de arquitectura que exige `AGENTS.md` queda establecida desde el
primer commit.

El PRD original reunía 20 requerimientos funcionales y 33 criterios de aceptación sobre tres frentes
—bootstrap, categorizador y extractor—, muy por encima del umbral de alcance de un ticket. Se
dividió en dos por una razón concreta: el categorizador es la pieza que carga el riesgo de producto
del PRD-001 (RNF-02, las 258 palabras clave y su orden normativo) y es la única de las dos
verificable sin depender de nada — recibe un Lugar y una lista de categorías vigentes, y devuelve
una categoría. El extractor, en cambio, es un pipeline de seis etapas donde el orden importa;
mezclarlos en una misma pasada de CODE vuelve ambiguo el diagnóstico de cualquier test que falle.

`FEAT-001a` levanta además el monorepo, de modo que `FEAT-001b` arranca con `pnpm test` funcionando
y un paquete ya compilando a `dist/` como referencia.

### Decisiones tomadas en DEFINE, vigentes para ambos sub-tickets

- **Sin autenticación, sin API, sin base de datos, sin interfaz.** RF-01 del PRD-001 exige un usuario
  autenticado; ese requerimiento se cumple en un ticket posterior. Ninguno de los dos sub-tickets es
  desplegable por sí solo, y se aceptó de forma explícita: el criterio de cierre es la suite verde y
  la frontera de arquitectura establecida.
- **Conjunto de casos dorado limitado a los ejemplos de `kb.md`.** No se escriben casos nuevos de
  categorización. Cubre 5 de las 10 categorías; el riesgo residual quedó aceptado.
- **RNF-02 del PRD-001 (85% de acierto) queda diferido y declarado como tal.** Medirlo requiere los
  campos de RF-41 y RF-42 persistidos y un mes calendario de uso real.
- **Los rechazos llevan motivo distinguible por regla**, no un rechazo genérico, para que la interfaz
  pueda decirle al usuario qué corregir.
