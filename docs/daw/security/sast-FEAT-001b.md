# SAST Report — FEAT-001b (Motor de extracción de campos del gasto)

Fecha: 2026-08-19
Alcance: diff completo de la rama `feat/FEAT-001b-extractor` contra `main` (`packages/domain`,
`packages/categorization`, config de workspace). `packages/domain` y `packages/categorization` son
lógica pura (sin Fastify, sin Prisma, sin HTTP, sin DB) — no procesan credenciales, no ejecutan
queries ni comandos, no renderizan HTML.

## Secretos (F-SAST-01)
✅ Sin coincidencias de patrones de API key/password/token/connection string. `.env` y `.env.*` están
en `.gitignore`.

## Inyección
✅ **SQL/NoSQL (F-SAST-02):** no aplica — ningún archivo del diff toca una base de datos.
✅ **Command injection (F-SAST-03):** único uso de `spawnSync` es en tests
(`packages/categorization/tests/purity.test.ts:14`, `packages/domain/tests/index.test.ts:5`), con
argumentos fijos (invocar `node` sobre un script generado por el propio test), sin input externo.
✅ **Path traversal (F-SAST-05):** los `readFileSync`/`writeFileSync` del diff están todos en tests
estructurales, operando sobre rutas del propio repo (`package.json`, `vitest.config.ts`, `dist/`) o
directorios temporales creados por el test (`mkdtempSync`), nunca sobre una ruta derivada de input de
usuario.

## XSS y funciones inseguras
✅ **XSS (F-SAST-06):** no aplica — no hay renderizado HTML en el diff.
✅ **eval/exec/deserialización insegura (F-SAST-04/F-SAST-17):** sin `eval()` ni `new Function()`.
`RegExp.exec()` en `category-marker.ts:35` y `temporal.ts:97` son el método nativo de matching de
regex, no ejecución de código.
✅ **Crypto débil (F-SAST-08):** no aplica — el diff no usa criptografía.

## Resto de categorías obligatorias
✅ **SSRF (F-SAST-07):** no aplica — no hay llamadas de red.
✅ **Debug mode (F-SAST-09):** no aplica — sin config de entorno en el diff.
✅ **Logging de datos sensibles (F-SAST-10):** el pipeline nunca loguea el texto crudo del gasto;
`RejectedExpense` no lleva el texto original (mitigación del threat model, Block 1).
✅ **Upload sin restricciones (F-SAST-11):** no aplica.
✅ **CSRF (F-SAST-12):** no aplica — sin endpoints HTTP en el diff.
✅ **Validación de input incompleta (F-SAST-14):** `parseExpense` nunca lanza excepción sobre input
malformado — siempre devuelve un `ParseResult` tipado (cubierto por
`packages/domain/tests/parse-expense.test.ts`, sección "never throws on malformed input").
✅ **Error handling que filtra internals (F-SAST-15):** no aplica — no hay manejo de errores hacia un
cliente externo en este paquete.

## Dependencias (F-SAST-13/16)
✅ `pnpm audit --prod`: sin vulnerabilidades conocidas.
✅ `packages/domain`: única dependencia de runtime `@ggasia/categorization` (interna, documentada
como excepción en ADR-001). `packages/categorization`: cero dependencias de runtime de terceros.
Ambos verificados también por `purity.test.ts` de cada paquete (AC-26/AC-16 respectivamente).

## Suppressions
0 — no hubo hallazgos Medium que suprimir.

---

Total: 0 vulnerabilidades (0 Critical, 0 High, 0 Medium sin resolver)
Result: PASSED

## Re-scan — corrective loop (fix AC-08, commit dd4affc)

Fecha: 2026-08-19
Alcance: `packages/domain/src/filler-words.ts` (nueva función `isBareMarkerSymbol`) y sus tests.

✅ **Secretos/inyección/XSS:** sin coincidencias en el diff.
✅ **ReDoS:** el regex nuevo (`/^[#$]+$/`, filler-words.ts:53) es una clase de caracteres simple
sin cuantificadores anidados ni alternación — sin riesgo de backtracking catastrófico, tiempo
lineal en el largo del token.
✅ **Dependencias:** sin cambios (`pnpm audit --prod` sigue limpio).

Total: 0 vulnerabilidades
Result: PASSED
