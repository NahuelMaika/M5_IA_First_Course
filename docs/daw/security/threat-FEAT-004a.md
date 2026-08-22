# Threat Model FEAT-004a: Registro, login y logout — API

| Field | Value |
|-------|-------|
| Ticket | FEAT-004a |
| Component | `apps/api` — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `authPreHandler` reescrito, `session-repository`, `user-repository` extendido, `login-throttle`, `schema.prisma` (`User.passwordHash`, modelo `Session`) |
| Date | 2026-08-22 |

## Attack surfaces identified

1. **Body de `POST /auth/register` y `POST /auth/login`** (email + password) — única entrada de red
   no confiable de este ticket que transporta un secreto (el password en texto plano, solo en
   tránsito).
2. **Cookie de sesión** (`Set-Cookie` en la respuesta de register/login, `Cookie` en cada request
   posterior) — reemplaza al header `x-user-id` (spec-FEAT-002 Block 6) como mecanismo de identidad;
   deja de ser trivialmente falsificable, pero introduce una nueva superficie: robo/replay del
   token.
3. **`authPreHandler` reescrito** (`apps/api/src/plugins/auth.ts`) — boundary de autenticación para
   `GET`/`POST /expenses` y, ahora, potencialmente cualquier ruta futura.
4. **Tabla `Session`** (nueva) — almacena el mecanismo de identidad activo de cada usuario.
5. **`login-throttle`** (en memoria) — control de fuerza bruta, pero también una superficie de DoS
   por sí misma (ver riesgos abajo).
6. **argon2** — operación deliberadamente cara en CPU, invocada en cada `register` y cada `login`
   (incluida la rama de "email no existe", ver mitigación de timing abajo).

No hay superficie de UI, de audio ni de terceros con red saliente en este ticket — es exclusivamente
backend (FEAT-004b es la UI, Out of Scope de este PRD).

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 | Cliente HTTP (`email`/`password` de register/login) | Fastify — validado por Zod (`schemas/auth.ts`) antes de tocar `auth-service` |
| B2 | Cookie de sesión enviada por el cliente | `authPreHandler` — la trata como una afirmación de identidad NO confiable hasta que `session-repository.findValid` la valida contra la tabla `Session` (hash + expiración) |
| B3 (cierra el boundary que threat-FEAT-002.md dejó abierto en B3) | Header `x-user-id` | Deja de existir como mecanismo de identidad — `authPreHandler` no lo lee más; verificado por test explícito (AC-09 del PRD) |
| B4 | `apps/api` (Fastify/Node) | PostgreSQL — todo acceso vía Prisma parametrizado; el `password` nunca se persiste sin pasar antes por `argon2.hash()` |
| B5 | `apps/web` (origen distinto) | `apps/api`, vía CORS (`WEB_ORIGIN`, ya validado desde spec-FEAT-003b) — la cookie cruza este boundary con atributos `SameSite`/`Secure` sensibles a `NODE_ENV` |

## STRIDE por componente

**`POST /auth/register`**

| Categoría | Evaluación |
|---|---|
| Spoofing | Cualquiera puede registrar una cuenta con un email que no le pertenece (no hay verificación de email — Out of Scope explícito del PRD). Riesgo aceptado, ver tabla de riesgos aceptados abajo |
| Tampering | Body validado por Zod (`email` formato, `password` ≥8 chars) antes de tocar `auth-service` |
| Repudiation | No hay log de eventos de registro — impacto bajo para el alcance de este MVP, sin requerimiento del PRD |
| Information Disclosure | FR-04 revela explícitamente "email ya registrado" ante un duplicado — decisión ya tomada y aceptada en el PRD (distinta de la regla de no revelar del login), no se re-discute acá |
| Denial of Service | `argon2.hash()` es intencionalmente cara en CPU; sin límite por IP, un atacante puede saturar CPU con registros repetidos. Riesgo aceptado, ver tabla abajo |
| Elevation of Privilege | N/A — no hay niveles de privilegio (Out of Scope del PRD) |

**`POST /auth/login`**

| Categoría | Evaluación |
|---|---|
| Spoofing | Mitigado por FR-09/AC-06 (throttle 5 intentos/15min por email) — **CRÍTICO** si el throttle se puede evadir, ver riesgo de case-sensitivity abajo |
| Tampering | N/A más allá del transporte (ver B1) |
| Repudiation | No hay log de intentos de login — impacto bajo, sin requerimiento del PRD |
| Information Disclosure | FR-08 exige mensaje genérico ante email inexistente o password incorrecto. **MEDIO** si el *timing* de la respuesta distingue ambos casos — ver mitigación de timing abajo |
| Denial of Service | Igual que en `register`: `argon2.verify()`/dummy-verify por request, sin límite por IP. Riesgo aceptado, ver tabla abajo. Adicionalmente: el throttle por email puede usarse para denegar acceso a la víctima (bloquearla intencionalmente) — riesgo aceptado, inherente a la decisión de throttle-por-email ya tomada en el PRD |
| Elevation of Privilege | N/A |

**`authPreHandler` reescrito / validación de sesión**

| Categoría | Evaluación |
|---|---|
| Spoofing | **ALTO** si el token de sesión fuera predecible o reutilizable entre logins — mitigado: token generado server-side con `crypto.randomBytes(32)` (256 bits de entropía), nunca aceptado del cliente (cierra fixation, ver mitigación abajo) |
| Tampering | Token opaco — cualquier alteración del valor de la cookie simplemente falla el lookup (`findValid` no encuentra match) |
| Repudiation | N/A |
| Information Disclosure | **MEDIO** — el token se almacena hoy en texto plano en `Session.token`; una fuga/breach de la base entrega sesiones activas listas para usar. Mitigación: hashear el token (SHA-256) antes de guardar, igual que se hace con el password (ver mitigación abajo). **MEDIO** — si algún día se habilita logging de headers, el `Cookie`/`Set-Cookie` no debe quedar en texto plano en logs — ver mitigación abajo |
| Denial of Service | Lookup por índice único (`token`) — costo bajo. Sesiones expiradas no se limpian (no hay cron, prohibido por AGENTS.md) — crecimiento no acotado de la tabla, riesgo aceptado (bajo impacto, revisar si el volumen se vuelve un problema) |
| Elevation of Privilege | N/A |

**`login-throttle` (en memoria, por email)**

| Categoría | Evaluación |
|---|---|
| Spoofing | N/A |
| Tampering | N/A — vive en memoria del proceso, no expuesto |
| Repudiation | N/A |
| Information Disclosure | N/A |
| Denial of Service | **ALTO** si la clave del `Map` no normaliza mayúsculas/minúsculas: `User.email` es `@db.Citext` (case-insensitive a nivel DB), pero un `Map` de JS compara strings byte a byte. Un atacante que alterna `Test@mail.com`/`test@mail.com`/`TEST@MAIL.COM` resetea el contador cada vez y evade el límite de 5/15min por completo. Mitigación obligatoria, ver abajo |
| Elevation of Privilege | N/A |

## Sensitive data classification (F-TM-05)

| Dato | Clasificación | En tránsito | En reposo |
|---|---|---|---|
| Password (input) | Credencial | HTTPS (dependencia de infra, ver riesgo MEDIO abajo) | Nunca persiste en texto plano — hasheado con argon2 antes del primer `INSERT` (F-TM-07) |
| Token de sesión | Credencial equivalente | Cookie `httpOnly` + `Secure` en producción | Hasheado (SHA-256) antes de guardar en `Session.token` — ver mitigación abajo (F-TM-07) |
| Email | PII de baja sensibilidad | HTTPS | Texto plano — necesario para login/lookup, sin regulación aplicable declarada en el proyecto |

## Riesgos

| Riesgo | STRIDE | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| R1 — Throttle de login evadible por variación de mayúsculas/minúsculas en el email (`Map` case-sensitive vs. `Citext` case-insensitive) | D | High | High | Normalizar el email a lowercase (`.toLowerCase()`) antes de usarlo como clave del `Map` en `login-throttle.ts` |
| R2 — Token de sesión en texto plano en `Session.token`: un breach de la DB entrega sesiones activas usables directamente | I | Low | High | Guardar `SHA-256(token)` en `Session.token`; la cookie sigue llevando el token crudo, `authPreHandler` hashea el valor recibido antes del lookup |
| R3 — Enumeración de emails vía timing: `login` responde más rápido cuando el email no existe (no llama a argon2) que cuando existe y el password es incorrecto (sí llama) | I | Medium | Medium | Ante email inexistente, ejecutar un `argon2.verify()` contra un hash dummy fijo antes de devolver el error genérico, para igualar el tiempo de respuesta |
| R4 — Session fixation: si el server aceptara/reusara un token que el cliente ya trae en la cookie al loguearse, un atacante podría fijarle una sesión a la víctima de antemano | S | Low | High | `register`/`login` SIEMPRE generan un token nuevo server-side; el valor de cualquier cookie que el cliente ya traiga en esa request se ignora por completo |
| R5 — Remanente de `x-user-id`: que el `authPreHandler` reescrito conserve, aunque sea como fallback, la lectura del header viejo | E | Low | Critical | El código nuevo no debe referenciar `request.headers["x-user-id"]` en ningún punto — verificado por grep en CODE y por el test de AC-09 (`x-user-id` solo, sin cookie, debe devolver 401) |
| R6 — Cookie/token en logs: si se habilita logging de requests más adelante, `Cookie`/`Set-Cookie` no debe quedar en texto plano | I | Low | Medium | Documentar como requisito para quien agregue logging: configurar `redact` de Fastify/pino sobre esos headers. No bloquea este ticket porque `app.ts` no tiene logger habilitado hoy |
| R7 — DoS por costo de CPU de argon2 en `/auth/register` y `/auth/login` (incluida la rama dummy-verify de R3), sin límite por IP | D | Medium | Medium | **Riesgo aceptado** (ver tabla abajo) — el PRD excluyó explícitamente throttle por IP |
| R8 — Registro con un email que no pertenece a quien registra (sin verificación de propiedad del email) | S | Medium | Low | **Riesgo aceptado** (ver tabla abajo) — verificación de email es Out of Scope del PRD |
| R9 — Dependencia operativa: la cookie `Secure` solo viaja sobre HTTPS; si el despliegue de producción no termina TLS delante de `apps/api`, el login queda roto (no es un fallo silencioso: la cookie simplemente no se setea/envía) | T | Low | Medium | Documentado como dependencia de infraestructura, fuera del código de este ticket — no requiere mitigación de código, sí una nota operativa en el spec |

## Accepted risks (F-TM-04)

| Riesgo | Aceptado por | Justificación | Condición de revisión |
|---|---|---|---|
| R7 — DoS por CPU de argon2 sin límite por IP en `/auth/register`/`/auth/login` | Usuario (confirmado 2026-08-22, durante esta sesión de PLAN) | GGasIA es una app personal/de pareja, sin exposición pública ni tráfico esperado de alto volumen; el PRD ya había descartado explícitamente throttle por IP en favor de throttle por email únicamente | Revisar si la app se expone a tráfico público, se observa abuso real, o el modelo de amenaza del proyecto cambia (ej. se agregan más usuarios o se publicita el producto) |
| R8 — Registro con email ajeno (sin verificación de propiedad) | Usuario (vía la decisión de Out of Scope del PRD FEAT-004a) | Verificación de email por link/código está explícitamente fuera de alcance de FEAT-004a; agregar esa verificación es trabajo de un ticket futuro, no de este | Revisar si se prioriza un ticket de verificación de email, o si se detecta abuso de registro con emails ajenos |

## Mitigations to fold into the spec

1. Normalizar el email a lowercase antes de usarlo como clave en `login-throttle.ts` (R1).
2. `session-repository` guarda `SHA-256(token)`, nunca el token crudo; `authPreHandler` hashea el
   valor de la cookie antes del lookup (R2).
3. `auth-service.login`: ante email inexistente, ejecutar un `argon2.verify()` contra un hash dummy
   fijo antes de devolver el error genérico (R3).
4. `register`/`login` generan siempre un token nuevo server-side; el valor de cualquier cookie
   entrante se ignora al emitir uno nuevo (R4).
5. El `authPreHandler` reescrito no debe contener ninguna referencia a `x-user-id`; el bloque que lo
   reescribe debe verificarlo explícitamente (R5), y el bloque de tests debe cubrir AC-09.
6. Nota para quien agregue logging de requests en el futuro: configurar `redact` sobre
   `Cookie`/`Set-Cookie` (R6) — no bloquea este ticket.
7. Nota operativa en el spec: producción requiere TLS terminado delante de `apps/api` para que la
   cookie `Secure` funcione (R9) — fuera del código de este ticket.

────────────────────────────────────────────────────────────
Risks: C:0 H:0 (0 sin mitigar) M:0 (0 sin mitigar) L:0 — R1-R6 y R9 mitigados en el diseño; R7 y R8
aceptados con las 3 condiciones de F-TM-04 satisfechas.
Result: PASSED
