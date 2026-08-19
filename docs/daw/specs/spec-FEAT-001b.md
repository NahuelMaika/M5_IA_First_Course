# Spec FEAT-001b: Motor de extracción de campos del gasto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| PRD | docs/daw/prd/prd-FEAT-001b.md |
| Tier | FEATURE |
| Date | 2026-08-18 |
| Spec loops | 1 |

## Summary

Un motor puro en `packages/domain` que interpreta el input crudo de un gasto siguiendo las seis
etapas de `kb.md` en su orden normativo (corte de Descripción → referencias temporales → marcador de
categoría → numerales en palabras → Monto → muletillas), y produce un `ParsedExpense` completo o un
`RejectedExpense` con motivo identificable — nunca un estado intermedio ambiguo. Consume el
categorizador de FEAT-001a exclusivamente por su puerto (`Categorizer`, `@ggasia/categorization`).
Se apoya en el scaffolding de test/build que hoy le falta al paquete (Bloque 1), que se agrega
primero para que los bloques siguientes puedan correr su propia suite desde el principio.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 2 |
| FR-02 | Block 3 |
| FR-03 | Block 3 |
| FR-04 | Block 4 |
| FR-05 | Block 5 |
| FR-06 | Block 6 |
| FR-07 | Block 7 |
| FR-08 | Block 8 |
| FR-09 | Block 8 |
| FR-10 | Block 8 |
| FR-11 | Block 1 (tipos), Block 3, Block 6, Block 7 (motivos concretos) |
| FR-12 | Block 8 |
| FR-13 | Block 8 |
| FR-14 | Block 6 |
| NFR-01 | Block 10 |
| NFR-02 | Block 1, Block 10 |
| NFR-03 | Block 10 |
| NFR-04 | Block 1 (guardas), Block 8 (aplicación) |
| NFR-05 | Block 6 |
| NFR-06 | Block 10 |

## Dependencies between blocks

Block 1 (scaffolding + tipos) es prerequisito de todos. Blocks 2–7 son las etapas del pipeline —
independientes entre sí en implementación (cada una opera sobre el segmento izquierdo con su propia
función pura), pero Block 8 las orquesta en el orden fijo de `kb.md` y depende de las seis. Block 9
(barrel) depende de Block 8. Block 10 (gates) depende de que 1–9 estén completos.

Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

## Block 1 — Scaffolding del paquete y tipos de dominio

**Files**
- `packages/domain/package.json` (modified) — agrega scripts `typecheck`, `test`,
  `test:coverage` (espejando `packages/categorization/package.json`); agrega devDependencies
  `vitest`, `@vitest/coverage-v8`, `@types/node`; agrega `@ggasia/categorization` bajo
  `dependencies` (no `devDependencies` — se consume en runtime por el pipeline, no solo en tests).
- `packages/domain/tsconfig.test.json` (new) — espejo de
  `packages/categorization/tsconfig.test.json`: `noEmit`, `types: ["node"]`,
  `include: ["src", "tests"]`.
- `packages/domain/vitest.config.ts` (modified) — agrega bloque `coverage` con umbrales 90%
  líneas/ramas/funciones y exclusión del test de performance de la corrida instrumentada
  (mismo patrón que `packages/categorization/vitest.config.ts`).
- `packages/domain/src/types.ts` (new) — tipos del dominio:
  - `ParsedExpense`: Monto (number, 2 decimales), Lugar (string), Cuando (Date), Categoría (string),
    origen de la categoría (`"automatica" | "marcador"`), Descripción (string), Nombre (string), Tipo
    (`"Personal"`).
  - `RejectedExpense`: motivo discriminado por `reason` (unión de literales, uno por cada regla de
    rechazo de FR-11/kb.md — nunca el texto crudo del input, siguiendo el precedente de
    `category-name.ts` de FEAT-001a; mitigación del threat model, riesgo LOW).
  - `ParseResult = { ok: true; expense: ParsedExpense } | { ok: false; rejection: RejectedExpense }`.
  - Tipo de entrada: `referenceDate: Date` — documentado en JSDoc como **precondición confiada del
    pipeline** (mitigación del threat model, riesgo MEDIUM, límite de confianza B2): este paquete no
    valida la fecha de referencia, la recibe ya válida de quien lo invoque.
- `packages/domain/src/limits.ts` (new) — constantes de los topes de largo de `kb.md`: input crudo
  500, Lugar 200, Descripción 300, Nombre 512 (NFR-04).
- `packages/domain/tests/types.test.ts` (new) — smoke test de que los tipos discriminan
  correctamente por `ok`/`reason`.

**Logic**
Puro scaffolding y modelado de datos — ninguna etapa del pipeline se implementa en este bloque.

**Error handling**
N/A — no hay lógica que falle todavía.

**Required tests**
- [ ] `types.test.ts` — un `ParseResult` con `ok: false` discrimina por `reason` sin ambigüedad
- [ ] `pnpm --filter @ggasia/domain run typecheck` pasa con el nuevo `tsconfig.test.json`

**Completion criterion**
`pnpm --filter @ggasia/domain run test` corre (aunque no haya nada más que testear todavía) y
reporta el árbol de scripts/devDependencies alineado con `packages/categorization`.

## Block 2 — Corte por separador de Descripción (FR-01)

**Files**
- `packages/domain/src/separator.ts` (new) — `splitDescription(raw: string): { left: string;
  description: string }`. Busca el primer ` - ` (guion ASCII con al menos un espacio en blanco a
  cada lado — kb.md líneas 113-117); si existe, el segmento derecho es Descripción literal y el
  izquierdo alimenta el resto del pipeline; si no existe, todo el input es el segmento izquierdo y
  Descripción queda vacía.
- `packages/domain/tests/separator.test.ts` (new).

**Logic**
Implementa kb.md "Paso 0". No usa un guion largo (`—`), guion tipográfico (`–`) ni espacio duro
(U+00A0) como separador — solo el guion ASCII U+002D con espacio en blanco real a los lados.

**Input validation**
No aplica todavía el tope de 500 caracteres (eso es Block 8/FR-12, evaluado ANTES de llamar a esta
función) — este bloque solo corta.

**Error handling**
Ninguno propio — el rechazo por segmento izquierdo vacío se resuelve en Block 8 (es el resultado de
Lugar vacío tras el pipeline completo, FR-01 + FR-07).

**Required tests**
- [ ] AC-01 — `milanesas 18000 - con los pibes` → Lugar-fuente `milanesas 18000`, Descripción
  `con los pibes`
- [ ] AC-02 — `milanesas 18000 - ` → Descripción vacía, segmento izquierdo `milanesas 18000`
- [ ] AC-03 — `- solo un comentario` → segmento izquierdo vacío
- [ ] Guion largo/tipográfico/espacio duro NO se reconoce como separador (regresión de kb.md
  líneas 113-117)

**Completion criterion**
`separator.test.ts` cubre AC-01, AC-02, AC-03 y pasa.

## Block 3 — Referencias temporales (FR-02, FR-03)

**Files**
- `packages/domain/src/temporal.ts` (new) — `extractTemporalReference(tokens: string[],
  referenceDate: Date): { when: Date | null; remainingTokens: string[] }` y
  `resolveWhen(extracted: Date | null, referenceDate: Date): Date | RejectedExpense["reason"]`
  (rechazo por fecha futura o fuera de la ventana de retroactividad).
- `packages/domain/tests/temporal.test.ts` (new).

**Logic**
Reconoce `hoy`/`ayer`/`anteayer`, nombres de día de semana (resuelve a la ocurrencia más reciente sin
pasarse de hoy), y `dd/mm[/aaaa]` calendario-válido, comparando por token completo sin distinguir
mayúsculas/acentos. Toma la primera referencia si hay varias, y quita todas del texto. Si no hay
ninguna, usa `referenceDate` (FR-03 — nunca lee el reloj del sistema). Rechaza si la fecha resuelta es
futura respecto a `referenceDate`, o anterior al primer día del mes que queda 12 meses cerrados hacia
atrás.

**Error handling**
- Fecha futura → motivo de rechazo `fecha_futura`.
- Fuera de la ventana de retroactividad → motivo `fecha_fuera_de_ventana`.
- `dd/mm` calendario-inválido (`31/2`, `45/13`) → no se reconoce como referencia, queda en el texto
  (no es un error de esta función, es el comportamiento esperado).

**Required tests**
- [ ] AC-04 — `nafta 8000 ayer` → Cuando = día anterior, `ayer` se quita del texto
- [ ] AC-05 — `31/2` no resuelve fecha, sigue en el texto
- [ ] AC-06 — sin referencia temporal → Cuando = `referenceDate`
- [ ] AC-21 — `31/12` con referencia en enero → rechazo `fecha_futura`, sin inferir año anterior
- [ ] AC-22 — `3/8/1998` → rechazo `fecha_fuera_de_ventana`
- [ ] Nombre de día de semana resuelve a la ocurrencia más reciente sin pasarse de hoy

**Completion criterion**
`temporal.test.ts` cubre AC-04, AC-05, AC-06, AC-21, AC-22 y pasa.

## Block 4 — Marcador de categoría `#nombre` (FR-04)

**Files**
- `packages/domain/src/category-marker.ts` (new) — `extractCategoryMarker(tokens: string[]):
  { markedName: string | null; remainingTokens: string[] }`.
- `packages/domain/tests/category-marker.test.ts` (new).

**Logic**
Reconoce el primer token que empieza con `#` seguido de al menos un carácter válido (letras con
acentos y `ñ`, dígitos, `-`, `_`). Toma el primero si hay varios, quita todos los marcadores válidos
del texto. Un `#` suelto o seguido de carácter inválido no es marcador y se trata como texto común.
**No resuelve** el nombre contra categorías existentes — eso es `resolveCategoryName` de
FEAT-001a/`category-name.ts`, fuera de alcance (Out of Scope del PRD), y no se importa aquí.

**Error handling**
Ninguno propio — un marcador con nombre inválido simplemente no se reconoce como marcador (no hay
rechazo en este bloque).

**Required tests**
- [ ] AC-07 — `milanesas 18000 #almuerzos` → Lugar-fuente `milanesas 18000`, marcado `almuerzos`
- [ ] AC-08 — `pagué 3000 de nafta # ayer` → `#` suelto no es marcador, queda como texto común
- [ ] Varios marcadores (`#a #b`) → gana el primero, ambos se quitan del texto

**Completion criterion**
`category-marker.test.ts` cubre AC-07, AC-08 y pasa.

## Block 5 — Numerales en palabras → dígitos (FR-05)

**Files**
- `packages/domain/src/numerals.ts` (new) — `convertWordNumerals(tokens: string[]): string[]`,
  implementando la tabla de numerales y las reglas de composición de kb.md (secuencia contigua, suma
  dentro del grupo/multiplicación con `mil`/`millón(es)`, tope de 999.999.999, `un`/`una`/`uno`
  aislados NO se convierten, `peso`/`pesos` adyacente se descarta junto al monto).
- `packages/domain/tests/numerals.test.ts` (new).

**Logic**
Corre sobre el segmento izquierdo después de quitar referencias temporales y marcador, y antes de
determinar el Monto (orden fijado por kb.md). Un numeral que excede el tope no se reconoce y queda
como texto.

**Error handling**
Ninguno propio — un numeral no reconocido simplemente no se convierte, y el rechazo (si corresponde)
lo decide Block 6 al no encontrar Monto.

**Required tests**
- [ ] AC-09 — `gasté mil quinientos en nafta` → 1500; `treinta y cinco mil el alquiler` → 35000,
  Lugar `alquiler`
- [ ] AC-10 — `me compré una remera 25000` → `una` aislada no se convierte (artículo)
- [ ] `un millón` → 1000000 (secuencia con multiplicador)
- [ ] `mil quinientos pesos de luz` → `pesos` se descarta junto al monto

**Completion criterion**
`numerals.test.ts` cubre AC-09, AC-10 y pasa.

## Block 6 — Determinación del Monto (FR-06, FR-14, NFR-05)

**Files**
- `packages/domain/src/amount.ts` (new) — `determineAmount(tokens: string[]):
  { amount: number } | { rejection: RejectedExpense["reason"] }`. Los rechazos usan los literales en
  inglés ya definidos en `types.ts` (`amount_indeterminate`, `amount_malformed`), consistente con el
  patrón ya establecido por `temporal.ts` (Block 3) de reutilizar el contrato de tipos de Block 1 en
  vez de nombres sueltos en español — el spec describe la intención en español, `types.ts` es la
  fuente de verdad del literal exacto.
- `packages/domain/src/types.ts` (modified) — agrega `amount_zero` a la unión
  `RejectedExpense["reason"]` (Block 1 no lo anticipó; FR-14 es un requisito agregado por loop
  correctivo PLAN↔DEFINE, posterior a Block 1).
- `packages/domain/tests/amount.test.ts` (new).

**Logic**
Implementa la tabla de desempate de kb.md sobre los tokens numéricos que quedan (ninguno → rechazo;
exactamente uno → ese es el Monto lleve `$` o no; varios con exactamente uno marcado con `$` → gana
el marcado; varios sin ninguno marcado, o varios con más de uno marcado → rechazo). Interpreta con
convención es-AR (`.` miles, `,` decimales), exige exactamente 2 decimales sin truncar ni redondear,
tope 999.999.999,99. Un Monto resuelto que da exactamente 0 se rechaza (FR-14): un monto negativo es
inexpresable desde texto libre (el `-` nunca sobrevive como parte de un número, kb.md), así que el
cero es el único valor no positivo alcanzable por esta vía.

**Input validation**
Formas malformadas (`1.5`, `1.50`, `1500,555`) se rechazan explícitamente — nunca se adivina una
lectura.

**Error handling**
- Ningún número, o varios sin desempate posible → `amount_indeterminate`.
- Número con formato inválido → `amount_malformed`.
- Monto resuelto igual a 0 → `amount_zero` (FR-14).

**Required tests**
- [ ] AC-11 — `café 1500` → Monto 1500
- [ ] AC-12 — `2 cafés $3000` → Monto 3000 (gana el marcado)
- [ ] AC-13 — `café 1.500,50` → Monto 1500.50
- [ ] AC-18 — `2 cafés 3000` y `ruta 2 5000` → `amount_indeterminate`
- [ ] AC-19 — `café 1.5`, `café 1.50`, `café 1500,555` → `amount_malformed`
- [ ] AC-28 — `café 0` → `amount_zero`
- [ ] Mitigación del threat model: un monto con más de 2 decimales nunca se trunca ni se redondea —
  se rechaza (NFR-05)

**Completion criterion**
`amount.test.ts` cubre AC-11, AC-12, AC-13, AC-18, AC-19, AC-28 y pasa.

## Block 7 — Descarte de muletillas → Lugar (FR-07)

**Files**
- `packages/domain/src/filler-words.ts` (new) — `stripFillerWords(tokens: string[]): string[]`.
  Lista cerrada de verbos de gasto (se descartan en cualquier posición) y lista cerrada de conectores
  (se recortan solo en los extremos, con **punteros de índice sobre el array de tokens — O(n) total,
  nunca `array.shift()/unshift()` repetido**, per la mitigación HIGH del threat model contra un input
  adversarial de 500 caracteres solo-conectores).
- `packages/domain/tests/filler-words.test.ts` (new).

**Logic**
Descarta verbos de gasto en cualquier posición. Recorta conectores desde ambos extremos hasta que ni
el primer ni el último token estén en la lista cerrada — los conectores interiores no se tocan. El
resultado es Lugar. Vacío tras el descarte → rechazo.

**Error handling**
Lugar vacío tras el descarte → motivo `lugar_vacio`.

**Required tests**
- [ ] AC-14 — `gasté 18000 en milanesas hoy` → Lugar `milanesas`; `cena en la casa de mi vieja 3000`
  → Lugar `cena en la casa de mi vieja` (conectores interiores intactos)
- [ ] AC-20 — `gasté 5000 en` → Lugar vacío, rechazo `lugar_vacio`
- [ ] Un único token que esté en la lista de conectores → se descarta, Lugar vacío
- [ ] Test de performance dedicado (no el de NFR-03 general): 500 caracteres compuestos íntegramente
  por tokens de las listas cerradas — el recorte debe resolver en tiempo lineal, no cuadrático
  (mitigación HIGH del threat model)

**Completion criterion**
`filler-words.test.ts` cubre AC-14, AC-20 y pasa, incluyendo el caso adversarial de performance.

## Block 8 — Orquestación del pipeline (FR-08, FR-09, FR-10, FR-12, FR-13)

**Files**
- `packages/domain/src/parse-expense.ts` (new) — `parseExpense(raw: string, referenceDate: Date,
  categorizer: Categorizer): ParseResult`. Orquesta, en el orden fijo de kb.md:
  1. Rechazo por largo excedido (FR-12, NFR-04) — ANTES de interpretar nada.
  2. `splitDescription` (Block 2).
  3. Tokeniza el segmento izquierdo con `tokenize()`/`normalize()` de `@ggasia/categorization`.
  4. `extractTemporalReference` + `resolveWhen` (Block 3).
  5. `extractCategoryMarker` (Block 4).
  6. `convertWordNumerals` (Block 5).
  7. `determineAmount` (Block 6).
  8. `stripFillerWords` (Block 7) → Lugar.
  9. Rechazo por Lugar vacío (Block 7) o Descripción/Nombre que exceden su tope (NFR-04).
  10. Nombre por defecto: Lugar si Descripción vacía, `Lugar - Descripción` si no (FR-08).
  11. Tipo por defecto: `Personal` (FR-09).
  12. Categoría: si hay marcador, categoría = nombre marcado (crudo, sin resolver) con origen
      `marcador` (FR-10, AC-17); si no, invoca `categorizer.categorize(lugar)` con origen
      `automatica`.
  13. Cualquier rechazo en los pasos 1–9 detiene el pipeline sin efectos colaterales — en particular,
      un marcador presente en un input que termina rechazado **no** se reporta como creación de
      categoría (FR-13, AC-24): el resultado de rechazo nunca incluye información de marcador.
- `packages/domain/tests/parse-expense.test.ts` (new) — conjunto dorado: ejercita el pipeline
  completo desde el input crudo (nunca una etapa suelta), per la mitigación del riesgo de reordenar
  etapas documentada en el PRD.

**Logic**
Este es el único punto que conoce el orden completo de las seis etapas — cada etapa (Blocks 2-7)
permanece ciega a las demás.

**Input validation**
- Input crudo > 500 caracteres, Lugar > 200, Descripción > 300, Nombre > 512 → rechazo
  `largo_excedido`, evaluado antes de intentar interpretar (FR-12).

**Error handling**
Todo camino de rechazo devuelve `{ ok: false, rejection: { reason, ... } }` sin lanzar excepciones —
consistente con el boundary B1 del threat model (el pipeline nunca debe `throw` sobre input
malformado).

**Required tests**
- [ ] AC-15 — Nombre por defecto (con y sin Descripción)
- [ ] AC-16 — Tipo por defecto `Personal`
- [ ] AC-17 — origen `automatica` (vía puerto) vs. `marcador` (nombre crudo, sin resolver)
- [ ] AC-23 — largo excedido en cualquiera de los 4 campos → `largo_excedido`, sin interpretar
- [ ] AC-24 — marcador + rechazo posterior → el resultado no señala creación de categoría
- [ ] Casos dorados de interacción entre etapas: AC-04 (fecha) + AC-09 (numeral) + Monto en el mismo
  input, ejercitando el pipeline de punta a punta, no etapas aisladas (mitigación del riesgo de
  reordenamiento del PRD)

**Completion criterion**
`parse-expense.test.ts` cubre AC-15, AC-16, AC-17, AC-23, AC-24 y al menos 3 casos dorados de
punta a punta, y pasa.

## Block 9 — Barrel público

**Files**
- `packages/domain/src/index.ts` (modified) — reemplaza `export {};` por: `parseExpense` y los tipos
  `ParseResult`, `ParsedExpense`, `RejectedExpense`.

**Logic**
Consumo compilado desde `dist/` — `package.json` ya declara `main: "dist/index.js"` y no se toca
(prohibición de AGENTS.md: nunca apuntar `main` a `src/index.ts`).

**Error handling**
N/A — un barrel es un re-export puro, sin lógica propia que pueda fallar en runtime. El único fallo
posible es de compilación (un símbolo que no existe), y lo captura `tsc` en build, no un test.

**Required tests**
- [ ] Test de humo: importar desde el barrel compilado (`dist/index.js` tras `pnpm build`) resuelve
  `parseExpense` y los tipos exportados.

**Completion criterion**
`packages/domain/src/index.ts` exporta exactamente lo que Block 8 produce, y `pnpm --filter
@ggasia/domain run build` genera `dist/index.js` con esas exportaciones.

## Block 10 — Gates de calidad (NFR-01, NFR-02, NFR-03, NFR-06)

**Files**
- `packages/domain/tests/coverage.test.ts` (new, si hace falta un test dedicado que fuerce
  cobertura de ramas no cubiertas por los tests funcionales de Blocks 2-8) — mismo patrón que
  `packages/categorization/tests/coverage.test.ts`.
- `packages/domain/tests/purity.test.ts` (new) — verifica que `package.json` declara 0
  dependencias de runtime de terceros (NFR-02) — la única dependencia de `dependencies` permitida es
  `@ggasia/categorization`, interna, documentada como excepción consistente con ADR-001.
- `packages/domain/tests/invariant.test.ts` (new) — recorre el 100% de los tokens de las 2 listas
  cerradas de muletillas (Block 7) contra las 258 palabras clave de `packages/categorization` y sus
  plurales derivados, verificando ausencia de intersección (NFR-06).
- `packages/domain/tests/performance.test.ts` (new) — mide interpretar un input de 500 caracteres en
  <10ms p95 sobre 1000 ejecuciones (NFR-03), excluido de la corrida de cobertura instrumentada
  (mismo patrón que `packages/categorization`'s `vitest.config.ts`).

**Error handling**
- Cobertura por debajo del 90% → el script `test:coverage` retorna código de salida distinto de 0
  (falla el gate, no hace falta manejo adicional).
- `purity.test.ts` falla explícitamente si `package.json` declara una dependencia de runtime de
  terceros no documentada como excepción (NFR-02).
- `invariant.test.ts` falla nombrando el/los token(s) en conflicto si hay intersección entre las
  listas de muletillas y las 258 palabras clave o sus plurales, para que el diagnóstico sea directo.
- `performance.test.ts` falla si el p95 medido excede 10ms, reportando el valor medido.

**Required tests**
- [ ] AC-25 — invariante muletillas ↔ 258 palabras clave, sin intersección
- [ ] AC-26 — cobertura ≥90% líneas/ramas/funciones en `packages/domain`, y `package.json` declara 0
  dependencias de runtime de terceros
- [ ] AC-27 — p95 <10ms sobre 1000 ejecuciones de un input de 500 caracteres

**Completion criterion**
`pnpm --filter @ggasia/domain run test` pasa completo (typecheck + suite + coverage + performance),
con cobertura ≥90% y 0 dependencias de runtime de terceros.

## Final verification

- Los 10 bloques completos: `pnpm --filter @ggasia/domain run test` verde de punta a punta.
- `pnpm build:packages` compila `packages/domain` sin errores, y su `main` sigue apuntando a
  `dist/index.js`.
- El motor consume el categorizador exclusivamente por su puerto (`Categorizer`), nunca la clase
  concreta `KeywordCategorizer`.
- Ningún camino del pipeline lanza una excepción sobre input malformado — siempre devuelve un
  `ParseResult` tipado.
- Las 4 mitigaciones del threat model (`docs/daw/security/threat-FEAT-001b.md`) están reflejadas en
  el código: recorte O(n) en Block 7, caso de test adversarial en Block 7 y Block 10,
  `referenceDate` documentada como precondición confiada en Block 1, `RejectedExpense` sin texto
  crudo en Block 1.
