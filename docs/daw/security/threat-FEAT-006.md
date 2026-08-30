# Threat Model FEAT-006: Alta de gasto por audio (transcripción + extracción)

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| Spec | docs/daw/specs/spec-FEAT-006.md |
| Date | 2026-08-28 |

## Componentes nuevos / modificados

1. `POST /expenses/audio` (apps/api) — nuevo endpoint, multipart, mismo `authPreHandler` que
   `POST /expenses`.
2. `transcription-client.ts` (apps/api) — primer cliente HTTP saliente del proyecto hacia un
   servicio de terceros (Groq).
3. `@fastify/multipart` — primer parser de `multipart/form-data` registrado en el proyecto.
4. `use-audio-recorder.ts` + control de grabación en `expense-form.tsx` (apps/web) — primer uso de
   `MediaRecorder`/`getUserMedia`.
5. `ExpenseChannel` enum (Prisma) — agrega `audio`, sin cambio de superficie de ataque por sí
   mismo.

## Trust boundaries

| Boundary | Ya existía | Nuevo en este ticket |
|---|---|---|
| Browser (apps/web) → apps/api | Sí (cookie de sesión, CORS) | Reutilizado tal cual por la nueva ruta |
| apps/api → PostgreSQL | Sí | Sin cambios (solo un valor de enum nuevo) |
| **apps/api → Groq (servicio externo de transcripción)** | **No** | **Sí — boundary nueva** |
| Navegador → micrófono del dispositivo | No | Sí — mediada por el permiso del navegador (fuera de nuestro control, estándar) |

## Análisis STRIDE

### `POST /expenses/audio`

| Categoría | Análisis |
|---|---|
| Spoofing | Mitigado: mismo `authPreHandler`/cookie de sesión que `POST /expenses` (F-TM sin cambios). |
| Tampering | El archivo de audio en tránsito browser→api viaja bajo el mismo HTTPS que ya protege toda la sesión (fuera de este ticket, ya cubierto por `threat-FEAT-004a.md`). |
| Repudiation | Igual que el canal de texto: el `Expense` persistido queda asociado a `userId` + `channel: "audio"`, sin logging adicional necesario. |
| Information Disclosure | El `buffer` del audio y el texto transcripto nunca se loguean (solo `response.status` en errores del cliente de transcripción, spec Block 3) — mitiga F-SAST-10 antes de llegar a CODE. |
| Denial of Service | Mitigado en dos capas: `bodyLimit` de 25 MB por-ruta + `limits.fileSize` del plugin (ADR-005), y timeout de 6s en el cliente de transcripción (spec Block 3) evita requests colgadas indefinidamente. Sin rate-limiting dedicado — igual que el resto de la API hoy (`POST /expenses` tampoco lo tiene): riesgo heredado, no introducido por este ticket. |
| Elevation of Privilege | N/A — el endpoint solo crea un recurso scope-ado al `userId` del request, mismo modelo de autorización que `POST /expenses`. |

### `transcription-client.ts` (apps/api → Groq)

| Categoría | Análisis |
|---|---|
| Spoofing | `TRANSCRIPTION_BASE_URL` es una env var, nunca input del usuario — no hay superficie de spoofing del lado de la app. |
| Tampering | **Riesgo R1** (ver abajo): sin forzar `https://`, el audio y la API key podrían viajar en texto plano ante un mal-config. |
| Repudiation | N/A — logs del lado de Groq, fuera de nuestro control. |
| Information Disclosure | **Riesgo R2** (ver abajo): el audio (voz del usuario, potencialmente PII) se envía a un procesador externo. |
| Denial of Service | Mitigado por el timeout de 6s (spec Block 3) — un Groq lento no cuelga el request indefinidamente. |
| Elevation of Privilege | N/A. |

### `@fastify/multipart` (parseo de archivo)

| Categoría | Análisis |
|---|---|
| Tampering / Unrestricted upload (CWE-434) | Mitigado estructuralmente: el archivo **nunca se escribe a disco ni se sirve de vuelta** — se procesa en memoria y se descarta apenas se obtiene la transcripción (FR-03). La clase de ataque clásica de "unrestricted upload" (subir un webshell servido después) no aplica porque no hay `disco → servir` en ningún punto del flujo. |
| Information Disclosure | Sin filtrado de MIME type (documentado en spec Block 5) — aceptado: el archivo nunca se ejecuta ni se interpreta localmente, solo se reenvía como bytes opacos a Groq, que es quien decide si puede procesarlo. |

### `use-audio-recorder.ts` / control de grabación (browser)

| Categoría | Análisis |
|---|---|
| Information Disclosure | El acceso al micrófono requiere el permiso explícito del navegador (modelo de seguridad estándar, fuera de nuestro control) — AC-08 ya cubre el caso de denegación. |
| Resto de categorías | N/A — sin superficie de ataque nueva del lado del servidor; el control solo arma un `Blob` y lo envía por el boundary ya analizado arriba. |

## Clasificación de datos sensibles (F-TM-05 / F-TM-07)

| Dato | Clasificación | En tránsito | En reposo |
|---|---|---|---|
| Audio grabado (voz del usuario) | PII (biométrico-adyacente) + potencialmente financiero (montos hablados) | HTTPS browser→api (heredado) y api→Groq (**mitigado por R1**, ver abajo) | **Nunca persistido** (FR-03) — vive solo en memoria durante el request |
| Texto transcripto | Igual clasificación que `rawInput` del canal de texto (ya cubierta por `threat-FEAT-002.md`) | HTTPS, mismo boundary que el canal de texto | Persistido en `Expense.rawInput`, mismo campo y política que hoy |
| `TRANSCRIPTION_API_KEY` | Credencial | HTTPS (**mitigado por R1**) | Solo en env var del proceso, nunca en código ni en logs (mismo patrón que las credenciales de DB) |

## Riesgos identificados

| ID | Riesgo | STRIDE | Likelihood | Impact | Mitigación |
|---|---|---|---|---|---|
| R1 | `TRANSCRIPTION_BASE_URL` sin forzar `https://` — un mal-config podría enviar audio (PII) y la API key en texto plano | Tampering / Information Disclosure | Low | High | **Mitigado**: `env.ts` ahora exige `z.url({ protocol: /^https$/ })` (spec Block 1, loop 1) |
| R2 | El audio del usuario (voz + montos hablados) se envía a Groq, un procesador de terceros | Information Disclosure | High (es el flujo normal de la feature, no un ataque) | Medium | **Riesgo aceptado** — ver abajo |
| R3 | Sin rate-limiting en `/expenses/audio` | Denial of Service | Low | Low | **Riesgo aceptado** — heredado de toda la API (`POST /expenses` tampoco lo tiene), no introducido por este ticket |
| R4 | Sin filtrado de MIME type en el archivo subido | Information Disclosure (menor) | Low | Low | **Riesgo aceptado** — el archivo nunca se ejecuta/almacena/sirve, solo se reenvía como bytes opacos |

### R2 — riesgo aceptado (F-TM-04)

| Campo | Valor |
|---|---|
| Quién lo acepta | El usuario, en esta sesión (confirmación pendiente abajo) — ya implícito en PRD-001 ("Riesgos y Dependencias", que establece que la transcripción de audio es la única dependencia de IA del producto) y en `prd-FEAT-006.md`'s Dependencies ("Servicio externo de transcripción de audio ... a elegir en PLAN") |
| Justificación | Es la premisa misma de la feature: sin enviar el audio a un servicio externo de transcripción no hay canal de audio. NFR-02 exige que el canal de texto siga funcionando si este servicio cae, acotando el radio del riesgo. |
| Condiciones de revisión | Si en el futuro se evalúa un proveedor de transcripción on-premise/self-hosted, o si Groq cambia sus términos de retención de datos de audio, este riesgo debe re-evaluarse. |

### R3/R4 — riesgos aceptados sin condición de revisión formal (impacto Low, consistentes con el resto de la API existente)

## Mitigaciones plegadas en el spec

1. `env.ts` (Block 1): `TRANSCRIPTION_BASE_URL` exige `https://` — cierra R1.
2. `transcription-client.ts` (Block 3): nunca loguea el `buffer` ni la transcripción, solo
   `response.status` en error.
3. El endpoint (Block 5) nunca persiste el `buffer` de audio a disco ni a DB, en ningún camino
   (feliz o de error) — cierra la clase de riesgo de "unrestricted upload" clásica.

## Resumen

- Superficies de ataque identificadas: 4 (endpoint, cliente de transcripción, multipart, control
  de grabación)
- Trust boundaries declaradas: 4 (1 nueva: apps/api → Groq)
- Riesgos: C:0 H:0 (R1 ya mitigado) M:1 (R2, aceptado) L:2 (R3/R4, aceptados)

## Loop 2 (spec loops=2) — corrección de dos defectos de implementación

**Fecha**: 2026-08-30. **Componente modificado**: `expense-form.tsx` (apps/web), función
`submitAudioExpense` y su JSX — mismo componente ya analizado arriba en "`use-audio-recorder.ts` /
control de grabación (browser)", sin componentes nuevos.

**Cambio 1 — filename real en el `FormData`**: hasta ahora `formData.append("file", blob)` viajaba
sin nombre (el navegador ponía `"blob"`, sin extensión); este loop agrega un filename derivado de
`blob.type` (ej. `recording.webm`). El filename **ya era controlado por el cliente antes de este
fix** — el trust boundary browser→apps/api no cambia, y `transcription-client.ts` (apps/api) ya
trataba ese valor como metadata opaca reenviada a Groq, nunca para construir un path de filesystem
(F-SAST-05, `sast-FEAT-006.md`, sin cambios). Que el valor pase de ser siempre `"blob"` a ser
`recording.<subtype>` no habilita ninguna clase de ataque nueva: sigue siendo una string acotada
(la subtype del `mimeType` que reporta `MediaRecorder`, ej. `webm`/`ogg`/`mp4`), no input de texto
libre del usuario.

**Cambio 2 — wrapper `<div>` de layout**: sin superficie de ataque — cambio puramente visual, sin
tocar ningún dato, request ni trust boundary.

| Categoría STRIDE | Análisis |
|---|---|
| Spoofing | Sin cambios — mismo `authPreHandler`. |
| Tampering | Sin cambios — el filename siempre fue tamperable por el cliente (ya lo era antes de este fix); no se usa para autorización ni para construir paths. |
| Repudiation | Sin cambios. |
| Information Disclosure | Sin cambios — el filename derivado no expone más información que antes (es la subtype del mimeType, no contenido del audio). |
| Denial of Service | Sin cambios. |
| Elevation of Privilege | N/A. |

**Resultado**: ninguna superficie de ataque nueva, ningún trust boundary nuevo, ningún dato sensible
nuevo. Riesgos de este loop: C:0 H:0 M:0 L:0.
