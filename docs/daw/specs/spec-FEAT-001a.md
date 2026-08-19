# Spec FEAT-001a: Bootstrap del monorepo y categorizador determinista

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| PRD | docs/daw/prd/prd-FEAT-001a.md |
| Tier | FEATURE |
| Date | 2026-08-17 |
| Spec loops | 1 |

## Summary

Se levanta el monorepo pnpm con dos workspaces (`packages/domain` como andamiaje vacío y
`packages/categorization` con contenido real), ambos compilados a `dist/` antes de correr tests. El
categorizador se construye como cuatro piezas puras encadenadas —normalización, tokenización, tabla
de palabras clave con pluralización, y recorrido en orden normativo— expuestas por un puerto. Se suma
la resolución del nombre de categoría marcado, que reutiliza la misma normalización. Cero
dependencias de runtime, cero red, cero modelo de lenguaje.

Documentos normativos que este spec implementa sin reinterpretar: `docs/daw/prd/kb.md` (definición de
token, 258 palabras clave, orden normativo, reglas de plural, invariantes, resolución del nombre
marcado), `ADR-001` (qué se exporta y qué no) y `docs/daw/security/threat-FEAT-001a.md` (8
mitigaciones, plegadas a los bloques 1, 2, 3 y 6).

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 1 |
| FR-02 | Block 1 |
| FR-03 | Block 2 |
| FR-04 | Block 2 |
| FR-05 | Block 4 |
| FR-06 | Block 3 |
| FR-07 | Block 4 |
| FR-08 | Block 4 |
| FR-09 | Block 6 |
| FR-10 | Block 5 |
| NFR-01 | Estrategia: cobertura ≥90% líneas/ramas/funciones sobre `packages/categorization`, medida en Block 7 con el reporte de Vitest. Cada bloque aporta sus tests; Block 7 verifica el umbral agregado. |
| NFR-02 | Estrategia: el `package.json` de `packages/categorization` nace sin campo `dependencies`. Block 1 lo crea así; Block 7 lo verifica con un test que lee el manifiesto. |
| NFR-03 | Estrategia: ninguna función del paquete importa `node:http`, `node:https`, `fetch` ni SDK alguno. Block 7 lo verifica con un test estructural sobre los fuentes, hermano del de pureza de Block 1. |
| NFR-04 | Estrategia: test estructural en Block 3 que recorre las 258 palabras clave y sus plurales derivados, sin afirmar semántica. |
| NFR-05 | Block 6 |
| NFR-06 | Estrategia: benchmark en Block 7 sobre 1000 ejecuciones con un Lugar de 200 caracteres, p95 < 5 ms, con la estrategia anti-flaky descrita en ese bloque. |

## Dependencies between blocks

```
1 ──> 2 ──> 3 ──> 4 ──> 5 ──> 7
           └──> 6 ──────────> 7
```

- **Block 1** no depende de nada y bloquea a todos: sin monorepo no hay dónde escribir.
- **Block 2** entrega `normalize` y `tokenize`, que consumen 3, 4 y 6.
- **Block 3** entrega la tabla pluralizada, que consume 4.
- **Block 4** cierra el categorizador; **Block 5** lo expone.
- **Block 6** depende solo de Block 2 (usa `normalize`), no del categorizador. Puede implementarse
  en paralelo a 3 y 4 si hiciera falta.
- **Block 7** requiere todo lo anterior: mide sobre el paquete completo.

Orden de ejecución: **1 → 2 → 3 → 4 → 5 → 6 → 7**.

---

## Block 1 — Bootstrap del monorepo

**Files**
- `package.json` (new) — raíz del workspace; scripts `build:packages`, `test`, `dev`.
- `pnpm-workspace.yaml` (new) — declara `packages/*` y `apps/*`.
- `tsconfig.base.json` (new) — configuración TypeScript compartida, `strict` y `isolatedModules`.
- `.npmrc` (new) — configuración de pnpm del repo.
- `packages/domain/package.json` (new) — `main` → `dist/index.js`, `types` → `dist/index.d.ts`.
- `packages/domain/tsconfig.json` (new) — extiende la base.
- `packages/domain/vitest.config.ts` (new) — config propia del workspace.
- `packages/domain/src/index.ts` (new) — marcador mínimo `export {};`.
- `packages/categorization/package.json` (new) — `main` → `dist/index.js`, **sin campo
  `dependencies`**.
- `packages/categorization/tsconfig.json` (new) — extiende la base.
- `packages/categorization/vitest.config.ts` (new) — config propia, con reporte de cobertura.
- `packages/categorization/src/index.ts` (new) — barrel vacío por ahora; Block 5 lo completa.
- `packages/categorization/tests/purity.test.ts` (new) — test estructural de pureza.

**Logic**

Monorepo pnpm con dos workspaces. `build:packages` compila ambos paquetes a `dist/` y está encadenado
como prerrequisito de `test` y de `dev`, de modo que ningún workspace pueda consumir a otro sin
compilar. Ambos `package.json` apuntan `main` a `dist/`, nunca a `src/index.ts`.

`packages/domain` nace vacío porque su contenido es de FEAT-001b, pero **debe compilar igual**:
`src/index.ts` lleva un `export {};` explícito. Un archivo literalmente vacío es tratado como script
global y falla con TS1208 bajo `isolatedModules`.

El lockfile de pnpm se commitea (mitigación R-09).

**Input validation**

No aplica: este bloque no acepta entrada de usuario.

**Error handling**
- Si `build:packages` falla, `test` y `dev` no deben ejecutarse: el encadenamiento es secuencial, no
  paralelo.
- Un `main` apuntando a un `dist/` inexistente debe romper en el import, no degradar en silencio.

**Required tests**
- [ ] `purity.test.ts` — ningún fuente de `packages/categorization` importa `fastify`,
  `@prisma/client` ni rutas bajo `apps/` — valida AC-02
- [ ] `pnpm test` desde la raíz compila ambos paquetes a `dist/` antes de correr la suite, y termina
  sin errores — valida AC-01
- [ ] El `package.json` de ambos paquetes apunta `main` a `dist/`, no a `src/`
- [ ] **`test` no se ejecuta si `build:packages` falla**: el script está encadenado de forma
  secuencial, no paralela — cubre el error documentado arriba
- [ ] **Importar un paquete cuyo `dist/` no existe lanza error**, no resuelve a `undefined` ni
  degrada en silencio — cubre el error documentado arriba

**Completion criterion**

`pnpm test` corre desde la raíz, compila `packages/domain` y `packages/categorization` a `dist/`, y
la suite pasa. `packages/domain/dist/index.js` existe.

---

## Block 2 — Normalización y tokenización

**Files**
- `packages/categorization/src/normalize.ts` (new) — normalización de texto para comparar.
- `packages/categorization/src/tokenize.ts` (new) — partición en tokens según `kb.md`.
- `packages/categorization/tests/normalize.test.ts` (new)
- `packages/categorization/tests/tokenize.test.ts` (new)

**Logic**

`normalize(text)`: pasa a minúsculas, descompone a **NFD**, descarta las marcas diacríticas y colapsa
los espacios. **Devuelve un valor nuevo; no muta ni altera el texto original que recibe** (FR-03). La
forma Unicode se fija explícitamente y se documenta en el propio módulo (mitigación R-03).

`tokenize(text)`: implementa la definición de token de `kb.md` (líneas 37-50) **completa**:
- La comparación es siempre por **token completo**, nunca por substring (FR-04).
- El guion entre letras **no** corta: `anti-mosquitos` es UN token.
- Cualquier otro signo de puntuación **sí** corta y se descarta: `café,` tokeniza a `café`.

**Estas dos últimas reglas no están cubiertas por ningún AC del PRD** — AC-04 solo ejercita la regla
de substring. Son obligación de este spec, y sus tests son obligatorios: sin ellos, un
`split(/\s+/)` ingenuo pasa los 17 criterios de aceptación del PRD y está mal.

Restricción de implementación (mitigación R-01): **prohibidos los cuantificadores anidados y las
alternancias con prefijos solapados**. La tokenización se resuelve por escaneo lineal de caracteres o
clases simples. Un backtracking catastrófico sobre un Lugar de 200 caracteres es un DoS.

**Input validation**
- Entrada: `string`. Se acepta vacío y devuelve lista vacía de tokens; no se lanza excepción.
- El largo máximo no se valida acá — es responsabilidad de quien llama (Block 6 lo hace para el
  nombre marcado).

**Error handling**
- Entrada vacía o solo espacios → lista de tokens vacía. No es un error.
- Ninguna función de este bloque loguea su entrada (obligación transversal del threat model).

**Required tests**
- [ ] Mayúsculas, acentos y espacios repetidos son equivalentes: `Almacen` ≡ `almacén`, `Médico` ≡
  `medico` — valida AC-03
- [ ] El texto original no queda alterado tras normalizar — valida FR-03
- [ ] Substring no matchea: `naftalina` no contiene el token `nafta`; `supermercadito` no contiene
  `super` — valida AC-04
- [ ] **Guion entre letras no corta**: `anti-mosquitos` produce un solo token — obligación de spec
- [ ] **Puntuación corta y se descarta**: `café,` produce el token `café` — obligación de spec
- [ ] Caso adversarial: 200 caracteres de puntuación repetida resuelven sin degradación — mitigación
  R-01
- [ ] **Entrada vacía o solo espacios devuelve lista de tokens vacía sin lanzar excepción** — cubre
  el error documentado arriba
- [ ] **Ningún fuente de este bloque contiene `console.`, `logger` ni escritura a stdout** — test
  estructural sobre `normalize.ts` y `tokenize.ts`; cubre la obligación de no loguear PII

**Completion criterion**

`normalize` y `tokenize` pasan sus tests, incluidos los dos casos no cubiertos por AC y el
adversarial de puntuación.

---

## Block 3 — Tabla de palabras clave y pluralización

**Files**
- `packages/categorization/src/keywords.ts` (new) — las 258 palabras clave en orden normativo.
- `packages/categorization/src/pluralize.ts` (new) — derivación de plurales, invariantes y caso
  inverso.
- `packages/categorization/tests/keywords.test.ts` (new) — test estructural.
- `packages/categorization/tests/pluralize.test.ts` (new)

**Logic**

`keywords.ts` es el **único** módulo que contiene la tabla, derivada de `kb.md` tal como está. Se
implementa como **array tipado explícito** —`Array<{ category: string; keywords: string[] }>`— y no
como objeto con claves. El orden normativo tiene que ser estructuralmente visible en el tipo: un
objeto literal depende de la garantía implícita de orden de inserción de JS, que un `sort-keys` de
linter o un reordenamiento "para dejarlo prolijo" rompe sin error de compilación y cambiando
clasificaciones.

Orden normativo (`kb.md:11-20`, `kb.md:359`), que es dato, no convención:

```
Comida, Transporte, Entretenimiento, Servicios, Salud,
Alquiler, Indumentaria, Hogar, Cuidado personal, Mascotas
```

`pluralize.ts` implementa **tres** reglas, no dos:
1. Derivación mecánica del plural regular.
2. La lista de **invariantes** de `kb.md`: marcas, siglas y extranjerismos que no admiten plural
   (`netflix` sí, `netflixes` no).
3. **Caso inverso** (`kb.md:347-348`): `expensas` y `anteojos` están guardadas ya en plural y deben
   matchear también sus singulares (`expensa`, `anteojo`). No es la lista de invariantes ni la
   derivación regular — es una tercera regla, en dirección contraria.

La tabla pluralizada se **precomputa una sola vez al cargar el módulo**, nunca por invocación
(mitigación R-02). Es requisito de implementación, no optimización opcional.

**Input validation**

No aplica: la tabla es dato estático del repo, no entrada de usuario.

**Error handling**
- Una palabra clave repetida entre categorías es un error de dato que el test estructural debe
  detectar, no algo que se resuelve en runtime.

**Required tests**
- [ ] **El array de orden de categorías es exactamente la secuencia de `kb.md`**, comparado con
  `toEqual(['Comida','Transporte','Entretenimiento','Servicios','Salud','Alquiler','Indumentaria','Hogar','Cuidado personal','Mascotas'])`
  — mitigación R-04, hallazgo del arch-auditor. **Ningún AC del PRD cubre esto**: entre AC-05 y
  AC-15 quedan 8 fronteras de orden sin fijar, y una transposición silenciosa pasaría en verde.
- [ ] El test estructural recorre el 100% de las 258 palabras clave y produce el plural que dictan
  las reglas — valida AC-15, NFR-04
- [ ] No hay ninguna palabra clave repetida entre categorías **después** de pluralizar — valida
  AC-15
- [ ] Plural regular: `farmacias` → Salud, `luces` → Servicios, `bares` → Entretenimiento — valida
  AC-06
- [ ] Invariantes: `netflixes` no matchea mientras `netflix` sí — valida AC-07
- [ ] Caso inverso: `expensa` y `anteojo` matchean sus entradas en plural — obligación de spec
  (`kb.md:347-348`)
- [ ] La tabla pluralizada se computa una vez, no por invocación — mitigación R-02

**Completion criterion**

Las 258 palabras clave recorridas, sin repeticiones tras pluralizar, y el orden normativo anclado a
`kb.md` por aserción literal.

---

## Block 4 — Núcleo del categorizador

**Files**
- `packages/categorization/src/categorizer.ts` (new) — recorrido en orden y asignación.
- `packages/categorization/tests/categorizer.test.ts` (new)

**Logic**

Recibe un Lugar, lo normaliza y tokeniza (Block 2), y recorre las categorías **en el orden normativo
de `kb.md`**, asignando **la primera** que presenta coincidencia (FR-05). No busca la mejor
coincidencia ni cuenta ocurrencias: gana la primera categoría en orden.

Las palabras clave de más de un token matchean **únicamente como secuencia contigua de tokens en ese
orden** (FR-07): `obra social swiss medical` matchea; los mismos tokens separados o invertidos, no.

Si ninguna palabra clave coincide, asigna `Otros` (FR-08), sin consultar ningún servicio externo
(NFR-03).

**Input validation**
- Entrada: el Lugar como `string`, y la lista de categorías vigentes.
- Un Lugar vacío resuelve a `Otros`, no a un error.

**Error handling**
- Ningún camino de este bloque lanza excepción por contenido del Lugar: todo texto que no matchea
  cae en `Otros`. Un gasto sin categorizar es un resultado válido del producto, no una falla.
- No se loguea el Lugar en ningún caso.

**Required tests**
- [ ] Desempate por orden normativo: `super y farmacia` → Comida, `comida para perro` → Mascotas —
  valida AC-05
- [ ] Multi-token contiguo: `obra social swiss medical` → Salud; separados o invertidos, no matchean
  — valida AC-08
- [ ] Sin coincidencia → `Otros`, sin llamadas externas: `comida 5000` → Otros — valida AC-09, NFR-03
- [ ] Lugar vacío → `Otros`
- [ ] **Ningún fuente de este bloque contiene `console.`, `logger` ni escritura a stdout** — test
  estructural sobre `categorizer.ts`; cubre la obligación de no loguear el Lugar

**Completion criterion**

El categorizador resuelve los casos de `kb.md` que tocan las 5 categorías con ejemplos, y respeta el
desempate por orden.

---

## Block 5 — Puerto y API pública

**Files**
- `packages/categorization/src/port.ts` (new) — interfaz del puerto del categorizador.
- `packages/categorization/src/index.ts` (modified) — barrel público.
- `packages/categorization/tests/port.test.ts` (new)

**Logic**

`port.ts` define la interfaz que los consumidores importan. La implementación concreta se obtiene por
una factory; **nunca se exporta la clase concreta** (FR-10, convención de `AGENTS.md`).

El barrel exporta, según **ADR-001**: el puerto, la factory, `tokenize` y `normalize`.
**No** exporta la tabla de palabras clave.

`tokenize`/`normalize` son públicos porque `kb.md` exige que las seis etapas del pipeline compartan
una única definición de token, y ubicarlas en `packages/domain` cerraría un ciclo entre paquetes
(`domain → categorization` ya existe por el puerto). El razonamiento completo está en ADR-001.

**Obligación diferida a FEAT-001b:** `kb.md:301-304` exige un test que recorra la tabla de palabras
clave contra la lista de muletillas para probar que ningún token pertenece a ambas. Las muletillas
son de FEAT-001b y están fuera de alcance acá. Como la tabla queda privada, **ese test se escribe en
este paquete** cuando FEAT-001b entregue la lista de muletillas. El PLAN de FEAT-001b debe levantar
esta obligación.

**Input validation**

No aplica: el puerto define contrato, no valida.

**Error handling**
- Los rechazos que devuelve el paquete llevan **motivo distinguible por regla**, nunca un rechazo
  genérico (decisión del PRD padre), y nunca el texto de entrada.

**Required tests**
- [ ] Un consumidor importa el puerto desde la interfaz pública del paquete — valida AC-14
- [ ] Un test sustituye la implementación concreta por un doble **sin modificar el código del
  consumidor** — valida AC-14
- [ ] El barrel exporta puerto, factory, `tokenize` y `normalize`, y **no** exporta la tabla de
  palabras clave — ADR-001
- [ ] **Todo rechazo que devuelve el paquete lleva un motivo identificable por regla y no incluye el
  texto de entrada que lo causó** — recorre los rechazos de la API pública; cubre el error
  documentado arriba

**Completion criterion**

Un consumidor puede categorizar contra el puerto y sustituirlo por un doble sin tocar su propio
código.

---

## Block 6 — Resolución del nombre de categoría marcado

**Files**
- `packages/categorization/src/category-name.ts` (new) — resolución y rechazos.
- `packages/categorization/tests/category-name.test.ts` (new)

**Logic**

Recibe un nombre de categoría **ya extraído** (quién lo extrae del input crudo es FEAT-001b) y la
lista de categorías vigentes visibles, y resuelve contra ella.

Usa **la misma** `normalize` de Block 2 — no una equivalente (`kb.md:186-189`: "es obligatorio que
sea la misma"). Reimplementar lowercase/acentos/espacios acá es exactamente el drift que `kb.md`
prohíbe.

Distingue tres desenlaces, cada uno con motivo propio (FR-09):
1. Coincide con una categoría vigente visible → resuelve a ella.
2. No coincide con ninguna → señala que **debe crearse**, sin crearla.
3. Coincide únicamente con una categoría **dada de baja** → señala que debe crearse una **nueva**,
   dejando intacta la dada de baja.

**Input validation**
- **La cota de 60 caracteres se verifica sobre el texto crudo, ANTES de normalizar** (NFR-05,
  mitigación R-08). Normalizar primero y medir después hace que un input enorme pague la
  normalización completa antes de ser rechazado.
- Un nombre que queda vacío tras normalizar se rechaza sin intentar resolverlo.

**Error handling**
- **Prohibido indexar la lista de categorías con un objeto literal** (mitigación R-05). Se usa `Map`
  u `Object.create(null)`. Un nombre marcado `__proto__` o `constructor` contra un objeto literal
  devuelve algo truthy que no es una categoría.
- Cada rechazo lleva motivo distinguible por regla, para que la interfaz pueda decirle al usuario qué
  corregir. Nunca devuelve el texto de entrada en el error.

**Required tests**
- [ ] Resuelve contra una categoría vigente tras normalizar: `Almuerzos` → `almuerzos` — valida AC-10
- [ ] Sin coincidencia → señala que debe crearse, y **no la crea** — valida AC-11
- [ ] Coincide solo con una dada de baja → señala crear una nueva, dejando intacta la dada de baja —
  valida AC-12
- [ ] Más de 60 caracteres → rechazo sin intentar resolver — valida AC-13, NFR-05
- [ ] Vacío tras normalizar → rechazo sin intentar resolver — valida AC-13
- [ ] **`__proto__`, `constructor` y `toString` como nombres marcados NO resuelven a ninguna
  categoría** — mitigación R-05
- [ ] La cota de longitud se aplica antes de normalizar — mitigación R-08
- [ ] Los tres desenlaces devuelven motivos distinguibles entre sí — decisión del PRD padre
- [ ] **Ningún rechazo de este bloque incluye el nombre marcado recibido en su motivo** — cubre el
  error documentado arriba (el nombre es PII potencial)

**Completion criterion**

Los tres desenlaces se distinguen por su motivo, los rechazos por longitud y vacío funcionan, y
`__proto__` no resuelve.

---

## Block 7 — Gates de calidad

**Files**
- `packages/categorization/tests/coverage.test.ts` (new) — verificación de manifiesto.
- `packages/categorization/tests/performance.test.ts` (new) — benchmark de AC-17.
- `packages/categorization/vitest.config.ts` (modified) — umbrales de cobertura.

**Logic**

Cierra el paquete verificando lo que solo es medible con todos los bloques anteriores en su lugar.

**Cobertura (NFR-01, AC-16):** umbral ≥90% en líneas, ramas y funciones sobre
`packages/categorization`, configurado en `vitest.config.ts` para que la suite **falle** al no
alcanzarlo, no solo lo reporte.

**Dependencias (NFR-02, AC-16):** un test lee el `package.json` del paquete y verifica 0
dependencias de runtime de terceros.

**Sin red ni LLM (NFR-03):** test estructural sobre los fuentes, hermano del de pureza de Block 1,
verificando que ningún módulo importe `node:http`, `node:https`, `fetch` ni SDK alguno.

**Performance (NFR-06, AC-17):** 1000 ejecuciones con un Lugar de 200 caracteres, p95 < 5 ms.
Estrategia anti-flaky, obligatoria porque un test de tiempo en CI es una fuente de fallos no
relacionados:
- Descartar las iteraciones de arranque en frío antes de medir.
- **No correr bajo instrumentación de cobertura**, que altera los tiempos.
- Aislado de otras suites sensibles al tiempo.

**Input validation**

No aplica.

**Error handling**

Los tres gates de este bloque fallan la suite en vez de reportar y seguir:
- Cobertura por debajo del umbral → `vitest` falla por configuración, no solo lo informa.
- El manifiesto declara alguna dependencia de runtime → el test falla nombrando cuál.
- El p95 supera los 5 ms → el test falla **reportando el valor medido**, para que el diagnóstico
  distinga "el código es lento" de "el CI estaba cargado". Por eso p95 y no promedio, y por eso el
  descarte de arranque en frío.

**Required tests**
- [ ] Cobertura ≥90% en líneas, ramas y funciones, con la suite fallando si no se alcanza — valida
  AC-16, NFR-01
- [ ] El `package.json` declara 0 dependencias de runtime de terceros — valida AC-16, NFR-02
- [ ] Ningún fuente importa red ni SDK de modelos de lenguaje — valida NFR-03
- [ ] Lugar de 200 caracteres, 1000 ejecuciones, p95 < 5 ms — valida AC-17, NFR-06

**Completion criterion**

`pnpm test` desde la raíz pasa entero, con cobertura ≥90% y el benchmark en verde.

---

## Final verification

Una vez completados los 7 bloques:

1. `pnpm test` desde la raíz compila ambos paquetes a `dist/` y la suite pasa completa (AC-01).
2. Los 17 criterios de aceptación del PRD tienen al menos un test que los valida.
3. Los tests que **ningún AC cubre** están presentes y en verde: guion y puntuación en tokenización,
   caso inverso de plurales, orden normativo anclado a `kb.md`, y `__proto__` en el nombre marcado.
4. Las 8 mitigaciones del threat model están implementadas en los bloques 1, 2, 3 y 6.
5. `packages/categorization` no importa Fastify, Prisma ni nada bajo `apps/`, y declara 0
   dependencias de runtime.
6. El barrel exporta exactamente lo que fija ADR-001, ni más ni menos.
7. La obligación diferida a FEAT-001b (test keywords ↔ muletillas) queda registrada para el PLAN de
   ese ticket.
