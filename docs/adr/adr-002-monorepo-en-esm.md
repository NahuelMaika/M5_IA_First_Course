# ADR-002: El monorepo se compila a ESM, no a CommonJS

| Field | Value |
|-------|-------|
| Date | 2026-08-17 |
| Ticket | FEAT-001a |
| Status | Accepted |

## Context

El bootstrap del monorepo nació con `module: commonjs` en `tsconfig.base.json`, elegido para evitar
la fricción de escribir la extensión `.js` en los imports relativos. La auditoría de arquitectura del
bloque 1 lo marcó como FAIL antes de que existiera una sola línea de código real.

El stack declarado en `AGENTS.md` es ESM-first de punta a punta: Fastify 5 en `apps/api`, Next.js 16
y React 19 en `apps/web`. `packages/categorization` va a ser consumido por ambos, y su superficie
pública está fijada por [[adr-001-tokenizacion-compartida-en-categorization]].

## Options considered

### Option 1: CommonJS
- **Pros:** imports relativos sin extensión; menos configuración inicial.
- **Cons:** la interoperabilidad de named exports desde CJS hacia ESM se resuelve por **análisis
  estático heurístico** (`cjs-module-lexer`), no por contrato. Un consumidor ESM que haga
  `import { createCategorizer } from "@ggasia/categorization"` puede fallar **en runtime** con
  `SyntaxError: does not provide an export named …`, compilando limpio. **Vitest no lo detecta**,
  porque resuelve por Vite y no por el loader ESM de Node: el error aparece recién cuando arranca la
  API. Además, con `module: commonjs` y sin `moduleResolution` explícito, TypeScript cae al resolver
  legacy `node10`, que no entiende el campo `exports` — el mismo que hace falta para que la
  privacidad de la tabla de palabras clave que fija ADR-001 sea estructural y no una convención. Y
  ningún paquete de terceros ESM-only puede consumirse.

### Option 2: ESM (`nodenext`)
- **Pros:** alineado con todo el stack declarado. Interoperabilidad por contrato, no por heurística.
  Habilita `exports`, y con él la privacidad estructural de ADR-001. Silencia la deprecación de carga
  de configs CJS de Vite.
- **Cons:** exige extensión en los imports relativos, y `__dirname` deja de existir.

### Option 3: CommonJS ahora, migrar después
- **Pros:** ninguno que sobreviva al análisis.
- **Cons:** el costo crece de forma no lineal. Hoy son 4 archivos y cero código real. En el bloque 5
  son ~16 archivos de fuentes y tests. Con `apps/api` y `apps/web` existiendo, es una reescritura de
  imports de todo el monorepo más dos configuraciones de framework.

## Decision

**Opción 2.** `module` y `moduleResolution` en `nodenext`, y `"type": "module"` en los tres
manifiestos.

El argumento decisivo no es de estilo: es que el modo de falla de CJS→ESM **compila limpio, pasa los
tests y rompe en producción**. Es exactamente la forma de cicatriz que `AGENTS.md` ya tiene
registrada tres veces en "What NOT to do", y la única ventana barata para evitarla es ahora.

La fricción de las extensiones, que era el motivo original de elegir CJS, se resuelve con
`rewriteRelativeImportExtensions: true`, disponible en TypeScript 7: el código fuente escribe
`./normalize.ts` y el emitido queda como `./normalize.js`.

## Consequences

- `tsconfig.base.json` usa `module: nodenext` y `moduleResolution: nodenext`.
- Los tres `package.json` declaran `"type": "module"`.
- Los imports relativos llevan extensión; `rewriteRelativeImportExtensions` permite escribirlos `.ts`.
- `__dirname` se reemplaza por `import.meta.dirname` en los tests.
- Se habilita el campo `exports`, que convierte la privacidad de `keywords.ts` de ADR-001 en una
  restricción que el runtime aplica, en vez de una promesa.
- Desaparece la advertencia de Vite sobre cargar configs con sintaxis ESM como CommonJS.
- Se acepta que cualquier dependencia futura CJS-only requiera interoperabilidad explícita. Dado que
  `packages/categorization` declara 0 dependencias de runtime, el riesgo es de las apps, no del
  motor de gastos.
