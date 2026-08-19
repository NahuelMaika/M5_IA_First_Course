# Threat Model FEAT-001b: Motor de extracción de campos del gasto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Component | `packages/domain` — pipeline `parse-expense.ts` y sus etapas (`separator.ts`, `temporal.ts`, `category-marker.ts`, `numerals.ts`, `amount.ts`, `filler-words.ts`) |
| Date | 2026-08-18 |

## Attack surfaces identified

1. **Input crudo del usuario** (texto tipeado o transcripción de audio, hasta 500 caracteres) — la
   única entrada no confiable de todo el componente. Alimenta las seis etapas del pipeline.
2. **Fecha de referencia inyectada por el llamador** (FR-03) — el motor nunca lee el reloj del
   sistema; confía en el parámetro. Quien la construye (la futura capa API) queda fuera de este
   ticket, pero el límite de confianza debe declararse.
3. **Puerto del categorizador** (`Categorizer` de `@ggasia/categorization`) — dependencia interna, no
   de terceros ni de red; mismo nivel de confianza que el propio paquete.

No hay superficie de red, de persistencia, de autenticación ni de autorización: `packages/domain` es
puro, no toca Fastify, Prisma ni HTTP (per AGENTS.md).

## Trust boundaries (F-TM-02)

| Boundary | Lado no confiable | Lado confiable |
|---|---|---|
| B1 | Input crudo (HTTP body / transcripción de audio) | El pipeline de extracción — nunca debe lanzar (`throw`) sobre input malformado, solo devolver rechazo tipado |
| B2 | Fecha de referencia recibida como parámetro | El pipeline la trata como ya validada; su validación en origen es responsabilidad de la capa API (fuera de este ticket) |
| B3 | Resultado del puerto del categorizador | El pipeline confía en el contrato de la interfaz `Categorizer`, no en una implementación concreta (AGENTS.md) |

## STRIDE por componente

**Pipeline de extracción (`parse-expense.ts` + etapas)**

| Categoría | Evaluación |
|---|---|
| Spoofing | N/A — no maneja identidad |
| Tampering | El input puede craftearse para forzar una interpretación incorrecta. Mitigado por el diseño mismo: `kb.md` prohíbe adivinar un monto ambiguo, y toda ambigüedad rechaza (FR-11) en vez de resolver en silencio |
| Repudiation | N/A en este paquete — no hay logging (es puro); el registro de auditoría es responsabilidad de una capa futura |
| Information Disclosure | Los motivos de rechazo son códigos discretos (FR-11: "motivo identificable y distinto"), nunca el texto crudo reflejado — evita que un input con contenido sensible se re-exponga en el resultado |
| Denial of Service | Un input adversarial (500 caracteres de conectores/muletillas repetidos) podría forzar un comportamiento cuadrático en el bucle de recorte de FR-07 si se implementa con mutación repetida de array — ver riesgo HIGH abajo |
| Elevation of Privilege | N/A — no hay privilegios en este paquete |

## Riesgos clasificados

| Riesgo | STRIDE | Likelihood | Impact | Mitigación propuesta |
|---|---|---|---|---|
| El bucle de descarte de muletillas (FR-07) recorta desde ambos extremos "hasta estabilizar" — una implementación ingenua con `array.shift()/unshift()` repetido sobre un input de 500 caracteres compuesto solo por conectores es O(n²) | D (DoS) | Medium | High — viola NFR-03 (p95 <10ms) bajo el peor caso, no solo lo degrada | Implementar el recorte con punteros de índice sobre el array de tokens (dos punteros, O(n) total), nunca mutando el array en cada iteración. El test de performance (Bloque 10, NFR-03) debe incluir un caso adversarial: 500 caracteres compuestos íntegramente por tokens de las listas cerradas de muletillas, no solo un input típico |
| La fecha de referencia (FR-03) es un parámetro de entrada no validado por este paquete; un llamador que la construya mal (fecha manipulada) evade en silencio la ventana de retroactividad y el rechazo por fecha futura | T | Low | Medium | Documentar explícitamente en el spec que `referenceDate` es una precondición del pipeline, no un valor que este paquete valida — la validación de origen es responsabilidad de quien lo invoque (capa API, ticket futuro). No es un riesgo a mitigar aquí porque el paquete es puro y no tiene forma de verificar la fecha del mundo real; es un límite de confianza a declarar, no a cerrar |
| Los rechazos podrían filtrar el texto crudo del usuario si una implementación futura decide loguear o incluir el input en el motivo de rechazo | I | Low | Low | Ya evitado por diseño: FR-11 exige motivos identificables por código, y el precedente de `category-name.ts` (FEAT-001a) ya establece la norma de no llevar el texto crudo en un rechazo. Extender la misma norma a todos los `RejectionReason` de este ticket |

## Datos sensibles (F-TM-05)

- **Monto y Lugar**: datos financieros de baja sensibilidad (no PII, no credenciales). No se
  persisten en este ticket — el motor es puro, en memoria, sin I/O.
- **Nombre marcado de categoría** (`#nombre`): potencial texto libre del usuario, mismo tratamiento
  que `category-name.ts` ya estableció — nunca se refleja en un rechazo.
- No hay credenciales ni PII estructurada en este componente. F-TM-07 (cifrado) no aplica: no hay
  persistencia ni transporte en `packages/domain`.

## Mitigaciones a plegar en el spec

1. Bloque 7 (`filler-words.ts`): implementar el recorte de extremos con punteros de índice, O(n)
   total, no mutación repetida de array.
2. Bloque 10 (gates de calidad): el test de performance de NFR-03 debe incluir un caso adversarial de
   500 caracteres solo-muletillas, además de un input típico.
3. Bloque 1 (tipos de dominio): documentar `referenceDate` como precondición confiada del pipeline —
   límite de confianza B2, sin validación interna.
4. Bloque 1 (tipos de rechazo): los `RejectionReason` nunca llevan el texto crudo del input — solo un
   código de motivo, siguiendo el precedente de `category-name.ts`.

---

┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling — PASSED                            │
├─────────────────────────────────────────────────────────┤
│  Attack surfaces identified: 3                             │
│  Trust boundaries declared: 3                               │
│                                                              │
│  Risks:                                                     │
│    🟠 HIGH: recorte de muletillas O(n²) bajo input          │
│       adversarial — Mitigación: punteros de índice O(n) +   │
│       caso de test adversarial en NFR-03                    │
│    🟡 MEDIUM: fecha de referencia no validada por este       │
│       paquete — Mitigación: documentar como precondición     │
│       confiada (límite de confianza B2)                      │
│    🟢 LOW: motivos de rechazo ya no llevan texto crudo       │
│       (precedente de category-name.ts)                       │
│                                                              │
│  Mitigaciones a plegar en el spec: 4 (ver arriba)            │
│  ─────────────────────────────────────────────────────      │
│  Risks: C:0 H:1 M:1 L:1                                     │
│  Report: docs/daw/security/threat-FEAT-001b.md               │
└─────────────────────────────────────────────────────────┘
