# RCA FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Tracker | none |
| Date | 2026-08-23 |

## Síntoma reportado

Con `pnpm dev` corriendo y sin sesión iniciada, el usuario queda en la pantalla de carga de gastos
(`/`) en vez de ser redirigido a `/login`. No aparece ningún error visible de forma obvia; la app
simplemente no navega.

## Causa raíz

`apps/web/src/lib/api/client.ts` define:

```ts
function readRequiredEnvVar(name: "NEXT_PUBLIC_API_URL"): string {
  const value = process.env[name];
  ...
}
```

`process.env[name]` es un acceso **dinámico** (con corchetes, sobre un parámetro). Next.js solo
inlinea variables `NEXT_PUBLIC_*` en el bundle del navegador cuando detecta un acceso **literal**,
con notación de punto (`process.env.NEXT_PUBLIC_API_URL`), en algún lugar del código fuente durante
su análisis estático de build — es así como decide qué variables exponer al cliente. Como ese acceso
literal no existe en ningún lugar del código (`apps/web/src`), la variable nunca se inlinea. En el
navegador, `process.env` es el polyfill que Next.js inyecta para el cliente, y no tiene la clave
`NEXT_PUBLIC_API_URL` — el acceso evalúa a `undefined`.

Confirmado inspeccionando directamente el bundle compilado en `apps/web/.next/dev/static/chunks/`:
el valor literal `http://localhost:3001` no aparece en ningún lado del código que llega al
navegador — solo queda la referencia a `process.env[name]` contra el polyfill.

## Cadena de eventos

1. Un componente del cliente (`expense-list.tsx`, `expense-form.tsx`, `login-form.tsx`,
   `register-form.tsx`, `logout-button.tsx`) llama a `apiRequest(path)`.
2. `apiRequest` llama a `readRequiredEnvVar("NEXT_PUBLIC_API_URL")`.
3. `process.env["NEXT_PUBLIC_API_URL"]` evalúa a `undefined` en el navegador (aunque en Node/Vitest
   sí tiene el valor real).
4. `readRequiredEnvVar` lanza `Error: NEXT_PUBLIC_API_URL is not configured...` **antes** de que
   `fetch` llegue a ejecutarse.
5. El `catch` del componente (mismo bloque que trata fallas de red) captura ese error y muestra el
   estado de error genérico — nunca hay una `Response` real.
6. `handleUnauthorized` (Block 7/8, spec-FEAT-004b) nunca se ejecuta porque nunca recibe una
   `Response` con la que evaluar el status. El redirect a `/login` nunca dispara.

## Componente afectado

`apps/web/src/lib/api/client.ts` — el único módulo autorizado a construir requests hacia
`apps/api`. Lo usa **toda** llamada del navegador: listado de gastos, alta de gasto, registro,
login, logout.

## Preexistencia

El patrón `process.env[name]` con notación de corchetes existe desde FEAT-003b Block 5 (commit
histórico, `apps/web/src/lib/api/client.ts` original con `NEXT_PUBLIC_STUB_USER_ID`). No fue
introducido por FEAT-004b — se heredó sin cambios en Block 2 de spec-FEAT-004b (`7636ba3`).

## Por qué no lo agarraron los tests

Los 252 tests de la suite corren bajo Vitest/Node, donde `process.env` sí contiene el valor real
seteado por el entorno de test — nunca ejercitan el bundle real que Next.js compila y sirve al
navegador. La regresión solo es observable corriendo `pnpm dev` y probando en un browser real.

## PRD relacionado

`docs/daw/prd/prd-FEAT-003b.md` y `docs/daw/prd/prd-FEAT-004b.md` — ninguno especifica el mecanismo
de lectura del env var (correctamente: es un detalle de implementación). No hay gap de requisitos;
es un defecto de implementación.

## Plan de la corrección (detalle en el spec de PLAN)

Reemplazar el acceso dinámico por un acceso literal de punto, para que Next.js pueda detectarlo e
inlinearlo en build. Dado que `readRequiredEnvVar` hoy solo tiene un valor posible para `name`
(`"NEXT_PUBLIC_API_URL"` — el otro caso, `NEXT_PUBLIC_STUB_USER_ID`, ya no existe desde FEAT-004b),
la función se simplifica a leer `process.env.NEXT_PUBLIC_API_URL` directamente.

## Rollback

Revertir el commit del fix restaura el comportamiento roto (sin redirect, error genérico
silencioso) pero no rompe nada adicional — no hay cambios de esquema, migración ni interfaz
pública involucrados. `git revert` del commit de CODE es suficiente.
