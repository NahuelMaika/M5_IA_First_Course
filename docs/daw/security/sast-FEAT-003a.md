# SAST FEAT-003a: Listado de gastos vía API — GET /expenses

| Field | Value |
|-------|-------|
| Ticket | FEAT-003a |
| Scope | 11 archivos modificados en `apps/api` (5 bloques) — ver `git diff --stat main..HEAD -- apps/api/` |
| Date | 2026-08-21 |

## Secretos (F-SAST-01)

- ✅ Sin patrones de API key/password/token/connection string hardcodeados en `src/`.
- ✅ `.env` está en `.gitignore` (heredado, sin cambios de este ticket).

## Injection

- ✅ F-SAST-02 (SQL/NoSQL): `findManyForUser` usa la API de query de Prisma (`where`/`orderBy`/`take`/`include`), parametrizada. Sin `$queryRawUnsafe`/`$executeRawUnsafe` en código propio — las únicas apariciones son firmas de método en el cliente Prisma generado (`src/generated/prisma/`), no invocaciones.
- ✅ F-SAST-03 (command injection): sin `eval`, `exec`, `child_process` en el diff.
- ✅ F-SAST-05 (path traversal): sin `readFile`/`writeFile`/`createReadStream` en el diff — este ticket no toca el filesystem.

## XSS y funciones inseguras

- ✅ F-SAST-06: no aplica — `apps/api` no renderiza HTML, es API pura.
- ✅ F-SAST-04/17: sin `eval()` ni deserialización insegura.
- ✅ F-SAST-08: sin criptografía propia introducida por este ticket.

## Resto de categorías obligatorias

- ✅ F-SAST-07 (SSRF): sin llamadas salientes nuevas a URLs derivadas de input de usuario.
- ✅ F-SAST-09 (debug en producción): sin flags de debug ni `NODE_ENV` hardcodeado.
- ✅ F-SAST-10 (logging de datos sensibles): `deps.logger?.error({ err: error }, ...)` en `listExpenses` (expense-service.ts:210) nunca incluye `rawInput` ni filas de gasto — verificado por código y por el test explícito del Block 3 (`toEqual({ err: thrown })`, comparación exacta). `rawInput` no forma parte del mapeo de `ExpenseListItem` en absoluto.
- ✅ F-SAST-11 (upload sin restricción): no aplica, sin subida de archivos en este ticket.
- ✅ F-SAST-12 (CSRF): heredado sin cambios — el mecanismo de identificación sigue siendo el header `x-user-id` (riesgo ya aceptado en `threat-FEAT-002.md`/`threat-FEAT-003a.md`, no un hallazgo SAST nuevo).
- ✅ F-SAST-14 (validación de input incompleta): `listExpensesQuerySchema` (`schemas/expense.ts:30-32`) coacciona y acota `limit` a entero 1-200 con `z.coerce.number().int().min(1).max(200).default(50)` — cubre no-numérico, decimales, negativos, cero y fuera de rango, verificado por 7 tests del Block 4.
- ✅ F-SAST-15 (errores que filtran internals): `outcome === "internal_error"` en la route responde `{error: "internal_error"}` sin detalle (routes/expenses.ts) — mismo patrón que el POST de FEAT-002, verificado por test explícito ("sin exponer el error interno").

## Dependencias (F-SAST-13/16)

- ✅ `pnpm audit --prod`: sin vulnerabilidades conocidas.
- Sin dependencias nuevas agregadas por este ticket (solo usa `@prisma/client`, `zod`, `fastify` ya presentes).

## Suppressions

Ninguna. Sin hallazgos Medium que requieran supresión documentada.

## Verdict

```
┌─────────────────────────────────────────────────────────────┐
│  /daw-security-sast FEAT-003a — PASSED                       │
├─────────────────────────────────────────────────────────────┤
│  Secrets: ✅  Injection: ✅  XSS/unsafe: ✅  Deps: ✅          │
│  Suppressions: 0                                              │
│  Total: 0 vulnerabilities (0 critical, 0 high, 0 medium)      │
└─────────────────────────────────────────────────────────────┘
```
