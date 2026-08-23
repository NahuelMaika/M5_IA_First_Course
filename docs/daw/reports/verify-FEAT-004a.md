# Verify Report FEAT-004a: Registro, login y logout — API

| Field | Value |
|-------|-------|
| Ticket | FEAT-004a |
| PRD | docs/daw/prd/prd-FEAT-004a.md |
| Spec | docs/daw/specs/spec-FEAT-004a.md |
| Threat model | docs/daw/security/threat-FEAT-004a.md |
| SAST | docs/daw/security/sast-FEAT-004a.md (PASSED, 0 vulnerabilidades) |
| Date | 2026-08-22 |
| Round | 1 |

## Resultado

**PASSED** — 0 FAIL, 3 WARNING no bloqueantes.

## Trazabilidad PRD → código → tests (F-VER-01)

Las 9 AC del PRD trazadas a código y test, las 9 con test pasando:

| AC | Código | Test(s) |
|---|---|---|
| AC-01 | `auth-service.ts:31-47` `register()` | `routes/auth.test.ts:106-125`, `services/auth-service.test.ts:54-70` |
| AC-02 | `schemas/auth.ts:15` `.min(8)` | `schemas/auth.test.ts:15-22`, `routes/auth.test.ts:154-170` |
| AC-03 | `auth-service.ts:38-40` | `routes/auth.test.ts:127-152`, `services/auth-service.test.ts:72-85` |
| AC-04 | `auth-service.ts:74-77`, `session-repository.ts:18-30` | `routes/auth.test.ts:202-229`, `repositories/session-repository.test.ts:66-76` |
| AC-05 | `auth-service.ts:61-72` (mismo outcome en ambas ramas) | `routes/auth.test.ts:231-256`, `services/auth-service.test.ts:104-122` |
| AC-06 | `login-throttle.ts`, `auth-service.ts:55-57`, `routes/auth.ts:61-64` | `lib/login-throttle.test.ts` (6/6), `routes/auth.test.ts:258-293` |
| AC-07 | `routes/auth.ts:80-88`, `session-repository.ts:45-47` | `routes/auth.test.ts:301-350` |
| AC-08 | `plugins/auth.ts` reescrito | `plugins/auth.test.ts:111-125`, `routes/expenses.test.ts:164-196` |
| AC-09 | `plugins/auth.ts:29-45` (cero lectura de header) | `plugins/auth.test.ts:127-141`, `routes/expenses.test.ts:513-573` |

## Cobertura de la spec (F-VER-02)

Los 11 bloques implementados 1:1 contra lo escrito. Dos desviaciones documentadas, ninguna un
defecto:

- **Block 1**: migración en dos pasos (nullable → backfill → NOT NULL) en vez del paso único que
  sugería el texto del spec — necesario porque la DB de test compartida ya tenía datos (el spec
  asumía "sin usuarios reales" sin contar la persistencia de esa DB). Documentado inline en la
  migración, criterio de cierre cumplido igual.
- **Block 10**: `Deps` de `auth-service` sin el campo `logger` que mostraba el código de ejemplo del
  spec — corregido durante la revisión del Block 9 (el import de Fastify violaba "servicios nunca
  importan Fastify" de AGENTS.md, y el campo no se usaba). Block 10 se implementó ya con la firma
  corregida.

## Suite completa (F-VER-04, F-VER-05, F-VER-06)

- ✅ F-VER-05 (typecheck): `pnpm --filter @ggasia/api run typecheck` — limpio, 0 errores. Sin
  linter configurado en el repo (no aplica).
- ✅ F-VER-06: cada test que lista cada bloque del spec existe y pasa, verificado 1:1 contra los
  `it(...)` reales de cada archivo (B1–B11, ver detalle en la sesión de verificación).
- ✅ F-VER-04: cada endpoint/función con input tiene al menos un sad-path — `/auth/register` (409,
  400, carrera P2002→500), `/auth/login` (401, 429), `authPreHandler` (sin cookie, cookie inválida,
  cookie expirada, `x-user-id` solo), `auth-service` (email duplicado, credenciales inválidas ×2,
  throttled, short-circuit del throttle).
  ⚠️ WARNING: la rama 400 de validación de `/auth/login` (Zod) no tiene un test dedicado — sí está
  cubierta por el 400 análogo de `/auth/register`, mismo código compartido. No bloqueante.
- ✅ Suite completa: **149/149 tests pasando**, 20 archivos. Una corrida en frío (cache vacía,
  latencia de red hacia la DB de test real en Supabase) mostró 2 archivos con timeout en sus
  hooks — reproducido dos veces en caliente con timeouts razonables: 100% verde ambas veces. No es
  una falla funcional, es presupuesto de timeout ajustado para este ambiente (WSL2 +
  `/mnt/c` + DB remota real). Ver WARNING abajo.

## Cobertura medida (F-VER-03)

`apps/api` no tiene `@vitest/coverage-v8` cableado en sus scripts (solo `packages/domain` y
`packages/categorization` lo declaran, con el piso de 90% que documenta AGENTS.md). Se corrió ad
hoc (`vitest run --coverage`) para esta verificación:

| Archivo (nuevo/modificado por este ticket) | Stmt | Branch | Func |
|---|---|---|---|
| `src/app.ts` | 100% | 100% | 100% |
| `src/lib/login-throttle.ts` | 100% | 100% | 100% |
| `src/lib/password.ts` | 100% | — | 100% |
| `src/plugins/auth.ts` | 100% | 100% | 100% |
| `src/repositories/session-repository.ts` | 100% | 100% | 100% |
| `src/repositories/user-repository.ts` | 100% | 100% | 100% |
| `src/routes/auth.ts` | 92.9% | 91.7% | 100% |
| `src/schemas/auth.ts` | 100% | — | — |
| `src/services/auth-service.ts` | 100% | 100% | 100% |
| **Agregado (9 archivos)** | **98.35%** | **97.87%** | **100%** |

✅ F-VER-03 PASS, muy por encima del piso de 80%. Las 2 líneas sin cubrir en `routes/auth.ts` son
la misma rama 400 de login ya anotada como WARNING arriba.

## Calidad

- ✅ W-VER-01: sin código muerto — `noUnusedLocals`/`noUnusedParameters` activos en todo el proyecto
  y el typecheck está limpio.
- ✅ W-VER-02: lógica de negocio (`auth-service`, `session-repository`, `user-repository`,
  `login-throttle`, `password`) al 100%, sin necesidad de warning.
- ⚠️ W-VER-03 (fragilidad), 2 hallazgos no bloqueantes:
  1. `lib/login-throttle.test.ts` usa emails literales fijos (no `randomUUID()`) contra el `Map`
     compartido a nivel de módulo. Seguro hoy (cada archivo de test corre en su propio proceso
     forkeado, `fileParallelism: false`), pero el patrón correcto (emails aleatorios) ya existe en
     `auth-service.test.ts`/`auth.test.ts` del mismo PR — valdría alinear este archivo a ese patrón
     en un ajuste futuro.
  2. Los timeouts default de la suite (30s/60s) quedan ajustados contra este ambiente específico
     (DB real remota + WSL2). Bloques 1 y 11 de este ticket agregaron trabajo a los hooks que
     mostraron el timeout (migración en Block 1, `sessionRepository.create` en el `beforeAll` de
     Block 11), acercando el margen. No es un defecto funcional — recomendación de seguimiento, no
     bloqueante para este ticket.

## Threat model — verificación a nivel de implementación completa

- ✅ R1 (throttle case-insensitive): `.toLowerCase()` en las 3 funciones, test de regresión pasa.
- ✅ R2 (token hasheado en reposo): SHA-256 antes de cada lectura/escritura, test confirma
  `stored.token !== rawToken`.
- ✅ R3 (login timing-safe): dummy hash precalculado, `verifyPassword` corre en la rama de email
  inexistente antes de `recordFailure` — cobertura de branch al 100% confirma que ese camino se
  ejecuta.
- ✅ R4 (anti session-fixation): `register`/`login` nunca leen una cookie entrante; el token de
  login siempre difiere del de register para el mismo usuario, verificado por test.
- ✅ R5 (x-user-id muerto): `grep -rn "x-user-id" apps/api/src` → 0 resultados, confirmado
  independientemente.

## Evidencia TDD

Confirmada durante CODE: cada uno de los 11 bloques tuvo su ronda de `daw-module-verifier`
verificando explícitamente el estado rojo-antes/verde-después con output real de comandos (no
autoreportado por el implementador sin verificar), documentado en el historial de la sesión de
CODE. No hay gap en este punto.

────────────────────────────────────────────────────────────
Total: 9/9 AC verificadas, 11/11 bloques implementados, cobertura 98.35%/97.87%/100% sobre la
superficie del ticket, 149/149 tests pasando, R1–R5 confirmados en el código mergeado.
FAILs: 0 | WARNINGs: 3 (no bloqueantes)
Result: PASSED
