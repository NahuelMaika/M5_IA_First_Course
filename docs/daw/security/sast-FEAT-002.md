# SAST Report — FEAT-002 (Alta de gasto vía API — auth stub + persistencia)

Fecha: 2026-08-19
Alcance: los 11 bloques del ticket — `apps/api` completo (scaffolding, `schema.prisma`, seed, plugin
Prisma, barrel de `@ggasia/categorization`, auth stub, schema Zod, repositorios, service, ruta
`POST /expenses`, tests de integración) y `packages/categorization/src/index.ts` (Bloque 5).

## Secretos (F-SAST-01)
✅ Sin coincidencias de patrones de API key/password/token/connection string en código fuente. Único
match del scan es un fixture de test claramente ficticio
(`apps/api/tests/env.test.ts:4`, `postgresql://user:pass@localhost:5432/ggasia`). `.env` y `.env.*`
están en `.gitignore`.

## Inyección
✅ **SQL/NoSQL (F-SAST-02):** sin `$executeRawUnsafe`/`$queryRawUnsafe` en ningún punto. Los dos usos
de `$executeRaw`/`$queryRaw` (tests de índices únicos parciales, Bloque 2) usan template literals
parametrizados de Prisma, no concatenación de strings.
✅ **Command injection (F-SAST-03):** los dos `execSync("pnpm exec prisma migrate deploy")`
(`tests/prisma-schema.test.ts`, `tests/expenses.integration.test.ts`) son un string estático, sin
interpolación de ningún input externo.
✅ **Path traversal (F-SAST-05):** no aplica — ningún archivo de este ticket construye una ruta de
filesystem a partir de input de usuario.

## XSS y funciones inseguras
✅ **XSS (F-SAST-06):** no aplica — API JSON pura, sin renderizado HTML.
✅ **eval/exec/deserialización insegura (F-SAST-04/F-SAST-17):** sin `eval()`/`new Function()` en
ningún archivo del ticket.
✅ **Crypto débil (F-SAST-08):** no aplica — sin passwords ni hashing en este ticket (fuera de
alcance, declarado explícitamente en el PRD).

## Resto de categorías obligatorias
✅ **SSRF (F-SAST-07):** sin `fetch`/`axios`/`http.request` en `apps/api/src`.
✅ **Debug mode (F-SAST-09):** sin flags de debug; `env.ts` aborta el proceso ante configuración
inválida (NFR-03), nunca arranca en estado degradado.
✅ **Logging de datos sensibles (F-SAST-10):** verificado con grep exhaustivo — `rawInput` nunca
aparece en un log en todo `apps/api/src`. El logger inyectado en `expense-service.ts` recibe el error
real de Prisma para diagnóstico, sin incluir `rawInput`. `env.ts` solo loguea nombres de campos
fallidos al arrancar, nunca sus valores.
✅ **Upload sin restricciones (F-SAST-11):** no aplica — sin endpoints de carga de archivos en este
ticket (audio queda fuera de alcance).
✅ **CSRF (F-SAST-12):** no aplica — sin `@fastify/cors`, sin cookies de sesión; API stateless por
header `x-user-id` (riesgo aceptado, ver threat model).
✅ **Validación de input incompleta (F-SAST-14):** el body de `POST /expenses` se valida con Zod
(Bloque 7); el único otro input, el header `x-user-id`, se resuelve vía `userRepository.findById` —
un valor no-UUID simplemente no matchea (401), sin llegar a lógica de negocio sin resolver.
✅ **Error handling que filtra internals (F-SAST-15):** el 500 de `routes/expenses.ts` es genérico
(`{ error: "internal_error" }`); el error real de Prisma solo se loguea server-side, nunca se
serializa hacia el cliente. El 400 de Zod expone únicamente el detalle de validación del propio body
enviado por el usuario, no estado interno del servidor.

## Dependencias (F-SAST-13/16)
🟠 **HIGH encontrado y corregido**: `deepmerge-ts@<8.0.0` (GHSA-ggr8-5vv4-36mx, stack exhaustion
mergeando grafos de objetos recursivos), traído transitivamente vía
`@prisma/client → @prisma/config → deepmerge-ts`. Uso real confirmado: exclusivo de
`loadConfigTsOrJs` en `@prisma/config`, invocado solo por el CLI de Prisma (`migrate`/`generate`/
`db seed`) al cargar `prisma.config.ts` — nunca alcanzable desde el runtime de `apps/api` sirviendo
requests HTTP. Igual, F-SAST-13 no permite suprimir un High: como Prisma 7.9.1 (última estable) no
trae una versión parcheada de `deepmerge-ts` todavía, se fijó un override de pnpm
(`pnpm-workspace.yaml`, `overrides: { deepmerge-ts: ^8.0.0 }`) a `deepmerge-ts@8.0.1`. Verificado:
`pnpm audit --prod` limpio, build/typecheck/`prisma validate` siguen funcionando tras el override.
✅ Sin otras vulnerabilidades Critical/High/Medium en `pnpm audit --prod`.

## Suppressions
Ninguna — el único hallazgo (HIGH en `deepmerge-ts`) se corrigió, no se suprimió.

---

```
┌─────────────────────────────────────────────────────────────┐
│  /daw-security-sast — PASSED                                  │
├─────────────────────────────────────────────────────────────┤
│  Secrets: ✅ 1 checked                                        │
│  Injection: ✅ 3 checked (SQL, command, path traversal)        │
│  XSS y funciones inseguras: ✅ 3 checked                       │
│  Dependencias: ✅ 1 HIGH encontrado y corregido (override pnpm)│
│  Suppressions: 0                                               │
│  ────────────────────────────────────────────────────────────│
│  Total: 10 clean, 1 vulnerabilidad corregida (0 abiertas)      │
│  Report: docs/daw/security/sast-FEAT-002.md                    │
│  Next: gates.sast = true, cerrar CODE                          │
└─────────────────────────────────────────────────────────────┘
```
