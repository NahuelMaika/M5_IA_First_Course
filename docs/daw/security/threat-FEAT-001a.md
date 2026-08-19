# Threat Model — FEAT-001a

| Field | Value |
|-------|-------|
| Ticket | FEAT-001a — Bootstrap del monorepo y categorizador determinista |
| Date | 2026-08-17 |
| Tier | FEATURE |
| Diseño analizado | 7 bloques del plan de PLAN (ver `spec-FEAT-001a.md`) |

## Alcance real de la superficie

Este ticket no expone HTTP, no persiste nada, no autentica y no abre red. Lo que entrega es un
paquete puro: funciones que reciben strings y devuelven datos. Eso **reduce** la superficie, no la
elimina — y la reduce de forma desigual: Spoofing y Elevation of Privilege quedan sin actor posible,
mientras DoS y Tampering se concentran justamente porque el input es texto libre del usuario.

## Componentes analizados

| # | Componente | Bloque |
|---|---|---|
| C1 | `normalize.ts` | 2 |
| C2 | `tokenize.ts` | 2 |
| C3 | `keywords.ts` (dato normativo) | 3 |
| C4 | `pluralize.ts` | 3 |
| C5 | `categorizer.ts` | 4 |
| C6 | `port.ts` + `index.ts` (API pública) | 5 |
| C7 | `category-name.ts` | 6 |
| C8 | Cadena de build del monorepo | 1 |

## Trust boundaries (F-TM-02)

- **TB-1 — Consumidor → API pública del paquete (C6).** El `Lugar` y el nombre marcado nacen como
  texto libre escrito o dictado por el usuario. Cruzan esta frontera **sin sanitizar**, porque el
  paquete es justamente quien los interpreta. Es la frontera que importa.
- **TB-2 — `kb.md` → `keywords.ts` (C3).** Frontera de *build time*, no de runtime. El dato lo
  controla el repo, no el usuario. El riesgo acá no es inyección: es divergencia silenciosa.
- **TB-3 — Registro de pnpm → cadena de build (C8).** Sin dependencias de runtime (NFR-02), pero
  TypeScript y Vitest entran como devDependencies.
- **No existe** frontera cliente→servidor, servidor→DB ni servicio→externo en este ticket. Aparecen
  cuando lleguen la API y la persistencia, en otros tickets.

## Clasificación de datos (F-TM-05, F-TM-07)

| Dato | Clasificación | Tratamiento |
|---|---|---|
| `Lugar` (texto libre del gasto) | **PII potencial + contexto financiero** — puede contener nombres propios, direcciones o prestadores de salud | En memoria, durante la llamada. No se persiste, no se loguea, no sale por red. |
| Nombre de categoría marcado | PII potencial (mismo motivo) | Ídem |
| Categorías vigentes (input) | Datos del usuario, no sensibles por sí mismos | Ídem |
| Tabla de 258 palabras clave | Público (deriva de `kb.md`, versionado) | Compilado al bundle |

**Sobre F-TM-07 (cifrado en reposo y en tránsito):** este paquete **no tiene reposo ni tránsito**.
No escribe a disco, no abre sockets y no mantiene estado entre llamadas. El cifrado del `Lugar` es
obligación de los tickets de persistencia y de API, donde sí existen ambos. Se declara acá para que
quede el rastro: la ausencia de cifrado en FEAT-001a no es una omisión, es que no hay dónde
aplicarlo.

**Obligación heredada:** ningún componente de este paquete debe loguear el `Lugar` ni el nombre
marcado, ni siquiera en mensajes de error. Un rechazo devuelve un motivo por regla —según la
decisión del PRD padre—, nunca el texto que lo causó.

## STRIDE por componente (F-TM-01)

| Componente | S | T | R | I | D | E |
|---|---|---|---|---|---|---|
| C1 `normalize` | n/a | R-03 | n/a | — | R-01 | n/a |
| C2 `tokenize` | n/a | R-03 | n/a | — | R-01 | n/a |
| C3 `keywords` | n/a | **R-04** | n/a | — | — | n/a |
| C4 `pluralize` | n/a | R-04 | n/a | — | R-02 | n/a |
| C5 `categorizer` | n/a | — | R-06 | — | R-02 | n/a |
| C6 API pública | n/a | — | n/a | R-07 | — | n/a |
| C7 `category-name` | n/a | **R-05** | n/a | — | R-08 | n/a |
| C8 build | n/a | R-09 | n/a | — | — | n/a |

- **Spoofing / Elevation of Privilege:** sin actores, sin identidades y sin privilegios en el
  paquete. No hay vector. No es que no se analizó — es que no existe.
- **Repudiation (R-06):** el categorizador no loguea. Es deliberado y correcto: la trazabilidad de
  qué categoría se asignó a qué gasto pertenece a la capa que persiste el gasto, no a la función
  pura que la calcula. Riesgo aceptado, ver abajo.
- **Information Disclosure:** el paquete no tiene acceso a datos de otros usuarios. R-07 cubre lo
  único real: qué expone la API pública.

## Riesgos y mitigaciones (F-TM-03)

| ID | Riesgo | STRIDE | Prob. | Impacto | Mitigación |
|---|---|---|---|---|---|
| **R-01** | **ReDoS en las regex de normalización/tokenización.** Un `Lugar` de 200 caracteres con puntuación repetida puede disparar backtracking catastrófico si la tokenización usa cuantificadores anidados. | D | Media | Medio | Prohibido en el spec: nada de cuantificadores anidados ni alternancias con prefijos solapados. Tokenización por escaneo lineal de caracteres o clases simples. El test de AC-17 (p95 < 5ms) actúa de canario, y se agrega un caso adversarial explícito: 200 caracteres de puntuación. |
| **R-02** | **Explosión algorítmica.** 258 keywords × plurales × ventanas de tokens contiguos, recalculado en cada llamada. | D | Media | Medio | La tabla pluralizada se computa **una sola vez al cargar el módulo**, nunca por invocación. El spec lo fija como requisito de implementación, no como optimización opcional. |
| **R-03** | **Evasión por homoglifos / forma Unicode.** `farmacia` con una `а` cirílica no matchea; dos formas Unicode distintas del mismo acento normalizan distinto si no se fija la forma. | T | Baja | Bajo | `normalize.ts` fija explícitamente la forma de normalización Unicode (NFD + descarte de marcas diacríticas) y lo documenta. Homoglifos: **riesgo aceptado** (ver abajo). |
| **R-04** | **Divergencia silenciosa entre `kb.md` y `keywords.ts`.** Alguien edita la tabla compilada sin tocar el anexo normativo, o reordena categorías. | T | **Alta** | **Alto** | Test estructural que ancla el array de orden de categorías a la secuencia literal de `kb.md` (`toEqual`), más el recorrido del 100% de las 258 palabras. Es el hallazgo del arch-auditor, y es la mitigación del riesgo #1 nombrado por `kb.md`. |
| **R-05** | **Prototype pollution en la resolución del nombre marcado.** Si las categorías vigentes se indexan en un objeto literal, un nombre como `__proto__` o `constructor` resuelve a algo que no es una categoría. | T | Media | Medio | Prohibido indexar input del usuario contra objetos literales. Se usa `Map`, o `Object.create(null)`. Caso de test obligatorio con `__proto__`, `constructor` y `toString` como nombres marcados. |
| **R-06** | Sin logging: no queda rastro de qué categoría se asignó. | R | Alta | Bajo | **Riesgo aceptado** (ver abajo). |
| **R-07** | **Sobreexposición de la API pública.** Exportar de más acopla FEAT-001b a internos del paquete. | I | Media | Bajo | ADR-001 fija exactamente qué se exporta: puerto, factory, `tokenize`, `normalize`. La tabla de keywords queda privada. |
| **R-08** | **Normalización antes del control de longitud.** Si `category-name.ts` normaliza y después mide los 60 caracteres, un input enorme paga la normalización completa antes de ser rechazado. | D | Media | Bajo | El control de cota se hace sobre la longitud cruda **antes** de normalizar. AC-13 exige el rechazo; el spec fija el orden. |
| **R-09** | **Cadena de suministro en devDependencies** (TypeScript, Vitest). | T | Baja | Medio | 0 dependencias de runtime, verificado por AC-16. Lockfile de pnpm commiteado. Sin scripts de post-install propios. (W-TM-01 cubierto.) |

## Riesgos aceptados (F-TM-04)

**RA-01 — Evasión por homoglifos (parte de R-03)**
- **Quién acepta:** el usuario/dueño del producto, en la sesión de PLAN de FEAT-001a (2026-08-17).
- **Justificación:** el único actor capaz de escribir un homoglifo en el `Lugar` es el propio dueño
  del gasto, y el único perjuicio es que su propio gasto caiga en `Otros`. No hay cruce de datos
  entre usuarios ni escalada. Defenderse implicaría un mapa de confusables Unicode, que es más
  código y más riesgo de falsos positivos que el problema que evita.
- **Condición de revisión:** si el producto incorpora ingreso de gastos por un tercero (importación,
  API pública, cuentas compartidas con permisos), deja de valer y se re-evalúa.

**RA-02 — Ausencia de logging / no repudio (R-06)**
- **Quién acepta:** el usuario/dueño del producto, en la sesión de PLAN de FEAT-001a (2026-08-17).
- **Justificación:** `packages/categorization` es puro por mandato de `AGENTS.md`. Loguear desde acá
  exigiría inyectar un logger y romper esa pureza, además de arriesgar que el `Lugar` —PII
  potencial— termine escrito en un archivo. La trazabilidad pertenece a la capa que persiste el
  gasto, donde el dato ya está y la categoría asignada queda guardada en el registro.
- **Condición de revisión:** cuando exista la capa de persistencia, verificar que el gasto guarde su
  categoría asignada. Si no lo hace, el no repudio se pierde de punta a punta y hay que resolverlo.

## Mitigaciones a plegar al spec

1. **Bloque 2:** sin cuantificadores anidados en las regex; escaneo lineal. Caso adversarial de
   200 caracteres de puntuación en los tests (R-01).
2. **Bloque 2:** forma de normalización Unicode explícita y documentada (R-03).
3. **Bloque 3:** tabla pluralizada precomputada una vez al cargar el módulo (R-02).
4. **Bloque 3:** aserción del orden normativo de categorías contra la secuencia literal de `kb.md`
   (R-04) — ya incorporada por el hallazgo del arch-auditor.
5. **Bloque 6:** `Map` u `Object.create(null)`, nunca objeto literal indexado por input del usuario;
   tests con `__proto__`, `constructor` y `toString` (R-05).
6. **Bloque 6:** cota de longitud sobre el texto crudo, antes de normalizar (R-08).
7. **Transversal:** ningún componente loguea el `Lugar` ni el nombre marcado, ni en errores. Los
   rechazos devuelven motivo por regla, nunca el texto de entrada.
8. **Bloque 1:** lockfile de pnpm commiteado; 0 dependencias de runtime (R-09).

## Verificación del catálogo (§3)

| Regla | Estado |
|---|---|
| F-TM-01 — STRIDE por componente | ✅ 8 componentes × 6 categorías |
| F-TM-02 — Trust boundaries | ✅ 3 declaradas, y las ausentes justificadas |
| F-TM-03 — Toda amenaza con mitigación o aceptación | ✅ 9 riesgos: 7 mitigados, 2 aceptados |
| F-TM-04 — Riesgo aceptado con los 3 campos | ✅ RA-01 y RA-02 con quién, por qué y condición de revisión |
| F-TM-05 — Datos sensibles clasificados | ✅ 4 categorías de dato |
| F-TM-06 — Referencia a la arquitectura real | ✅ los 8 componentes son los del plan, por bloque |
| F-TM-07 — Cifrado de PII | ✅ declarado no aplicable, con el motivo y la obligación heredada |
| W-TM-01 — Análisis de dependencias | ✅ R-09 |
| W-TM-02 — Análisis de disponibilidad | ✅ R-01, R-02, R-08 |
