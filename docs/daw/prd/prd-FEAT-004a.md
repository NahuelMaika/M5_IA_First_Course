# PRD FEAT-004a: Registro, login y logout — API

| Field | Value |
|-------|-------|
| Ticket | FEAT-004a |
| Tracker | none |
| Date | 2026-08-22 |
| PRD loops | 0 |

## Context and Problem

`POST /expenses` y `GET /expenses` validan hoy la identidad del usuario con un stub: leen el header
`x-user-id`, lo buscan en la tabla `users` y, si existe, dejan pasar la request
(`apps/api/src/plugins/auth.ts`, spec-FEAT-002 Block 6). No hay passwords ni sesión — el header lo
fija a mano quien llame a la API. Las threat models de FEAT-002 y FEAT-003a aceptaron este stub como
riesgo conocido, pendiente de reemplazo.

Esta sub-ticket (parte a de la división de FEAT-004) cubre el lado API: registro, login, logout y el
reemplazo del `authPreHandler`. La UI que consume estos endpoints es FEAT-004b.

## Goals

- Permitir que un usuario se registre con email y password vía API.
- Permitir iniciar sesión (login) y cerrar sesión (logout) vía API, mediante una cookie de sesión
  httpOnly.
- Reemplazar por completo el stub `x-user-id` en `apps/api` — tanto el `authPreHandler` como las
  rutas de `expenses` — por autenticación real basada en sesión.

## Functional Requirements

- FR-01: El sistema expone `POST /auth/register` que acepta `email` y `password`.
- FR-02: El registro rechaza un `password` de menos de 8 caracteres.
- FR-03: El sistema almacena el password hasheado con argon2 — nunca en texto plano ni en logs.
- FR-04: El registro con un `email` ya existente responde con un error explícito ("email ya
  registrado").
- FR-05: Un registro exitoso crea la sesión del usuario automáticamente (auto-login), sin requerir un
  login posterior.
- FR-06: El sistema expone `POST /auth/login` que acepta `email` y `password` y los valida contra el
  hash almacenado.
- FR-07: Un login exitoso crea una sesión y la expone como cookie httpOnly.
- FR-08: Un login fallido (email inexistente o password incorrecto) responde con un mensaje de error
  genérico, sin revelar cuál de los dos falló ni si el email existe.
- FR-09: El sistema aplica throttle sobre `POST /auth/login`: máximo 5 intentos fallidos por `email`
  en una ventana de 15 minutos.
- FR-10: Al superar el límite de throttle, la respuesta puede ser explícita (indicar que ese email
  alcanzó el límite de intentos) — a diferencia de FR-08, acá no aplica la regla de no revelar.
- FR-11: El sistema expone `POST /auth/logout` que invalida la sesión activa y limpia la cookie.
- FR-12: El `authPreHandler` (`apps/api/src/plugins/auth.ts`) deja de validar por `x-user-id` y pasa
  a validar la cookie de sesión emitida por `POST /auth/login` o `POST /auth/register`.
- FR-13: `GET /expenses` y `POST /expenses` (`apps/api/src/routes/expenses.ts`) usan el
  `authPreHandler` actualizado — dejan de aceptar `x-user-id` como mecanismo de autenticación.

## Non-Functional Requirements

- NFR-01: La cookie de sesión es `httpOnly` y, en producción, `Secure`.
- NFR-02: La sesión expira a los 7 días desde su creación.
- NFR-03: Los passwords se hashean con argon2 (dependencia ya declarada como convención en
  AGENTS.md, pendiente de agregar a `apps/api/package.json`).
- NFR-04: El throttle de login se aplica por `email`, no por IP.
- NFR-05: Ningún log ni mensaje de error incluye el password en texto plano.

## Acceptance Criteria

- AC-01 (FR-01, FR-03, FR-05): WHEN un usuario envía `POST /auth/register` con un `email` no
  registrado y un `password` de 8 o más caracteres, THE sistema SHALL crear la cuenta, hashear el
  password con argon2 y devolver una sesión activa (cookie httpOnly).
- AC-02 (FR-02): IF `POST /auth/register` recibe un `password` de menos de 8 caracteres, THEN THE
  sistema SHALL rechazar la request sin crear la cuenta.
- AC-03 (FR-04): IF `POST /auth/register` recibe un `email` ya registrado, THEN THE sistema SHALL
  responder con un error explícito indicando que el email ya está registrado, sin crear una cuenta
  nueva.
- AC-04 (FR-06, FR-07): WHEN un usuario envía `POST /auth/login` con `email` y `password` correctos,
  THE sistema SHALL crear una sesión y devolverla como cookie httpOnly con 7 días de vigencia.
- AC-05 (FR-08): IF `POST /auth/login` recibe un `email` inexistente o un `password` incorrecto,
  THEN THE sistema SHALL responder con un mensaje de error genérico que no distingue ambos casos.
- AC-06 (FR-09, FR-10): IF un mismo `email` acumula 5 intentos fallidos de login en una ventana de 15
  minutos, THEN THE sistema SHALL rechazar intentos adicionales para ese email hasta que la ventana
  expire, pudiendo indicar explícitamente que se alcanzó el límite.
- AC-07 (FR-11): WHEN un usuario con sesión activa envía `POST /auth/logout`, THE sistema SHALL
  invalidar la sesión y limpiar la cookie, de forma que requests posteriores con esa cookie sean
  rechazadas.
- AC-08 (FR-12, FR-13): WHEN una request a `GET /expenses` o `POST /expenses` incluye una cookie de
  sesión válida, THE sistema SHALL procesarla identificando al usuario dueño de la sesión.
- AC-09 (FR-12, FR-13): IF una request a `GET /expenses` o `POST /expenses` no incluye una cookie de
  sesión válida, THEN THE sistema SHALL responder 401, incluyendo el caso donde solo se envía
  `x-user-id` sin cookie.

## Out of Scope

- Pantallas de registro/login/logout en `apps/web`, cliente HTTP y route guards — eso es FEAT-004b.
- Recuperación de password ("olvidé mi contraseña").
- Verificación de email por link/código.
- Login social (Google, etc.).
- Cambio de password una vez logueado.
- Throttle por IP (solo por email, ver NFR-04).
- Roles o permisos distintos entre usuarios.

## Risks and Mitigations

- **Riesgo:** el `authPreHandler` actual es usado por rutas ya en producción (`expenses.ts`); un
  reemplazo mal hecho puede dejar esas rutas abiertas o rotas.
  **Mitigación:** FR-13/AC-08/AC-09 exigen test explícito de que `x-user-id` solo, sin cookie, ya no
  autentica.
- **Riesgo:** sin throttle, un atacante podría probar passwords por fuerza bruta contra `/auth/login`.
  **Mitigación:** FR-09/AC-06 — 5 intentos por email cada 15 minutos, cubierto en este mismo ticket.
- **Riesgo:** guardar el password mal hasheado (o en texto plano) es una fuga crítica en caso de
  breach de la base.
  **Mitigación:** NFR-03/AC-01 — argon2 obligatorio, verificado por test.

## Dependencies

- `apps/api/prisma/schema.prisma` — el modelo `User` necesita una migración que agregue la columna de
  password hasheado.
- `apps/api/package.json` — agregar `argon2` como dependencia.
- FEAT-002 (`authPreHandler`, rutas de `expenses`) — se modifica, no se reemplaza desde cero.
- FEAT-004b — consume estos endpoints; no bloquea a FEAT-004a.
