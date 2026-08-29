# Verify — FEAT-006 (Alta de gasto por audio: transcripción + extracción)

Verificado por `daw-module-verifier` (agente sin autoría del código) contra
`prd-FEAT-006.md`, `spec-FEAT-006.md`, `threat-FEAT-006.md` y `sast-FEAT-006.md`.

## Trazabilidad PRD → Código → Tests

| AC | Código | Test |
|----|--------|------|
| AC-01 | `routes/expenses.ts:handleCreateExpenseFromAudio` | `expenses.test.ts` "returns 201 ... channel: audio (AC-01)", `expense-form.test.tsx` "happy path ... (AC-01/AC-10)" |
| AC-02 | `transcription-client.ts` (nunca loguea buffer/texto) + `expenses.ts` (ningún early-return expone buffer/transcripción) | `expenses.test.ts` "never exposes the raw audio bytes or the transcribed text in an error response (AC-02)" (marca secreta inyectada, verificada ausente del body) |
| AC-03 | `expenses.ts` (paso 5: `trim()===""` → 422) | `expenses.test.ts` "422 transcripcion_vacia ... (AC-03)", `expense-form.test.tsx` "422 transcripcion_vacia ... (AC-03)" |
| AC-04 | `app.ts` (multipart `fileSize: 25MB`) + `expenses.ts` (`bodyLimit` por-ruta + catch de `toBuffer()`) | `expenses.test.ts` "413 ... transcribeAudio nunca invocado (AC-04)" |
| AC-05 | `transcription-client.ts` (catch de fetch/timeout/no-ok → `outcome: "error"`) + `expenses.ts` (502) | `expenses.test.ts` "502 ... createExpense nunca invocado (AC-05)", `expense-form.test.tsx` "502 ... (AC-05)" |
| AC-06 | `expense-form.tsx` (botón mic nunca usa `isSubmitting` como `disabled`) | `expense-form.test.tsx` "the stop button stays enabled while recording, even while a text submit is in flight (AC-06)" |
| AC-07 | `expenses.ts` (`authPreHandler`) | `expenses.test.ts` "401 when there is no session cookie (AC-07)" (`transcribeAudio` never called, verificado) |
| AC-08 | `use-audio-recorder.ts` (`status: "error"` en permiso denegado / API ausente) + `expense-form.tsx` (notify + Textarea nunca se desmonta) | `use-audio-recorder.test.ts` (2 tests) + `expense-form.test.tsx` "microphone permission denied ... leaves the text Textarea present and enabled (AC-08)" |
| AC-09 | `expense-form.tsx` (`isSubmitting` compartido) | `expense-form.test.tsx` "shows a progress indicator and disables the submit control ... (AC-09)" |
| AC-10 | `expense-form.tsx` (reusa `<section aria-label="Detalle del gasto guardado">`) | `expense-form.test.tsx` "happy path ... renders the same interpreted detail as the text flow (AC-01/AC-10)" |
| NFR-01 | `transcription-client.ts` (`AbortSignal.timeout(6000)`) | Medición de latencia real fuera del alcance automatizado, tal como el spec lo declara |
| NFR-02 | canal de texto sin dependencia de `TRANSCRIPTION_*` | Diff acotado a exactamente 13 archivos = los 7 blocks; suite completa de `/expenses` en verde sin cambios de expectativas preexistentes |
| NFR-03 | cubierto por AC-07 | — |

Las 10 AC + 3 NFR: ✅ PASS.

## Spec — 7 bloques

- ✅ Block 1 — `env.ts` — 4/4 tests requeridos (BASE_URL ausente, `http://` rechazado/R1, API_KEY vacío, happy path).
- ✅ Block 2 — `ExpenseChannel` enum + `createExpense(channel)` — migración SQL correcta, default `"texto"` preservado (no-regresión), 2/2 tests.
- ✅ Block 3 — `transcription-client.ts` — 5/5 tests requeridos (200 OK, 401/500, timeout, headers/body, JSON malformado).
- ✅ Block 4 — multipart registrado, límite 25MB — smoke test en `app.test.ts`.
- ✅ Block 5 — `POST /expenses/audio` — 9/9 tests requeridos, asserts de body real, no solo status code.
- ✅ Block 6 — `useAudioRecorder` — 5/5 tests requeridos.
- ✅ Block 7 — control de grabación en `expense-form.tsx` — 10/10 tests requeridos, incluye FormData sin `Content-Type` manual.

Los 7 bloques: ✅ PASS.

## Threat model / SAST

- ✅ R1 (TLS forzado) — `env.ts:41` `z.url({ protocol: /^https$/ })` + test dedicado.
- ✅ FR-03 (buffer nunca persistido/logueado) — `transcription-client.ts` solo loguea `err`/`status`; confirmado con test de "marca secreta" en el body (AC-02).
- ✅ `sast-FEAT-006.md` — PASSED, 0 Critical/High/Medium sin suprimir.
- ℹ️ R2 (audio a Groq) / R3 (sin rate-limiting) / R4 (sin filtrado MIME) — riesgos aceptados en PLAN, sin código pendiente.

## Regresión canal de texto

- ✅ `POST /expenses` (route + service) sin cambios de comportamiento — mismos tests preexistentes en verde.
- ✅ `expense-form.tsx`: `submitExpense()` (flujo Textarea) intacto; botón "Guardar" sin cambios.
- ✅ Diff acotado a exactamente 13 archivos = los 7 blocks del spec, nada fuera de alcance.

## Calidad

- ✅ F-VER-05: `pnpm --filter @ggasia/api typecheck` y `pnpm --filter @ggasia/web typecheck` limpios.
- ✅ W-VER-01: sin imports/código muerto detectado (confirmado por typecheck con `noUnusedLocals` limpio).
- ⚠️ Lint: no hay linter configurado en el proyecto — no aplicable, no es un gap de este ticket.

## Ejecución real

- ✅ `pnpm --filter @ggasia/api test` → 228/228 tests, 23 archivos (incluye `expenses.integration.test.ts` contra Supabase de test, corrió y pasó sin problema de conectividad).
- ✅ `pnpm --filter @ggasia/web exec vitest run expense-form.test.tsx use-audio-recorder.test.ts expense-list.test.tsx --maxWorkers=2` → 47/47 tests, 3 archivos.

## Resultado

```
Total: 27 passed, 0 failed, 1 warning (lint no configurado en el proyecto, no bloqueante)
Result: PASSED
```

**PASSED** — 0 FAILs de F-VER-01 a F-VER-06. `gates.verify` = `true`.
