# PRD FEAT-001a: Bootstrap del monorepo y categorizador determinista

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a |
| Tracker | none |
| Date | 2026-08-11 |
| PRD loops | 0 |

## Context and Problem

Este es el primer sub-ticket de FEAT-001 (ver `prd-FEAT-001.md`, el PRD padre). Trae dos entregables
que van juntos porque el segundo no existe sin el primero.

**El monorepo.** El repositorio no tiene todavía ni un `package.json`. `AGENTS.md` ya declara la
forma que debe tener —pnpm workspaces, TypeScript 7, Vitest 4, `packages/*` compilados a `dist/`,
`build:packages` antes de `dev` y de `test`— y nadie la implementó. Sin eso no hay dónde poner
código.

**El categorizador.** Es la pieza que decide a qué categoría pertenece un gasto, y es donde vive el
riesgo de producto del PRD-001: RNF-02 exige 85% de acierto sin corrección del usuario. Las reglas ya
están cerradas en `kb.md` y no admiten interpretación: 258 palabras clave repartidas en 10
categorías cuyo **orden es normativo**, comparación por token completo y nunca por substring,
plurales derivados mecánicamente, y `Otros` cuando nada coincide. Reordenar la lista o mover una
palabra clave de una categoría a otra cambia clasificaciones que ya funcionaban.

Lo que hoy no existe y este ticket resuelve: no hay ningún lugar del sistema capaz de decidir la
categoría de un gasto, ni de resolver el marcador `#nombre` contra las categorías que el usuario
tiene vigentes.

La categorización no consulta ningún modelo de lenguaje ni servicio externo. Es una decisión de
producto del PRD-001, no una limitación técnica.

## Goals

1. Dejar el monorepo funcionando: `pnpm test` compila los paquetes y corre la suite desde la raíz.
2. Entregar `packages/categorization` puro, sin dependencias de runtime, implementando `kb.md` como
   está escrito.
3. Exponer el categorizador a través de su puerto, para que `FEAT-001b` lo consuma sin acoplarse a
   la implementación concreta.
4. Cubrir la tabla completa de palabras clave con tests estructurales, de modo que un cambio futuro
   en `kb.md` no pueda romper una categoría en silencio.

## Functional Requirements

- FR-01: El sistema debe proveer un monorepo pnpm con los workspaces `packages/domain` y
  `packages/categorization`, cada uno con su `vitest.config.ts` propio y su `main` apuntando a
  `dist/`, y debe compilar ambos paquetes antes de ejecutar los tests.
- FR-02: El sistema debe mantener `packages/categorization` libre de importaciones de Fastify,
  Prisma o cualquier módulo bajo `apps/`.
- FR-03: El sistema debe normalizar el texto para comparar pasándolo a minúsculas, descartando las
  marcas diacríticas y colapsando los espacios, sin alterar el texto original que recibe.
- FR-04: El sistema debe comparar las palabras clave contra el Lugar por token completo, nunca por
  substring.
- FR-05: El sistema debe recorrer las categorías en el orden normativo de `kb.md` y asignar la
  primera que presenta coincidencia.
- FR-06: El sistema debe hacer coincidir cada palabra clave también con su plural regular derivado
  mecánicamente, salvo las marcas, siglas y extranjerismos que `kb.md` declara invariantes.
- FR-07: El sistema debe hacer coincidir las palabras clave de más de un token únicamente como
  secuencia contigua de tokens en ese orden.
- FR-08: El sistema debe asignar la categoría `Otros` cuando ninguna palabra clave coincide con el
  Lugar.
- FR-09: El sistema debe resolver un nombre de categoría marcado contra la lista de categorías
  vigentes visibles que recibe como entrada, usando la misma normalización que define la unicidad de
  nombres, y debe señalar cuando ese nombre no corresponde a ninguna de ellas.
- FR-10: El sistema debe exponer el categorizador a través de un puerto, de modo que sus
  consumidores dependan de esa interfaz y no de la implementación concreta.

## Non-Functional Requirements

- NFR-01: La cobertura de tests de `packages/categorization` debe ser de al menos 90% en líneas,
  ramas y funciones.
- NFR-02: El paquete `packages/categorization` debe declarar 0 dependencias de runtime de terceros.
- NFR-03: El categorizador debe resolver la categoría con 0 llamadas de red y 0 invocaciones a
  modelos de lenguaje.
- NFR-04: Los tests estructurales deben recorrer el 100% de las 258 palabras clave de `kb.md` y sus
  plurales derivados.
- NFR-05: El sistema debe rechazar todo nombre de categoría que supere los 60 caracteres.
- NFR-06: El categorizador debe resolver un Lugar de hasta 200 caracteres en menos de 5 ms en el
  percentil 95, medido sobre 1000 ejecuciones en la suite de tests.

## Acceptance Criteria

- AC-01: WHEN se ejecuta `pnpm test` desde la raíz del monorepo (FR-01), THE sistema SHALL compilar
  `packages/domain` y `packages/categorization` a `dist/` antes de ejecutar los tests, y la suite
  SHALL terminar sin errores.
- AC-02: WHEN un test recorre los archivos fuente de `packages/categorization` (FR-02), THE sistema
  SHALL no presentar ninguna importación de `fastify`, `@prisma/client` ni de rutas bajo `apps/`.
- AC-03: WHEN el Lugar difiere de la palabra clave solo en mayúsculas, acentos o espacios repetidos
  (FR-03), THE sistema SHALL considerarlos equivalentes: `Almacen` coincide con `almacén` y `Médico`
  con `medico`.
- AC-04: WHEN el Lugar contiene una palabra clave como parte de otra palabra (FR-04), THE sistema
  SHALL no considerarla coincidencia: `naftalina` produce Otros y `supermercadito` produce Otros.
- AC-05: WHEN el Lugar contiene palabras clave de dos categorías distintas (FR-05), THE sistema
  SHALL asignar la primera en el orden normativo: `super y farmacia` produce Comida y `comida para
  perro` produce Mascotas.
- AC-06: WHEN el Lugar contiene el plural regular de una palabra clave (FR-06), THE sistema SHALL
  asignar su categoría: `farmacias` produce Salud, `luces` produce Servicios y `bares` produce
  Entretenimiento.
- AC-07: WHEN la palabra clave pertenece a la lista de invariantes de `kb.md` (FR-06), THE sistema
  SHALL no reconocer forma plural para ella: `netflixes` produce Otros mientras `netflix` produce
  Entretenimiento.
- AC-08: WHEN el Lugar contiene los tokens de una palabra clave compuesta en orden contiguo (FR-07),
  THE sistema SHALL asignar su categoría —`obra social swiss medical` produce Salud— y WHEN esos
  tokens aparecen separados o invertidos, THE sistema SHALL no considerarlos coincidencia.
- AC-09: WHEN ninguna palabra clave coincide con el Lugar (FR-08, NFR-03), THE sistema SHALL asignar
  `Otros` sin haber consultado ningún servicio externo: `comida 5000` produce Otros.
- AC-10: WHEN el nombre marcado coincide, tras normalizarlo a minúsculas sin acentos y con espacios
  colapsados, con una categoría vigente visible recibida como entrada (FR-09), THE sistema SHALL
  resolver a esa categoría: `Almuerzos` resuelve a la categoría vigente `almuerzos`.
- AC-11: IF el nombre marcado no coincide con ninguna categoría vigente visible (FR-09), THEN THE
  sistema SHALL señalar que esa categoría debe crearse, sin crearla.
- AC-12: IF el nombre marcado coincide únicamente con una categoría dada de baja (FR-09), THEN THE
  sistema SHALL señalar que debe crearse una categoría nueva, dejando intacta la dada de baja.
- AC-13: IF el nombre de categoría recibido supera los 60 caracteres o queda vacío tras normalizarlo
  (FR-09, NFR-05), THEN THE sistema SHALL rechazarlo sin intentar resolverlo.
- AC-14: WHEN un consumidor importa el paquete (FR-10), THE sistema SHALL exponer el puerto del
  categorizador como parte de su interfaz pública, y un test SHALL sustituir la implementación
  concreta por un doble sin modificar el código del consumidor.
- AC-15: WHEN el test estructural recorre las 258 palabras clave de `kb.md` (NFR-04), THE sistema
  SHALL producir para cada una el plural que dictan las reglas de derivación, y THE conjunto de
  palabras clave SHALL no presentar ninguna repetida entre categorías distintas.
- AC-16: WHEN se ejecuta la suite con reporte de cobertura (NFR-01, NFR-02), THE sistema SHALL
  alcanzar al menos 90% de líneas, ramas y funciones en `packages/categorization`, y THE
  `package.json` del paquete SHALL declarar 0 dependencias de runtime de terceros.
- AC-17: WHEN se mide la categorización de un Lugar de 200 caracteres sobre 1000 ejecuciones
  (NFR-06), THE sistema SHALL resolverlo en menos de 5 ms en el percentil 95.

## Out of Scope

- La extracción de campos desde el input crudo —separador de descripción, referencias temporales,
  numerales en palabras, tabla de desempate del monto, descarte de muletillas, Nombre y Tipo—.
  Es el alcance completo de FEAT-001b.
- El reconocimiento del marcador `#nombre` dentro del texto del usuario. Este ticket resuelve un
  nombre ya extraído; quién lo extrae del input es FEAT-001b.
- La API HTTP, la persistencia con Prisma, la interfaz y la autenticación.
- La creación y el almacenamiento de categorías. El categorizador recibe las categorías vigentes
  como entrada y señala cuándo falta una; no las crea ni las guarda.
- La medición de RNF-02 del PRD-001 (85% de acierto sin corrección), diferida según la decisión
  registrada en el PRD padre.
- La ampliación de la tabla de palabras clave de `kb.md`. Se implementa tal como está; agregar
  términos obliga a volver a medir RNF-02 y es un cambio de otro ticket.

## Risks and Mitigations

- **Riesgo**: el orden de las categorías y la ubicación de cada palabra clave son normativos, y
  reordenarlos cambia clasificaciones que ya funcionaban. → Mitigación: la tabla se implementa como
  dato ordenado derivado de `kb.md` en un único módulo, y AC-05 fija el desempate por orden con dos
  casos que `kb.md` ya resolvió.
- **Riesgo**: los ejemplos de `kb.md` tocan 5 de las 10 categorías, de modo que Entretenimiento,
  Salud, Alquiler, Hogar y Cuidado personal quedan con muy pocos casos semánticos. → Mitigación
  parcial: AC-15 recorre el 100% de la tabla sin afirmar semántica, y AC-06 suma un caso por cada
  regla de pluralización. Riesgo residual aceptado en la decisión registrada en el PRD padre.
- **Riesgo**: la derivación mecánica de plurales puede generar una forma que colisione con una
  palabra clave de otra categoría y cambie el desempate en silencio. → Mitigación: AC-15 verifica
  que no haya palabras clave repetidas entre categorías, y esa comprobación corre sobre el conjunto
  ya pluralizado.
- **Riesgo**: el monorepo es el primer código del repositorio, así que un error de configuración
  —`main` apuntando a `src/`, o `build:packages` sin encadenar— no rompe nada hoy y rompe en
  producción más adelante. → Mitigación: AC-01 verifica la cadena de compilación desde la raíz, y
  `AGENTS.md` ya declara esos dos errores como prohibidos.

## Dependencies

- `docs/daw/prd/kb.md` — anexo normativo y bloqueante. Aporta la normalización, la definición de
  token, las 258 palabras clave con su orden normativo, las reglas de derivación de plurales, la
  lista de invariantes y las reglas de resolución del nombre marcado.
- `docs/daw/prd/PRD.md` (PRD-001) — origen de los requerimientos que este ticket implementa: RF-06,
  RF-29, RF-30, RF-46, RF-47, y RF-14 en su parte de detección.
- `docs/daw/prd/prd-FEAT-001.md` — PRD padre, con las decisiones de alcance vigentes para este
  sub-ticket.
- `AGENTS.md`, sección "Architecture conventions" — impone la pureza del paquete (FR-02), su consumo
  compilado desde `dist/` (FR-01) y el consumo del categorizador a través de su puerto (FR-10).
- Node.js ≥ 22, pnpm workspaces, TypeScript 7 y Vitest 4 — declarados en `AGENTS.md`, sección
  "Stack". Ninguno está instalado todavía en el repositorio: este ticket los introduce.
- Consumidor futuro: `packages/domain` (FEAT-001b) consumirá este paquete a través de su puerto. No
  existe todavía y no es un bloqueante para este ticket.
