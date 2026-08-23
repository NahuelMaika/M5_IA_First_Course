# SAST FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Date | 2026-08-23 |

## Alcance

Diff completo del fix (2 archivos, ~25 líneas):
- `apps/web/src/lib/api/client.ts` — cambio de `process.env[name]` a `process.env.NEXT_PUBLIC_API_URL`.
- `apps/web/src/lib/api/client.test.ts` — test de regresión que lee el propio archivo fuente con `readFileSync`.

## Secretos

✅ F-SAST-01 — 0 secretos hardcodeados. `NEXT_PUBLIC_API_URL` es configuración pública por
convención de Next.js (prefijo `NEXT_PUBLIC_`), no un secreto.

## Injection

✅ F-SAST-02/03/05 — sin SQL, sin ejecución de comandos, sin path traversal. El `readFileSync` del
test usa una ruta fija (`join(import.meta.dirname, "client.ts")`), no input de usuario — no aplica
path traversal.

## XSS y funciones inseguras

✅ F-SAST-06 — sin manipulación de DOM/HTML.
✅ F-SAST-04/17 — sin `eval`, sin deserialización insegura.

## Resto de categorías obligatorias

✅ F-SAST-07 (SSRF) — N/A, mismo destino de `fetch` que antes, sin cambios de flujo.
✅ F-SAST-08 (crypto débil) — N/A.
✅ F-SAST-09 (debug en producción) — N/A.
✅ F-SAST-10 (logging de datos sensibles) — N/A, el mensaje de error no cambia en sustancia.
✅ F-SAST-11 (upload sin restricción) — N/A.
✅ F-SAST-12 (CSRF) — N/A, sin endpoint nuevo.
✅ F-SAST-14 (validación de input incompleta) — N/A, sin input nuevo.
✅ F-SAST-15 (error handling que filtra internals) — el mensaje de error se mantiene idéntico en
   contenido; no expone nada nuevo.

## Dependencias

✅ F-SAST-13/16 — sin cambios en `package.json` ni `pnpm-lock.yaml`. `node:fs` y `node:path` son
builtins de Node, sin dependencia nueva que auditar.

## Suppressions

Ninguna.

---

**Total: 12 clean, 0 vulnerabilidades (0 Critical, 0 High, 0 Medium).**
**Resultado: PASSED.**
