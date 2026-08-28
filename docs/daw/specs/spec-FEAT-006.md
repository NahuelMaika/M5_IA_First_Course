# Spec FEAT-006: Alta de gasto por audio (transcripción + extracción)

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| PRD | docs/daw/prd/prd-FEAT-006.md |
| Tier | FEATURE |
| Date | 2026-08-28 |
| Spec loops | 1 |

## Summary

`apps/api` gana un endpoint `POST /expenses/audio` que recibe un archivo (`multipart/form-data`,
máx. 25 MB), lo transcribe llamando a Groq (`whisper-large-v3-turbo`, endpoint OpenAI-compatible ya
configurado en `.env`) y pasa el texto transcripto a `createExpense` — el mismo pipeline que usa
`POST /expenses` — parametrizado con `channel: "audio"`. `apps/web` gana un hook `MediaRecorder` y
un control de grabación en `expense-form.tsx` que envía el blob grabado al nuevo endpoint y
reutiliza el render de detalle ya existente para el resultado. Ver ADR-005 para la elección de
proveedor y la estrategia de límite de tamaño.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 5 |
| FR-02 | Block 5 |
| FR-03 | Block 3, Block 5 |
| FR-04 | Block 5 |
| FR-05 | Block 4, Block 5 |
| FR-06 | Block 6, Block 7 |
| FR-07 | Block 7 |
| FR-08 | Block 7 |
| FR-09 | Block 7 |
| NFR-01 | Strategy: timeout de 6s en el cliente de transcripción (Block 3), deja ~2s de margen sobre el p95 de 8s para el resto del pipeline; medido manualmente en VERIFY (no hay entorno de carga automatizado en el proyecto) |
| NFR-02 | Strategy: ningún archivo ni ruta del canal de texto (`POST /expenses`, `expense-form.tsx`'s flujo de texto) se modifica para depender de `TRANSCRIPTION_*` — si Groq está caído, la única ruta afectada es `/expenses/audio` |
| NFR-03 | Block 5 |
| AC-01 | Block 5 |
| AC-02 | Block 3, Block 5 |
| AC-03 | Block 5 |
| AC-04 | Block 4, Block 5 |
| AC-05 | Block 3, Block 5 |
| AC-06 | Block 7 |
| AC-07 | Block 5 |
| AC-08 | Block 6, Block 7 |
| AC-09 | Block 7 |
| AC-10 | Block 7 |

## Dependencies between blocks

Blocks 1–4 son independientes entre sí pero todos alimentan Block 5 (no puede completarse sin
ellos). Block 6 es independiente de los anteriores. Block 7 depende de Block 6 (usa su hook) y,
funcionalmente, del contrato que define Block 5 (aunque sus tests usan `fetch` mockeado, no
requieren el backend corriendo). Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6 → 7.

## Block 1 — Configuración: variables de entorno de transcripción

**Files**
- `apps/api/src/env.ts` (modified) — agrega `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY`,
  `TRANSCRIPTION_MODEL` a `envSchema`.

**Logic**
Mismo patrón que las env vars existentes: `TRANSCRIPTION_API_KEY: z.string().min(1)`,
`TRANSCRIPTION_MODEL: z.string().min(1)`. `TRANSCRIPTION_BASE_URL` usa `z.url({ protocol: /^https$/
})` — a diferencia de `WEB_ORIGIN` (que acepta `http://` para desarrollo local),
`TRANSCRIPTION_BASE_URL` viaja siempre hacia un servicio real de terceros (nunca `localhost`), así
que exige `https://` sin excepción (threat-FEAT-006.md, riesgo R1: el audio del usuario —
potencialmente PII de voz — y la API key no deben poder viajar en texto plano por un
mal-config). Ninguna de las tres tiene un default — si falta cualquiera, `loadEnv` hace
`process.exit(1)` igual que hoy con `DATABASE_URL`/`WEB_ORIGIN` (AGENTS.md: "la API aborta el
proceso si falta una env var requerida").

**Input validation**
- `TRANSCRIPTION_BASE_URL`: debe ser una URL válida con protocolo `https` (el cliente de Block 3
  concatena `/audio/transcriptions` sobre este valor tal cual).
- `TRANSCRIPTION_API_KEY` / `TRANSCRIPTION_MODEL`: no vacíos.

**Error handling**
- Cualquier campo ausente o inválido → el proceso nunca llega a levantar el servidor (mismo
  comportamiento que hoy para `DATABASE_URL`/`WEB_ORIGIN`).

**Required tests**
- [ ] `apps/api/tests/env.test.ts` — falla (`process.exit(1)`) si `TRANSCRIPTION_BASE_URL` está
  ausente
- [ ] `apps/api/tests/env.test.ts` — falla si `TRANSCRIPTION_BASE_URL` usa `http://` en vez de
  `https://` (threat-FEAT-006.md R1)
- [ ] `apps/api/tests/env.test.ts` — falla si `TRANSCRIPTION_API_KEY` está vacío
- [ ] `apps/api/tests/env.test.ts` — carga OK con las tres variables presentes y válidas

**Completion criterion**
`vitest run apps/api/tests/env.test.ts` pasa; `pnpm --filter @ggasia/api typecheck` no reporta
errores en `env.ts`.

## Block 2 — Dominio: canal de audio en el modelo de datos

**Files**
- `apps/api/prisma/schema.prisma` (modified) — agrega `audio` a `enum ExpenseChannel`.
- `apps/api/prisma/migrations/<timestamp>_add_audio_expense_channel/` (new) — migración generada
  por `prisma migrate dev`.
- `apps/api/src/services/expense-service.ts` (modified) — `createExpense` gana un 4° parámetro
  `channel: Expense["channel"] = "texto"`, reemplaza el literal hardcodeado en la línea 165
  (`channel: "texto"` → `channel`).

**Logic**
El enum pasa de un solo valor (`texto`) a dos (`texto`, `audio`). La migración se genera con
`pnpm --filter @ggasia/api exec prisma migrate dev --name add_audio_expense_channel` (AGENTS.md:
nunca `db:migrate`/`prisma migrate deploy` interactivo en producción, pero `migrate dev` es
exactamente la herramienta correcta en desarrollo). `createExpense` sigue sin exponer `channel`
como parte de ningún schema Zod de request — lo decide el caller (la ruta), nunca el body del
usuario. Todos los call sites existentes (`POST /expenses`, tests de `expense-service.test.ts`)
siguen compilando sin cambios porque el parámetro tiene default.

**Data model**
- `ExpenseChannel` (enum, mapeado a `expense_channel` en Postgres): agrega el valor `audio`. Sin
  cambios en la tabla `expenses` — la columna `channel` ya existe y solo amplía sus valores
  permitidos.

**Error handling**
Ninguno nuevo — la migración solo agrega un valor de enum, no toca filas existentes (todas ya
tienen `channel = 'texto'`).

**Required tests**
- [ ] `apps/api/tests/services/expense-service.test.ts` — `createExpense` sin 4° argumento persiste
  `channel: "texto"` (comportamiento actual sin cambios)
- [ ] `apps/api/tests/services/expense-service.test.ts` — `createExpense(deps, userId, rawInput,
  "audio")` persiste `channel: "audio"`
- [ ] `apps/api/tests/prisma-schema.test.ts` (si ya valida el enum) — `audio` es un valor aceptado

**Completion criterion**
`prisma migrate dev` corre limpio contra la base de test; `vitest run
apps/api/tests/services/expense-service.test.ts apps/api/tests/prisma-schema.test.ts` pasa.

## Block 3 — Cliente de transcripción (Groq)

**Files**
- `apps/api/src/services/transcription-client.ts` (new) — primer cliente HTTP externo del
  proyecto.

**Logic**
Exporta `transcribeAudio(buffer: Buffer, filename: string, mimeType: string):
Promise<TranscriptionResult>`, con `TranscriptionResult = { outcome: "transcribed"; text: string }
| { outcome: "error" }`. Construye un `FormData` nativo (`file` como `Blob` a partir del `buffer` +
`mimeType`, `model: env.TRANSCRIPTION_MODEL`) y hace `fetch(`${env.TRANSCRIPTION_BASE_URL}
/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer
${env.TRANSCRIPTION_API_KEY}` }, body: formData, signal: AbortSignal.timeout(6000) })` — timeout de
6s (NFR-01: deja margen sobre el p95 de 8s para el resto del pipeline). Si la respuesta no es
`response.ok`, o el `fetch` rechaza (red, timeout), devuelve `{ outcome: "error" }` sin lanzar. Si
es OK, parsea el JSON de respuesta (`{ text: string }`, formato por default de la API
OpenAI-compatible) y devuelve `{ outcome: "transcribed", text: data.text }`.

El `buffer` recibido como parámetro nunca se escribe a disco ni se loguea en este módulo (FR-03):
solo se envía como body de la request HTTP y queda elegible para GC en cuanto la función retorna.

**Error handling**
- Respuesta HTTP no-OK del proveedor (4xx/5xx) → `{ outcome: "error" }`, loggeando `response.status`
  (nunca el body, que podría reflejar contenido del audio transcripto parcialmente).
- Timeout (6s) o error de red (`fetch` rechaza) → `{ outcome: "error" }`, mismo logging.
- JSON de respuesta malformado → `{ outcome: "error" }`.

**Required tests**
- [ ] `apps/api/tests/services/transcription-client.test.ts` — respuesta 200 con `{ text: "..." }`
  → `{ outcome: "transcribed", text: "..." }`
- [ ] ídem — respuesta 401/500 del proveedor → `{ outcome: "error" }`
- [ ] ídem — timeout (fetch mockeado que nunca resuelve, `AbortSignal` dispara) → `{ outcome:
  "error" }`
- [ ] ídem — request enviada con `Authorization: Bearer <TRANSCRIPTION_API_KEY>` y `model:
  <TRANSCRIPTION_MODEL>` correctos (verificado sobre el mock de `fetch`)
- [ ] ídem — respuesta 200 con un body que no parsea como JSON válido → `{ outcome: "error" }`
  (spec loop 1, F-SPEC-16)

**Completion criterion**
`vitest run apps/api/tests/services/transcription-client.test.ts` pasa; el módulo no importa nada
de `fastify` ni `../generated/prisma` (sigue siendo un cliente HTTP puro).

## Block 4 — Soporte multipart y límites de tamaño

**Files**
- `apps/api/package.json` (modified) — agrega `@fastify/multipart` a `dependencies`.
- `apps/api/src/app.ts` (modified) — registra el plugin.

**Logic**
`app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })`, junto a los demás
`app.register(...)` existentes. El `bodyLimit: 16384` global de la instancia (línea 94, mitigación
DoS de `threat-FEAT-002.md`) **no se toca** — sigue protegiendo `POST /expenses` y el resto de las
rutas de texto (ADR-005). El límite de 25 MB para el audio se declara en Block 5, a nivel de la
ruta nueva únicamente. `limits.fileSize` del plugin (25 MB) actúa como respaldo del `bodyLimit`
por-ruta para el caso de un body chunked sin `Content-Length` fiable (ver ADR-005).

**Error handling**
Ninguno propio de este bloque — los límites configurados aquí se ejercitan y verifican en Block 5.

**Required tests**
- [ ] `apps/api/tests/app.test.ts` — `buildApp()` no lanza con el plugin registrado (smoke test de
  que la instancia sigue construyéndose)

**Completion criterion**
`pnpm --filter @ggasia/api typecheck` pasa con la dependencia nueva instalada;
`vitest run apps/api/tests/app.test.ts` pasa.

## Block 5 — Endpoint POST /expenses/audio

**Files**
- `apps/api/src/routes/expenses.ts` (modified) — agrega `handleCreateExpenseFromAudio` y su
  registro de ruta.

**Logic**
1. `authPreHandler` (reutilizado tal cual) resuelve `request.userId` o responde 401 antes de que el
   handler corra (AC-07/NFR-03).
2. `const data = await request.file()` (API de `@fastify/multipart`). Si `data` es `undefined` (no
   se envió ningún archivo) → 400.
3. `const buffer = await data.toBuffer()`. Si el archivo excede `limits.fileSize` del plugin, esta
   llamada lanza — capturado en un `try/catch` alrededor de este paso, responde 413 sin haber
   invocado el cliente de transcripción (AC-04). El `bodyLimit: 25 * 1024 * 1024` de la ruta (ver
   abajo) ya rechaza antes de llegar acá cualquier request cuyo `Content-Length` supere 25 MB —
   este `catch` cubre el caso residual de un body sin `Content-Length` fiable.
4. `const transcription = await transcribeAudio(buffer, data.filename, data.mimetype)` (Block 3).
   Si `transcription.outcome === "error"` → 502 `{ error: "transcription_failed" }`, sin invocar
   `createExpense` (AC-05). `buffer` no se referencia más allá de este punto.
5. Si `transcription.text.trim() === ""` → 422 `{ reason: "transcripcion_vacia" }`, sin invocar
   `createExpense` (FR-04/AC-03) — este chequeo vive acá, no dentro de `parseExpense` (que solo ve
   texto no-vacío en este flujo).
6. `const result = await createExpense({ prisma: request.server.prisma, logger: request.log },
   userId, transcription.text, "audio")` (Block 2's parámetro nuevo).
7. Mapeo de respuesta idéntico al de `handleCreateExpense` (201/422/500) — mismo shape de body,
   mismos códigos, reutilizando el `result.outcome` ya tipado por `expense-service.ts`.

**API contract**
- Method + path: `POST /expenses/audio`
- Request: `multipart/form-data`, un único campo de archivo (`file`), audio (cualquier
  `mimetype` — no se restringe por tipo MIME explícito, el proveedor de transcripción es quien
  determina si puede procesarlo).
- Response 201: mismo shape que `POST /expenses` (`amount`, `place`, `when`, `category`,
  `categoryOrigin`, `description`, `name`, `type`, `currency`).
- Error codes:
  - 400 `{ error: "validation_error" }` — sin archivo en el multipart.
  - 401 `{ error: "unauthorized" }` — sin sesión activa (AC-07).
  - 413 — archivo excede 25 MB (AC-04; sin body custom, respuesta nativa de Fastify/plugin).
  - 422 `{ reason: "transcripcion_vacia" }` — transcripción vacía o solo espacios (AC-03).
  - 422 `{ reason: RejectionReason }` — el texto transcripto es rechazado por `parseExpense` (mismos
    8 valores que ya devuelve `POST /expenses`, sin novedad).
  - 502 `{ error: "transcription_failed" }` — el servicio de transcripción falló o no respondió
    (AC-05).
  - 500 `{ error: "internal_error" }` — mismo criterio que `POST /expenses`.
- Auth: `authPreHandler`, igual que `POST /expenses` (NFR-03).

**Input validation**
- Presencia de archivo (paso 2).
- Tamaño ≤ 25 MB, en dos capas: `bodyLimit` por-ruta (`app.route({ ..., bodyLimit: 25 * 1024 *
  1024, ... })`) + `limits.fileSize` del plugin como respaldo (paso 3).
- Transcripción no vacía (paso 5).

**Error handling**
Cubierto punto por punto en "Logic" arriba. Ningún paso deja el audio (`buffer`) ni su transcripción
persistidos si la solicitud termina en error — ambos solo viven en memoria durante el handler
(FR-03/AC-02).

**Required tests**
- [ ] `apps/api/tests/routes/expenses.test.ts` — 201: audio válido (mock de `transcribeAudio`) con
  Monto y Lugar reconocibles crea el gasto con `channel: "audio"` (AC-01)
- [ ] ídem — 400: request sin archivo
- [ ] ídem — 401: sin sesión activa (AC-07)
- [ ] ídem — 413: archivo que excede 25 MB, `transcribeAudio` nunca se invoca (AC-04)
- [ ] ídem — 422 `transcripcion_vacia`: mock de `transcribeAudio` devuelve texto vacío/solo
  espacios, `createExpense` nunca se invoca (AC-03)
- [ ] ídem — 422 con `reason` de dominio: mock de `transcribeAudio` devuelve texto sin monto
  reconocible, mismo `reason` que devolvería `POST /expenses` con ese texto
- [ ] ídem — 502: mock de `transcribeAudio` devuelve `{ outcome: "error" }`, ningún gasto creado
  (AC-05)
- [ ] ídem — ningún byte del `buffer` original ni la transcripción quedan expuestos en la respuesta
  de error (AC-02)
- [ ] ídem — 500: mock de `createExpense` devolviendo `{ outcome: "internal_error" }` responde
  `{ error: "internal_error" }` sin loguear `rawInput` (spec loop 1, F-SPEC-16)

**Completion criterion**
`vitest run apps/api/tests/routes/expenses.test.ts` pasa; `pnpm --filter @ggasia/api typecheck`
pasa.

## Block 6 — Hook de grabación de audio (apps/web)

**Files**
- `apps/web/src/lib/hooks/use-audio-recorder.ts` (new) — wrapper sobre `MediaRecorder`, mismo
  directorio que `use-field-validation.ts`.

**Logic**
Expone `useAudioRecorder()` con estado `{ status: "idle" | "recording" | "error"; errorMessage:
string | null }` y funciones `start(): Promise<void>` / `stop(): Promise<Blob>`.

- `start()`: si `navigator.mediaDevices?.getUserMedia` no existe (API no disponible) o
  `getUserMedia({ audio: true })` rechaza (permiso denegado), pasa a `status: "error"` con un
  mensaje descriptivo, sin lanzar (AC-08 — el caller decide cómo notificarlo, este hook no importa
  `notify` directamente para mantenerse desacoplado de la UI). Si tiene éxito, crea un
  `MediaRecorder(stream)`, arranca a grabar (`recorder.start()`), acumula chunks vía
  `ondataavailable`, pasa a `status: "recording"`.
- `stop()`: llama a `recorder.stop()`, espera el evento `onstop`, ensambla los chunks en un único
  `Blob` (mismo `mimeType` que reportó el `MediaRecorder`), libera el stream
  (`stream.getTracks().forEach(t => t.stop())`) y vuelve a `status: "idle"`. Devuelve el `Blob`
  ensamblado.

**Error handling**
- Permiso de micrófono denegado o `getUserMedia`/`MediaRecorder` no disponibles → `status: "error"`
  + `errorMessage` (AC-08).
- `stop()` llamado sin una grabación en curso → no-op defensivo (no debería ocurrir dado cómo
  Block 7 lo invoca, pero no lanza).

**Required tests**
- [ ] `apps/web/src/lib/hooks/use-audio-recorder.test.ts` — `start()` exitoso pasa a
  `status: "recording"` (mock de `MediaRecorder`/`getUserMedia`)
- [ ] ídem — `getUserMedia` rechaza (permiso denegado) → `status: "error"` con mensaje
- [ ] ídem — `navigator.mediaDevices` ausente → `status: "error"` sin lanzar
- [ ] ídem — `stop()` devuelve un `Blob` con los chunks acumulados y libera el stream
  (`track.stop()` invocado)
- [ ] ídem — `stop()` invocado sin una grabación en curso (`status !== "recording"`) no lanza y no
  cambia `status` (spec loop 1, F-SPEC-16)

**Completion criterion**
`vitest run apps/web/src/lib/hooks/use-audio-recorder.test.ts` pasa; `pnpm --filter @ggasia/web
typecheck` pasa.

## Block 7 — Control de grabación y envío en el formulario de carga

**Files**
- `apps/web/src/components/expense-form.tsx` (modified) — agrega el control de grabación, el envío
  del audio y el manejo de sus respuestas.

**Logic**
- Agrega un `Button` de micrófono junto al `Textarea` existente, que llama a `useAudioRecorder()`
  (Block 6). Mientras `status === "recording"`, el botón queda en su variante "detener" y **nunca**
  se deshabilita por el estado `isSubmitting` (FR-07/AC-06 — son estados distintos: grabar vs.
  enviar).
- Al detener (`stop()` resuelve con un `Blob`), se invoca `submitAudioExpense(blob)`: pone
  `isSubmitting = true` (reutiliza el mismo flag que ya deshabilita el botón "Guardar" y muestra el
  `Loader2`, FR-08/AC-09 — mismo patrón visual que el envío de texto), arma un `FormData` con el
  blob bajo la clave `file`, y llama `apiRequest("/expenses/audio", { method: "POST", body:
  formData })` — **sin** pasar `headers: { "Content-Type": ... }` manual, para que el browser
  setee el boundary del multipart automáticamente (si se copiara el patrón de
  `submitExpense`/`Content-Type: application/json` literal, el multipart se rompe).
- Manejo de respuesta, en el mismo `submitAudioExpense`:
  - 201 → `setResult(data)` + `onCreated?.(data)`, igual que `submitExpense` (AC-10/FR-09 — reusa
    el `<section aria-label="Detalle del gasto guardado">` ya existente sin cambios).
  - 401 → `handleUnauthorized(response)`, igual que `submitExpense`.
  - 422 con `reason === "transcripcion_vacia"` → `notify("error", "No pudimos reconocer texto en
    el audio grabado. Probá de nuevo o escribí el gasto.")`.
  - 422 con cualquier otro `reason` → `resolveRejectionMessage(body.reason)` (reutilizado tal cual
    de `submitExpense`, ya que estos son los mismos 8 `RejectionReason` del dominio).
  - 502 (`transcription_failed`) → `notify("error", "No pudimos transcribir el audio. Probá de
    nuevo o escribí el gasto.")`.
  - 400/413/500 y fallo de red → `notify("error", GENERIC_ERROR_MESSAGE)`, mismo criterio que
    `submitExpense`.
  - `finally`: `isSubmitting = false`.
- Si `useAudioRecorder()` reporta `status === "error"` (permiso denegado o API no disponible) →
  `notify("error", errorMessage)`; el `Textarea` de texto sigue montado y operable sin ningún
  cambio (AC-08 — no requiere lógica nueva, solo no remover el campo).

**Error handling**
Cubierto punto por punto arriba. Ningún nuevo estado de error dejar el formulario en un estado
donde ambos controles (grabar y "Guardar" de texto) queden deshabilitados simultáneamente sin una
operación en curso.

**Required tests**
- [ ] `apps/web/src/components/expense-form.test.tsx` — flujo feliz: grabar → detener → 201 mockeado
  → `result` se renderiza igual que en el flujo de texto (AC-01/AC-10)
- [ ] ídem — mientras graba, el botón de detener permanece habilitado (AC-06)
- [ ] ídem — durante el envío (post-stop, pre-respuesta), el indicador de progreso se muestra y el
  control de envío queda deshabilitado (AC-09)
- [ ] ídem — permiso de micrófono denegado (mock de `useAudioRecorder` en `status: "error"`) →
  `notify("error", ...)` invocado y el `Textarea` de texto sigue presente y habilitado (AC-08)
- [ ] ídem — 422 `transcripcion_vacia` → mensaje específico vía `notify` (AC-03)
- [ ] ídem — 502 → mensaje específico vía `notify` (AC-05)
- [ ] ídem — el `FormData` enviado a `apiRequest` no incluye un header `Content-Type` manual
- [ ] ídem — 401 en la respuesta de `/expenses/audio` dispara `handleUnauthorized` (mismo
  comportamiento que `submitExpense`) (spec loop 1, F-SPEC-16)
- [ ] ídem — 422 con un `reason` de dominio (ej. `amount_zero`) muestra el mensaje de
  `resolveRejectionMessage`, igual que el flujo de texto (spec loop 1, F-SPEC-16)
- [ ] ídem — 400/413/500 y fallo de red muestran `notify("error", GENERIC_ERROR_MESSAGE)` (spec
  loop 1, F-SPEC-16)

**Completion criterion**
`vitest run apps/web/src/components/expense-form.test.tsx` pasa; `pnpm --filter @ggasia/web
typecheck` pasa.

## Final verification

Con los 7 bloques completos: `pnpm test` (typecheck + vitest en todo el monorepo) pasa en verde;
`POST /expenses/audio` con un audio real (probado manualmente contra Groq, no solo mockeado) crea
un gasto con `channel: "audio"` visible en el listado existente; el canal de texto (`POST
/expenses`, el flujo de `Textarea`) no cambia su comportamiento en ningún test preexistente; ningún
archivo de audio ni su transcripción quedan en disco ni en la base de datos más allá del campo
`rawInput` (que ya almacena texto libre para el canal de texto, y ahora también el texto
transcripto para el canal de audio — nunca los bytes del audio en sí).
