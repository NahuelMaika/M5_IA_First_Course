# Fix-plan FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Tier | FIX |
| RCA | docs/daw/specs/rca-FIX-001.md |
| Date | 2026-08-23 |
| Spec loops | 0 |

## Problem

Con la app corriendo (`pnpm dev`) y sin sesión iniciada, el usuario queda en la pantalla de carga
de gastos (`/`) en vez de ser redirigido a `/login`. `GET /expenses` sí responde 401 desde
`apps/api` (verificado con `curl`), pero ese `Response` nunca llega a ejecutarse: `apiRequest()`
lanza una excepción antes de invocar `fetch`, así que el `catch` del componente lo trata como una
falla de red genérica en vez de dejar pasar el 401 a `handleUnauthorized`.

## Root cause

`apps/web/src/lib/api/client.ts` lee la variable de entorno con acceso dinámico:

```ts
function readRequiredEnvVar(name: "NEXT_PUBLIC_API_URL"): string {
  const value = process.env[name];
  ...
}
```

Next.js solo inlinea variables `NEXT_PUBLIC_*` en el bundle del navegador cuando detecta un acceso
**literal** con notación de punto (`process.env.NEXT_PUBLIC_API_URL`) en el código fuente, durante
su análisis estático de build. Como ese acceso literal no existe en ningún lugar del código
(confirmado por el impact scan), la variable nunca se inlinea, y en el navegador
`process.env["NEXT_PUBLIC_API_URL"]` evalúa a `undefined` contra el polyfill de `process` que
Next.js inyecta para el cliente. Detalle completo en `docs/daw/specs/rca-FIX-001.md`.

## Solution — steps

1. `apps/web/src/lib/api/client.ts:16-26` — reemplazar `readRequiredEnvVar(name)` (que recibe un
   parámetro y hace `process.env[name]`) por una lectura directa con acceso literal de punto:

   ```ts
   function readRequiredEnvVar(): string {
     const value = process.env.NEXT_PUBLIC_API_URL;

     if (!value) {
       throw new Error(
         "NEXT_PUBLIC_API_URL is not configured. Set it in apps/web/.env.local (see apps/web/.env.example).",
       );
     }

     return value;
   }
   ```

   El parámetro `name` se elimina: la función hoy solo tiene un valor posible para ese parámetro
   (`"NEXT_PUBLIC_API_URL"` — el otro caso histórico, `NEXT_PUBLIC_STUB_USER_ID`, ya no existe desde
   FEAT-004b), así que mantenerlo genérico solo perpetúa el patrón que causó el bug.

2. `apps/web/src/lib/api/client.ts:38` — actualizar la única llamada, `readRequiredEnvVar("NEXT_PUBLIC_API_URL")`,
   a `readRequiredEnvVar()` (sin argumento).

## Dependencies between steps

Ninguna — es el mismo archivo, dos líneas relacionadas, sin orden que importe entre sí.

## Error handling

El mensaje de error ante variable faltante se mantiene idéntico en texto y comportamiento (sigue
lanzando antes de llamar `fetch`); solo cambia el mecanismo de lectura. No se introduce ningún
camino de error nuevo.

## Tests

- [ ] **Regression test** — un test en `client.test.ts` que verifique que, con `NEXT_PUBLIC_API_URL`
  seteada en `process.env`, `apiRequest` construye la URL correctamente (ya existe un test
  equivalente; se revisa que siga pasando con acceso literal, ya que el impact scan confirmó que el
  test setea/borra la variable con `process.env["NEXT_PUBLIC_API_URL"] = ...` — comportamiento
  idéntico bajo Node sea cual sea la notación de lectura).
- [ ] El test existente del sad path (`NEXT_PUBLIC_API_URL` no configurada → throw) sigue pasando
  sin modificación.
- [ ] Nuevo test de regresión específico: build real de producción (`next build`) del módulo, o
  inspección del bundle compilado, confirmando que el valor de `NEXT_PUBLIC_API_URL` SÍ aparece
  inlineado como literal en el output del cliente — esta es la prueba que el bug original nunca tuvo
  y que hubiera evitado que pasara desapercibido. Ver criterio de finalización.

## Regression risk

**Bajo.** Cambio de dos líneas en un único archivo, sin cambiar la interfaz pública de `apiRequest`
(sigue recibiendo `path` e `init`, sigue devolviendo `Promise<Response>`). Ningún llamador
(`auth.ts`, `expense-list.tsx`, `expense-form.tsx`) cambia su forma de invocar `apiRequest`. El
impact scan confirmó que `readRequiredEnvVar` no se exporta y solo se usa dentro de `client.ts`, así
que no hay otros consumidores directos.

## Rollback plan

- **Pasos:** trivial — `git revert` del commit de CODE. No hay cambios de esquema, migración,
  variable de entorno nueva ni interfaz pública involucrados; revertir el commit restaura el
  comportamiento roto (sin redirect, error genérico silencioso) sin romper nada adicional.
- **Indicadores:** si tras el fix `apiRequest` deja de funcionar en el navegador real (p. ej. la app
  no puede listar/crear gastos en absoluto, no solo el caso sin sesión), es señal de que el acceso
  literal introdujo un problema de build distinto al que resolvía — revertir y reabrir el ticket.
