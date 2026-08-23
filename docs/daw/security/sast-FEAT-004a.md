# SAST FEAT-004a: Registro, login y logout — API

| Field | Value |
|-------|-------|
| Ticket | FEAT-004a |
| Scope | Archivos nuevos/modificados de este ticket en `apps/api` (11 bloques) |
| Date | 2026-08-22 |

## Secrets

- ✅ F-SAST-01: sin API keys/passwords/tokens/connection strings hardcodeados en el código nuevo
  (`rg` sobre patrones `password=`, `secret=`, `api_key=` en `apps/api/src` — 0 resultados).
- ✅ `.env`/`.env.*` están en `.gitignore`.
- ✅ El único "password" literal en el código (`DUMMY_HASH_PROMISE` en `auth-service.ts`, y la
  password de test documentada en `seed.ts`) son valores de test/dummy explícitamente comentados
  como tales, no credenciales reales.

## Injection

- ✅ F-SAST-02: sin `$executeRawUnsafe`/`$queryRawUnsafe` en el código nuevo. Todo acceso a datos
  pasa por Prisma parametrizado (repositorios) o por el `$executeRaw`/`$queryRaw` con template
  literals ya existente en tests (parametrizado por Prisma, no concatenación de strings).
- ✅ F-SAST-03: sin `eval`, `child_process`, `exec` en ningún archivo nuevo.
- ✅ F-SAST-05: sin input de usuario usado para construir paths de archivo.

## XSS y funciones inseguras

- ✅ F-SAST-06: no aplica — este ticket es exclusivamente backend (`apps/api`), sin renderizado de
  HTML.
- ✅ F-SAST-04/17: sin `eval()` ni deserialización insegura.
- ✅ F-SAST-08 (crypto débil): `session-repository.ts` usa `createHash("sha256")` — pero **no** para
  passwords (eso es argon2, ver abajo), sino para derivar la clave de búsqueda de un token ya
  aleatorio de 256 bits. SHA-256 es apropiado en este contexto (no es hashing de contraseñas). Los
  passwords se hashean exclusivamente con `argon2` (`lib/password.ts`), sin parámetros de costo
  debilitados (defaults de la librería, `argon2id`).

## SSRF, debug mode, logging, upload, CSRF

- ✅ F-SAST-07: sin llamadas salientes a URLs derivadas de input de usuario.
- ✅ F-SAST-09: sin flags de debug/modo degradado — `NODE_ENV` sigue controlando `secure`/`sameSite`
  de la cookie de sesión (Block 6), consistente con el resto del proyecto.
- ✅ F-SAST-10: `rg` sobre `console.log/error/warn` con `password`/`token` en `apps/api/src` — 0
  resultados. El servicio de auth no recibe ni pasa un logger (se removió durante la revisión del
  Block 9 por acoplar el service a Fastify); nada logueado en ningún punto.
- ✅ F-SAST-11: no aplica — sin endpoints de upload de archivos en este ticket.
- ✅ F-SAST-12 (CSRF): `POST /auth/register`, `/login`, `/logout` y `POST/GET /expenses` exigen
  `Content-Type: application/json` (Zod valida `request.body`, y no hay `@fastify/formbody` ni
  ningún otro parser de `application/x-www-form-urlencoded`/`multipart/form-data` registrado). Un
  POST JSON no es una "simple request" CORS — dispara preflight `OPTIONS`, y `@fastify/cors` está
  configurado con un único origen permitido (`WEB_ORIGIN`, no `*`), así que un origen atacante ve su
  preflight rechazado y el navegador nunca llega a enviar la request real. Un HTML form clásico
  (que sí evita el preflight) no puede enviar `application/json`, así que tampoco funciona como
  vector. La combinación CORS-de-origen-único + `Content-Type: application/json` obligatorio ya
  mitiga CSRF para estos endpoints — no se requiere un token CSRF adicional en este ticket.

## Medium

- ✅ F-SAST-14 (validación de input incompleta): `registerBodySchema`/`loginBodySchema` (Zod)
  cubren email y password en los 3 endpoints nuevos; ningún input llega a `auth-service` sin pasar
  por Zod primero (Block 10).
- ✅ F-SAST-15 (error handling que filtra internals): ningún handler nuevo devuelve `error.message`,
  `error.stack` ni el objeto de error crudo al cliente — los 500 genéricos se dejan propagar al
  error handler default de Fastify (Block 10, decisión ya revisada para el caso P2002).

## Dependencies

- ✅ F-SAST-13/16: `pnpm --filter @ggasia/api audit --prod` → **No known vulnerabilities found**.
  Dependencias nuevas de este ticket: `argon2` (^0.45.1), `@fastify/cookie` (^11.1.2).

## Suppressions

Ninguna. No hubo hallazgos Medium que requirieran supresión documentada.

────────────────────────────────────────────────────────────
Total: 17 clean, 0 vulnerabilidades (0 Critical, 0 High, 0 Medium sin mitigar)
Report: docs/daw/security/sast-FEAT-004a.md
Result: PASSED
