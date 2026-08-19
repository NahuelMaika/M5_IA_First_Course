# Verify Report — FEAT-001b (Motor de extracción de campos del gasto)

PRD: `docs/daw/prd/prd-FEAT-001b.md` (14 FR, 6 NFR, 28 AC)
Spec: `docs/daw/specs/spec-FEAT-001b.md` (10 blocks)
Threat model: `docs/daw/security/threat-FEAT-001b.md`
SAST: `docs/daw/security/sast-FEAT-001b.md`

## Run 1 — 2026-08-19 13:36 — BLOCKED

Verdict: **BLOCKED** — FAILs: 2 | WARNs: 3 | PASSes: 9

- **F-VER-01 FAIL (AC-08):** `pagué 3000 de nafta # ayer` daba Lugar `nafta #` en vez de `nafta`
  (normativo en `kb.md:318`). Un `#` suelto que no forma marcador válido no era descartado por
  `stripFillerWords`, y sobrevivía en Lugar/Nombre. Ningún test lo cubría end-to-end: `category-marker.test.ts`
  solo probaba `extractCategoryMarker` aislada, y `parse-expense.test.ts` no tenía el caso exacto de AC-08.
- **F-VER-04 WARN:** falta sad-path específico para la interacción "`#` suelto + Lugar".
- **W-VER-01 WARN:** tipo `ReferenceDate` (`types.ts:97`) exportado sin uso en ningún lado del paquete.
- **TDD evidence WARN:** sin reporte de implementador para reconstruir "tests fallando antes" de los
  10 blocks originales (se retomó la sesión tras una compactación).

27/28 AC pasaban; los blocks 1-10 estaban implementados; cobertura y typecheck ya cumplían.

**Acción:** corrective loop VERIFY → CODE (ver `.daw-state.json` history, entrada
`2026-08-19T13:43:00Z`). No se corrigió código en VERIFY.

## Corrección aplicada en CODE

Commit `dd4affc` — `packages/domain/src/filler-words.ts`: nueva función `isBareMarkerSymbol`
(`/^[#$]+$/`) que descarta cualquier token que sea exclusivamente `#`/`$` en `stripFillerWords`,
sin tocar las 2 listas cerradas de kb.md (`SPENDING_VERB_WORDS`, `CONNECTOR_WORDS`). Extendida al
`$` suelto por el mismo defecto estructural (confirmado en `amount.ts`). 5 tests nuevos con
evidencia TDD documentada (fallando antes / pasando después). Revisado y aprobado por
`daw-module-verifier` y `daw-arch-auditor` antes de commitear. Re-cierre de CODE:
`daw-test` PASSED (193 tests) + `daw-security-sast` re-scan PASSED (commit `ee664c7`).

## Run 2 — 2026-08-19 13:59 — PASSED

Verdict: **PASSED** — FAILs: 0 | WARNs: 2 | PASSes: 34

### Trazabilidad AC → Test (28/28)

| AC | Código | Test | Veredicto |
|---|---|---|---|
| AC-01 | separator.ts | separator.test.ts | ✅ |
| AC-02 | separator.ts | separator.test.ts | ✅ |
| AC-03 | separator.ts | separator.test.ts | ✅ |
| AC-04 | temporal.ts | temporal.test.ts | ✅ |
| AC-05 | temporal.ts | temporal.test.ts | ✅ |
| AC-06 | temporal.ts | temporal.test.ts | ✅ |
| AC-07 | category-marker.ts | category-marker.test.ts | ✅ (sin regresión) |
| AC-08 | filler-words.ts (`isBareMarkerSymbol`) | filler-words.test.ts + parse-expense.test.ts (E2E) | ✅ **corregido** |
| AC-09 | numerals.ts | numerals.test.ts | ✅ |
| AC-10 | numerals.ts | numerals.test.ts | ✅ |
| AC-11 | amount.ts | amount.test.ts | ✅ |
| AC-12 | amount.ts | amount.test.ts | ✅ |
| AC-13 | amount.ts | amount.test.ts | ✅ |
| AC-14 | filler-words.ts | filler-words.test.ts | ✅ (sin regresión) |
| AC-15 | parse-expense.ts | parse-expense.test.ts | ✅ |
| AC-16 | parse-expense.ts | parse-expense.test.ts | ✅ |
| AC-17 | parse-expense.ts | parse-expense.test.ts | ✅ |
| AC-18 | amount.ts | amount.test.ts | ✅ |
| AC-19 | amount.ts | amount.test.ts | ✅ |
| AC-20 | filler-words.ts | filler-words.test.ts | ✅ (sin regresión) |
| AC-21 | temporal.ts | temporal.test.ts | ✅ |
| AC-22 | temporal.ts | temporal.test.ts | ✅ |
| AC-23 | parse-expense.ts + limits.ts | parse-expense.test.ts | ✅ |
| AC-24 | parse-expense.ts | parse-expense.test.ts | ✅ |
| AC-25 | filler-words.ts | invariant.test.ts | ✅ |
| AC-26 | package.json + vitest.config.ts | purity.test.ts + coverage.test.ts | ✅ |
| AC-27 | parse-expense.ts | performance.test.ts | ✅ |
| AC-28 | amount.ts | amount.test.ts | ✅ |

### Reglas

| Regla | Veredicto |
|---|---|
| F-VER-01 (28 AC con test que pasa) | ✅ PASS |
| F-VER-02 (10 blocks implementados) | ✅ PASS |
| F-VER-03 (cobertura ≥80%, corrida real) | ✅ PASS — 98.18% stmts / 96.36% branch / 100% funcs / 98.06% lines |
| F-VER-04 (sad-path por función con input) | ✅ PASS — WARN anterior resuelto |
| F-VER-05 (typecheck sin errores) | ✅ PASS |
| F-VER-06 (tests del spec existen y pasan) | ✅ PASS |
| W-VER-01 (código muerto / imports sin usar) | ⚠️ WARN — `ReferenceDate` (`types.ts:97`) sigue sin uso, no bloqueante |
| W-VER-02 (cobertura 80-90%) | N/A — supera el 90% |
| W-VER-03 (tests frágiles) | ✅ PASS |

### TDD evidence

- Fix de AC-08 (commit `dd4affc`): evidencia completa, 5/5 tests failing-then-passing.
- Blocks 1-10 originales: sin evidencia histórica reconstruible (sesión retomada tras compactación) —
  WARN no bloqueante, ya señalado en Run 1.

## Veredicto final

**PASSED.** `gates.verify` = `true`. El ticket puede avanzar a RELEASE.
