# Verify — FEAT-005a (ABM de gastos: edición y eliminación)

Verificado por `daw-module-verifier` (agente sin autoría del código) contra
`prd-FEAT-005a.md`, `spec-FEAT-005a.md` y `threat-FEAT-005a.md`.

## Trazabilidad PRD → Código → Tests

| AC | Código | Test |
|----|--------|------|
| AC-01 | `expense-service.ts:updateExpense`, `routes/expenses.ts:handleUpdateExpense` | `expense-service.test.ts` "updates Amount/Place/Date... (AC-01)", `expenses.integration.test.ts:726` |
| AC-02 | `expense-repository.ts:findByIdForUser` (R1) | `expense-service.test.ts` "returns 'not_found' for another user's expense (AC-02)", integration:764 |
| AC-03 | `expense-service.ts:updateExpense` (preserva `categoryId` si no viene en el patch) | "preserves the current category when the patch only carries 'place' (AC-03)" |
| AC-04 | `expense-service.ts:updateExpense` (valida contra `findVisibleForUserWithId`) | "reassigns the category... (AC-04)", schema "accepts a PATCH with categoryId — AC-04" |
| AC-05 | `expense-service.ts:deleteExpense`, `routes:handleDeleteExpense` | "deletes the user's own expense (AC-05)", integration:796 |
| AC-06 | `confirm-dialog.tsx` + `expense-list.tsx:handleConfirmDelete` | `confirm-dialog.test.tsx` "closes without invoking onConfirm when cancelling", `expense-list.test.tsx:481` — AC-06 |
| AC-07 | `expense-service.ts:deleteExpense` (mismo `not_found` ambiguo) | "returns 'not_found' for another user's expense (AC-07)", integration:831 |
| AC-08 | `expense-edit-dialog.tsx` (preload + close-on-success) | `expense-edit-dialog.test.tsx:98,142` |
| AC-09 | `dialog.tsx` (Base UI nativo) | `dialog.test.tsx` "invokes onOpenChange(false) on Escape/outside click" |
| AC-10 | `confirm-dialog.tsx` | "shows the affected item's name", "puts initial focus on 'Eliminar'" |

Las 10 AC: ✅ PASS.

## Spec — 12 bloques

Blocks 1–12: todos los checkboxes de "Required tests" verificados presentes y pasando
(unitarios de `apps/api` y `apps/web` corridos en aislamiento por el verificador; suite
completa de `apps/api` con DB real corrida antes en esta sesión — ver Nota sobre DB abajo).
✅ PASS en los 12.

## Threat model

- ✅ R1 (IDOR) — `findByIdForUser` filtra `{id, userId}` en la misma query.
- ✅ R2 (categoryId ajeno) — validado contra `findVisibleForUserWithId`, 422 testeado en
  service+route+integración.
- ✅ R3 (límites RNF-07/08 en PATCH) — replicados en Zod, 9 tests del schema.
- ✅ R4 (fuga de error Prisma) — catch-log-genérico testeado en los 3 servicios/rutas.
- ℹ️ R5 (CSRF) — riesgo aceptado documentado (F-TM-04 satisfecho, sin código).

## Calidad

- ✅ F-VER-05: `pnpm -r typecheck` limpio en los 4 workspaces.
- ✅ W-VER-01: sin imports/código muerto detectado.
- ✅ W-VER-03: sin tests frágiles (sin timestamps/IDs hardcodeados, sin dependencia de orden).

## Nota sobre corridas con DB real

`daw-module-verifier` corrió con `DATABASE_URL_TEST` inalcanzable (la red cambió a mitad de
su ejecución, ver historial de la sesión) — le aparecieron como fallidos/saltados 19 tests
ajenos a este ticket (`auth-service`, `user-repository`, `prisma-schema`, `plugins/prisma`,
`seed`, todos preexistentes) y se saltearon `expense-repository.test.ts` (13) y
`expenses.integration.test.ts` (33) por no poder conectar.

Esos mismos archivos SÍ corrieron en verde antes en esta sesión, con la red de DB
disponible: `pnpm --filter @ggasia/api test` → **22 archivos, 200/200 tests passed**
(incluye `expense-repository.test.ts` y `expenses.integration.test.ts` completos). Se toma
esa corrida como evidencia válida de F-VER-01/F-VER-06 para los bloques de `apps/api` — no
hay ningún FAIL real originado en código de este ticket, en ninguna de las dos corridas.

## Cobertura (F-VER-03)

No se pudo generar un reporte de cobertura numérico con `vitest --coverage` sobre
`apps/api` en este momento por falta de acceso a la DB (misma causa de red). La cobertura
funcional (cada AC, cada bloque, cada mitigación con su test dedicado) está confirmada por
inspección directa de los 24 puntos de trazabilidad de arriba. Queda como pendiente
no bloqueante: generar el número exacto la próxima vez que haya acceso a la DB de test,
antes del release si se quiere el dato duro.

## Resultado (Loop 1)

```
Total: 24 passed, 0 failed, 2 warnings (cobertura numérica pendiente, TDD-evidence no confirmable por inspección de código final)
Result: PASSED
```

**PASSED** — 0 FAILs de F-VER-01 a F-VER-06.

## Verificación — Loop 2 (select z-index + Descripción en edición)

Verificado por `daw-module-verifier` contra `prd-FEAT-005a.md` v1.1 (FR-09/AC-11/AC-12),
`spec-FEAT-005a.md` (Spec loops: 2) y el código final del loop correctivo.

| AC | Código | Test |
|----|--------|------|
| AC-11 | `schemas/expense.ts:106`, `expense-repository.ts:update`, `routes/expenses.ts:158-159`, `expense-edit-dialog.tsx:339-354` | `expense.test.ts:118-128`, `expense-repository.test.ts:389-397`, `expenses.integration.test.ts:764-802`, `expense-edit-dialog.test.tsx:150-204` — verifican el valor persistido en Prisma, no solo el status code, incluyendo el caso "vaciar a \"\"" |
| AC-12 | `schemas/expense.ts:106` (`z.string().max(300)`) | `expense.test.ts:130-134`, `expenses.integration.test.ts:805-831` (400 + registro persistido intacto), `expense-edit-dialog.test.tsx:206-214` (error inline + submit deshabilitado) |
| Regresión z-index | `select.tsx:59` (`z-[60]`, vs. `z-50` de `dialog.tsx:24,31`) | `select.test.tsx:99-119` — Select montado dentro de un Dialog abierto, click real, compara numéricamente el z-index del popup contra el del diálogo (no un check superficial de presencia de clase) |

AC-01 a AC-10: sin regresión — siguen citadas por ID en `expense-edit-dialog.test.tsx`,
`expense-list.test.tsx`, `expense-row.test.tsx` y `expenses.integration.test.ts`; ningún test
eliminado o vaciado respecto al veredicto del loop 1.

Spec (5 bloques tocados por el loop 2): Block 1, 2, 6, 9, 11 — todos ✅ PASS.

Calidad: ✅ F-VER-05 (`pnpm -r typecheck`, 4/4 workspaces limpio), ✅ W-VER-01 (sin código
muerto en los diffs), ✅ W-VER-03 (sin tests frágiles — `select.test.tsx` usa comparación
numérica robusta del z-index, no un string literal).

### Ejecución real y nota sobre DB

El verificador corrió con la conexión a Supabase caída en el momento (`P1001: Can't reach
database server`) — reporta esto explícitamente como WARN y no lo asume como PASS, correcto.
`apps/web` sí corrió completo: 130/130 (1 timeout de worker por contención de recursos en
`client.test.ts`, aislado 4/4 verde). `pnpm -r typecheck` limpio.

Para `apps/api`, se toma como evidencia la corrida real de esta misma sesión, hecha DESPUÉS
del commit del loop 2 (`21092a6`) y CON la red de DB disponible: `pnpm --filter @ggasia/api
test` → **22 archivos, 207/207 tests passed**, incluyendo `expense-repository.test.ts`,
`services/expense-service.test.ts` y `expenses.integration.test.ts` con los casos nuevos de
AC-11/AC-12 ya en verde (tras corregir en el camino una aserción propia incorrecta sobre el
valor por defecto de `description` en un gasto recién creado por texto libre). Ningún FAIL
real originado en código de este loop, en ninguna corrida.

## Resultado (Loop 2)

```
Total: 14 passed, 0 failed, 1 warning (apps/api DB-connected run taken from earlier in this session, not from this verify pass — documented above)
Result: PASSED
```

**PASSED** — 0 FAILs de F-VER-01 a F-VER-06. `gates.verify` = `true`.
