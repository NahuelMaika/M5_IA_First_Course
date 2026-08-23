# Spec FEAT-004b: Registro, login y logout — UI

| Field | Value |
|-------|-------|
| Ticket | FEAT-004b |
| PRD | docs/daw/prd/prd-FEAT-004b.md |
| Tier | FEATURE |
| Date | 2026-08-23 |
| Spec loops | 0 |

## Summary

`apps/web/src/lib/api/client.ts` deja de adjuntar `x-user-id`/`NEXT_PUBLIC_STUB_USER_ID` y pasa a
enviar `credentials: "include"` en cada request, para que el browser adjunte la cookie httpOnly de
sesión que expone FEAT-004a. Esto requiere primero habilitar `credentials: true` en el CORS de
`apps/api` (Block 1) — sin eso el browser ignora `credentials: "include"` por ser origen cruzado
(`localhost:3000` vs `localhost:3001`), y AC-04 no puede cumplirse aunque el cliente esté bien
escrito. Se agregan pantallas de registro y login (`/register`, `/login`) y una acción de logout,
todas contra un módulo `apps/web/src/lib/api/auth.ts` que centraliza las tres llamadas a
`/auth/*`. La pantalla de carga de gastos (`/`) queda protegida: tanto `expense-list.tsx` (carga
inicial) como `expense-form.tsx` (envío de un gasto) redirigen a `/login` ante un 401 de
`apps/api`, vía un hook compartido que centraliza esa política — igual que `notifications.ts`
centraliza la política de dismissal (AGENTS.md).

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 4 |
| FR-02 | Block 5 |
| FR-03 | Block 6 |
| FR-04 | Block 2 |
| FR-05 | Block 4, Block 5 |
| FR-06 | Block 7, Block 8 |
| NFR-01 | Strategy: Block 3 (`auth.ts`) es el único módulo que construye URLs `/auth/*`; Blocks 4-8 solo lo importan, nunca llaman `fetch`/`apiRequest` directo |
| NFR-02 | Block 4, Block 5 (`type="password"` en los inputs de contraseña) |
| NFR-03 | Strategy: Blocks 4-8 muestran errores vía `notify()` (Block 4 de spec-FEAT-003b), nunca `window.alert`/`window.confirm` |

Gap adicional encontrado por el Impact Scan (no mapea a un FR/AC del PRD, es un requisito técnico
implícito para que FR-04 funcione): CORS sin `credentials` habilitado en `apps/api` → cubierto por
Block 1.

## Dependencies between blocks

Block 1 (CORS credentials, `apps/api`) no depende de nada y bloquea funcionalmente a todo lo
demás — sin él, la cookie nunca viaja, aunque el resto del código esté correcto. Block 2 (cliente
HTTP) depende de Block 1 solo en términos funcionales, no de compilación: sus tests unitarios
mockean `fetch` y no requieren CORS real. Block 3 (`auth.ts`) depende de Block 2 (usa
`apiRequest`). Block 4 (registro) y Block 5 (login) dependen de Block 3. Block 6 (logout) depende
de Block 3. Block 7 (proteger `expense-list.tsx`) y Block 8 (mismo tratamiento en
`expense-form.tsx`) dependen de Block 2 (ya no debe haber `x-user-id`) y comparten el hook que
Block 7 crea.

Orden sugerido: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

## Block 1 — CORS: habilitar credentials en apps/api

**Files**
- `apps/api/src/app.ts` (modified) — agrega `credentials: true` al registro de `@fastify/cors`.
- `apps/api/tests/cors.test.ts` (modified) — nuevo caso que verifica el header
  `Access-Control-Allow-Credentials`.

**Logic**

`@fastify/cors` (`apps/api/node_modules/@fastify/cors/index.js:15`) tiene `credentials: false` por
default y hoy no se sobreescribe (`app.ts:97-100` solo pasa `origin` y `methods`). Sin el header
`Access-Control-Allow-Credentials: true`, el browser descarta cualquier `Set-Cookie` de una
response cross-origin recibida con `credentials: "include"`, y tampoco adjunta la cookie en
requests posteriores. Cambio: `app.register(cors, { origin: webOrigin, methods: CORS_METHODS,
credentials: true })`. `webOrigin` ya es un string explícito (nunca `"*"`), que es requisito de
CORS para poder combinarse con `credentials: true`.

**Error handling**

Ninguno nuevo — este bloque solo agrega una opción de configuración a un plugin ya registrado.

**Required tests**

- [ ] `GET /expenses` (o cualquier response con `origin` configurado) incluye
  `Access-Control-Allow-Credentials: true` — valida el gap del Impact Scan.
- [ ] El test de preflight `OPTIONS /expenses` existente (línea 95 de `cors.test.ts`) sigue
  pasando sin modificaciones — confirma que agregar `credentials` no afecta la negociación de
  métodos ya testeada.

**Completion criterion**

`pnpm --filter api test -- cors.test.ts` pasa, incluyendo el nuevo caso.

## Block 2 — Cliente HTTP: cookie de sesión en vez de x-user-id

**Files**
- `apps/web/src/lib/api/client.ts` (modified) — elimina `x-user-id`/`NEXT_PUBLIC_STUB_USER_ID`,
  agrega `credentials: "include"`.
- `apps/web/src/lib/api/client.test.ts` (modified) — reescrito: reemplaza las aserciones sobre
  `x-user-id`/`NEXT_PUBLIC_STUB_USER_ID` por aserciones sobre `credentials: "include"`. Sin este
  cambio el archivo queda en rojo apenas se toca `client.ts` (gap del Impact Scan — el archivo
  testea exactamente el comportamiento que este bloque borra).
- `apps/web/.env.example` (modified) — quita la entrada `NEXT_PUBLIC_STUB_USER_ID` (ya no se lee).

**Logic**

`readRequiredEnvVar` deja de invocarse para `"NEXT_PUBLIC_STUB_USER_ID"` (se borra ese caso del
union type). `apiRequest` deja de hacer `headers.set("x-user-id", stubUserId)` y pasa
`credentials: "include"` a `fetch` (equivalente RequestInit, mismo objeto que ya arma con
`{ ...init, headers }`). `NEXT_PUBLIC_API_URL` sigue siendo la única env var requerida.

**Error handling**

Sin cambios respecto al bloque previo — sigue lanzando si `NEXT_PUBLIC_API_URL` falta, antes de
llamar `fetch`.

**Required tests**

- [ ] `apiRequest` construye la request con `credentials: "include"` — reemplaza el test que hoy
  verifica `x-user-id`.
- [ ] `apiRequest` NO adjunta el header `x-user-id` bajo ninguna circunstancia — prueba negativa
  explícita (AC-04 lo pide literalmente: `SHALL NOT adjuntar el header x-user-id`).
- [ ] Sad path: sigue lanzando antes de llamar `fetch` cuando falta `NEXT_PUBLIC_API_URL` (test
  existente, adaptado — ya no hace falta el caso de `NEXT_PUBLIC_STUB_USER_ID` faltante, esa env
  var deja de existir).

**Completion criterion**

`pnpm --filter web test -- client.test.ts` pasa; ningún llamador de `apiRequest` en el repo
referencia más `x-user-id` ni `NEXT_PUBLIC_STUB_USER_ID` (confirmado por el Impact Scan: solo
`client.ts`/`client.test.ts` los usaban).

## Block 3 — Módulo apps/web/src/lib/api/auth.ts

**Files**
- `apps/web/src/lib/api/auth.ts` (new) — `registerUser`, `loginUser`, `logoutUser`.
- `apps/web/src/lib/api/auth.test.ts` (new).

**Logic**

Único módulo permitido a construir requests hacia `/auth/*` (NFR-01, mismo criterio que Block 5 de
spec-FEAT-003b aplicó a `/expenses`). Cada función envuelve `apiRequest` (Block 2) y devuelve un
resultado discriminado por outcome, sin lanzar por un status de negocio (401/409/429/400 son
resultados válidos, no excepciones):

```ts
type RegisterResult =
  | { outcome: "created"; userId: string }
  | { outcome: "duplicate_email" }
  | { outcome: "validation_error" }
  | { outcome: "unknown_error" };

type LoginResult =
  | { outcome: "success"; userId: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "too_many_attempts" }
  | { outcome: "validation_error" }
  | { outcome: "unknown_error" };

type LogoutResult = { outcome: "success" } | { outcome: "unknown_error" };
```

`registerUser(email, password)` → `POST /auth/register`; mapea 201→`created`, 409→
`duplicate_email`, 400→`validation_error`, cualquier otro (incluida una excepción de `fetch`) →
`unknown_error`. `loginUser(email, password)` → `POST /auth/login`; mapea 200→`success`, 401→
`invalid_credentials`, 429→`too_many_attempts`, 400→`validation_error`, resto → `unknown_error`.
`logoutUser()` → `POST /auth/logout`; mapea 204→`success`, resto → `unknown_error`. Ningún status
se ignora: los cuatro (register) o cinco (login) status reales que devuelve `apps/api/src/routes/
auth.ts` quedan cubiertos explícitamente.

**API contract** *(consumido, no creado — documentado para trazabilidad)*
- `POST /auth/register` — body `{email, password}` → 201 `{userId}` / 409 `{error:
  "email_already_registered"}` / 400 `{error: "validation_error", details}`.
- `POST /auth/login` — body `{email, password}` → 200 `{userId}` / 401 `{error:
  "invalid_credentials"}` / 429 `{error: "too_many_attempts"}` / 400 `{error: "validation_error",
  details}`.
- `POST /auth/logout` — sin body → 204 sin body.

**Error handling**

Un `fetch` rechazado (falla de red) se trata igual que cualquier status no mapeado:
`unknown_error`. Ninguna función parsea el body de una response 4xx/5xx más allá de discriminar
por `status` — no hace falta leer `details` de un 400 para esta UI (los formularios validan
email/password del lado cliente antes de enviar, ver Block 4/5).

**Required tests**

- [ ] `registerUser` mapea 201/409/400/status-inesperado a su outcome correspondiente.
- [ ] `loginUser` mapea 200/401/429/400/status-inesperado a su outcome correspondiente.
- [ ] `logoutUser` mapea 204/status-inesperado a su outcome correspondiente.
- [ ] Las tres funciones devuelven `unknown_error` cuando `apiRequest` rechaza (falla de red), sin
  dejar la excepción sin capturar.

**Completion criterion**

`pnpm --filter web test -- auth.test.ts` pasa; ningún componente de Block 4/5/6 importa
`apiRequest` directamente para `/auth/*` (solo `auth.ts` lo hace).

## Block 4 — Pantalla de registro

**Files**
- `apps/web/src/app/register/page.tsx` (new).
- `apps/web/src/components/register-form.tsx` (new).
- `apps/web/src/components/register-form.test.tsx` (new).

**Logic**

Formulario controlado con dos campos (`email`, `password`, `password` con `type="password"` —
NFR-02), reutilizando el patrón de estilo por tokens de `textarea.tsx` (borde, foco, estados
`aria-invalid`) para los `<input>` en vez de definir estilos propios (AGENTS.md: "no screen defines
its own colors, typography or spacing").

**Input validation** (F-SPEC-09, resuelto por disambiguation Q1 de `/daw-validate-spec`: mismo
patrón que `validateExpenseInput`/RF-70/RF-81 de `expense-form.tsx` — form con `noValidate`, error
oculto mientras se tipea, revelado en blur o intento de submit, y limpiado apenas el valor vuelve a
ser válido):
- `email` — requerido; formato validado con `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (chequeo explícito en
  JS, no solo `type="email"` del browser, para controlar el texto del error igual que el resto del
  form). Sin longitud máxima propia: el único límite práctico es el `bodyLimit: 16384` (16 KB) que
  `apps/api/src/app.ts` ya aplica a todo el body.
- `password` — requerido, mínimo 8 caracteres (espeja `registerBodySchema.password` en
  `apps/api/src/schemas/auth.ts:15`). Mismo criterio que `email`: sin longitud máxima propia, límite
  práctico es el `bodyLimit` de `apps/api`.

Al enviar, si ambos campos pasan la validación, llama a `registerUser` (Block 3): `"created"` →
`router.push("/")` (AC-05, vía `useRouter` de `next/navigation` — componente `"use client"`, no
Server Action, porque la sesión la crea `apps/api` vía cookie cross-origin, no Next.js);
`"duplicate_email"` → `notify("error", "Ese email ya está registrado.")`; `"validation_error"` →
`notify("error", "Revisá el email y la contraseña (mínimo 8 caracteres).")`; `"unknown_error"` →
mensaje genérico, mismo texto que ya usa `expense-form.tsx` (`GENERIC_ERROR_MESSAGE`). Loading
state (`isSubmitting`) deshabilita el botón de submit, mismo patrón que `expense-form.tsx`.

**Error handling**

Errores de validación client-side (email con formato inválido, password <8 caracteres) bloquean el
submit antes de llamar `registerUser` — no generan un status HTTP, se resuelven íntegramente en el
form. Ver mapeo de outcomes de `registerUser` arriba — cubre los cuatro outcomes sin dejar ninguno
sin mensaje.

**Required tests**

- [ ] Muestra el error de formato en blur cuando el email no matchea el patrón, sin llamar
  `registerUser` — valida el input validation de arriba.
- [ ] Muestra el error de longitud en blur cuando el password tiene menos de 8 caracteres, sin
  llamar `registerUser`.
- [ ] Envío exitoso con email y password válidos: llama `registerUser` con esos valores y redirige
  a `/` — valida AC-01, AC-05.
- [ ] `duplicate_email` muestra el mensaje específico, sin redirigir.
- [ ] `validation_error` (400 de la API) muestra el mensaje específico, sin redirigir — camino
  distinto de la validación client-side de arriba, ejercitado igual mockeando `registerUser`.
- [ ] `unknown_error` (incluida una falla de red) muestra el mensaje genérico, sin redirigir.
- [ ] El input de contraseña tiene `type="password"` — valida NFR-02.

**Completion criterion**

`pnpm --filter web test -- register-form.test.tsx` pasa; `/register` es alcanzable y el formulario
crea una cuenta contra `apps/api` real en un smoke test manual.

## Block 5 — Pantalla de login

**Files**
- `apps/web/src/app/login/page.tsx` (new).
- `apps/web/src/components/login-form.tsx` (new).
- `apps/web/src/components/login-form.test.tsx` (new).

**Logic**

Mismo patrón que Block 4, contra `loginUser`: `"success"` → `router.push("/")` (AC-05);
`"invalid_credentials"` → `notify("error", "Email o contraseña incorrectos.")`; nunca revela cuál
de los dos es incorrecto (mismo criterio que AGENTS.md ya exige para el login del lado API: "no
leave messages that reveal whether an email is registered"); `"too_many_attempts"` →
`notify("error", "Demasiados intentos. Probá de nuevo en unos minutos.")`; `"validation_error"` →
mensaje de formato inválido; `"unknown_error"` → mensaje genérico. Incluye un link a `/register`
(y viceversa en Block 4) para que ambas pantallas sean alcanzables entre sí sin depender de
navegación manual por URL.

**Input validation** (F-SPEC-09, misma resolución que Block 4): mismo componente de validación de
`email` que Block 4 (formato, blur, sin longitud máxima propia). `password` — **solo requerido, sin
mínimo de 8** — espeja a propósito la asimetría de `apps/api/src/schemas/auth.ts:18-21`
(`loginBodySchema.password` no aplica el mínimo de registro: exigir 8 acá filtraría, vía un 400 en
vez del 401 uniforme, si un password histórico o de test es corto pero por lo demás correcto —
mismo razonamiento que ya está documentado en ese archivo).

**Error handling**

Errores de validación client-side (email con formato inválido, password vacío) bloquean el submit
antes de llamar `loginUser`. Ver mapeo de outcomes arriba — cubre los cinco outcomes de `loginUser`.

**Required tests**

- [ ] Muestra el error de formato en blur cuando el email no matchea el patrón, sin llamar
  `loginUser`.
- [ ] Muestra el error de campo requerido en blur cuando el password está vacío, sin llamar
  `loginUser` — y NO lo hace para un password de menos de 8 caracteres pero no vacío (prueba
  negativa que confirma que login no hereda el mínimo de 8 de Block 4).
- [ ] Envío exitoso: llama `loginUser` y redirige a `/` — valida AC-02, AC-05.
- [ ] `invalid_credentials` muestra un mensaje genérico (no distingue email inexistente de
  password incorrecto).
- [ ] `too_many_attempts` muestra su mensaje específico.
- [ ] `validation_error` (400 de la API) muestra su mensaje específico, sin redirigir.
- [ ] `unknown_error` (incluida una falla de red) muestra el mensaje genérico, sin redirigir.
- [ ] El input de contraseña tiene `type="password"`.

**Completion criterion**

`pnpm --filter web test -- login-form.test.tsx` pasa; `/login` es alcanzable y loguea contra
`apps/api` real en un smoke test manual, dejando la cookie de sesión seteada (verificable en
devtools).

## Block 6 — Logout

**Files**
- `apps/web/src/components/logout-button.tsx` (new).
- `apps/web/src/components/logout-button.test.tsx` (new).
- `apps/web/src/app/page.tsx` (modified) — monta `<LogoutButton />` en la pantalla de carga de
  gastos.

**Logic**

Botón que invoca `logoutUser()` (Block 3) al click. `"success"` → `router.push("/login")` (AC-03).
`"unknown_error"` → `notify("error", GENERIC_ERROR_MESSAGE)`, sin redirigir (si el logout falló en
el server, forzar la redirección dejaría al usuario creyendo que cerró sesión cuando la cookie
puede seguir siendo válida). Mismo patrón de `isSubmitting`/disabled que Blocks 4/5 mientras la
request está en curso.

**Error handling**

Cubre los dos outcomes de `logoutUser` (Block 3 ya no tiene más casos que esos dos).

**Required tests**

- [ ] Click exitoso: llama `logoutUser` y redirige a `/login` — valida AC-03.
- [ ] `unknown_error` muestra el mensaje genérico y NO redirige.

**Completion criterion**

`pnpm --filter web test -- logout-button.test.tsx` pasa; el botón es visible en `/` y cierra
sesión contra `apps/api` real en un smoke test manual (cookie limpiada, `GET /expenses` posterior
devuelve 401).

## Block 7 — Proteger expense-list.tsx (401 → redirect a login)

**Files**
- `apps/web/src/lib/auth/use-redirect-on-unauthorized.ts` (new) — hook compartido.
- `apps/web/src/lib/auth/use-redirect-on-unauthorized.test.ts` (new).
- `apps/web/src/components/expense-list.tsx` (modified).
- `apps/web/src/components/expense-list.test.tsx` (modified).

**Logic**

`useRedirectOnUnauthorized()` devuelve una función `(response: Response) => boolean`: si
`response.status === 401`, llama `router.push("/login")` (vía `useRouter` de `next/navigation`,
Block 4/5 ya establecen el patrón) y devuelve `true`; si no, devuelve `false` sin efecto. Centraliza
en un solo lugar la política "401 de `apps/api` implica sesión vencida → a `/login`", igual que
`notifications.ts` centraliza su propia política (AGENTS.md) — así Block 8 la reutiliza sin
duplicar la condición ni el destino del redirect.

`loadExpenses` en `expense-list.tsx` (línea 82-96 actual) gana un chequeo antes del `if
(!response.ok)` existente: si `handleUnauthorized(response)` devuelve `true`, retorna sin llamar
`setState({status: "error"})` — el redirect reemplaza el estado de error, no coexiste con él.
Todo status no-401 sigue el camino ya existente (`!response.ok` → error genérico).

**Error handling**

401 ya no cae en el estado `"error"` genérico (comentario actual en línea 11-13 de
`expense-list.tsx`, que hoy agrupa 401/500/network, deja de ser preciso para 401 específicamente —
se actualiza ese comentario). El resto de status no-2xx sigue exactamente igual que hoy.

**Required tests**

- [ ] `useRedirectOnUnauthorized`: con un `Response` de status 401, llama `router.push("/login")`
  y devuelve `true`.
- [ ] `useRedirectOnUnauthorized`: con cualquier otro status, no navega y devuelve `false`.
- [ ] `expense-list.tsx`: `GET /expenses` devuelve 401 → redirige a `/login`, sin mostrar el estado
  de error genérico — valida AC-06.
- [ ] `expense-list.tsx`: `GET /expenses` devuelve 500 (o falla de red) → sigue mostrando el estado
  de error genérico existente, sin redirigir (regresión del comportamiento actual).

**Completion criterion**

`pnpm --filter web test -- expense-list.test.tsx use-redirect-on-unauthorized.test.ts` pasa; un
intento directo de acceder a `/` sin cookie de sesión redirige a `/login` en un smoke test manual.

## Block 8 — Mismo tratamiento de 401 en expense-form.tsx

**Files**
- `apps/web/src/components/expense-form.tsx` (modified).
- `apps/web/src/components/expense-form.test.tsx` (modified).

**Logic**

Decisión confirmada por el usuario tras el gap que reportó el Impact Scan: si la sesión vence
mientras se está enviando un gasto, `expense-form.tsx` debe redirigir a `/login`, igual que
`expense-list.tsx` (Block 7), en vez de mostrar el mensaje genérico que agrupa 400/401/500
(comentario actual en línea 143 de `expense-form.tsx`, que se corrige). `submitExpense` (línea
118-151 actual) reutiliza `useRedirectOnUnauthorized()` (Block 7): antes del branch `if
(response.status === 422)`, un chequeo `if (handleUnauthorized(response)) return;` intercepta el
401 y redirige, sin pasar por `notify(GENERIC_ERROR_MESSAGE)`. 400/500 (y la falla de red del
`catch`) siguen sin cambios, agrupados en el mensaje genérico.

**Error handling**

401 dejó de agruparse con 400/500 (se actualiza el comentario de línea 143 para reflejar el nuevo
alcance: "400/500 — generic message; 401 handled separately, see Block 8"). El resto del manejo de
errores de `submitExpense` (422, catch de red) no cambia.

**Required tests**

- [ ] `submitExpense`: `POST /expenses` devuelve 401 → redirige a `/login`, sin llamar `notify`.
- [ ] `submitExpense`: 400/500/falla de red siguen mostrando el mensaje genérico existente, sin
  redirigir (regresión).
- [ ] 422 sigue leyendo `reason` del body y mostrando el mensaje mapeado (regresión — este camino
  no lo toca este bloque).

**Completion criterion**

`pnpm --filter web test -- expense-form.test.tsx` pasa; enviar un gasto con una cookie de sesión
inválida/vencida redirige a `/login` en un smoke test manual, en vez de mostrar el error genérico.

## Final verification

- Ningún archivo de `apps/web/src` referencia `x-user-id` ni `NEXT_PUBLIC_STUB_USER_ID` (grep
  limpio, confirmado por el Impact Scan como la única superficie que los usaba).
- `pnpm --filter api test` y `pnpm --filter web test` pasan completos (suite entera, no solo los
  archivos tocados por este spec).
- Flujo manual end-to-end: registro → redirige a `/` → cerrar sesión (logout) → `/` sin sesión
  redirige a `/login` → login → vuelve a `/` → cargar un gasto funciona con la cookie de sesión (no
  con `x-user-id`) → verificar en devtools que la cookie de sesión viaja en cada request hacia
  `apps/api` y que `x-user-id` no aparece en ningún request.
