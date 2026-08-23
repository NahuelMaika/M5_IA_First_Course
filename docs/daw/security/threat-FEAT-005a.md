# Threat Model — FEAT-005a: ABM de gastos (edición y eliminación)

| Field | Value |
|-------|-------|
| Ticket | FEAT-005a |
| Date | 2026-08-23 |
| Based on | prd-FEAT-005a.md, plan validado por daw-impact-scanner + daw-arch-auditor (PASSED) |

## Componentes nuevos o modificados

- `PATCH /expenses/:id` — nuevo endpoint, edita Monto/Lugar/Fecha/categoría de un gasto propio.
- `DELETE /expenses/:id` — nuevo endpoint, elimina físicamente un gasto propio.
- `GET /categories` — nuevo endpoint de lectura, lista categorías visibles (predefinidas + propias).
- `expense-service.ts` (`updateExpense`, `deleteExpense`) — lógica de ownership y preservación/
  reasignación de categoría.
- `category-service.ts` (`listCategories`) y `category-repository.ts`
  (`findVisibleForUserWithId`) — nuevo camino de lectura de categorías con `id`.
- `expense-repository.ts` (`findByIdForUser`, `update`, `remove`).
- Frontend: `dialog.tsx`, `confirm-dialog.tsx`, `select.tsx`, hook de validación por campo,
  `expense-edit-dialog.tsx`, triggers en `expense-row.tsx`/`expense-list.tsx`.

## Trust boundaries (F-TM-02)

| Boundary | Descripción |
|---|---|
| B1 — Browser ↔ `apps/api` | Los 3 endpoints nuevos cruzan esta frontera; autenticados por la cookie de sesión (`authPreHandler`, sin cambios respecto a FEAT-004a/b). |
| B2 — `apps/api` service ↔ PostgreSQL (Prisma) | `updateExpense`/`deleteExpense`/`listCategories` construyen queries con datos parcialmente controlados por el cliente (`categoryId`, campos del PATCH). |
| B3 — `apps/api` ↔ `apps/web` (CORS) | Sin cambios — `CORS_METHODS` ya incluye PATCH/DELETE (confirmado en el impact scan). |

## STRIDE por componente (F-TM-01)

### `PATCH /expenses/:id` y `DELETE /expenses/:id`

| Categoría | Análisis |
|---|---|
| Spoofing | Depende de la cookie de sesión existente (RNF-06, sin cambios) — sin riesgo nuevo. |
| Tampering | **Ver R1, R2, R3 abajo.** |
| Repudiation | Sin logging de auditoría de ediciones/eliminaciones — no exigido por el PRD; el hard delete (FR-05) es intencional y ya documentado como irreversible en `prd-FEAT-005a.md`. Aceptado como está, sin requerimiento que lo cubra. |
| Information Disclosure | **Ver R4.** El 404 uniforme (`{error:"not_found"}` tanto para "no existe" como "no es tuyo") ya está en el diseño — correcto, evita confirmar la existencia de un gasto ajeno. |
| Denial of Service | Sin rate limit dedicado, mismo criterio que `POST /expenses` (ya existente, sin mitigación específica en ese ticket tampoco) — W-TM-02, riesgo bajo para un servicio interno de bajo tráfico. |
| Elevation of Privilege | **Ver R1 (IDOR).** |

### `GET /categories`

| Categoría | Análisis |
|---|---|
| Spoofing | Igual que arriba, cookie de sesión existente. |
| Tampering | N/A — sin body, solo lectura. |
| Repudiation | N/A. |
| Information Disclosure | Debe filtrar exclusivamente `ownerId: null OR ownerId: userId` (mismo patrón que `findVisibleForUser` ya probado) — sin este filtro, un usuario vería categorías privadas de otro. Mitigación: `findVisibleForUserWithId` reutiliza el mismo `where` que `findVisibleForUser`, solo agrega `id` al `select`. |
| Denial of Service | Bajo, lectura simple. |
| Elevation of Privilege | Cubierto por el mismo filtro de arriba. |

### Reasignación manual de categoría (`categoryId` en el PATCH)

| Categoría | Análisis |
|---|---|
| Tampering | **Ver R2.** Un `categoryId` de otro usuario o predefinido-inexistente podría colarse sin validación. |
| Elevation of Privilege | Mismo riesgo que R2 — asignar una categoría que no le pertenece no expone datos, pero corrompe la integridad de la asignación. |

## Clasificación de datos sensibles (F-TM-05)

| Dato | Clasificación | Nota |
|---|---|---|
| Monto, Lugar, Fecha, Descripción del gasto | Financiero / personal | Ya persistido desde FEAT-002; este ticket solo agrega edición/eliminación, no un nuevo mecanismo de almacenamiento. |
| Nombre de categoría | Personal / bajo impacto | Sin PII directa. |
| `categoryId`, `expense.id` | Identificador interno (UUID) | No es secreto por diseño — la protección es el control de acceso (ownership), no la opacidad del UUID. |

No se introduce manejo nuevo de credenciales ni PII (email/password) en este ticket — la sesión sigue
siendo la de FEAT-004a/b, sin cambios. Transporte vía HTTPS y cifrado en reposo a nivel del proveedor
de base de datos: heredado sin cambios de `threat-FEAT-002.md`/`threat-FEAT-004a.md` (F-TM-07 ya
resuelto en esos documentos; este ticket no agrega una superficie nueva de credenciales/PII que lo
reabra).

## Riesgos identificados

| # | Riesgo | STRIDE | Likelihood | Impact | Mitigación |
|---|---|---|---|---|---|
| R1 | IDOR: un usuario autenticado adivina/itera el `id` de un gasto ajeno en `PATCH`/`DELETE /expenses/:id` | Elevation of Privilege | Medium | High | `findByIdForUser` debe filtrar **en la query de Prisma** con `where: { id, userId }` combinados (no `findUnique({id})` seguido de una comparación en JS) — si no matchea ninguno de los dos, devuelve `null` y el servicio responde 404 uniforme. Esto queda como requisito explícito del spec, no una opción de implementación. |
| R2 | Un `categoryId` de otro usuario (o de una categoría inexistente) se acepta en el PATCH sin validar pertenencia | Tampering / Elevation of Privilege | Medium | Medium | `updateExpense` valida el `categoryId` recibido contra `findVisibleForUserWithId(userId)` **antes** de persistir; si no aparece en esa lista, la operación se rechaza (422) y el gasto no se actualiza. |
| R3 | El PATCH acepta Monto/Lugar sin los mismos límites que la creación (RNF-07/RNF-08 de `PRD.md`: monto positivo, máx. 2 decimales, ≤ 999.999.999,99; Lugar ≤ 200 caracteres) — a diferencia de `POST /expenses`, el update NO pasa por `parseExpense`, así que esos límites no se heredan gratis | Tampering | Medium | Medium | `updateExpenseBodySchema` debe declarar explícitamente los mismos límites Zod que la creación (positivo, 2 decimales, tope RNF-08; longitud RNF-07) — no alcanza con "amount opcional", hay que fijar los `.refine()`/`.max()` en el spec. |
| R4 | Un error no controlado en `updateExpense`/`deleteExpense`/`listCategories` filtra el mensaje real de Prisma en la respuesta 500 | Information Disclosure | Low | Medium | Mismo patrón que `createExpense`: `catch` genérico → `{error:"internal_error"}` al cliente, error real solo al `logger` del servidor. Se declara como requisito del spec para los 3 nuevos métodos del servicio. |
| R5 | CSRF sobre `PATCH`/`DELETE /expenses/:id`: `apps/api` sigue sin protección CSRF (sin token, sin validación de `Origin`/`Referer`) — un sitio malicioso podría forzar estas requests con la cookie de la víctima | Tampering | Medium | Medium | **Extensión del riesgo aceptado R2 de `threat-FEAT-004b.md`** (ver abajo) — mismo mecanismo, misma justificación, estos dos endpoints nuevos son el mismo tipo de escritura con cookie ambiente que `POST /expenses` ya cubría. |

## Riesgos aceptados (F-TM-04)

| Riesgo | Aceptado por | Justificación | Condición de revisión |
|---|---|---|---|
| R5 — Sin protección CSRF en `PATCH`/`DELETE /expenses/:id` | Usuario (confirmado 2026-08-23, durante esta sesión de PLAN) | Extiende la aceptación ya registrada para R1/R2 en `threat-FEAT-004b.md` (2026-08-23): GGasIA es una app personal/de pareja sin exposición pública ni tráfico de terceros esperado — mismo criterio, misma clase de endpoint de escritura con cookie ambiente. | Misma condición ya registrada: revisar si la app se expone fuera del círculo personal/de pareja, si se detecta abuso real (ej. un gasto editado o eliminado que el usuario no reconoce haber tocado), o si se agrega un flujo que aumente el valor de una cuenta comprometida. |

## Mitigaciones a incorporar al spec

1. `findByIdForUser` filtra `{id, userId}` en la misma query de Prisma (R1).
2. `updateExpense` valida `categoryId` contra `findVisibleForUserWithId(userId)` antes de persistir, rechaza con 422 si no aparece (R2).
3. `updateExpenseBodySchema` replica los límites de monto (positivo, 2 decimales, ≤ 999.999.999,99) y de longitud de Lugar (≤ 200) que ya aplica la creación (R3).
4. `updateExpense`/`deleteExpense`/`listCategories` siguen el mismo patrón catch-log-genérico que `createExpense` (R4).

────────────────────────────────────────────────────────────
Risks: C:0 H:0 (R1 mitigado por diseño) M:0 (R2/R3 mitigados por diseño, R5 aceptado) L:0 (R4 mitigado por diseño)
Result: PASSED
Report: docs/daw/security/threat-FEAT-005a.md
