# SAST FEAT-004b: Registro, login y logout — UI

| Field | Value |
|-------|-------|
| Ticket | FEAT-004b |
| Scope | `git diff e68f79f..HEAD` — 24 archivos, `apps/web` (UI de auth) + 1 línea de CORS en `apps/api` |
| Date | 2026-08-23 |

## Secrets

- ✅ F-SAST-01: `rg` sobre patrones de API key/password/token/connection string hardcodeados en el
  diff completo — 0 resultados. Los únicos literales `"password"`/`"unaClave123"`/`"password123"`
  encontrados están en `login-form.test.tsx`, `register-form.test.tsx` y `auth.test.ts` como
  fixtures de test, no credenciales reales.
- ✅ `.env`/`.env.*` siguen en `.gitignore`; `apps/web/.env.example` solo pierde una línea
  (`NEXT_PUBLIC_STUB_USER_ID`, retirada porque el stub header ya no existe) — no agrega secretos.

## Injection

- ✅ F-SAST-02 / F-SAST-03: no aplica — este diff es exclusivamente `apps/web` (frontend) más una
  línea de config CORS en `apps/api/src/app.ts`; sin queries ni `exec`/`spawn`/`child_process`.
- ✅ F-SAST-05: sin input de usuario usado para construir paths de archivo.

## XSS y funciones inseguras

- ✅ F-SAST-06: `rg` sobre `innerHTML|dangerouslySetInnerHTML` en el diff — 0 resultados. Todos los
  componentes nuevos (`login-form.tsx`, `register-form.tsx`, `logout-button.tsx`) renderizan texto
  vía JSX estándar (`{emailError}`, `{passwordError}`), nunca HTML crudo.
- ✅ F-SAST-04 / F-SAST-17: sin `eval()`, sin deserialización insegura. `response.json()` en
  `auth.ts` (`registerUser`/`loginUser`) está envuelto en `try/catch` y su resultado se tipa por
  aserción, no se ejecuta como código.

## SSRF, debug mode, logging, upload, CSRF

- ✅ F-SAST-07: `client.ts` construye la URL como `${NEXT_PUBLIC_API_URL}${path}` — `path` es
  siempre un literal fijo pasado por el propio código (`"/auth/register"`, `"/auth/login"`,
  `"/auth/logout"`, `"/expenses"`), nunca derivado de input de usuario.
- ✅ F-SAST-09: no aplica — sin flags de debug ni modo degradado en este diff.
- ✅ F-SAST-10: `rg` sobre `console.log/error/warn` con `password`/`token` en el diff — 0
  resultados. El password vive solo en estado de React (`useState`), nunca en `localStorage`,
  `sessionStorage` ni logs; confirmado también en `threat-FEAT-004b.md` (Information Disclosure,
  formularios).
- ✅ F-SAST-11: no aplica — sin endpoints de upload en este ticket.
- ⚠️→✅ F-SAST-12 (CSRF), `POST /auth/register`, `/auth/login`, `/auth/logout`: **no es un
  hallazgo nuevo.** `threat-FEAT-004b.md` ya evaluó exactamente esta superficie bajo STRIDE
  (Spoofing) como R1 ("Login CSRF") y R2 (CSRF sobre logout/expenses), y el usuario los aceptó
  formalmente el 2026-08-23 cumpliendo los 3 campos que exige F-TM-04 (quién aceptó, justificación,
  condición de revisión) — ver tabla "Accepted risks" de ese documento. `daw-threat-modeling` para
  esta feature ya cerró con `Result: PASSED`. Repetir el bloqueo acá violaría el propio catálogo:
  un riesgo con mitigación-o-aceptación documentada (F-TM-03) ya está resuelto; SAST re-audita el
  código contra lo que el diseño decidió, no reabre una decisión de PLAN ya aprobada por el
  usuario con autoridad para aceptarla.

  **Nota técnica para revisar en la próxima iteración del threat model** (no bloquea este SAST):
  `sast-FEAT-004a.md` (ya PASSED) documentó que `POST /auth/*` y `/expenses` exigen
  `Content-Type: application/json` — confirmado de nuevo acá: `apps/api` no registra
  `@fastify/formbody` ni ningún `addContentTypeParser` para `text/plain`/
  `application/x-www-form-urlencoded`/`multipart/form-data` (`rg` sobre esos patrones en
  `apps/api/src` — 0 resultados). Un `POST` con ese `Content-Type` es "non-simple" para CORS ⇒
  dispara preflight `OPTIONS`, y `@fastify/cors` sigue restringido a un único origen exacto
  (`webOrigin`, nunca `"*"`), así que el navegador nunca llega a enviar el request real desde un
  origen atacante vía `fetch`. Una alternativa `mode: "no-cors"` con `Content-Type: text/plain`
  evita el preflight, pero el body no calificaría como JSON válido y Zod lo rechazaría (400) antes
  de tocar `auth-service`. Esto sugiere que la likelihood "Medium" asignada a R1/R2 en
  `threat-FEAT-004b.md` podría estar sobreestimada frente a la misma mitigación que ya se usó para
  cerrar `sast-FEAT-004a.md` sin exigir un token CSRF — vale la pena que el reviewer del riesgo
  aceptado (condición de revisión ya documentada) lo tenga en cuenta. Esto es una observación
  informativa, no cambia el resultado de este gate: el riesgo ya está formalmente aceptado y,
  aunque se revalúe la likelihood, no habría remediación pendiente en el código de este diff.

## Medium

- ✅ F-SAST-14 (validación de input incompleta): `login-form.tsx`/`register-form.tsx` validan
  formato de email y longitud de password client-side antes de invocar `auth.ts`; el servidor
  (Zod, `apps/api`, sin cambios en este diff) sigue siendo la validación autoritativa — cliente no
  reemplaza servidor, la complementa.
- ✅ F-SAST-15 (error handling que filtra internals): `auth.ts` nunca expone `error.message` ni el
  cuerpo crudo de una respuesta fallida — cada outcome no reconocido colapsa a
  `{ outcome: "unknown_error" }`, y los formularios lo traducen a un mensaje genérico
  (`"Ocurrió un error, intentá de nuevo."`), igual criterio que `expense-form.tsx` ya aplicaba.

## Dependencies

- ✅ F-SAST-13 / F-SAST-16: sin cambios de dependencias en este diff (`git diff` sobre
  `package.json`/`pnpm-lock.yaml` — vacío). `pnpm audit --prod` → **No known vulnerabilities
  found**.

## Otras verificaciones puntuales del diff

- ✅ Redirect a `/login` (`useRedirectOnUnauthorized`): el destino es el literal fijo `"/login"`,
  nunca construido desde un query param o el input del usuario — sin riesgo de open-redirect
  (consistente con `threat-FEAT-004b.md`).
- ✅ CORS `credentials: true` (`apps/api/src/app.ts`): combinado con `webOrigin` — confirmado en
  `apps/api/src/env.ts` que sigue siendo un string exacto validado (sin trailing slash, sin path,
  nunca `"*"`), nunca un wildcard. `credentials: true` + origin wildcard sería Critical
  (CWE-942/OWASP A05); no es el caso acá.
- ✅ Password mínimo 8 caracteres en registro, sin mínimo (solo requerido) en login — decisión
  documentada en el propio código para no filtrar, vía un 400 distinto al 401 uniforme, si un
  password histórico es corto pero correcto. No es un hallazgo de seguridad, es diseño correcto.

## Suppressions

Ninguna. No hubo hallazgos Medium que requirieran supresión documentada bajo el protocolo de
§4.4 (la única observación CSRF de arriba no es una supresión SAST — es un cross-reference a un
riesgo ya aceptado formalmente en PLAN vía F-TM-04, con sus propios 3 campos ya documentados en
`threat-FEAT-004b.md`).

────────────────────────────────────────────────────────────
Total: 17 clean, 0 vulnerabilidades nuevas (0 Critical, 0 High, 0 Medium sin mitigar)
Report: docs/daw/security/sast-FEAT-004b.md
Result: PASSED
