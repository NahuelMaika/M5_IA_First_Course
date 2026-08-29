# SAST — FEAT-006 (Alta de gasto por audio: transcripción + extracción)

CODE closeout. Alcance: los 7 blocks del ticket, con foco en el diff final (Block 5:
`apps/api/src/routes/expenses.ts`, Block 3: `apps/api/src/services/transcription-client.ts`, Block
4: registro de `@fastify/multipart` en `apps/api/src/app.ts`, Block 6:
`apps/web/src/lib/hooks/use-audio-recorder.ts`, Block 7: `apps/web/src/components/expense-form.tsx`)
y en las mitigaciones de `threat-FEAT-006.md`.

## Secretos

- ✅ F-SAST-01: `TRANSCRIPTION_API_KEY` se lee únicamente de `env.ts` (`process.env`), nunca
  hardcodeada; no aparece en ningún archivo modificado ni en logs (`transcription-client.ts` solo
  loguea `response.status`, nunca headers ni body).

## Injection

- ✅ F-SAST-02: sin queries construidas por concatenación; `createExpense` recibe el texto
  transcripto como `rawInput` parametrizado (Block 2), mismo camino que el canal de texto.
- ✅ F-SAST-03: sin `exec`/`spawn`/`eval`/`new Function` en ningún archivo modificado (grep
  verificado sobre los 4 archivos del diff).
- ✅ F-SAST-05: `filename`/`mimetype` del multipart (`data.filename`, `data.mimetype`) solo se usan
  como metadata del `Blob` reenviado a Groq (`transcription-client.ts:48`) — nunca se usan para
  construir un path de filesystem; el archivo nunca toca disco.

## XSS y funciones inseguras

- ✅ F-SAST-06: sin `innerHTML`/`dangerouslySetInnerHTML` en `expense-form.tsx`; el resultado
  (`result.name`, `result.category`, etc.) se renderiza como texto React, mismo patrón ya
  establecido para el canal de texto.
- ✅ F-SAST-04/17: sin `eval` ni deserialización insegura; `response.json()` del cliente de
  transcripción está en un `try/catch` que devuelve `{ outcome: "error" }` ante un body malformado,
  sin `eval` de contenido externo.
- ✅ F-SAST-08: sin criptografía propia introducida en este ticket.

## Resto de categorías obligatorias

- ✅ F-SAST-07 (SSRF): `TRANSCRIPTION_BASE_URL` es una env var fija en deploy (`z.url({ protocol:
  /^https$/ })`, `env.ts:41`), nunca input del usuario — sin URL dinámica construible por request.
- ✅ F-SAST-09: sin flags de debug en el código de producción.
- ✅ F-SAST-10: ni el `buffer` de audio ni el texto transcripto se loguean en ningún punto
  (`transcription-client.ts` solo loguea `err`/`status`; `expenses.ts` no loguea nada localmente,
  delega al logger de `createExpense` que ya excluye `rawInput` desde FEAT-001b).
- ✅ F-SAST-11 (Unrestricted upload): mitigado estructuralmente — el archivo nunca se escribe a
  disco ni se sirve de vuelta (procesado 100% en memoria, descartado al retornar). Doble límite de
  tamaño: `bodyLimit: 25 * 1024 * 1024` por-ruta (`expenses.ts:372`) + `limits.fileSize`/`files: 1`
  del plugin (`app.ts:119`).
- ✅ F-SAST-12 (CSRF): la ruta reutiliza `authPreHandler`/cookie de sesión sin cambios — mismo
  modelo ya aceptado en `threat-FEAT-004b.md`/`threat-FEAT-005a.md`, no un gap nuevo de este ticket.
- ✅ F-SAST-14: presencia de archivo (400 si falta), tamaño (413) y transcripción no vacía (422) se
  validan explícitamente antes de invocar `createExpense` (spec Block 5, pasos 2-5).
- ✅ F-SAST-15: todo camino de error de `handleCreateExpenseFromAudio` responde un body fijo y
  genérico (`400`/`401`/`413`/`422`/`502`/`500`) — nunca el buffer, la transcripción, ni un stack
  trace real.

## Dependencias

- ✅ F-SAST-13/16: `pnpm audit --prod` — sin vulnerabilidades conocidas (incluye `@fastify/multipart`
  y las nuevas dependencias de Blocks 3/4).

## Riesgos heredados de `threat-FEAT-006.md`

- R1 (TLS hacia Groq) — mitigado en código, ya verificado arriba (`env.ts:41`).
- R2 (audio enviado a Groq, procesador de terceros) — riesgo aceptado por el usuario en PLAN, sin
  hallazgo de código nuevo que agregar.
- R3 (sin rate-limiting) / R4 (sin filtrado de MIME type) — riesgos aceptados en PLAN, impacto Low,
  consistentes con el resto de la API existente.

## Suppressions

Ninguna.

## Resultado

**PASSED** — 0 Critical, 0 High, 0 Medium sin suprimir.
