# Threat Model FEAT-003b: UI de carga y listado de gastos

| Field | Value |
|-------|-------|
| Ticket | FEAT-003b |
| Component | `apps/web` (Next.js, primer código de frontend del proyecto) — formulario de carga, listado, cliente API, módulo de notificaciones. `apps/api` — CORS nuevo (Block 2 de la spec) |
| Date | 2026-08-21 |

## Attack surfaces identified

1. **Campo de texto libre del formulario** (`expense-form.tsx`) — input de usuario, hasta 500
   caracteres, viaja a `POST /expenses`. Primera superficie donde texto de usuario se renderiza de
   vuelta en el DOM (Lugar, Nombre, Descripción, categoría, en el resultado interpretado y en cada
   fila del listado).
2. **`NEXT_PUBLIC_STUB_USER_ID` / `NEXT_PUBLIC_API_URL`** — variables con prefijo `NEXT_PUBLIC_`,
   quedan embebidas en el bundle de JavaScript servido al navegador: cualquiera que abra devtools
   puede leerlas. Esto hace explícito y visible, por primera vez a través de una UI real, lo que ya
   era cierto en FEAT-002/FEAT-003a: `x-user-id` es un valor que el cliente controla, no una prueba
   de identidad.
3. **CORS nuevo en `apps/api`** (`WEB_ORIGIN`) — primera vez que la API acepta requests
   cross-origin; un origen mal configurado (wildcard, o el origen equivocado) amplía la superficie
   de quién puede llamarla desde un navegador.
4. **Mapeo de `reason` de rechazo a mensaje** (`rejection-messages.ts`) — 8 valores conocidos del
   servidor; un valor no reconocido (ej. uno nuevo agregado en un ticket futuro sin actualizar este
   mapeo) es una entrada no contemplada.
5. **Dependencias nuevas** (Next.js, React, Tailwind CSS, shadcn/ui, Base UI, Testing Library) —
   primera vez que el proyecto instala un ecosistema de frontend completo; superficie de supply
   chain nueva.

No hay superficie de archivos, de audio, ni de escritura directa a base de datos desde este ticket
— todo el acceso a datos pasa por los endpoints ya existentes y auditados de `apps/api`.

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 | Texto que la persona escribe en el formulario | React escapa por default todo lo que se renderiza vía JSX (`{value}`); este ticket no usa `dangerouslySetInnerHTML` en ningún punto — confirmado por diseño de los componentes de la spec |
| B2 | El bundle de JavaScript servido al navegador (contiene `NEXT_PUBLIC_STUB_USER_ID`) | El servidor de `apps/api`, que sigue siendo quien decide si ese id corresponde a un usuario real (`authPreHandler`, sin cambios) — el navegador nunca es una fuente de confianza para la identidad, hoy ni después de este ticket |
| B3 | Origen HTTP del request (header `Origin`) | `WEB_ORIGIN` validado por Zod al arranque de `apps/api` (Block 2) — un origen no autorizado no recibe los headers CORS que le permitirían leer la respuesta desde JavaScript |
| B4 | El valor `reason` que devuelve `POST /expenses` en un 422 | `rejection-messages.ts` — un mapeo cerrado de 8 claves conocidas, nunca reenvía el string crudo del servidor como texto de UI |
| B5 | Body de error 400/401/500 de la API | El manejo de errores del Block 7 nunca parsea ni muestra `details`/mensajes internos — solo notificaciones genéricas predefinidas por el cliente |

## STRIDE por componente

**Formulario + resultado interpretado + filas del listado**

| Categoría | Evaluación |
|---|---|
| Spoofing | N/A a nivel de este componente — cubierto por el cliente API (ver abajo) |
| Tampering | La validación cliente (vacío, 500 caracteres) es solo UX; el servidor revalida todo (RNF-07 ya lo exige y FEAT-002 ya lo aplica) — un cliente que la elude no logra nada que la API no rechace igual |
| Repudiation | N/A — no hay acción que negar distinta de lo que ya cubre `rawInput` persistido en FEAT-002 |
| Information Disclosure | Texto propio de la persona, mostrado solo a ella misma en su propia sesión de navegador — sin persistencia local (no `localStorage`/`sessionStorage`), sin envío a terceros |
| Denial of Service | Sin límite de reintentos de envío desde el cliente más allá de deshabilitar el botón mientras la request está en curso — una persona podría reintentar manualmente sin límite. Mismo criterio ya aceptado en `threat-FEAT-002.md` (sin rate-limiting en el PRD) |
| Elevation of Privilege | N/A — sin roles |

**Cliente API (`apiClient`, stub `x-user-id`)**

| Categoría | Evaluación |
|---|---|
| Spoofing | **El riesgo central de este ticket.** Ver sección de riesgo aceptado abajo — ahora el valor vive en un bundle público, no solo en la configuración de un test de backend |
| Tampering | N/A — el cliente no modifica la request más allá de adjuntar el header configurado |
| Repudiation | N/A — heredado sin cambios de FEAT-002 |
| Information Disclosure | `NEXT_PUBLIC_STUB_USER_ID` es legible por cualquiera que inspeccione el bundle — aceptado, ver abajo |
| Denial of Service | N/A |
| Elevation of Privilege | N/A — sin roles; el stub no distingue privilegios, solo identidad |

**CORS (Block 2, `apps/api`)**

| Categoría | Evaluación |
|---|---|
| Spoofing | N/A |
| Tampering | N/A |
| Repudiation | N/A |
| Information Disclosure | Un `WEB_ORIGIN` mal configurado (wildcard `*`, o un origen de terceros por error) permitiría que cualquier sitio web lea las respuestas de la API desde JavaScript si además tuviera el `x-user-id` correcto — agrava el riesgo ya aceptado del stub, no lo crea. Mitigado por validación estricta de `WEB_ORIGIN` (Zod, sin wildcard posible por diseño del schema) |
| Denial of Service | N/A — CORS no introduce una superficie de agotamiento de recursos nueva |
| Elevation of Privilege | N/A |

**`rejection-messages.ts`**

| Categoría | Evaluación |
|---|---|
| Information Disclosure | Un `reason` no reconocido, si se reenviara crudo como texto de UI, expondría un código interno del dominio (`packages/domain`) al usuario final sin traducir — bajo impacto (no es secreto), pero rompe la convención de "texto de usuario en español" de `AGENTS.md`. Mitigado: fallback genérico, nunca el string crudo (ver Mitigación 3) |
| Denial of Service | N/A |

**Dependencias nuevas del ecosistema frontend**

| Categoría | Evaluación |
|---|---|
| Tampering (supply chain) | Primera instalación de un ecosistema de frontend completo — superficie nueva de paquetes con posibles CVEs. Mitigado por `pnpm audit` como parte del SAST de CODE, mismo mecanismo que ya usa `apps/api` (cerró un HIGH real en FEAT-002, `deepmerge-ts`) |

## Clasificación de datos sensibles (F-TM-05)

| Dato | Clasificación | Tratamiento |
|---|---|---|
| Texto del formulario, resultado interpretado, filas del listado (Lugar, Nombre, Descripción, Monto, Categoría, fecha) | Financiero / PII indirecta — mismo dato ya clasificado en `threat-FEAT-003a.md` | Renderizado solo en la sesión de navegador de la propia persona; sin persistencia local; sin analytics ni logging de cliente en este ticket |
| `NEXT_PUBLIC_STUB_USER_ID` | Identificador operativo, no secreto | Public por diseño de Next.js (`NEXT_PUBLIC_`) — aceptado, ver riesgo abajo |
| Credenciales | — | No aplica; sin login en este ticket |

**Cifrado (F-TM-07):** en tránsito, HTTPS es responsabilidad del despliegue (mismo criterio que
`PRD.md` → Riesgos y Dependencias: interfaz y API en dominios distintos). Con CORS habilitando el
cruce de orígenes por primera vez, un despliegue sin HTTPS en cualquiera de los dos servicios
expondría el `x-user-id` y los datos del gasto en texto plano en la red — no es una superficie nueva
que este ticket introduzca, pero CORS es lo que hace que el escenario cross-origin sea real por
primera vez, así que vale la pena decirlo explícitamente acá.

## Riesgos clasificados

| Riesgo | STRIDE | Likelihood | Impact | Mitigación propuesta |
|---|---|---|---|---|
| `x-user-id` sigue siendo un valor client-controlled sin prueba de identidad — y ahora, embebido en un bundle público de JavaScript, cualquier visitante del sitio puede leerlo con devtools y operar como el usuario de seed | S / I | High | Critical | **Riesgo aceptado y re-evaluado**, heredado de `threat-FEAT-002.md`/`threat-FEAT-003a.md` — ver sección siguiente |
| `WEB_ORIGIN` mal configurado (wildcard o dominio equivocado) amplía quién puede leer respuestas de la API vía CORS | I | Low | High | **Mitigación 1**: `WEB_ORIGIN` se valida con Zod al arranque (Block 2) como una URL concreta, sin soporte de wildcard en el schema — un despliegue no puede configurar `*` por accidente, solo por editar el código de validación a mano |
| Un `reason` de rechazo no reconocido se renderiza crudo como texto de UI, exponiendo un código interno sin traducir | I | Low | Low | **Mitigación 2**: `rejection-messages.ts` usa un mapeo cerrado con fallback genérico explícito en runtime — nunca interpola el valor crudo de `reason` en el mensaje mostrado a la persona |
| Body de error 400 (detalles de validación Zod) o 500 se renderiza directamente, filtrando estructura interna de la API | I | Low | Low | **Mitigación 3**: Block 7 del spec nunca parsea `details`/mensajes de 400/401/500 — siempre una notificación genérica predefinida por el cliente, ya diseñado así antes de este análisis |
| Dependencias nuevas del ecosistema frontend traen una vulnerabilidad conocida (supply chain) | T | Medium | Medium | **Mitigación 4**: `pnpm audit` corre como parte del SAST de CODE (mismo mecanismo que ya cerró un HIGH real en FEAT-002) |
| Sin límite de reintentos de envío del formulario | D | Low | Low | **Riesgo aceptado** — mismo criterio que `threat-FEAT-002.md`: sin requisito de rate-limiting en el PRD, y el servidor es quien acota el costo real por request |

## Riesgo aceptado — `x-user-id` visible en el bundle público, sin sesión real (F-TM-04)

Riesgo heredado y re-evaluado por tercera vez (FEAT-002 → FEAT-003a → FEAT-003b), porque este
ticket cambia su naturaleza una vez más: de "un header que un backend confía" a "un valor que
literalmente se sirve al navegador de cualquier visitante del sitio desplegado".

| Campo | Valor |
|---|---|
| Quién lo acepta | Nahuel Maiká (product owner / dueño del repo) |
| Justificación | El ticket de autenticación real (RF-08/RF-12/RF-13/RNF-06 del PRD-001) todavía no existe — el modelo `User` no tiene campo de contraseña. Bloquear FEAT-003b hasta que exista invertiría el orden de entrega: esta pantalla es la primera forma de usar el producto sin `curl`, y es lo que permite verificar de punta a punta el trabajo de FEAT-001a/b/002/003a. El PRD de este ticket ya declara el reemplazo explícitamente (`Out of Scope` → "siguiente ticket: FEAT-004") |
| Condiciones de revisión | **Ningún despliegue de `apps/web` con datos reales de usuarios reales es aceptable hasta que FEAT-004 (login y sesión reales) reemplace el stub tanto en `apps/api` como en `apps/web`.** Esta condición ya estaba declarada para FEAT-003a y se reafirma acá con un matiz más fuerte: antes el riesgo requería conocer o adivinar un id de UUID; después de este ticket, el id queda escrito en texto plano en el bundle de cualquier despliegue de demo, así que la barrera de esfuerzo para explotarlo baja a cero. Se reevalúa si aparece cualquier intención de desplegar `apps/web` a usuarios reales antes de FEAT-004 |

## Mitigations to fold into the spec

Las 4 mitigaciones activas ya están reflejadas en `docs/daw/specs/spec-FEAT-003b.md`:

1. **`WEB_ORIGIN` validado por Zod, sin wildcard posible** — Block 2.
2. **`rejection-messages.ts` con fallback genérico, nunca el valor crudo** — Block 7 (el completion
   criterion ya exige "sin ningún `default` que enmascare un valor no mapeado" a nivel de test; se
   suma acá el requisito de runtime: el fallback en producción debe ser un mensaje genérico, nunca
   una interpolación del `reason` recibido).
3. **400/401/500 nunca renderizan el body crudo del servidor** — Block 7, ya diseñado así.
4. **`pnpm audit` como parte del SAST de CODE** — heredado del proceso ya vigente, se reafirma para
   las dependencias nuevas de este ticket.

## Verdict

```
┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling FEAT-003b — PASSED                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Attack surfaces identified: 5                            │
│  Trust boundaries declared: 5                              │
│                                                          │
│  Riesgos:                                                 │
│    🔴 CRITICAL: x-user-id embebido en bundle público       │
│       — Riesgo aceptado (F-TM-04 completo), re-evaluado    │
│         por 3ra vez, mitiga FEAT-004                        │
│    🟠 HIGH: WEB_ORIGIN mal configurado                      │
│       — Mitigación 1 (Zod, sin wildcard)                    │
│    🟡 MEDIUM: dependencias nuevas de supply chain             │
│       — Mitigación 4 (pnpm audit en SAST)                     │
│    🟢 LOW: reason no reconocido expuesto crudo                │
│       — Mitigación 2 (fallback genérico)                       │
│    🟢 LOW: error 400/500 expuesto crudo                        │
│       — Mitigación 3 (ya diseñado, sin parseo de body)          │
│    🟢 LOW: sin límite de reintentos de envío                    │
│       — aceptado, mismo criterio que FEAT-002                    │
│                                                          │
│  ─────────────────────────────────────────────────────   │
│  Risks: C:1 H:1 M:1 L:3                                  │
│  Report: docs/daw/security/threat-FEAT-003b.md           │
└─────────────────────────────────────────────────────────┘
```
