# Spec FEAT-005a: ABM de gastos — edición y eliminación

| Field | Value |
|-------|-------|
| Ticket | FEAT-005a |
| PRD | docs/daw/prd/prd-FEAT-005a.md |
| Tier | FEATURE |
| Date | 2026-08-23 |
| Spec loops | 2 |

## Summary

Agrega `PATCH /expenses/:id` y `DELETE /expenses/:id` (con ownership scoped en la query de Prisma,
no en JS), un `GET /categories` de lectura que expone `id` (gap que `findVisibleForUser` no cubre),
y la UI de edición/eliminación: un modal genérico (`dialog.tsx`), una confirmación destructiva sobre
`alert-dialog` de Base UI, un selector de categoría, y el primer hook de validación por campo que
extrae el patrón que `AGENTS.md` ya pedía. `expense-list.tsx` pasa a ser dueño del estado de
edición/eliminación; `expense-row.tsx` se mantiene presentacional.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 2, Block 4, Block 6, Block 11 |
| FR-02 | Block 1, Block 3, Block 4, Block 6, Block 9, Block 11 |
| FR-03 | Block 4 |
| FR-04 | Block 6, Block 8, Block 12 |
| FR-05 | Block 2, Block 4, Block 6 |
| FR-06 | Block 7, Block 11 |
| FR-07 | Block 8, Block 12 |
| FR-08 | Block 2, Block 4, Block 6 |
| FR-09 | Block 1, Block 2, Block 6, Block 11 |
| NFR-01 | Block 4, Block 6 (mismo p95 <3s que POST/GET existentes, sin trabajo adicional bloqueante) |
| NFR-02 | Strategy: `routes → service → repository` en los 6 bloques de `apps/api`, mismo DI (`fastify.prisma`) que `POST`/`GET /expenses` |
| NFR-03 | Block 7, Block 8, Block 9 (Base UI + tokens del proyecto, sin color/spacing hardcodeado); Block 12 (botones de editar/eliminar, mismo criterio de tokens + destino táctil ≥24×24px) |

## Dependencies between blocks

```
Block 1 (schema PATCH) ─┐
Block 2 (expense-repo)  ├─→ Block 4 (expense-service) ─┐
Block 3 (category-repo) ─→ Block 5 (category-service) ─┤
                                                         ├─→ Block 6 (routes + app.ts)
                                                         │
Block 7 (dialog.tsx) ────────────────────────────────┐  │
Block 8 (confirm-dialog.tsx) ─────────────────────────┤  │
Block 9 (select.tsx) ─────────────────────────────────┼──┼─→ Block 11 (expense-edit-dialog.tsx)
Block 10 (use-field-validation.ts) ───────────────────┘  │        │
                                                            ←──────┘
                                                    Block 12 (expense-row.tsx + expense-list.tsx)
                                                    depende de Block 6, Block 8, Block 11
```

Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6 (backend completo) → 7 → 8 → 9 → 10 (primitivas UI,
independientes entre sí, pueden ir en paralelo) → 11 → 12.

## Block 1 — Zod schema para PATCH /expenses/:id

**Files**
- `apps/api/src/schemas/expense.ts` (modified) — agrega `updateExpenseBodySchema`.

**Logic**
Todos los campos opcionales, pero al menos uno debe estar presente (`.refine` a nivel objeto). No
pasa por `parseExpense` (eso es exclusivo del alta por texto libre), así que los límites de RNF-07/
RNF-08 se declaran acá explícitamente en vez de heredarlos.

**Input validation**
- `amount`: `z.coerce.number().positive()`, máximo 2 decimales (`.refine` sobre `Number.isInteger(v * 100)`), tope `999999999.99` (RNF-08 de `PRD.md`).
- `place`: `z.string().min(1).max(200)` (RNF-07 de `PRD.md`).
- `when`: `z.coerce.date()`, rechazada si es futura o anterior al piso de retroactividad de 12 meses (RF-27/RF-28 de `PRD.md`) — reutiliza la misma regla que `packages/domain/src/temporal.ts` aplica en la creación, reimplementada acá en Zod porque `apps/web` no depende de `@ggasia/domain` (confirmado en el impact scan) y el schema de `apps/api` tampoco pasa por `parseExpense` en este flujo.
- `categoryId`: `z.string().uuid()`.
- `description`: `z.string().max(300)` (RNF-07 de `PRD.md`) — **sin `.min(1)`**: a diferencia de
  `place`, una Descripción vacía es un valor válido (campo opcional del Modelo de Datos: Gasto de
  `kb.md`), así que el PATCH debe poder limpiarla explícitamente con `description: ""`.
- Objeto completo: `.refine(obj => Object.keys(obj).length > 0)` — un PATCH vacío se rechaza con 400.

**Error handling**
- Cualquier campo fuera de rango → falla la validación Zod, la ruta (Block 6) responde 400.

**Required tests**
- [ ] acepta un PATCH con un solo campo (`place`) — AC-01
- [ ] acepta un PATCH con `categoryId` — AC-04
- [ ] acepta un PATCH con `description` — AC-11
- [ ] acepta un PATCH que limpia `description` a `""` — AC-11
- [ ] rechaza un PATCH vacío `{}`
- [ ] rechaza `amount` negativo o con más de 2 decimales
- [ ] rechaza `amount` > 999999999.99
- [ ] rechaza `place` vacío o > 200 caracteres
- [ ] rechaza `when` futura
- [ ] rechaza `when` anterior al piso de retroactividad de 12 meses
- [ ] rechaza `categoryId` que no es un UUID válido
- [ ] rechaza `description` de más de 300 caracteres — AC-12

**Completion criterion**
`pnpm --filter @ggasia/api test schemas/expense` pasa con los 12 casos arriba.

## Block 2 — expense-repository: findByIdForUser, update, remove

**Files**
- `apps/api/src/repositories/expense-repository.ts` (modified).

**Logic**
- `findByIdForUser(prisma, {id, userId})`: `prisma.expense.findFirst({ where: { id, userId } })` —
  **mitigación R1 del threat model**: el filtro por `userId` va en la MISMA query de Prisma, nunca
  un `findUnique({id})` seguido de comparar `userId` en JS. Devuelve `null` si no matchea ninguno de
  los dos (gasto inexistente O de otro usuario, sin distinguir).
- `update(prisma, id, data)`: `prisma.expense.update({ where: { id }, data, include: { category: true } })` — recibe un `id` ya verificado por `findByIdForUser` en la capa de servicio (Block 4), este repositorio no re-verifica ownership. `UpdateExpenseInput` (Loop 2) suma `description?: string` a los campos opcionales ya existentes (`amount`, `place`, `when`, `categoryId`) — pasa a Prisma sin transformación, igual que el resto.
- `remove(prisma, id)`: `prisma.expense.delete({ where: { id } })` — borrado físico (FR-05, RF-44 de `PRD.md`).

**Error handling**
- Un P2025 (registro no encontrado) de `update`/`remove` no debería ocurrir en la práctica porque el
  servicio siempre llama a `findByIdForUser` antes — no se captura acá, se re-lanza tal cual (mismo
  criterio que `category-repository.ts create`'s comentario sobre P2002: este repositorio no
  silencia errores de Prisma).

**Required tests**
- [ ] `findByIdForUser` devuelve el gasto cuando `id` y `userId` matchean
- [ ] `findByIdForUser` devuelve `null` cuando el `id` no existe
- [ ] `findByIdForUser` devuelve `null` cuando el `id` existe pero pertenece a otro `userId`
- [ ] `update` persiste los campos pasados y devuelve la categoría incluida
- [ ] `update` persiste `description`, incluyendo limpiarla a `""` — AC-11
- [ ] `remove` elimina la fila (una consulta posterior por ese `id` no la encuentra)

**Completion criterion**
`pnpm --filter @ggasia/api test repositories/expense-repository` pasa, incluyendo los 6 casos
arriba, contra la base de test real (mismo criterio que el resto de `expense-repository.test.ts`).

## Block 3 — category-repository: findVisibleForUserWithId

**Files**
- `apps/api/src/repositories/category-repository.ts` (modified).

**Logic**
`findVisibleForUserWithId(prisma, userId)`: mismo `where: { OR: [{ownerId: null}, {ownerId: userId}]} }` que `findVisibleForUser`, pero el `select`/mapeo incluye `id` además de `name`/`active`. **No se modifica `findVisibleForUser`**: `resolveCategoryName` (en `@ggasia/categorization`) depende de su shape exacto `{name, active}[]` y no debe recibir un campo de más ni de menos.

**Error handling**
- Este repositorio no captura errores de Prisma (mismo criterio que `expense-repository.ts`, Block
  2): una falla se propaga sin transformar hacia la capa de servicio (Block 5), que es quien decide
  cómo responder.

**Required tests**
- [ ] devuelve categorías predefinidas y propias del usuario, cada una con `id`
- [ ] no devuelve categorías propias de otro usuario
- [ ] `findVisibleForUser` (la función existente) sigue devolviendo exactamente `{name, active}` sin `id` — test de regresión explícito para no romper `resolveCategoryName`

**Completion criterion**
`pnpm --filter @ggasia/api test repositories/category-repository` pasa, incluyendo los 3 casos
arriba.

## Block 4 — expense-service: updateExpense, deleteExpense

**Files**
- `apps/api/src/services/expense-service.ts` (modified).

**Logic**
- `updateExpense(deps, userId, expenseId, patch)`:
  1. `findByIdForUser(deps.prisma, {id: expenseId, userId})` → si `null`, `{outcome: "not_found"}`.
  2. Si `patch.categoryId` está presente: validarlo contra `categoryRepository.findVisibleForUserWithId(deps.prisma, userId)` — **mitigación R2**: si el `categoryId` no aparece en esa lista, `{outcome: "invalid_category"}`, no se persiste nada.
  3. Si `patch.categoryId` NO está presente: el `categoryId` del gasto se preserva sin tocar — nunca se llama a `resolveCategoryName` ni a `createCategorizer` en este flujo (regla de `AGENTS.md`: "Do not re-categorize an expense when its Place is edited").
  4. `expenseRepository.update(deps.prisma, expenseId, {...patch})`.
  5. `try/catch` genérico: cualquier error no controlado → **mitigación R4**, `deps.logger?.error({err: error}, "expense update failed with an internal error")`, `{outcome: "internal_error"}` — nunca el mensaje real de Prisma sale de este módulo (mismo patrón que `createExpense`).
- `deleteExpense(deps, userId, expenseId)`:
  1. `findByIdForUser` → `null` → `{outcome: "not_found"}`.
  2. `expenseRepository.remove(deps.prisma, expenseId)` → `{outcome: "deleted"}`.
  3. Mismo `try/catch` genérico que `updateExpense`.

**Error handling**
- `"not_found"` cubre tanto "no existe" como "es de otro usuario" — sin rama que los distinga (evita
  confirmar la existencia de un gasto ajeno, F-TM mitigación en `threat-FEAT-005a.md`).
- `"invalid_category"` es un outcome distinto de `"not_found"` — el gasto sí existe y es del usuario,
  el problema es sólo el `categoryId` propuesto.

**Required tests**
- [ ] `updateExpense` actualiza Monto/Lugar/Fecha de un gasto propio — AC-01
- [ ] `updateExpense` actualiza la Descripción de un gasto propio, incluyendo limpiarla a `""` — AC-11
- [ ] `updateExpense` devuelve `"not_found"` para un gasto que no existe
- [ ] `updateExpense` devuelve `"not_found"` para un gasto de otro usuario — AC-02
- [ ] `updateExpense` conserva la categoría vigente cuando el patch sólo trae `place` — AC-03
- [ ] `updateExpense` reasigna la categoría cuando el patch trae un `categoryId` válido — AC-04
- [ ] `updateExpense` devuelve `"invalid_category"` para un `categoryId` de otro usuario o predefinido inexistente
- [ ] `updateExpense` nunca invoca `resolveCategoryName`/`createCategorizer` (spy/mock que verifica que no se llaman)
- [ ] `deleteExpense` elimina un gasto propio — AC-05
- [ ] `deleteExpense` devuelve `"not_found"` para un gasto que no existe
- [ ] `deleteExpense` devuelve `"not_found"` para un gasto de otro usuario — AC-07
- [ ] `updateExpense`/`deleteExpense` devuelven `"internal_error"` y loguean sin exponer el error real ante una falla de Prisma simulada

**Completion criterion**
`pnpm --filter @ggasia/api test services/expense-service` pasa, incluyendo los 12 casos arriba.

## Block 5 — category-service: listCategories

**Files**
- `apps/api/src/services/category-service.ts` (new).

**Logic**
`listCategories(deps, userId)`: envuelve `categoryRepository.findVisibleForUserWithId`, mismo patrón
`try/catch` con log server-side y `{outcome: "internal_error"}` genérico que el resto del servicio.

**Error handling**
- `try/catch` genérico: cualquier error de `findVisibleForUserWithId` → `deps.logger?.error({err:
  error}, "category listing failed with an internal error")`, `{outcome: "internal_error"}` — nunca
  el mensaje real de Prisma sale de este módulo (mismo patrón que `expense-service.ts`).

**Required tests**
- [ ] devuelve las categorías visibles para el usuario — AC-15 (de `prd-FEAT-005.md` original; en este ticket la consume Block 11)
- [ ] devuelve `"internal_error"` ante una falla de Prisma simulada, sin exponer el error real

**Completion criterion**
`pnpm --filter @ggasia/api test services/category-service` pasa, incluyendo los 2 casos arriba.

## Block 6 — Routes: PATCH/DELETE /expenses/:id, GET /categories

**Files**
- `apps/api/src/routes/expenses.ts` (modified) — agrega `handleUpdateExpense`, `handleDeleteExpense`.
- `apps/api/src/routes/categories.ts` (new) — `handleListCategories`.
- `apps/api/src/app.ts` (modified) — `app.register(categoriesRoutes)` junto a `app.register(expensesRoutes)`.
- `apps/api/tests/expenses.integration.test.ts` (modified) — extiende la suite de integración existente.

**API contract**

- `PATCH /expenses/:id`
  - Request: body validado por `updateExpenseBodySchema` (Block 1); `:id` es un UUID.
  - Auth: `authPreHandler` (cookie de sesión).
  - Response 200: mismo shape que `POST /expenses` (monto con `.toFixed(2)`, categoría por nombre).
  - Errores: 400 (body inválido o vacío), 401 (sin sesión), 404 (`{error:"not_found"}`, gasto
    inexistente o ajeno), 422 (`{error:"invalid_category"}`, `categoryId` no visible para el
    usuario), 500 (`{error:"internal_error"}`).
  - `toUpdatePatch` (Loop 2): suma `description` al mapeo hacia `UpdateExpensePatch` — sin
    conversión, se copia tal cual la deja `updateExpenseBodySchema` (Block 1).

- `DELETE /expenses/:id`
  - Request: `:id` es un UUID, sin body.
  - Auth: `authPreHandler`.
  - Response 204: sin body.
  - Errores: 401, 404 (`{error:"not_found"}`), 500.

- `GET /categories`
  - Request: sin query params.
  - Auth: `authPreHandler`.
  - Response 200: `{ categories: [{id, name, active}] }`.
  - Errores: 401, 500.

**Error handling**
- Todas las respuestas de error siguen el shape `{error: "snake_case_reason"}`, mismo precedente que
  `routes/auth.ts`.

**Required tests**
- [ ] `PATCH /expenses/:id` devuelve 200 y el body actualizado — AC-01
- [ ] `PATCH /expenses/:id` con `description` devuelve 200 con la descripción actualizada — AC-11
- [ ] `PATCH /expenses/:id` con `description` de más de 300 caracteres devuelve 400 — AC-12
- [ ] `PATCH /expenses/:id` devuelve 400 con un body vacío
- [ ] `PATCH /expenses/:id` devuelve 401 sin cookie de sesión
- [ ] `PATCH /expenses/:id` devuelve 404 para un gasto ajeno — AC-02
- [ ] `PATCH /expenses/:id` devuelve 422 para un `categoryId` no visible
- [ ] `DELETE /expenses/:id` devuelve 204 y el gasto deja de estar en `GET /expenses` — AC-05
- [ ] `DELETE /expenses/:id` devuelve 404 para un gasto ajeno — AC-07
- [ ] `GET /categories` devuelve 200 con predefinidas + propias — AC-15
- [ ] `GET /categories` devuelve 401 sin cookie de sesión
- [ ] `PATCH /expenses/:id` devuelve 500 cuando el servicio devuelve `"internal_error"` (servicio mockeado), sin exponer el error real
- [ ] `DELETE /expenses/:id` devuelve 401 sin cookie de sesión
- [ ] `DELETE /expenses/:id` devuelve 500 cuando el servicio devuelve `"internal_error"` (servicio mockeado)
- [ ] `GET /categories` devuelve 500 cuando el servicio devuelve `"internal_error"` (servicio mockeado)
- [ ] Integración: crear gasto → editarlo → verificarlo en `GET /expenses` → borrarlo → verificar que ya no aparece

**Completion criterion**
`pnpm --filter @ggasia/api test` (suite completa) pasa, incluyendo los 16 casos arriba.

## Block 7 — ui/dialog.tsx

**Files**
- `apps/web/src/components/ui/dialog.tsx` (new).
- `apps/web/src/components/ui/dialog.test.tsx` (new).

**Logic**
Envuelve `@base-ui/react/dialog`. Props: `open`, `onOpenChange`, `title`, `children` (el consumidor
pasa el form/contenido). Cierra automáticamente cuando el consumidor invoca `onOpenChange(false)`
tras un guardado exitoso (RF-06 de `prd-FEAT-005a.md`; RF-58/RF-78 de `PRD.md`). Descarta cambios sin
pedir confirmación adicional al cancelar, `Escape`, o clic afuera (RF-59 de `PRD.md`) — comportamiento
nativo de `@base-ui/react/dialog`, no hay que reimplementarlo. Estilos con tokens del proyecto
(`AGENTS.md`: sin color/tipografía/spacing hardcodeado).

**Error handling**
- N/A — este componente no realiza llamadas a la API ni maneja errores propios; es una primitiva de
  presentación. El consumidor (Block 11) es responsable de mostrar cualquier error de una operación
  async que ocurra dentro del diálogo.

**Required tests**
- [ ] renderiza el contenido cuando `open=true`
- [ ] no renderiza cuando `open=false`
- [ ] `Escape` invoca `onOpenChange(false)` sin pedir confirmación — AC-09
- [ ] clic afuera invoca `onOpenChange(false)` sin pedir confirmación — AC-09
- [ ] foco atrapado dentro del diálogo mientras está abierto (accesibilidad, RNF-13 de `PRD.md`)

**Completion criterion**
`pnpm --filter @ggasia/web test dialog` pasa, incluyendo los 5 casos arriba.

## Block 8 — ui/confirm-dialog.tsx

**Files**
- `apps/web/src/components/ui/confirm-dialog.tsx` (new).
- `apps/web/src/components/ui/confirm-dialog.test.tsx` (new).

**Logic**
Envuelve `@base-ui/react/alert-dialog` directamente (no `dialog.tsx` de Block 7 — `alert-dialog` es
la primitiva de Base UI pensada para confirmaciones destructivas). Props: `open`, `onOpenChange`,
`itemName` (nombre del elemento afectado, RF-56 de `PRD.md`), `onConfirm`. Foco inicial en el botón
"Eliminar" (RF-57 de `PRD.md`), verbos "Eliminar"/"Cancelar" (RF-77 de `PRD.md`) — nunca
`window.confirm`/`alert` (`AGENTS.md`).

**Error handling**
- N/A — este componente no realiza llamadas a la API; sólo invoca `onConfirm`. El consumidor (Block
  12) es responsable de manejar el resultado de la operación destructiva real.

**Required tests**
- [ ] muestra el nombre del elemento afectado — AC-10
- [ ] el foco inicial está en el botón "Eliminar" — AC-10
- [ ] confirmar invoca `onConfirm`
- [ ] cancelar cierra sin invocar `onConfirm` — AC-06 (nivel UI; la persistencia se confirma en Block 12)

**Completion criterion**
`pnpm --filter @ggasia/web test confirm-dialog` pasa, incluyendo los 4 casos arriba.

## Block 9 — ui/select.tsx

**Files**
- `apps/web/src/components/ui/select.tsx` (new).
- `apps/web/src/components/ui/select.test.tsx` (new).

**Logic**
Envuelve `@base-ui/react/select`. Props: `value`, `onValueChange`, `options: {value, label}[]`,
`label`. Genérico — no acoplado a "categoría" en el nombre ni en el tipo, para que
`prd-FEAT-005b.md` lo reutilice sin modificarlo.

**Bug fix (Loop 2)**: `select-popup` (el `SelectPrimitive.Popup` dentro del `Portal`) no llevaba
ninguna clase `z-*` — quedaba en la capa `z-auto`, que en CSS pinta SIEMPRE por debajo de cualquier
hermano con `z-index` positivo (como `dialog-backdrop`/`dialog-popup` de `ui/dialog.tsx`, ambos en
`z-50`), sin importar el orden en el DOM. Efecto observado: al usar el `Select` de categoría dentro
de `expense-edit-dialog.tsx` (Block 11), el desplegable de opciones renderizaba detrás del backdrop
del diálogo, invisible/inoperable. Fix: agregar `z-[60]` a `select-popup` — estrictamente por encima
del `z-50` del diálogo, para no depender del orden de montaje de los portales.

**Error handling**
- N/A — recibe sus opciones ya resueltas vía props; no realiza llamadas a la API ni valida su propio
  input. Un `options` vacío renderiza un select sin opciones, no es un estado de error.

**Required tests**
- [ ] renderiza las opciones pasadas
- [ ] seleccionar una opción invoca `onValueChange` con su `value`
- [ ] operable por teclado (RNF-13 de `PRD.md`)
- [ ] `select-popup` lleva una clase `z-*` con valor numérico mayor al `z-50` de `dialog-popup`/
      `dialog-backdrop` (regresión explícita del bug de stacking — Loop 2)
- [ ] al montar `Select` dentro de un `Dialog` abierto (mismo anidamiento que Block 11) y abrir el
      desplegable, su opción resulta clickeable (`fireEvent.click` sobre la opción invoca
      `onValueChange`) — test de integración de stacking, no sólo de clase CSS

**Completion criterion**
`pnpm --filter @ggasia/web test select` pasa, incluyendo los 5 casos arriba.

## Block 10 — Hook de validación por campo

**Files**
- `apps/web/src/lib/hooks/use-field-validation.ts` (new).
- `apps/web/src/lib/hooks/use-field-validation.test.ts` (new).

**Logic**
Primera extracción del patrón que `AGENTS.md` documenta ("no hay componente `form`, la validación
por campo es un hook") — hoy `login-form.tsx`/`register-form.tsx`/`expense-form.tsx` lo hacen inline.
API: `useFieldValidation(value, validator)` → `{error, touched, onBlur}`. Muestra el error recién al
perder el foco o al intentar enviar, nunca mientras se escribe por primera vez (RF-70 de `PRD.md`).
Oculta el error apenas el valor pasa a ser válido (RF-81 de `PRD.md`).

**Error handling**
- N/A — el hook no realiza operaciones que puedan fallar (sin efectos secundarios, sin llamadas a la
  API). El `validator` es una función pura provista por el consumidor y debe devolver un mensaje de
  error o `undefined`, nunca lanzar una excepción — contrato documentado en el tipo del hook.

**Required tests**
- [ ] no muestra error mientras el campo nunca perdió el foco
- [ ] muestra error tras `onBlur` con un valor inválido
- [ ] oculta el error apenas el valor se vuelve válido, sin esperar un nuevo blur

**Completion criterion**
`pnpm --filter @ggasia/web test use-field-validation` pasa, incluyendo los 3 casos arriba.

## Block 11 — expense-edit-dialog.tsx

**Files**
- `apps/web/src/components/expense-edit-dialog.tsx` (new).
- `apps/web/src/components/expense-edit-dialog.test.tsx` (new).

**Logic**
Usa `dialog.tsx` (Block 7), `select.tsx` (Block 9) para el picker de categoría (poblado con
`GET /categories`, Block 6), y `use-field-validation.ts` (Block 10) para Monto/Lugar/Fecha/
Descripción. Precarga los valores vigentes del gasto, incluyendo Descripción (Loop 2 — campo
ausente en la v1.0 de este bloque, ver `prd-FEAT-005a.md` v1.1). Al enviar, llama
`apiRequest(`/expenses/${id}`, {method: "PATCH", body: JSON.stringify(patch)})`. Cierra
automáticamente en éxito (comportamiento heredado de Block 7). Muestra el error de la API en una
notificación emergente (RF-64 de `PRD.md`, vía el módulo de notificaciones existente).

**Input validation**
- Monto: mismas reglas que `updateExpenseBodySchema` (Block 1) aplicadas vía `use-field-validation.ts`
  (Block 10) — positivo, máximo 2 decimales, tope 999999999.99.
- Lugar: 1 a 200 caracteres.
- Fecha: no futura, no anterior al piso de retroactividad de 12 meses.
- Descripción (Loop 2): 0 a 300 caracteres — a diferencia de Lugar, vacía es válida (campo opcional).
- Categoría: sólo valores presentes en la lista que devuelve `GET /categories` (Block 6) — el
  `select.tsx` (Block 9) no permite construir un valor arbitrario.

**Error handling**
- El `PATCH` devuelve 4xx/5xx → notificación de error emergente (RF-64 de `PRD.md`), el diálogo
  permanece abierto con los valores que el usuario ya había editado (no se pierden).
- Un campo inválido (validado por Block 10) → error inline junto al campo, envío deshabilitado hasta
  que se corrija.

**Required tests**
- [ ] precarga Monto/Lugar/Fecha/Categoría/Descripción vigentes — AC-08
- [ ] envía sólo los campos modificados (o todos, según diseño final del form) al `PATCH`
- [ ] cierra el diálogo tras un guardado exitoso — AC-08
- [ ] muestra el error de validación de un campo en cuanto pierde el foco (Block 10)
- [ ] muestra una notificación de error si el `PATCH` falla, sin cerrar el diálogo
- [ ] editar Descripción y guardar envía el nuevo valor en el `PATCH` — AC-11
- [ ] vaciar Descripción y guardar envía `description: ""` en el `PATCH` — AC-11
- [ ] una Descripción de más de 300 caracteres muestra error inline y deshabilita el envío — AC-12

**Completion criterion**
`pnpm --filter @ggasia/web test expense-edit-dialog` pasa, incluyendo los 8 casos arriba.

## Block 12 — Triggers de edición/eliminación en la lista

**Files**
- `apps/web/src/components/expense-row.tsx` (modified) — agrega botones de editar/eliminar y props `onEdit`/`onDelete`.
- `apps/web/src/components/expense-row.test.tsx` (modified).
- `apps/web/src/components/expense-list.tsx` (modified) — dueño del estado de edición/eliminación, monta `expense-edit-dialog.tsx` y `confirm-dialog.tsx` una sola vez.
- `apps/web/src/components/expense-list.test.tsx` (modified).

**Logic**
`expense-row.tsx` se mantiene presentacional: recibe `onEdit`/`onDelete` como callbacks, sin estado
propio de diálogos. `expense-list.tsx` extiende su `ListState` existente con qué gasto se está
editando/eliminando, monta `expense-edit-dialog.tsx` (Block 11) y `confirm-dialog.tsx` (Block 8) UNA
sola vez a nivel de lista (no una instancia por fila). Al confirmar la eliminación, llama
`apiRequest(`/expenses/${id}`, {method: "DELETE"})`. Refleja la mutación exitosa (edición o
eliminación) en la lista de inmediato (RF-68 de `PRD.md`) y dispara una notificación de éxito breve
vía el módulo de notificaciones existente (`notify()`, nunca `toast.add` directo desde el
componente — `AGENTS.md`) (RF-80 de `PRD.md`). **No envuelve el `<ul>` existente en un contenedor de
scroll propio** al agregar los botones de acción (`AGENTS.md`: "Do not put lists inside their own
scrolling containers" — señalado como WARN por `daw-arch-auditor`, verificar explícitamente en este
bloque).

**Error handling**
- El `DELETE` devuelve 4xx/5xx → notificación de error emergente (RF-64 de `PRD.md`), el gasto
  permanece en la lista sin cambios (no se remueve optimísticamente antes de confirmar el 204).
- Un error del `PATCH` disparado desde `expense-edit-dialog.tsx` (Block 11) ya lo maneja ese
  componente — `expense-list.tsx` sólo reacciona a un guardado exitoso para reflejar el cambio.

**Required tests**
- [ ] cada fila renderiza un botón de editar y uno de eliminar
- [ ] click en editar abre `expense-edit-dialog.tsx` precargado con ese gasto
- [ ] click en eliminar abre `confirm-dialog.tsx` con el nombre de ese gasto
- [ ] confirmar la eliminación llama al `DELETE` y quita el gasto de la lista
- [ ] cancelar la confirmación de eliminación NO llama al `DELETE` y el gasto permanece en la lista sin cambios — AC-06
- [ ] si el `DELETE` falla, muestra una notificación de error y el gasto permanece en la lista
- [ ] una edición exitosa actualiza la fila correspondiente en la lista sin recargar
- [ ] una mutación exitosa (edición o eliminación) dispara una notificación de éxito
- [ ] el `<ul>` de la lista no queda envuelto en un contenedor con scroll propio tras agregar los botones (test de regresión explícito para el WARN de `daw-arch-auditor`)

**Completion criterion**
`pnpm --filter @ggasia/web test expense-row expense-list` pasa, incluyendo los 9 casos arriba.

## Final verification

- `pnpm test` (suite completa del monorepo) pasa, incluyendo los ~84 tests nuevos/modificados de los
  12 bloques (Loop 2 suma ~11 tests: description en schema/repo/service/route/dialog + regresión de
  z-index del select).
- `pnpm -r typecheck` pasa (Stack de `AGENTS.md`).
- Todas las 12 AC de `prd-FEAT-005a.md` (AC-01 a AC-12) están cubiertas por al menos un test.
- Las 4 mitigaciones de `threat-FEAT-005a.md` (R1, R2, R3, R4) están implementadas y testeadas —
  R5 queda como riesgo aceptado, sin código que lo mitigue.
- `daw-security-sast` corre sin hallazgos abiertos antes del cierre de CODE.
