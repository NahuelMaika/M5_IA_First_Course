# SAST Report — FEAT-003b

**Ticket:** FEAT-003b — UI de carga y listado de gastos
**Fase:** CODE (closeout)
**Alcance:** archivos no-test modificados en `feat/FEAT-003b-expenses-ui` desde su base
(`feat/FEAT-003a-expenses-get`): `apps/api/src/{app,env,server}.ts`,
`apps/web/{.env.example,next.config.ts,src/**}` (componentes, cliente API, notificaciones,
rejection-messages, tema).

## Secrets (F-SAST-01)

- ✅ Sin patrones de API key / password / token / clave privada en ningún archivo del alcance.
- ✅ `.env` y `.env.*` están en `.gitignore` (raíz). Confirmado con `git ls-files` que ningún
  `.env`/`.env.local` real está trackeado.
- ✅ `apps/web/.env.example` solo contiene valores de placeholder/dev
  (`NEXT_PUBLIC_API_URL=http://localhost:3001`, `NEXT_PUBLIC_STUB_USER_ID` con el UUID fijo del
  seed de desarrollo) — no son secretos reales.

## Injection (F-SAST-02, F-SAST-03, F-SAST-05)

- ✅ SQL/NoSQL: sin concatenación de queries ni acceso a Prisma en el código nuevo de `apps/web`
  (capas separadas, per `AGENTS.md`). `apps/api` no tocó queries en este alcance (solo CORS/env).
- ✅ Command injection: sin `child_process`/`exec`/`spawn` en el alcance.
- ✅ Path traversal: `apiRequest(path, init)` (`apps/web/src/lib/api/client.ts:34`) recibe `path`
  siempre como literal hardcodeado en los call sites (`"/expenses"`), nunca de input de usuario.

## XSS (F-SAST-06)

- ✅ Sin `dangerouslySetInnerHTML` ni `.innerHTML` en ningún componente del alcance. Todo el texto
  dinámico (mensajes de rechazo, notificaciones, contenido interpretado del gasto) se renderiza
  como children de JSX — escapado por defecto por React.

## Funciones inseguras / crypto débil (F-SAST-04, F-SAST-08, F-SAST-17)

- ✅ Sin `eval()`, `new Function()`, ni deserialización insegura.
- ✅ Sin uso de crypto débil. `crypto.randomUUID()` se usa únicamente como key temporal de React
  para una fila del listado (Block 9) — no es un valor de seguridad ni se envía al servidor.

## SSRF / debug / logging sensible / upload / CSRF (F-SAST-07, 09, 10, 11, 12)

- ✅ SSRF: el `baseUrl` de `apiRequest` viene de `NEXT_PUBLIC_API_URL` (env, no de input de
  usuario); no hay fetch hacia una URL construida con datos del usuario.
- ✅ Debug: sin flags de debug/modo desarrollo condicionados incorrectamente.
- ✅ Logging: `apps/api/src/env.ts:44` loguea únicamente los *nombres* de las variables de entorno
  inválidas (`failedFields`), nunca sus valores.
- N/A Upload: no hay funcionalidad de carga de archivos en este alcance.
- N/A CSRF: la API usa el header `x-user-id` (no cookies de sesión) — el modelo de amenaza de este
  mecanismo ya fue evaluado y aceptado explícitamente en PLAN (ver nota abajo), CSRF con cookies no
  aplica a este esquema.

## Validación incompleta / leak de errores internos (F-SAST-14, F-SAST-15)

- ✅ `apps/web/src/lib/rejection-messages.ts`: los 8 valores de `RejectionReason` están cubiertos
  sin `default` enmascarante — un valor no mapeado hace fallar `getRejectionMessage` en vez de
  filtrar un mensaje no controlado al usuario.
- ✅ Errores 400/401/500/red del backend nunca exponen `details`/stack al usuario — se muestran
  como notificación genérica (`apps/web/src/components/expense-form.tsx`).

## Dependencias (F-SAST-13, F-SAST-16)

- ✅ `pnpm audit --prod`: **No known vulnerabilities found**.

## Nota informativa (no es un finding de SAST)

El header `x-user-id` autogestionado por el cliente y visible en el bundle público del navegador
(`apps/web/src/lib/api/client.ts`) fue identificado y **aceptado explícitamente como riesgo
CRITICAL en el threat model de PLAN** (`docs/daw/security/threat-FEAT-003b.md`), no como un
hallazgo nuevo de esta fase. Se documenta acá solo para trazabilidad — no se re-evalúa ni se
suprime en SAST, que es responsabilidad de PLAN.

## Suppressions

Ninguna. No hubo hallazgos Medium que requirieran supresión documentada.

---

## Resumen

```
┌─────────────────────────────────────────────────────────────┐
│  /daw-security-sast — PASSED                                  │
├─────────────────────────────────────────────────────────────┤
│                                                                │
│  Secrets:                                                     │
│    ✅ F-SAST-01: sin secretos hardcodeados, .env ignorado      │
│                                                                │
│  Injection:                                                   │
│    ✅ F-SAST-02: sin SQL/NoSQL injection                       │
│    ✅ F-SAST-03: sin command injection                         │
│    ✅ F-SAST-05: sin path traversal (path siempre literal)     │
│                                                                │
│  XSS y funciones inseguras:                                    │
│    ✅ F-SAST-06: sin dangerouslySetInnerHTML/innerHTML          │
│    ✅ F-SAST-04/08/17: sin eval, sin crypto débil               │
│                                                                │
│  Dependencias:                                                 │
│    ✅ F-SAST-13/16: pnpm audit --prod sin vulnerabilidades      │
│                                                                │
│  Suppressions: 0                                               │
│                                                                │
│  ────────────────────────────────────────────────────────────│
│  Total: 100% clean, 0 vulnerabilidades (0 critical, 0 high)   │
│  Report: docs/daw/security/sast-FEAT-003b.md                  │
│  Next: gates.sast = true → cerrar CODE, transición a VERIFY   │
└─────────────────────────────────────────────────────────────┘
```

## Ronda 2 — corrective loop (2026-08-21)

**Alcance:** único archivo modificado — `apps/web/src/components/expense-list.test.tsx` (32 líneas
agregadas: un test nuevo que verifica el destino táctil mínimo de 24×24px CSS, AC-13/NFR-03). Sin
cambios en `apps/api` ni en código de producción de `apps/web`.

- ✅ F-SAST-01: sin secretos — el diff es exclusivamente aserciones sobre `className` con literales
  de regex, sin strings sensibles.
- ✅ F-SAST-02/03/05: sin queries, sin `exec`/`spawn`, sin paths — el archivo es un test de
  componente, no toca I/O.
- ✅ F-SAST-06: sin `dangerouslySetInnerHTML`/`.innerHTML`.
- ✅ F-SAST-04/08/17: sin `eval`, sin crypto.
- ✅ F-SAST-13/16: sin dependencias nuevas en `package.json` — no aplica re-auditar.

```
┌─────────────────────────────────────────────────────────────┐
│  /daw-security-sast [ronda 2] — PASSED                        │
├─────────────────────────────────────────────────────────────┤
│  Total: 100% clean, 0 vulnerabilidades (0 critical, 0 high)   │
│  Next: gates.sast = true → cerrar CODE, transición a VERIFY   │
└─────────────────────────────────────────────────────────────┘
```
