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

## Resultado

```
Total: 24 passed, 0 failed, 2 warnings (cobertura numérica pendiente, TDD-evidence no confirmable por inspección de código final)
Result: PASSED
```

**PASSED** — 0 FAILs de F-VER-01 a F-VER-06. `gates.verify` = `true`.
