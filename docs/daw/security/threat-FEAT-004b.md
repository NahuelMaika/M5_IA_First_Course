# Threat Model FEAT-004b: Registro, login y logout — UI

| Field | Value |
|-------|-------|
| Ticket | FEAT-004b |
| Component | `apps/web` — pantallas `/register`, `/login`, `logout-button.tsx`, `auth.ts`, `client.ts` reescrito; `apps/api/src/app.ts` — CORS con `credentials: true` |
| Date | 2026-08-23 |

## Attack surfaces identified

1. **CORS con `credentials: true`** (`apps/api/src/app.ts`, Block 1) — habilita que el browser
   adjunte y guarde la cookie de sesión en requests cross-origin hechas por `apps/web`. Restringido
   a un único origen explícito (`webOrigin`, nunca `"*"`), no amplía qué origen puede LEER la
   respuesta.
2. **`client.ts` reescrito** (Block 2) — la cookie de sesión reemplaza a `x-user-id` como mecanismo
   de identidad para todo request desde `apps/web`.
3. **`auth.ts`** (Block 3) — primer módulo de `apps/web` que llama `/auth/register`, `/auth/login`,
   `/auth/logout`.
4. **Formularios de registro y login** (Block 4/5) — primera UI que efectivamente hace que un
   usuario obtenga una cookie de sesión real (antes de este ticket, esa cookie nunca se emitía desde
   ningún flujo de browser).
5. **`logout-button.tsx`** (Block 6) — primera UI que invoca `/auth/logout`.
6. **`useRedirectOnUnauthorized`** (Block 7/8) — redirige a `/login` ante un 401; el destino es un
   literal fijo (`"/login"`), nunca derivado de input del usuario ni de un query param.

No hay superficie nueva de audio, terceros con red saliente, ni cambios de schema — es
exclusivamente `apps/web` + una línea de configuración en `apps/api`.

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 (heredado de threat-FEAT-004a.md) | Body de `/auth/register`/`/auth/login` (email/password) | Fastify + Zod — sin cambios en este ticket |
| B5 (heredado, extendido por Block 1) | `apps/web` (origen `WEB_ORIGIN`) | `apps/api`, vía CORS — ahora con `credentials: true`; el origen autorizado sigue siendo exacto, no `"*"` |
| **B6 (nuevo — es el que hace explotable el hallazgo de abajo)** | **Cualquier origen, no solo `WEB_ORIGIN`** | La cookie de sesión, vía `SameSite` — el browser adjunta la cookie a un request cross-site independientemente de la configuración CORS de `apps/api` (CORS solo controla quién puede LEER la respuesta, no quién puede ENVIAR el request con la cookie ambiente) |

B6 no lo introduce el código de este ticket — la política `sameSite: isProduction ? "none" :
"lax"` ya estaba decidida en `apps/api/src/app.ts` desde spec-FEAT-004a. Pero hasta este ticket
nunca existió un flujo de browser que dejara una cookie de sesión real seteada para explotar: es
FEAT-004b lo que hace que B6 pase de teórico a explotable por primera vez, así que corresponde
evaluarlo acá.

## STRIDE por componente

**CORS `credentials: true` (Block 1)**

| Categoría | Evaluación |
|---|---|
| Spoofing | N/A — no cambia quién puede autenticarse, solo si el browser puede usar la cookie ya emitida |
| Tampering | N/A |
| Repudiation | N/A |
| Information Disclosure | Sigue restringido a `webOrigin` exacto — ningún origen no autorizado puede LEER una respuesta cross-origin con esta cookie |
| Denial of Service | N/A |
| Elevation of Privilege | N/A |

**Formularios de registro/login/logout — primer flujo real de sesión vía browser**

| Categoría | Evaluación |
|---|---|
| Spoofing | **HIGH — "Login CSRF"**: un sitio malicioso puede forzar el browser de la víctima a hacer `POST /auth/login` (o `/auth/register`) con credenciales DEL ATACANTE. La víctima queda logueada en la cuenta del atacante sin saberlo; cualquier gasto que cargue después queda visible para el atacante. `apps/api` no tiene protección CSRF (sin token, sin validación de `Origin`/`Referer`) — ver riesgo R1 abajo |
| Tampering | Cubierto por B1, sin cambios |
| Repudiation | N/A — sin requerimiento del PRD, igual que threat-FEAT-004a.md |
| Information Disclosure | El password nunca se loguea ni se persiste client-side (solo estado de React, ningún `localStorage`/`sessionStorage`); `type="password"` mitiga shoulder-surfing (NFR-02) |
| Denial of Service | Mismo mecanismo de B6 permite forzar `POST /auth/logout` con la cookie DE LA VÍCTIMA desde un sitio malicioso — nuisance (deslogueo forzado), no compromiso de datos. También `POST /expenses` con la cookie de la víctima — contaminación de datos (gastos falsos), no disclosure. Ver riesgo R2 abajo |
| Elevation of Privilege | N/A — sin niveles de privilegio |

**`useRedirectOnUnauthorized` (Block 7/8)**

| Categoría | Evaluación |
|---|---|
| Spoofing/Tampering/Repudiation/DoS/Elevation | N/A |
| Information Disclosure | Sin riesgo de open-redirect: el destino es el literal `"/login"`, nunca construido desde input del usuario ni de un query param |

## Sensitive data classification (F-TM-05)

Sin datos nuevos respecto a threat-FEAT-004a.md — este ticket solo agrega la UI que transporta los
mismos datos ya clasificados ahí (password como credencial, token de sesión como credencial
equivalente, email como PII de baja sensibilidad). Cifrado en tránsito sigue siendo dependencia de
infra (HTTPS), sin cambios (F-TM-07 ya cubierto en threat-FEAT-004a.md).

## Riesgos

| Riesgo | STRIDE | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| R1 — Login CSRF: `POST /auth/login`/`/auth/register` sin protección CSRF permite loguear a la víctima en una cuenta del atacante | S | Medium | High | **Riesgo aceptado** (ver tabla abajo) |
| R2 — CSRF sobre `POST /auth/logout` (deslogueo forzado) y `POST /expenses` (gasto falso) usando la cookie ambiente de la víctima | D/T | Medium | Low-Medium | **Riesgo aceptado** (ver tabla abajo) — mismo mecanismo que R1, se agrupa bajo la misma decisión |

## Accepted risks (F-TM-04)

| Riesgo | Aceptado por | Justificación | Condición de revisión |
|---|---|---|---|
| R1, R2 — Sin protección CSRF (Origin check o token) en `apps/api` para rutas que cambian estado, explotable desde que FEAT-004b deja una sesión real activable vía browser | Usuario (confirmado 2026-08-23, durante esta sesión de PLAN) | GGasIA es una app personal/de pareja sin exposición pública ni tráfico de terceros esperado — mismo criterio ya usado para aceptar R7/R8 en threat-FEAT-004a.md | Revisar si la app se expone a usuarios fuera del círculo personal/de pareja, si se detecta abuso real (ej. gastos que un usuario no reconoce haber cargado, o una sesión que no reconoce haber iniciado), o si se agrega un flujo que aumente el valor de una cuenta comprometida (verificación de email, cambio de password) |

## Mitigations to fold into the spec

Ninguna — el único hallazgo HIGH (R1/R2) fue resuelto como riesgo aceptado, no como mitigación de
diseño. El resto de los componentes no presentó riesgos sin mitigar.

────────────────────────────────────────────────────────────
Risks: C:0 H:0 (0 sin mitigar, 2 aceptados: R1, R2) M:0 L:0
Result: PASSED
