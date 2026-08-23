# Verify FIX-001: Redirect a /login no dispara — apiRequest() falla en el navegador por env var no inlineada

| Field | Value |
|-------|-------|
| Ticket | FIX-001 |
| Tier | FIX |
| Fix-plan | docs/daw/specs/fix-FIX-001.md |
| RCA | docs/daw/specs/rca-FIX-001.md |
| Fecha | 2026-08-23 |
| Verificador | daw-module-verifier |

## 1. Fix-plan — pasos de la solución

**Paso 1** (`client.ts:16-26` del plan): reemplazar `readRequiredEnvVar(name)` con `process.env[name]`
por `readRequiredEnvVar()` sin parámetro, leyendo `process.env.NEXT_PUBLIC_API_URL` con notación de
punto literal.

- ✅ Verificado leyendo `apps/web/src/lib/api/client.ts:16-31` en el HEAD del branch: la firma es
  `function readRequiredEnvVar(): string`, sin parámetro `name`, y la línea 22 lee
  `process.env.NEXT_PUBLIC_API_URL` con notación de punto literal, exactamente como especifica el
  plan (incluyendo el mensaje de error idéntico).

**Paso 2** (`client.ts:38` del plan): actualizar el único call site de
`readRequiredEnvVar("NEXT_PUBLIC_API_URL")` a `readRequiredEnvVar()`.

- ✅ Verificado en `client.ts:43`: `const baseUrl = readRequiredEnvVar();` — sin argumento.

**Dependencias entre pasos:** el plan declara "ninguna" — consistente, es el mismo archivo y ambos
pasos se implementaron juntos en un único commit (`b6269ee`).

## 2. Regression test — reproducido independientemente

El fix-plan pide 3 ítems bajo "Tests":

1. **Regression test** verificando que con `NEXT_PUBLIC_API_URL` seteada, `apiRequest` construye la
   URL correctamente.
   - ✅ Ya existía (`client.test.ts:25-32`, "sends every request towards /expenses..."), y sigue
     pasando sin modificación tras el fix (confirmado — diff `7636ba3..b6269ee` sobre
     `client.test.ts` muestra que las 3 primeras pruebas no cambiaron ni una línea, solo se agregó un
     `describe` nuevo al final).

2. **Test sad-path existente** (`NEXT_PUBLIC_API_URL` no configurada → throw) sigue pasando sin
   modificación.
   - ✅ Confirmado — mismo diff, `client.test.ts:42-50` no cambió.

3. **Test de regresión específico** — el plan pide explícitamente "build real de producción
   (`next build`) del módulo, o inspección del bundle compilado, confirmando que el valor de
   `NEXT_PUBLIC_API_URL` SÍ aparece inlineado como literal en el output del cliente — esta es la
   prueba que el bug original nunca tuvo".
   - ❌ **No implementado tal como está especificado.** Lo que existe en su lugar
     (`client.test.ts:60-67`, describe `"readRequiredEnvVar source shape (FIX-001 regression
     guard)"`) es un test que lee el **código fuente** de `client.ts` con `readFileSync` y hace
     `expect(source).toMatch(/process\.env\.NEXT_PUBLIC_API_URL/)` /
     `.not.toMatch(/process\.env\[\s*name\s*\]/)`. Esto verifica el **patrón de acceso en el código
     fuente** (la precondición documentada para que Next.js inlinee), no el **resultado real del
     build** (que el valor efectivamente termine inlineado en el bundle del cliente). Son pruebas de
     naturaleza distinta: la que el plan pide es la que la RCA usó para confirmar la causa raíz
     ("inspeccionando directamente el bundle compilado en `apps/web/.next/dev/static/chunks/`"); la
     que se implementó es una proxy más débil que no ejercita el compilador de Next.js en absoluto.
     Si en el futuro Next.js cambia su heurística de inlineado (o se agrega alguna transformación
     intermedia), este test seguiría en verde sin que el bundle real contenga el valor.
   - Adicionalmente, el fix-plan tiene una referencia colgante: "Ver criterio de finalización" (línea
     85) — no existe ninguna sección "Criterio de finalización" en el documento (confirmado con
     `rg -i "criterio de finalización"` sobre el archivo completo). El plan referencia un criterio de
     aceptación que nunca se escribió.

### Reproducción independiente del bug (paso 2 de la consigna)

1. Se revirtió temporalmente `apps/web/src/lib/api/client.ts` a la versión pre-fix
   (`git show 7636ba3:apps/web/src/lib/api/client.ts`, commit padre de `b6269ee` — usa
   `readRequiredEnvVar(name)` con `process.env[name]`).
2. Se corrió `pnpm exec vitest run --pool=threads src/lib/api/client.test.ts` desde `apps/web`.
3. Resultado: **1 failed, 3 passed** — falló exactamente el nuevo test de regresión
   ("reads NEXT_PUBLIC_API_URL via a literal dot-notation access, not a dynamic/bracket one"), con
   el assert `expect(source).toMatch(/process\.env\.NEXT_PUBLIC_API_URL/)` rompiendo porque el
   código pre-fix no contiene esa notación literal. Los otros 3 tests pasaron igual (consistente con
   la RCA: bajo Node/Vitest, `process.env[name]` y `process.env.NEXT_PUBLIC_API_URL` evalúan
   idéntico — el bug solo es observable en el bundle real del navegador, no en la suite bajo Node).
4. Se restauró `client.ts` a su estado actual con `git checkout -- src/lib/api/client.ts`
   (confirmado con `git status --porcelain` → diff vacío).
5. Se corrió la suite de nuevo: **4 passed (4)** — los 3 tests originales más el nuevo regression
   guard, todos en verde.

- ✅ El regression test **existe**, **falla antes del fix** (reproducido) y **pasa después**
  (reproducido).
- ⚠️ Pero cubre un síntoma distinto del que el fix-plan pidió cubrir (ver ítem 3 arriba) — el test
  que efectivamente hubiera detectado la regresión contra el bundle compilado real no se escribió.

## 3. Suite completa

Corrida desde `apps/web`: `pnpm exec vitest run --pool=threads --maxWorkers=2`

```
Test Files  14 passed (14)
     Tests  103 passed (103)
  Duration  251.71s
```

- ✅ 103 passed, 0 failed. Sin regresiones en el resto de la suite.

## 4. Typecheck

`pnpm run typecheck` (→ `tsc --noEmit -p tsconfig.json`) desde `apps/web`: exit code 0, sin output de
errores.

- ✅ Typecheck limpio.

## 5. Sin cambios fuera de alcance

`git show --stat b6269ee` (commit del fix): únicamente
`apps/web/src/lib/api/client.test.ts` (+19) y `apps/web/src/lib/api/client.ts` (+13/-4/+9 netos).
`git status --porcelain` sobre `apps/web/src/lib/api/` tras restaurar: sin diferencias. Los artefactos
de PLAN/CODE (RCA, fix-plan, threat model, SAST) están en commits separados
(`5d12d74`, `a6639b8`, `d12a81d`) y no tocan código fuente.

- ✅ Sin cambios fuera del alcance declarado en el fix-plan.

## 6. Calidad

- ✅ Sin imports sin usar: `readFileSync`/`join` agregados en `client.test.ts` se usan en el nuevo
  `describe`; el parámetro `name` eliminado de `readRequiredEnvVar` no deja ningún residuo.
- ✅ Sin código muerto: el cambio es una simplificación (elimina el parámetro genérico que ya no
  tenía más de un valor posible), no agrega ramas ni funciones sin uso.
- ✅ Mensaje de error idéntico en texto y comportamiento, tal como declara la sección "Error
  handling" del plan.

## Veredicto

| Check | ID | Resultado |
|---|---|---|
| Paso 1 del fix-plan implementado | — | ✅ |
| Paso 2 del fix-plan implementado | — | ✅ |
| Regression test existe / falla antes / pasa después (reproducido) | F-SPEC-14 | ✅ |
| Test de regresión específico (build/bundle) del plan | F-VER-06 | ❌ FAIL — se implementó un test de patrón de código fuente en su lugar, no el test de build/bundle que el plan pidió explícitamente |
| Referencia a "criterio de finalización" inexistente en el plan | F-SPEC-05 (equivalente) | ⚠️ WARN — referencia colgante en el fix-plan |
| Suite completa sin regresiones | — | ✅ 103/103 |
| Typecheck | F-VER-05 | ✅ |
| Sin cambios fuera de alcance | F-VER-02 (equivalente) | ✅ |
| Sin código muerto / imports limpios | W-VER-01 | ✅ |

**Resultado: BLOCKED.** 1 FAIL bloqueante (F-VER-06 equivalente): el paso 3 de la sección "Tests" del
fix-plan pide explícitamente un test de build real o inspección de bundle compilado — la prueba que,
según el propio plan, "el bug original nunca tuvo y que hubiera evitado que pasara desapercibido". Lo
que se implementó es una prueba de patrón de texto sobre el código fuente, que verifica la
precondición documentada para el inlineado pero no el resultado real del build. Es una prueba válida
y útil, pero no la que el plan aprobado especificó, y no se solicitó ni registró ninguna modificación
al fix-plan para sustituirla (el plan no puede modificarse en CODE/VERIFY sin pasar por el loop
correctivo a PLAN).

**Siguiente paso:** volver a CODE para agregar el test de build/bundle especificado (por ejemplo,
correr `next build` sobre `apps/web` en un test/script y grep-ear el output compilado en
`.next/**` buscando el valor literal de `NEXT_PUBLIC_API_URL`, o un test equivalente que ejercite el
compilador real de Next.js), o — si el equipo decide que el test de patrón de fuente es una
alternativa aceptable — reabrir PLAN para actualizar `fix-FIX-001.md` con esa decisión documentada
explícitamente, antes de volver a correr VERIFY.

---

## Ronda 2 — re-verificación tras cerrar F-VER-06

| Field | Value |
|-------|-------|
| Fecha | 2026-08-23 |
| Verificador | daw-module-verifier |
| Motivo | Cierre de F-VER-06 (FAIL de ronda 1): el fix-plan pedía un test de build real de Next.js o inspección del bundle compilado; ronda 1 solo tenía un test de patrón de texto sobre el código fuente. |

### 1. Fix-plan — pasos de la solución

Sin cambios respecto a ronda 1 — `client.ts` no se modificó en esta ronda (solo se reescribió el
test de regresión y se agregó soporte condicional en `next.config.ts`).

- ✅ Paso 1 y paso 2 del fix-plan: siguen implementados idénticos a como se verificó en ronda 1
  (`client.ts:16-31` y `client.ts:43`).

### 2. Regression test (F-VER-06) — reproducido independientemente

Se leyó el test nuevo completo (`client.test.ts:54-100`, describe
`"readRequiredEnvVar bundle inlining (FIX-001 regression guard)"`) y `next.config.ts` completo.

- ✅ **Ejercita el compilador real de Next.js, no un proxy de texto.** El test corre
  `execFileSync(".../node_modules/.bin/next", ["build"], { env: { NEXT_BUILD_VERIFY_DIST_DIR,
  NEXT_PUBLIC_API_URL: probeUrl } })` — un `next build` de producción real — y luego lee los chunks
  JS compilados en `<distDir>/static/chunks/*.js` con `readFileSync`, buscando el valor literal de
  `probeUrl` (`http://fix-001-build-verify.invalid:4321`) inlineado en el bundle emitido. Esto es
  exactamente el tipo de prueba que el fix-plan pedía en el punto 3 de su sección "Tests" y que la
  RCA usó para confirmar la causa raíz original — ya no es una inspección del patrón de acceso en el
  código fuente.
- ✅ **Aislado de `.next`:** `next.config.ts:8-10` solo aplica `distDir:
  process.env.NEXT_BUILD_VERIFY_DIST_DIR` si esa variable está seteada — condicional, vía spread
  sobre un objeto vacío en el caso normal. En cualquier `next dev`/`next build` normal (sin esa env
  var) el override no se activa, así que es inerte por defecto (ver punto 4 abajo).

#### Reproducción independiente (obligatoria para esta ronda)

1. Se guardó el `client.ts` actual (post-fix, HEAD del branch) y se sobrescribió con la versión
   pre-fix (`git show feat/FEAT-004b-auth-ui:apps/web/src/lib/api/client.ts` —
   `readRequiredEnvVar(name)` con `process.env[name]`). Diff confirmado línea por línea antes de
   sobrescribir.
2. Se corrió `pnpm exec vitest run --pool=threads --testTimeout=150000 -t "bundle inlining"
   src/lib/api/client.test.ts` desde `apps/web` contra el código pre-fix.
   - **Resultado: 1 failed, 3 skipped** (el filtro `-t` solo corre el test de bundle inlining). El
     `next build` real corrió (≈50s) y falló en
     `expect(inlinedSomewhere).toBe(true)` → `AssertionError: expected false to be true` — el valor
     de `probeUrl` efectivamente NO aparece en ningún chunk del bundle compilado cuando el código
     usa acceso dinámico por corchetes. Esto reproduce el bug original contra el compilador real, no
     contra un mock.
   - Se confirmó que `.next-fix001-verify` NO quedó en disco tras el `afterEach` incluso con el test
     en rojo (`ls` → "No such file or directory").
3. Se restauró `client.ts` a su estado exacto post-fix (`cp` desde la copia guardada) y se confirmó
   `git diff` vacío sobre el archivo (sin residuo).
4. Se corrió la suite completa del archivo (`pnpm exec vitest run --pool=threads
   --testTimeout=150000 src/lib/api/client.test.ts`) contra el código restaurado.
   - **Resultado: 4 passed (4)** — los 3 tests originales del describe superior más el nuevo
     regression guard de build, todos en verde.
   - Se confirmó de nuevo que `.next-fix001-verify` NO quedó en disco tras la corrida exitosa.

- ✅ F-VER-06: el regression test **ejercita el compilador real de Next.js** (no un proxy),
  **falla antes del fix** (reproducido contra código pre-fix) y **pasa después** (reproducido contra
  código post-fix). Cierra el FAIL de ronda 1.
- ✅ F-SPEC-14 (fix con regression test) sigue cumplido, ahora con la prueba que el plan pedía.

### 3. Limpieza del distDir temporal

- ✅ Confirmado en ambos casos (build fallido y build exitoso): no queda ningún directorio
  `.next-fix001-verify` en `apps/web` tras la ejecución — el `afterEach(() => rmSync(distPath, {
  recursive: true, force: true }))` se ejecuta incondicionalmente, incluso cuando el `expect` del
  test falla.

### 4. `next.config.ts` inerte por defecto

- ✅ Confirmado por lectura: el spread condicional (`...(process.env.NEXT_BUILD_VERIFY_DIST_DIR ?
  {...} : {})`) solo aplica el override de `distDir` cuando esa variable de entorno está presente.
  Ninguna corrida normal (`pnpm dev`, `pnpm build`, CI, ni la suite completa de Vitest fuera de este
  test específico) setea `NEXT_BUILD_VERIFY_DIST_DIR`, así que en todo uso normal el objeto
  spreadeado es `{}` y `next.config.ts` se comporta exactamente como antes de este cambio — no
  requiere correr `next dev` para confirmarlo, es una propiedad estática del código.

### 5. Suite completa

`pnpm exec vitest run --pool=threads --maxWorkers=2 --testTimeout=150000` desde `apps/web`:

```
Test Files  14 passed (14)
     Tests  103 passed (103)
  Duration  296.45s
```

- ✅ 103 passed, 0 failed. Sin regresiones. (La suite creció en duración por el `next build` real
  del nuevo test, esperado y ya anticipado en la consigna de esta ronda.)

### 6. Typecheck

`pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) desde `apps/web`: sin output, exit limpio.

- ✅ Typecheck limpio (F-VER-05).

### 7. Alcance

`git diff --stat feat/FEAT-004b-auth-ui..HEAD -- apps/web/src apps/web/next.config.ts`:

```
apps/web/next.config.ts             | 10 ++++++-
apps/web/src/lib/api/client.test.ts | 52 +++++++++++++++++++++++++++++++++++++
apps/web/src/lib/api/client.ts      | 13 +++++++---
```

- ✅ Solo los 3 archivos esperados (más los artefactos de docs de PLAN/CODE/VERIFY, ya revisados en
  ronda 1 y en el SAST de ronda 2). Sin cambios fuera de alcance.

### 8. Calidad

- ✅ Sin código muerto: el cambio de esta ronda reemplaza un `describe` completo por otro; no deja
  funciones ni ramas huérfanas.
- ✅ Imports limpios en `client.test.ts`: `execFileSync`, `existsSync`, `readFileSync`, `readdirSync`,
  `rmSync`, `join` — los 6 se usan efectivamente en el nuevo describe (confirmado con `rg`).
- ✅ No es un test frágil en el sentido de W-VER-03 (orden de ejecución, estado global o valores
  hardcodeados): que dependa de correr `next build` real (filesystem/tiempo) es inherente a lo que
  el fix-plan pidió verificar — el propio RCA identificó que solo el compilador real puede probar
  esto — y no una debilidad de diseño del test. No se marca como WARNING por ese motivo.

### Referencia colgante del fix-plan (heredada de ronda 1)

- ⚠️ W-SPEC-05 (equivalente) sigue presente sin resolver: "Ver criterio de finalización" en
  `fix-FIX-001.md:85` sigue sin sección correspondiente en el documento. No bloquea (es un WARNING,
  no repite el FAIL de ronda 1) y no forma parte del alcance de esta re-verificación, que se limitó
  a cerrar F-VER-06.

### Veredicto ronda 2

| Check | ID | Resultado |
|---|---|---|
| Regression test ejercita el compilador real de Next.js | F-VER-06 | ✅ (cerrado) |
| Falla antes del fix, reproducido contra `next build` real | F-VER-06 | ✅ |
| Pasa después del fix, reproducido contra `next build` real | F-VER-06 | ✅ |
| Limpieza del distDir temporal (ambos casos) | W-VER-01 (equivalente) | ✅ |
| `next.config.ts` inerte por defecto | — | ✅ |
| Suite completa sin regresiones | — | ✅ 103/103 |
| Typecheck | F-VER-05 | ✅ |
| Alcance confinado a los 3 archivos esperados | F-VER-02 (equivalente) | ✅ |
| Sin código muerto / imports limpios | W-VER-01 | ✅ |
| Test no frágil pese a depender de filesystem/build | W-VER-03 | ✅ (no aplica) |
| Referencia colgante "criterio de finalización" en el plan | — | ⚠️ WARN (heredado, no bloqueante) |

**Resultado: PASSED.** El FAIL de ronda 1 (F-VER-06) se cerró: el nuevo test corre un `next build`
de producción real y verifica el bundle compilado emitido, reproducido de forma independiente
fallando contra el código pre-fix y pasando contra el código post-fix. Sin regresiones en la suite
completa (103/103), typecheck limpio, alcance confinado a los archivos declarados. Queda 1 WARNING
no bloqueante heredado (referencia colgante en el fix-plan) que no requiere una nueva ronda de
VERIFY.

**Siguiente paso:** avanzar a RELEASE.
