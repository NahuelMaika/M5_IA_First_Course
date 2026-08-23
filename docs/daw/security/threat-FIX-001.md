# Threat Model FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Date | 2026-08-23 |

## Contexto del diseño

El fix-plan (`docs/daw/specs/fix-FIX-001.md`) modifica exclusivamente
`apps/web/src/lib/api/client.ts`, cambiando cómo `readRequiredEnvVar` lee la variable de entorno
`NEXT_PUBLIC_API_URL` — de acceso dinámico con corchetes (`process.env[name]`) a acceso literal con
notación de punto (`process.env.NEXT_PUBLIC_API_URL`), para que Next.js pueda inlinearla en el
bundle del navegador en build time. No cambia la interfaz pública de `apiRequest`, no agrega
endpoints, no toca autenticación/autorización, no persiste datos nuevos.

## Componente analizado

`apps/web/src/lib/api/client.ts` — módulo de transporte HTTP del cliente, frontera de confianza
entre el navegador (no confiable) y `apps/api` (confiable). Esta frontera ya existe y no cambia con
este fix: `credentials: "include"` sigue igual, el mecanismo de sesión por cookie (FEAT-004a/b)
sigue igual.

## Superficies de ataque identificadas

Ninguna nueva. El cambio no acepta input de usuario, no expone datos nuevos, no introduce
autenticación/autorización nueva, no integra un servicio externo nuevo y no cambia el flujo de datos
existente — solo corrige que un valor ya destinado a ser público (`NEXT_PUBLIC_API_URL`, por
convención de Next.js: el prefijo `NEXT_PUBLIC_` existe justamente para marcar variables que SÍ
deben llegar al navegador) efectivamente llegue al bundle del cliente, en vez de causar una
excepción antes del `fetch`.

## Evaluación STRIDE

| Categoría | Aplica | Análisis |
|---|---|---|
| Spoofing | No | No involucra identidad ni autenticación. |
| Tampering | No | No modifica datos en tránsito ni en reposo. |
| Repudiation | No | No agrega ni quita logging. |
| Information Disclosure | No | `NEXT_PUBLIC_API_URL` ya está destinada a ser pública por convención de Next.js (el prefijo `NEXT_PUBLIC_` es exactamente para eso); el fix hace que ese inlineado ya-intencionado funcione, no expone nada que no debiera ser público. No es la variable `DATABASE_URL`/secretos de `apps/api` — esas nunca pasan por este módulo. |
| Denial of Service | No | Sin cambios de performance ni de capacidad. |
| Elevation of Privilege | No | Sin cambios de privilegios. |

## Datos sensibles involucrados

Ninguno. `NEXT_PUBLIC_API_URL` es un valor de configuración público (URL base de la API, no un
secreto) — por diseño, ya que todo lo que lleva el prefijo `NEXT_PUBLIC_` termina en el bundle del
navegador de todas formas.

## Riesgos identificados

Ninguno CRITICAL, HIGH, MEDIUM ni LOW. Este cambio no introduce superficie de ataque nueva.

## Frontera de confianza

Declarada explícitamente: navegador (no confiable) ↔ `apps/api` (confiable), mediada por
`apiRequest()`. Sin cambios respecto al estado actual.

---

**Resultado: PASSED.** 0 riesgos identificados, 0 mitigaciones pendientes.
