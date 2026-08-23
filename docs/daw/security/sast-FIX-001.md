# SAST FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Date | 2026-08-23 |

## Alcance

Diff completo del fix (3 archivos):
- `apps/web/src/lib/api/client.ts` — cambio de `process.env[name]` a `process.env.NEXT_PUBLIC_API_URL`.
- `apps/web/src/lib/api/client.test.ts` — regression test que corre un `next build` real contra un
  `distDir` aislado e inspecciona el bundle compilado.
- `apps/web/next.config.ts` — `distDir` condicional, activado solo por la variable
  `NEXT_BUILD_VERIFY_DIST_DIR` que el test setea.

## Secretos

✅ F-SAST-01 — 0 secretos hardcodeados. `NEXT_PUBLIC_API_URL` es configuración pública por
convención de Next.js (prefijo `NEXT_PUBLIC_`), no un secreto. El `probeUrl` del test es un valor
de prueba inventado (`http://fix-001-build-verify.invalid:4321`), no una credencial.

## Injection

✅ F-SAST-02/03/05 — sin SQL. El test ejecuta `next build` con `execFileSync` (no `exec`/shell),
pasando el binario y los argumentos como array fijo — no hay interpolación de shell ni
concatenación de comandos, por lo que no aplica inyección de comandos aunque se ejecute un
proceso hijo. Las rutas (`webRoot`, `distPath`, el binario `next`) se construyen con `join()` sobre
segmentos literales fijos, nunca sobre input externo — no aplica path traversal.

## XSS y funciones inseguras

✅ F-SAST-06 — sin manipulación de DOM/HTML.
✅ F-SAST-04/17 — sin `eval`, sin deserialización insegura.

## Resto de categorías obligatorias

✅ F-SAST-07 (SSRF) — N/A, mismo destino de `fetch` que antes en el código de producción; el
`probeUrl` del test nunca se usa para una request real (el build solo lo inlinea como string).
✅ F-SAST-08 (crypto débil) — N/A.
✅ F-SAST-09 (debug en producción) — N/A. La rama condicional de `distDir` en `next.config.ts`
solo se activa si `NEXT_BUILD_VERIFY_DIST_DIR` está seteada, algo que únicamente hace el propio
test — en `next dev`/`next build` normales (incluida producción) esa variable nunca existe, así
que el comportamiento por defecto (`.next`) no cambia.
✅ F-SAST-10 (logging de datos sensibles) — N/A, el mensaje de error no cambia en sustancia.
✅ F-SAST-11 (upload sin restricción) — N/A.
✅ F-SAST-12 (CSRF) — N/A, sin endpoint nuevo.
✅ F-SAST-14 (validación de input incompleta) — N/A, sin input nuevo del usuario final; el único
"input" nuevo (`NEXT_BUILD_VERIFY_DIST_DIR`) es una variable de entorno de build-time controlada
exclusivamente por quien ejecuta el build (mismo nivel de confianza que `WEB_ORIGIN`/`DATABASE_URL`),
nunca por un actor en runtime.
✅ F-SAST-15 (error handling que filtra internals) — el mensaje de error se mantiene idéntico en
contenido; no expone nada nuevo.

## Dependencias

✅ F-SAST-13/16 — sin cambios en `package.json` ni `pnpm-lock.yaml`. `node:child_process`,
`node:fs` y `node:path` son builtins de Node, sin dependencia nueva que auditar.

## Suppressions

Ninguna.

---

**Total: 13 clean, 0 vulnerabilidades (0 Critical, 0 High, 0 Medium).**
**Resultado: PASSED.**
