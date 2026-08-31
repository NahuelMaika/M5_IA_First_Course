# ADR-005: Proveedor de transcripción de audio y estrategia de bodyLimit

| Field | Value |
|-------|-------|
| Date | 2026-08-28 |
| Ticket | FEAT-006 |
| Status | Accepted |

## Context

PRD FEAT-006 (FR-01) requiere transcribir un audio a texto mediante un servicio externo, pero
delega la elección concreta del proveedor a PLAN. Además, `apps/api/src/app.ts` fija hoy
`bodyLimit: 16384` (16 KB) a nivel de toda la instancia Fastify — una mitigación de DoS explícita
del threat model de FEAT-002 para el canal de texto — que bloquea cualquier archivo de audio
(FR-05 exige aceptar hasta 25 MB).

## Options considered

### Proveedor de transcripción

#### Opción 1: Groq (whisper-large-v3-turbo, endpoint OpenAI-compatible)
- **Pros:** ya configurado en `.env` raíz (`TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY`,
  `TRANSCRIPTION_MODEL`), sin gestión de credenciales nueva. Endpoint compatible con el formato
  `POST /audio/transcriptions` de OpenAI, así que el cliente HTTP no depende de un SDK propietario.
  Latencia baja (turbo), relevante para NFR-01 (p95 < 8s).
- **Cons:** dependencia de un proveedor externo sin fallback automático si Groq cae (mitigado por
  NFR-02: el canal de texto sigue funcionando igual).

#### Opción 2: OpenAI Whisper API directamente
- **Pros:** mismo formato de API, proveedor con mayor SLA histórico.
- **Cons:** requiere credenciales nuevas no configuradas hoy; sin ninguna ventaja funcional sobre
  la Opción 1 dado que ambas exponen la misma interfaz.

**Decisión:** Opción 1 (Groq). Ya está configurado end-to-end en el entorno del proyecto y el
contrato HTTP es el mismo que el de OpenAI, así que cambiar de proveedor en el futuro no requiere
tocar el cliente, solo la env var `TRANSCRIPTION_BASE_URL`.

### Estrategia de bodyLimit para el endpoint de audio

#### Opción 1: Subir el `bodyLimit` global de la instancia Fastify a 25 MB+
- **Pros:** un solo lugar de configuración.
- **Cons:** relaja para *todas* las rutas (incluido `POST /expenses` de texto) la mitigación de
  DoS documentada en el threat model de FEAT-002, sin necesidad real — el canal de texto nunca
  necesita más de unos KB.

#### Opción 2: `bodyLimit` por-ruta (soportado nativamente por Fastify)
- **Pros:** el límite de 16 KB del canal de texto queda intacto; el endpoint nuevo de audio declara
  su propio `bodyLimit: 25 * 1024 * 1024` en su definición de ruta, sin tocar `app.ts`.
- **Cons:** ninguno relevante — es la forma soportada por el framework para este caso exacto.

**Decisión:** Opción 2. No hay motivo para relajar una mitigación ya validada en FEAT-002 cuando
Fastify resuelve esto de forma nativa por ruta.

## Consequences

- Nueva dependencia: `@fastify/multipart` (parseo del `multipart/form-data` con el archivo de
  audio) — no existía ninguna en el proyecto. Su propio límite `limits.fileSize` (25 MB, distinto
  del `bodyLimit` de Fastify: `fileSize` acota el archivo dentro del multipart ya parseado,
  `bodyLimit` corta por `Content-Length` antes de parsear nada) se registra junto al plugin, como
  respaldo del `bodyLimit` de 25 MB de la ruta para el caso de un cuerpo chunked sin
  `Content-Length` fiable.
- `apps/api/src/env.ts`: agrega `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY`,
  `TRANSCRIPTION_MODEL` al schema Zod (abort-on-invalid, mismo patrón que las env vars actuales).
- Nuevo archivo `apps/api/src/services/transcription-client.ts`: primer cliente HTTP externo del
  proyecto — sin sibling que calcar, usa `fetch` nativo de Node 22 contra
  `${TRANSCRIPTION_BASE_URL}/audio/transcriptions`.
- `apps/api/src/app.ts` no cambia su `bodyLimit` global; el límite de 25 MB se declara solo en la
  definición de la nueva ruta de audio.
- Si Groq se reemplaza en el futuro por otro proveedor OpenAI-compatible, el cambio se limita a la
  env var `TRANSCRIPTION_BASE_URL` (y `TRANSCRIPTION_MODEL` si aplica) — el cliente no cambia.
