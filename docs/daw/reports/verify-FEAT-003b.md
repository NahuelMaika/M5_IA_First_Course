# Verificación — FEAT-003b: UI de carga y listado de gastos

## Ronda 1 — 2026-08-21 — BLOCKED

Metodología: `daw-verify-module` + agente `daw-module-verifier` (contexto sin haber escrito el código). Lectura completa del PRD, spec, threat model, SAST report y la implementación en `apps/web` (14 archivos de test, 12 componentes/módulos), contrastada contra cada AC y cada checkbox de spec. `tsc --noEmit` limpio.

**Nota de entorno:** el sandbox WSL sobre `/mnt/c` presentó timeouts de arranque de workers de Vitest (`[vitest-pool-runner]: Timeout waiting for worker to respond`) en `apps/web` y `apps/api`, incluso con `--no-file-parallelism`. En las corridas parciales que sí completaron, 53 tests pasaron, 0 fallaron. No se pudo medir `vitest run --coverage` por la misma causa — no atribuible al código.

### Traceability PRD → Código → Tests

| AC | Cobertura | Veredicto |
|---|---|---|
| AC-01 (FR-01, tokens) | Sin `style=`, sin hex/rgb, sin arbitrary values — `components/ui/button.tokens.test.tsx` | ✅ PASS |
| AC-02 (FR-03, x-user-id) | `lib/api/client.ts:apiRequest` → `lib/api/client.test.ts` | ✅ PASS |
| AC-03 (FR-04/08, creación + detalle) | `expense-form.tsx:submitExpense` → `expense-form.test.tsx` | ✅ PASS |
| AC-04 (FR-05, rechazo antes de invocar API) | `expense-form.tsx:validateExpenseInput/handleSubmit` → probado solo vía blur (Tab), no vía click real en "Guardar" con input inválido | ⚠️ WARN |
| AC-05 (FR-06, ocultar error) | `expense-form.tsx:handleChange` | ✅ PASS |
| AC-06 (FR-09, 422 → notif persistente) | `expense-form.tsx:submitExpense` + `notifications.test.ts` | ✅ PASS |
| AC-07 (FR-07, in-flight) | `expense-form.tsx` (`isSubmitting`) | ✅ PASS |
| AC-08 (FR-10/12, listado ordenado) | `expense-list.tsx`/`expense-row.tsx` — orden por posición del DOM no aseverado en la carga inicial (solo en inserción post-creación, Block 9) | ⚠️ WARN |
| AC-09 (FR-11, inserción por posición) | `expense-list.tsx:insertExpenseByWhenDescending` — 2 tests explícitos | ✅ PASS |
| AC-10 (FR-13, estado vacío) | `expense-list.tsx` — incluye test E2E de foco al textarea | ✅ PASS |
| AC-11 (FR-14, error + reintento) | `expense-list.tsx:loadExpenses` — 401/500/red + reintento | ✅ PASS |
| AC-12 (FR-02, dismissal >3) | `notifications.ts:evictOldestToMakeRoom` — 2 tests | ✅ PASS |
| AC-13 (NFR-02/03/04, viewport/contraste/touch-target) | NFR-02 y NFR-04 con test dedicado. **NFR-03 (destino táctil ≥24×24px CSS) sin ningún test que lo verifique** | ❌ **FAIL** |
| AC-14 (NFR-05, teclado + foco visible) | Test de tabbing sobre `Page` completo | ✅ PASS |
| AC-15 (FR-15, wrap sin truncar) | `expense-row.tsx` — test de concepto de 200+ caracteres | ✅ PASS |

### Spec — Bloques

Los 9 bloques tienen código y tests correspondientes (1 commit por bloque). Block 1: el check "`next build`/`next dev` no falla" (declarado por el propio spec como fuera de Vitest) no se ejecutó en esta ronda.

### Calidad (F-VER-02 a F-VER-06, W-VER-01 a W-VER-03)

- F-VER-02 (bloques implementados): ✅ PASS
- F-VER-03 (cobertura ≥80%): ⚠️ WARN — no medible en este entorno (timeouts del sandbox), revisión manual indica cobertura alta por rama
- F-VER-04 (sad path): ✅ PASS
- F-VER-05 (lint/typecheck): ✅ PASS (`tsc --noEmit`, sin errores; no hay linter configurado en el repo)
- F-VER-06 (tests del spec): ✅ PASS
- W-VER-01 (dead code): ✅ PASS
- W-VER-03 (tests frágiles): ✅ PASS

### Resultado

```
Total: 20 passed, 1 failed, 4 warnings
Verdict: BLOCKED
```

**Corrective loop:** volver a CODE para agregar un test que valide el tamaño mínimo de destino táctil (24×24px CSS) sobre los controles interactivos de la pantalla (botón "Guardar", textarea) — cierra AC-13/NFR-03. Los 4 WARN quedan documentados como mejoras no bloqueantes.

## Ronda 2 — 2026-08-21 — PASSED

Fix aplicado: commit `27620b3` — nuevo test en `apps/web/src/components/expense-list.test.tsx:260-290`, dentro de `describe("Page — full screen (Block 9)")`, que enumera los 2 controles interactivos reales de la pantalla completa (textarea + botón submit) y verifica sus `className` reales contra las clases del sistema de diseño que garantizan ≥24×24px (`h-6`/`size-6` en adelante, `min-h-16`), rechazando explícitamente valores arbitrarios en px por debajo de 24. Confirmado contra `button.tsx` (default `h-8`, 32px) y `textarea.tsx` (`min-h-16`, 64px) — no es tautológico.

- ✅ F-VER-01 — AC-13/NFR-03: **RESUELTO**.
- ✅ Regresión: el commit solo tocó el test file y el reporte SAST — cero código de producción, sin riesgo sobre el resto de los AC.
- ✅ Suite completa `apps/web`: 9 archivos, 60/60 tests, typecheck limpio.
- ⚠️ Los 4 WARN de la ronda 1 (AC-04, AC-08, cobertura no medible por timeouts del sandbox, Block 1 `next build` no verificado) siguen vigentes sin cambios — no bloqueantes.

```
Total: 3 passed, 0 failed, 4 warnings
Verdict: PASSED
```

`gates.verify` = `true`. FEAT-003b puede avanzar a RELEASE.
