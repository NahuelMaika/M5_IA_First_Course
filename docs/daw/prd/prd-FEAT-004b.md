# PRD FEAT-004b: Registro, login y logout — UI

| Field | Value |
|-------|-------|
| Ticket | FEAT-004b |
| Tracker | none |
| Date | 2026-08-22 |
| PRD loops | 0 |

## Context and Problem

`apps/web/src/lib/api/client.ts` adjunta hoy un `x-user-id` fijo, leído de la variable de entorno
`NEXT_PUBLIC_STUB_USER_ID` (spec-FEAT-003b Block 5), a cada request hacia `apps/api`. No hay pantalla
de registro ni de login: cualquiera que abra la app ya "es" el usuario fijado en esa variable.

FEAT-004a agrega `POST /auth/register`, `POST /auth/login` y `POST /auth/logout` en `apps/api`, y
reemplaza el `authPreHandler` para validar una cookie de sesión httpOnly en vez de `x-user-id`. Esta
sub-ticket (parte b) cubre el lado `apps/web`: las pantallas que consumen esos endpoints, el
reemplazo del cliente HTTP y la protección de la pantalla de carga de gastos (FEAT-003b).

## Goals

- Permitir que un usuario se registre y loguee desde `apps/web`.
- Reemplazar el mecanismo de `x-user-id`/`NEXT_PUBLIC_STUB_USER_ID` en el cliente HTTP por el envío
  de la cookie de sesión.
- Proteger la pantalla de carga de gastos: sin sesión, redirige al login; login o registro exitosos
  redirigen a ella.
- Permitir cerrar sesión (logout) desde la UI.

## Functional Requirements

- FR-01: `apps/web` expone una pantalla de registro (email + password) que llama a
  `POST /auth/register`.
- FR-02: `apps/web` expone una pantalla de login (email + password) que llama a `POST /auth/login`.
- FR-03: `apps/web` expone una acción de logout que llama a `POST /auth/logout`.
- FR-04: El cliente HTTP de `apps/web` (`apps/web/src/lib/api/client.ts`) deja de adjuntar
  `x-user-id`/`NEXT_PUBLIC_STUB_USER_ID` y pasa a enviar la cookie de sesión en cada request
  (`credentials: "include"` o equivalente).
- FR-05: Un login o registro exitoso redirige a la pantalla de carga de gastos (FEAT-003b).
- FR-06: Acceder a la pantalla de carga de gastos sin sesión activa redirige a la pantalla de login.

## Non-Functional Requirements

- NFR-01: Ningún componente de `apps/web` construye su propia URL o adjunta headers de autenticación
  por fuera del cliente HTTP centralizado (mismo criterio que spec-FEAT-003b Block 5).
- NFR-02: Los formularios de registro y login no muestran el password en texto plano por defecto
  (`type="password"`).
- NFR-03: Los errores de registro y login se muestran en la pantalla, no mediante `window.alert` ni
  `window.confirm` (regla existente de AGENTS.md).

## Acceptance Criteria

- AC-01 (FR-01): WHEN un usuario completa el formulario de registro en `apps/web` con email y
  password y lo envía, THE sistema SHALL invocar `POST /auth/register` y mostrar en la pantalla el
  resultado (éxito o el error correspondiente).
- AC-02 (FR-02): WHEN un usuario completa el formulario de login en `apps/web` con email y password y
  lo envía, THE sistema SHALL invocar `POST /auth/login` y mostrar en la pantalla el resultado
  (éxito o el error correspondiente).
- AC-03 (FR-03): WHEN un usuario autenticado ejecuta la acción de logout desde `apps/web`, THE
  sistema SHALL invocar `POST /auth/logout` y redirigirlo a la pantalla de login.
- AC-04 (FR-04): WHEN `apps/web` realiza cualquier request a `apps/api` luego de un login o registro
  exitoso, THE sistema SHALL incluir la cookie de sesión en la request y SHALL NOT adjuntar el header
  `x-user-id`.
- AC-05 (FR-05): WHEN un usuario completa el registro o el login desde `apps/web`, THE sistema SHALL
  redirigirlo a la pantalla de carga de gastos.
- AC-06 (FR-06): IF un usuario sin sesión activa intenta acceder a la pantalla de carga de gastos,
  THEN THE sistema SHALL redirigirlo a la pantalla de login.

## Out of Scope

- Los endpoints `/auth/register`, `/auth/login`, `/auth/logout` y el reemplazo del `authPreHandler`
  — eso es FEAT-004a (dependencia).
- Recuperación de password ("olvidé mi contraseña").
- Verificación de email por link/código.
- Login social (Google, etc.).
- Cambio de password una vez logueado.
- Indicadores de fuerza de password más allá del mínimo de 8 caracteres (validado en FEAT-004a).

## Risks and Mitigations

- **Riesgo:** si el cliente HTTP sigue enviando `x-user-id` en paralelo a la cookie, se enmascara un
  bug de sesión (la request pasa por el motivo equivocado).
  **Mitigación:** AC-04 exige verificar explícitamente que `x-user-id` no se adjunta más.
- **Riesgo:** una pantalla de carga de gastos accesible sin sesión filtra la existencia de la
  funcionalidad o, peor, permite operar sin autenticación si el guard falla silenciosamente.
  **Mitigación:** AC-06, testeado con un intento de acceso directo sin cookie.

## Dependencies

- FEAT-004a — expone los endpoints `/auth/register`, `/auth/login`, `/auth/logout` y la cookie de
  sesión que esta sub-ticket consume. Bloqueante: FEAT-004b no puede completarse funcionalmente sin
  FEAT-004a mergeado o disponible en la misma rama.
- FEAT-003b — la pantalla de carga de gastos que se protege (AC-06) y el destino del redirect
  (AC-05).
- `apps/web/src/lib/api/client.ts` (spec-FEAT-003b Block 5) — se modifica, no se reemplaza desde
  cero.
