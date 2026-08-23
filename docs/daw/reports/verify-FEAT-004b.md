# Verify Report FEAT-004b: Registro, login y logout — UI

| Field | Value |
|-------|-------|
| Ticket | FEAT-004b |
| PRD | docs/daw/prd/prd-FEAT-004b.md |
| Spec | docs/daw/specs/spec-FEAT-004b.md |
| Threat model | docs/daw/security/threat-FEAT-004b.md (PASSED, R1/R2 riesgo aceptado por el usuario) |
| Date | 2026-08-23 |
| Round | 1 |

## Resultado

**PASSED** — 0 FAIL, 2 WARNING no bloqueantes.

## Trazabilidad PRD → código → tests (F-VER-01)

Las 6 AC del PRD trazadas a código y test, las 6 con test pasando (verificando comportamiento real,
no solo un status code):

| AC | Código | Test(s) |
|---|---|---|
| AC-01 (FR-01) | `register-form.tsx:submitRegistration` → `auth.ts:registerUser` | `register-form.test.tsx`: "a successful submit calls registerUser..." + `duplicate_email`/`validation_error`/`unknown_error` (5 casos) |
| AC-02 (FR-02) | `login-form.tsx:submitLogin` → `auth.ts:loginUser` | `login-form.test.tsx`: "a successful submit calls loginUser..." + `invalid_credentials`/`too_many_attempts`/`validation_error`/`unknown_error` (6 casos) |
| AC-03 (FR-03) | `logout-button.tsx:handleClick` → `auth.ts:logoutUser` | `logout-button.test.tsx`: "a successful click calls logoutUser and redirects to /login (AC-03)" |
| AC-04 (FR-04) | `client.ts:apiRequest` (`credentials: "include"`, sin `headers.set("x-user-id", ...)`) | `client.test.ts`: "sends every request... with credentials: 'include'" + "does NOT attach the x-user-id header under any circumstance" (prueba negativa explícita) |
| AC-05 (FR-05) | `register-form.tsx`/`login-form.tsx`, caso `"created"`/`"success"` → `router.push("/")` | Mismos tests de submit exitoso de AC-01/AC-02, ambos assertan `mockedPush` con `"/"` |
| AC-06 (FR-06) | `expense-list.tsx:loadExpenses` + `use-redirect-on-unauthorized.ts:useRedirectOnUnauthorized` | `expense-list.test.tsx`: "redirects to /login without showing the generic error state when the initial load returns 401 (AC-06)"; `use-redirect-on-unauthorized.test.ts` (2 casos, hook aislado) |

Refuerzo adicional no exigido literalmente por AC-06 pero sí por el spec (Block 8, gap del Impact
Scan confirmado por el usuario): `expense-form.tsx:submitExpense` aplica la misma política ante un
401 al enviar un gasto — `expense-form.test.tsx`: "401 redirects to /login without calling notify".

## Non-functional requirements

| NFR | Verificación |
|---|---|
| NFR-01 (único módulo que construye `/auth/*`) | Confirmado por lectura de código: `register-form.tsx`, `login-form.tsx`, `logout-button.tsx` importan `registerUser`/`loginUser`/`logoutUser` de `@/lib/api/auth`, ninguno importa `apiRequest` para `/auth/*`. Sin test dedicado — mismo criterio que el spec adoptó para su propio "Completion criterion" (verificación manual/Impact-Scan, no un test automatizado de grep). |
| NFR-02 (`type="password"`) | `register-form.test.tsx` y `login-form.test.tsx`, un test dedicado cada uno |
| NFR-03 (sin `window.alert`/`confirm`) | Confirmado por lectura de código: los 6 componentes nuevos/modificados usan exclusivamente `notify()` |

## Cobertura de la spec (F-VER-02, F-VER-06)

Los 8 bloques implementados 1:1 contra lo escrito, sin desviaciones:

| Bloque | Tests requeridos por el spec | Implementados |
|---|---|---|
| Block 1 — CORS credentials | 2/2 | ✅ (`cors.test.ts`, incluye el preflight preexistente sin tocar) |
| Block 2 — Cliente HTTP | 3/3 | ✅ |
| Block 3 — `auth.ts` | 4/4 | ✅ (+2 extra: 201/200 con body malformado → `unknown_error`) |
| Block 4 — Registro | 7/7 | ✅ |
| Block 5 — Login | 8/8 | ✅ |
| Block 6 — Logout | 2/2 | ✅ (+1 extra: promise rechazada) |
| Block 7 — `expense-list.tsx` | 4/4 | ✅ |
| Block 8 — `expense-form.tsx` | 3/3 | ✅ |

`.env.example` sin `NEXT_PUBLIC_STUB_USER_ID` confirmado (Block 2). `grep -rn "x-user-id"
apps/web/src` solo aparece en el texto de la prueba negativa de `client.test.ts` ("does NOT attach
the x-user-id header"), cero referencias funcionales — confirma el "Final verification" del spec.

## Suite completa y typecheck (F-VER-05)

- ✅ `apps/web`: `pnpm run typecheck` (`tsc --noEmit`) — limpio, 0 errores.
- ✅ `apps/api`: `pnpm run typecheck` (`tsc -p tsconfig.test.json`) — limpio, 0 errores.
- ✅ Sin linter configurado en el repo (ni `apps/web` ni `apps/api` declaran script `lint`) — no
  aplica F-VER-05 en esa mitad de la regla.
- ✅ `apps/api`: **150/150 tests pasando**, 20 archivos (incluye los 2 nuevos casos de Block 1 en
  `cors.test.ts`).
- ✅ `apps/web`: los 8 archivos nuevos/modificados por este ticket — **67 tests, 67 pasando**
  (`client.test.ts` 3, `auth.test.ts` 12, `use-redirect-on-unauthorized.test.ts` 2,
  `register-form.test.tsx` 8, `login-form.test.tsx` 10, `logout-button.test.tsx` 3,
  `expense-list.test.tsx` — incl. el nuevo caso 401/AC-06, `expense-form.test.tsx` — incl. el nuevo
  caso 401/Block 8).

## Sad-path (F-VER-04)

Todo endpoint/función con input tiene al menos un caso inválido:

- `apiRequest`: `NEXT_PUBLIC_API_URL` ausente → throw antes de llamar `fetch`.
- `registerUser`/`loginUser`/`logoutUser`: status inesperado, `apiRequest` rechazada (falla de red),
  body no-JSON en un 2xx.
- `RegisterForm`/`LoginForm`: email con formato inválido, password corto/vacío (client-side);
  `duplicate_email`/`invalid_credentials`/`too_many_attempts`/`validation_error`/`unknown_error`
  (server-side); promesa rechazada.
- `LogoutButton`: `unknown_error`, promesa rechazada.
- `useRedirectOnUnauthorized`: status no-401 → sin efecto.
- `expense-list.tsx`/`expense-form.tsx`: 401, 400/500, network failure — cada camino con su propio
  test, incluida la regresión de que 401 YA NO cae en el mensaje genérico.

## Cobertura medida (F-VER-03)

`apps/web` no tiene `@vitest/coverage-v8` cableado en scripts; se corrió ad hoc
(`vitest run --coverage --pool=forks`, ver nota de entorno abajo) sobre los archivos
nuevos/modificados por este ticket:

| Archivo | Stmt | Branch | Func | Line |
|---|---|---|---|---|
| `src/lib/api/client.ts` | 100% | 100% | 100% | 100% |
| `src/lib/api/auth.ts` | 100% | 100% | 100% | 100% |
| `src/lib/auth/use-redirect-on-unauthorized.ts` | 100% | 100% | 100% | 100% |
| `src/components/logout-button.tsx` | 100% | 100% | 100% | 100% |
| `src/components/login-form.tsx` | 93.84% | 81.81% | 100% | 93.84% |
| `src/components/register-form.tsx` | 92.42% | **79.41%** | 100% | 92.42% |
| `src/components/expense-list.tsx` (modificado, Block 7) | 97.72% | 94.44% | 100% | 100% |
| `src/components/expense-form.tsx` (modificado, Block 8) | 94.91% | 92.3% | 100% | 96.42% |
| `apps/api/src/app.ts` (línea CORS, Block 1) | 100% | — (sin rama nueva) | 100% | 100% |
| **Agregado (sobre el diff de este ticket)** | **~95%** | **~87–88%** | **100%** | **~96%** |

✅ F-VER-03 PASS en agregado — muy por encima del piso de 80% en las tres métricas.

⚠️ **WARNING**: `register-form.tsx` cae a **79.41% de branch** (27/34), individualmente por debajo
del piso de 80%. Ramas sin ejercitar, identificadas por línea:
- `handleEmailChange`/`handlePasswordChange` (líneas 78-79, 86-87): el camino "RF-81 — ocultar el
  error mientras se tipea, sin esperar blur", cuando el valor vuelve a ser válido *sin* pasar por
  blur/submit, no tiene un test dedicado (sí existe el análogo por blur).
- `handleSubmit` (línea 133-134): el `return` temprano cuando se hace click en "Crear cuenta" con un
  campo inválido *que todavía no pasó por blur* no está ejercitado — los tests de blur nunca llegan
  a hacer click en el submit.
No bloquea (el agregado del módulo supera 80% en las tres métricas y las 7 pruebas requeridas por
el spec para este bloque están presentes y en verde), pero recomiendo 2 tests puntuales para cerrar
el gap antes del próximo ticket que toque este archivo.

## Calidad

- ✅ W-VER-01: sin código muerto — `noUnusedLocals`/`noUnusedParameters` activos en
  `tsconfig.base.json` (heredado por `apps/web` y `apps/api`) y el typecheck de ambos está limpio.
- ✅ W-VER-03 (fragilidad): sin hallazgos en los archivos de este ticket — sin `Date.now()`/IDs
  hardcodeados usados como assertion, sin estado global compartido entre tests, cada archivo limpia
  el DOM (`cleanup()`) y resetea sus mocks (`mockReset`) en `afterEach`.
- ⚠️ **WARNING de entorno**: `vitest run --coverage` con el pool por default (`threads`) sufre
  timeouts intermitentes de arranque de worker en este WSL2 (confirmado, no es nuevo de este
  ticket — mismo síntoma que ya documentó `verify-FEAT-004a.md` para la suite de `apps/api`).
  Mitigado corriendo con `--pool=forks` y, cuando aun así un archivo puntual fallaba en arrancar,
  aislándolo en una corrida separada — el resultado funcional (67/67 tests en verde) es el mismo en
  todas las corridas, solo cambia qué archivos logran arrancar en paralelo. No es un defecto de
  código.

## Threat model — verificación a nivel de implementación

- ✅ Ningún componente nuevo agrega superficie no analizada por `threat-FEAT-004b.md` — CORS
  `credentials: true`, `client.ts`, `auth.ts`, los 3 formularios/acción y
  `useRedirectOnUnauthorized` son exactamente los 6 componentes que el documento evalúa.
- ✅ R1/R2 (Login CSRF, sin protección) — riesgo aceptado por el usuario, sin mitigación de diseño
  pendiente en este ticket; no corresponde re-flaggear como hallazgo nuevo.
- ✅ Sin open-redirect: el destino de `useRedirectOnUnauthorized` y de los redirects post
  login/registro/logout es siempre un literal (`"/login"`, `"/"`), nunca construido desde input del
  usuario ni un query param — confirmado por lectura de código.

────────────────────────────────────────────────────────────
Total: 6/6 AC verificadas, 3/3 NFR verificadas, 8/8 bloques del spec implementados, cobertura
~95%/~87%/100% en agregado sobre el diff del ticket, 150/150 tests de `apps/api` + 67/67 tests de
`apps/web` pasando.
FAILs: 0 | WARNINGs: 2 (no bloqueantes)
Result: PASSED
