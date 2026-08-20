# Threat Model FEAT-002: Alta de gasto vía API — auth stub + persistencia

| Field | Value |
|-------|-------|
| Ticket | FEAT-002 |
| Component | `apps/api` — ruta `POST /expenses`, auth stub, `expense-service`, repositorios Prisma, `schema.prisma` (User/Category/Expense), barrel de `@ggasia/categorization` |
| Date | 2026-08-19 |

## Attack surfaces identified

1. **Body de `POST /expenses`** (input crudo de texto libre, hasta 500 caracteres tras Zod) — única
   entrada de red no confiable de este ticket. Alimenta `parseExpense` de `@ggasia/domain`.
2. **Header `x-user-id`** — mecanismo de identificación transitorio (FR-02), trivialmente
   falsificable: no hay sesión, cookie ni token, solo un valor que el cliente elige.
3. **Conexión a PostgreSQL** (`DATABASE_URL`/`DIRECT_URL`, pooler de Supabase) — primer acceso a base
   de datos del proyecto.
4. **Barrel de `@ggasia/categorization`** — ampliación de superficie pública (`resolveCategoryName`,
   `VisibleCategory`, `CategoryNameResolution`), consumida ahora desde `apps/api`, fuera del paquete
   por primera vez.
5. **`prisma/seed.ts`** — corre en el arranque/setup, escribe categorías predefinidas y el usuario de
   prueba.

No hay superficie de audio, de terceros con red saliente, ni de frontend: este ticket es
exclusivamente backend (Out of Scope del PRD).

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 | Cliente HTTP (body de `POST /expenses`) | Fastify — validado por Zod (FR-10) antes de tocar `parseExpense`; `parseExpense` ya trata su input como no confiable (threat-FEAT-001b.md, B1) |
| B2 (cierra el boundary dejado abierto en threat-FEAT-001b.md) | — | `referenceDate` pasa a estar construido en `apps/api` a partir del reloj del propio servidor (`new Date()` en `APP_TIMEZONE`), **nunca desde un campo del body**. Este ticket es la "capa API" que threat-FEAT-001b.md dejó pendiente: el boundary queda cerrado porque `referenceDate` deja de ser un parámetro externo para pasar a ser confiable por construcción |
| B3 | Header `x-user-id` | El auth stub — lo trata como una afirmación de identidad NO verificada; ver riesgo CRITICAL abajo |
| B4 | `apps/api` (Fastify/Node) | PostgreSQL — todo acceso pasa por Prisma parametrizado, nunca SQL crudo con interpolación de usuario (la única migración con SQL editado a mano es estática, sin input de usuario) |
| B5 | `apps/api` | `@ggasia/domain`/`@ggasia/categorization` compilados — mismo nivel de confianza que el propio código de `apps/api` (paquetes internos, sin red, sin I/O) |

## STRIDE por componente

**Ruta `POST /expenses` + `expense-service`**

| Categoría | Evaluación |
|---|---|
| Spoofing | Cubierto por el auth stub (ver componente separado abajo) |
| Tampering | El body se valida con Zod (tipo, no vacío) antes de `parseExpense`; `parseExpense` ya rechaza ambigüedad en vez de adivinar (heredado de FEAT-001b) |
| Repudiation | El gasto persiste `rawInput` y `channel` de forma inmutable (FR-07/RF-43) — da trazabilidad de qué generó cada registro, atribuida al `x-user-id` de la request (con la limitación de spoofing ya declarada) |
| Information Disclosure | El 422 devuelve solo el código de `RejectionReason` (nunca el input crudo, heredado del contrato de `parseExpense`); el 500 por error no manejado de Prisma **no debe** propagar el mensaje/stack de Prisma al cliente — ver riesgo MEDIUM abajo |
| Denial of Service | Body grande antes de que Zod/`parseExpense` puedan rechazar por longitud — ver riesgo MEDIUM abajo. Creación no acotada de categorías por marcador — ver riesgo LOW abajo |
| Elevation of Privilege | N/A — no hay niveles de privilegio en este diseño, solo identidad (spoofeable) |

**Auth stub (`preHandler` + `user-repository`)**

| Categoría | Evaluación |
|---|---|
| Spoofing | **CRÍTICO** — cualquier cliente que conozca o adivine un `id` de usuario válido opera como ese usuario. Sin sesión, sin verificación de posesión de credenciales |
| Tampering | N/A |
| Repudiation | Cualquier acción queda atribuida a un `x-user-id` que no está criptográficamente ligado al cliente real — repudio trivial, subsumido en el riesgo de Spoofing |
| Information Disclosure | El 401 debe responder igual (mismo status, mismo cuerpo genérico) tanto si el header falta como si el `id` no existe en `User` — para no confirmar/negar existencia de un id específico, mismo principio que AGENTS.md ya exige para el login real |
| Denial of Service | Lookup por PK indexada (`findById`) — costo bajo incluso ante barrido de ids al azar |
| Elevation of Privilege | N/A |

**Barrel de `@ggasia/categorization` (bloque 5)**

| Categoría | Evaluación |
|---|---|
| Tampering / Information Disclosure | N/A — `resolveCategoryName` es una función pura ya auditada en FEAT-001a; exponerla no cambia su comportamiento ni introduce I/O. El único riesgo es de superficie/mantenibilidad (ADR-004), no de seguridad |

**Persistencia (Prisma + PostgreSQL)**

| Categoría | Evaluación |
|---|---|
| Tampering | Prisma parametriza todas las queries generadas; la única sentencia SQL manual (índice único parcial de la migración) es estática, sin interpolación de datos de request |
| Information Disclosure | Un error de Prisma no manejado (ej. violación de constraint) puede incluir el nombre de columnas/tabla en su mensaje — no debe llegar tal cual al cliente |
| Denial of Service | Creación de categorías vía marcador (RF-14) no tiene límite de cantidad por usuario; acotado parcialmente por el tope de 60 caracteres del nombre (RNF-07) pero no en cantidad |

## Riesgos clasificados

| Riesgo | STRIDE | Likelihood | Impact | Mitigación propuesta |
|---|---|---|---|---|
| El header `x-user-id` permite a cualquier cliente operar como cualquier usuario, sin prueba de posesión de credenciales | S | High | Critical | **Riesgo aceptado** — ver sección siguiente, no hay mitigación técnica posible dentro del alcance de este ticket (el PRD lo declara explícitamente fuera de alcance reemplazarlo por sesión real) |
| Un body de `POST /expenses` con un string muy grande (varios MB) se buferiza en memoria antes de que Zod o `parseExpense` puedan rechazarlo por longitud (500 caracteres, RNF-07) | D | Medium | Medium | Fijar `bodyLimit` explícito en la instancia Fastify (Bloque 1, `app.ts`) — un valor bajo, holgado sobre el tope real de 500 caracteres (p. ej. 16 KB), en vez de confiar en el default de Fastify (1 MB) o en el rechazo tardío de `parseExpense` |
| Un error no controlado de Prisma (ej. violación de constraint único) se propaga al cliente con el mensaje/stack original de Prisma, revelando nombres de tabla/columna | I | Medium | Medium | Bloque 9/10: handler de errores centralizado que mapea errores de Prisma (`PrismaClientKnownRequestError`, etc.) a una respuesta genérica (400/500 sin detalle interno); nunca reenviar `error.message` de Prisma tal cual |
| Creación de categorías por marcador sin límite de cantidad por usuario permite acumular filas indefinidamente con requests repetidas | D | Low | Low | **Riesgo aceptado** — no hay requisito de rate-limiting en ningún RF/RNF del PRD-001 ni de este ticket; el tope de 60 caracteres por nombre (RNF-07) acota el costo por fila. Si se vuelve un problema real, corresponde a un ticket de rate-limiting, no a este |
| El 401 del auth stub podría responder distinto (mensaje o código) según si el header falta vs. si el id no existe, confirmando qué ids son válidos | I | Low | Low | Bloque 6: un único cuerpo de respuesta 401 genérico para ambos casos ("no autorizado"), sin distinguir el motivo en el mensaje |

## Riesgo aceptado — `x-user-id` como mecanismo de identificación (F-TM-04)

Este es el riesgo CRÍTICO del ticket. Ya está declarado en `docs/daw/prd/prd-FEAT-002.md` ("Riesgos y
Dependencias") y aprobado al validar el PRD, pero el catálogo de reglas (F-TM-04) exige que quede
registrado acá con los tres campos completos:

| Campo | Valor |
|---|---|
| Quién lo acepta | Nahuel Maiká (product owner / dueño del repo) |
| Justificación | El ticket de autenticación real (RF-08/RF-12/RF-13/RNF-06 del PRD-001) todavía no existe. Bloquear FEAT-002 hasta que exista invertiría el orden de entrega sin necesidad: el motor de extracción/categorización (FEAT-001a/b) ya está listo y probado, y este ticket es la única forma de verificarlo end-to-end contra una base de datos real. El header es un mecanismo transitorio, explícitamente documentado como tal en el PRD, y ningún cliente de producción debe apoyarse en él |
| Condiciones de revisión | Se revisa obligatoriamente cuando arranque el ticket de autenticación real — ese ticket REEMPLAZA el header por sesión (cookie + `SESSION_COOKIE_NAME`/`SESSION_IDLE_TTL_HOURS` ya declarados en `.env`), no lo complementa. Hasta entonces, `apps/api` no debe desplegarse en un entorno accesible públicamente sin dejar esto por escrito en el README/runbook de deploy |

**Confirmado por el usuario el 2026-08-19** ("Acepto el riesgo"), en los términos exactos de la tabla
de arriba — los tres campos de F-TM-04 quedan satisfechos.

## Datos sensibles (F-TM-05, F-TM-07)

- **Email de usuario** (`User.email`, `citext`): PII. En reposo: cifrado provisto por el motor
  gestionado de PostgreSQL (Supabase). En tránsito: la cadena de conexión debe forzar TLS
  (`sslmode=require` o equivalente en el connection string del pooler) — a verificar explícitamente
  en Bloque 1 (`env.ts`) que la URL de Supabase ya lo exige por defecto y no se está deshabilitando.
- **Input crudo del gasto** (`rawInput`): texto libre, potencialmente con PII incidental (nombres de
  lugares, personas). Clasificado como sensibilidad baja-media, no estructurado. No requiere cifrado
  adicional a nivel de aplicación (F-TM-07 aplica a PII/credenciales estructuradas); sí requiere
  nunca aparecer en logs ni en mensajes de error (heredado del contrato de `RejectionReason`).
- **Monto**: dato financiero, no PII, no credenciales. Sin requisito de cifrado adicional.
- **Sin credenciales en este ticket**: no hay contraseñas en el schema (`User` no tiene campo
  `password`) — el hash argon2 de `AGENTS.md` aplica recién al ticket de autenticación real.

## Mitigaciones a plegar en el spec

1. Bloque 1 (`app.ts`): fijar `bodyLimit` explícito y bajo (~16 KB) en la instancia Fastify.
2. Bloque 1 (`env.ts`): validar/documentar que la cadena de conexión a PostgreSQL fuerza TLS.
3. Bloque 6 (auth stub): un único cuerpo 401 genérico, sin distinguir "header ausente" de "usuario
   inexistente" en el mensaje.
4. Bloque 9/10 (service/ruta): handler de errores centralizado que nunca reenvía `error.message` de
   Prisma al cliente.
5. Bloque 1 (tipos/documentación): `expense-service` construye `referenceDate` con `new Date()` en
   `APP_TIMEZONE`, nunca desde el body — cierra el boundary B2 dejado abierto por
   threat-FEAT-001b.md.
6. Documentar en el spec, como nota explícita (no oculta), el riesgo aceptado de `x-user-id` con sus
   tres campos F-TM-04 (arriba), referenciando este documento.

---

┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling — PASSED                            │
├─────────────────────────────────────────────────────────┤
│  Attack surfaces identified: 5                             │
│  Trust boundaries declared: 5                               │
│                                                              │
│  Risks:                                                     │
│    🔴 CRITICAL: x-user-id spoofeable — Mitigación: riesgo    │
│       aceptado (F-TM-04), CONFIRMADO por el usuario          │
│       2026-08-19                                              │
│    🟡 MEDIUM: body grande sin bodyLimit — Mitigación: fijar  │
│       bodyLimit explícito en Bloque 1                        │
│    🟡 MEDIUM: error de Prisma sin manejar filtra detalle     │
│       interno — Mitigación: handler de errores centralizado  │
│    🟢 LOW: creación no acotada de categorías por marcador —  │
│       riesgo aceptado, sin requisito de rate-limiting         │
│    🟢 LOW: 401 podría distinguir motivo — Mitigación: cuerpo  │
│       genérico único                                          │
│                                                              │
│  Mitigaciones a plegar en el spec: 6 (ver arriba)            │
│  ─────────────────────────────────────────────────────      │
│  Risks: C:1 H:0 M:2 L:2                                     │
│  Report: docs/daw/security/threat-FEAT-002.md                │
└─────────────────────────────────────────────────────────┘
