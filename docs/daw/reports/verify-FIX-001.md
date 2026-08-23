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
