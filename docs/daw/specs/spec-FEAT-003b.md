# Spec FEAT-003b: UI de carga y listado de gastos

| Field | Value |
|-------|-------|
| Ticket | FEAT-003b |
| PRD | docs/daw/prd/prd-FEAT-003b.md |
| Tier | FEATURE |
| Date | 2026-08-21 |
| Spec loops | 0 |

## Summary

Levanta `apps/web` desde cero (Next.js 16, React 19, Tailwind CSS 4 vía tokens CSS, shadcn/ui sobre
Base UI) y construye la pantalla de Gastos: un formulario de texto libre que crea gastos vía
`POST /expenses` (FEAT-002) y un listado que los lee vía `GET /expenses` (FEAT-003a), ambos
identificados con el stub `x-user-id` fijo por variable de entorno. El impact scan encontró que
`apps/api` no tiene CORS configurado — sin eso, ningún navegador puede llamar a la API desde
`apps/web`, así que este ticket también cierra ese hueco (Block 2), trazado a NFR-01 aunque no
tenga un FR propio en el PRD. Testing de componentes: Vitest + Testing Library + jsdom, primer
precedente de este tipo en el repo.

## Coverage: PRD → blocks

| Requirement | Covered by |
|---|---|
| FR-01 | Block 1, Block 3 |
| FR-02 | Block 4 |
| FR-03 | Block 5 |
| FR-04 | Block 6 |
| FR-05 | Block 6 |
| FR-06 | Block 6 |
| FR-07 | Block 7 |
| FR-08 | Block 7 |
| FR-09 | Block 7 |
| FR-10 | Block 8 |
| FR-11 | Block 9 |
| FR-12 | Block 9 |
| FR-13 | Block 8 |
| FR-14 | Block 8 |
| FR-15 | Block 9 |
| NFR-01 | Estrategia: Block 2 (CORS) elimina el único bloqueante de red entre `apps/web` y `apps/api`; sin llamadas adicionales del lado del cliente más allá de las dos ya medidas en FEAT-002/FEAT-003a. |
| NFR-02 | Estrategia: layout con CSS Grid/Flexbox y unidades relativas desde Block 3 (tokens compartidos); verificado a nivel de pantalla completa en Block 9 (AC-13, viewport 360px/1280px). |
| NFR-03 | Estrategia: tokens de espaciado de Block 3 fijan un mínimo de 24×24px CSS en todo control interactivo (botones, inputs); verificado a nivel de pantalla completa en Block 9 (AC-13). |
| NFR-04 | Estrategia: paleta de Block 3 pre-validada por contraste (WCAG AA) antes de usarse en ningún componente (test propio del Block 3). |
| NFR-05 | Estrategia: todo control interactivo es un elemento nativo (`button`, `textarea`) o un componente de Base UI (que ya expone foco visible y manejo de teclado), nunca un `div` con `onClick`; verificado por componente en Block 6 y a nivel de pantalla completa en Block 9 (AC-14). |

## Dependencies between blocks

Secuencial con una rama: **Block 1 → Block 2** (independiente, puede ir en paralelo a 1 pero se lista
después por orden de lectura) **→ Block 3 → Block 4 → Block 5 → Block 6 → Block 7 → Block 8 → Block 9**.

- Block 2 (CORS) es independiente de Block 1 — toca solo `apps/api`, no `apps/web`. Se hace temprano
  porque Block 5 en adelante necesita poder llamar a la API real desde el navegador.
- Block 3 depende de Block 1 (necesita `apps/web` levantado para instalar shadcn/ui).
- Block 4 depende de Block 3 (el módulo de notificaciones usa el `toast` de Base UI, instalado en 3).
- Block 5 depende de Block 1 (necesita el proyecto Next.js para leer variables de entorno).
- Block 6 depende de Block 3, 4 y 5 (formulario con tema, notificaciones y cliente API).
- Block 7 depende de Block 6 (extiende el formulario con el submit real) y Block 2 (CORS).
- Block 8 depende de Block 5 (cliente API) y Block 4 (notificaciones para el error de carga).
- Block 9 depende de Block 7 y Block 8 (conecta la creación con el listado).

## Block 1 — Bootstrap de `apps/web`

**Files**
- `apps/web/package.json` (nuevo) — integrado al workspace pnpm, siguiendo el patrón de
  `apps/api/package.json` (`name: "@ggasia/web"`, scripts propios, sin dependencias de workspace
  todavía).
- `apps/web/next.config.ts` (nuevo)
- `apps/web/tsconfig.json` (nuevo, extiende `tsconfig.base.json` de la raíz)
- `apps/web/vitest.config.ts` (nuevo) — `environment: "jsdom"`, primer precedente de testing de
  componentes en el repo.
- `apps/web/vitest.setup.ts` (nuevo) — importa `@testing-library/jest-dom`.
- `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx` (nuevos, placeholder)
- `package.json` (raíz, modificado) — sin cambios de script si `pnpm -r` ya cubre `apps/web`
  automáticamente vía el workspace; confirmar y ajustar `build:packages`/`test`/`dev` solo si hace
  falta filtrar.

**Logic**

Next.js 16 con App Router, TypeScript estricto (hereda `strict: true` de `tsconfig.base.json`,
igual que `apps/api`). `pnpm-workspace.yaml` ya incluye `apps/*`, así que `apps/web` se integra sin
tocar la configuración del workspace. Se agregan `vitest`, `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event` y `jsdom` como devDependencies — la
decisión de stack de testing (Vitest + Testing Library + jsdom) fue confirmada explícitamente por el
usuario ante la ausencia de precedente en el repo.

**Input validation**

N/A — este bloque no procesa input de usuario.

**Error handling**

- `next.config.ts` sin configuración de red hacia `apps/api` todavía (eso es Block 5) — un fallo de
  arranque de Next.js es un error de desarrollo, no un caso a manejar en runtime.

**Required tests**

- [ ] `apps/web` levanta (`next build` o `next dev` no falla) — verificado por CI/script, no un test
      de Vitest.
- [ ] `pnpm --filter @ggasia/web run test` corre sin archivos de test (placeholder) sin error de
      configuración — confirma que `vitest.config.ts` con `environment: "jsdom"` y el setup de
      `@testing-library/jest-dom` están bien armados antes de escribir componentes reales.

**Completion criterion**

`pnpm install` resuelve sin error, `apps/web` aparece en `pnpm -r list`, y un test placeholder con
`render(<div />)` de Testing Library pasa contra `jsdom`.

## Block 2 — CORS en `apps/api`

**Files**
- `apps/api/src/app.ts` (modificado) — registra `@fastify/cors`.
- `apps/api/package.json` (modificado) — agrega `@fastify/cors`.
- `apps/api/src/env.ts` (modificado) — agrega `WEB_ORIGIN` como variable requerida (Zod, sin
  trailing slash ni path, per la cicatriz de `AGENTS.md`).
- `apps/api/tests/cors.test.ts` (nuevo)

**Logic**

Hallazgo del impact scan: `apps/api` no tiene CORS configurado en ningún punto. Sin esto, todo
`fetch` desde `apps/web` (que corre en un puerto distinto en dev, y en un dominio distinto en
producción per `PRD.md` → Riesgos y Dependencias) es bloqueado por el navegador antes de llegar a la
API. `AGENTS.md` marca explícitamente la cicatriz: "no dejar `methods` sin declarar en
`@fastify/cors`: v11 default es `GET,HEAD,POST` y rompe PATCH/DELETE" — se declaran los métodos
explícitos que la API expone hoy (`GET`, `POST`) más los que el resto del PRD-001 va a necesitar
pronto (`PATCH`, `DELETE`), para no repetir este mismo hallazgo en el próximo ticket que agregue
edición de gastos.

`WEB_ORIGIN` es la única variable de entorno nueva: el origen exacto que `@fastify/cors` autoriza,
validado con Zod al arranque (mismo patrón que `DATABASE_URL`/`APP_TIMEZONE` en `env.ts`) — un
arranque sin esta variable aborta, no sirve con CORS abierto a cualquier origen.

**API contract**

No agrega un endpoint nuevo; modifica el comportamiento transversal de todos los existentes
(`POST /expenses`, `GET /expenses`): agrega los headers CORS (`Access-Control-Allow-Origin`,
`Access-Control-Allow-Methods`) a toda respuesta, y responde `OPTIONS` (preflight) sin pasar por
`authPreHandler`.

**Input validation**

- `WEB_ORIGIN`: string, debe ser una URL válida sin trailing slash ni path — mismo criterio que
  `PRD.md` exige para el propio despliegue de `apps/web`.

**Error handling**

- `WEB_ORIGIN` ausente o inválida al arranque → el proceso aborta (RNF-15 de `PRD.md`, ya vigente
  para toda variable requerida), sin atender ninguna solicitud.
- Una request desde un origen distinto de `WEB_ORIGIN` → el navegador la bloquea client-side
  (comportamiento estándar de CORS); no requiere código adicional en `apps/api`.

**Required tests**

- [ ] La respuesta de `GET /expenses` incluye el header `Access-Control-Allow-Origin` con el valor
      de `WEB_ORIGIN`.
- [ ] La respuesta incluye `Access-Control-Allow-Methods` con `GET` y `POST` explícitos (no el
      default de Fastify).
- [ ] Una request `OPTIONS` (preflight) a `/expenses` responde sin pasar por `authPreHandler` (no
      exige `x-user-id`).
- [ ] Sad path: el proceso aborta al arranque si `WEB_ORIGIN` está ausente o mal formada (trailing
      slash o con path).

**Completion criterion**

Los 4 tests pasan. Nota de precisión (encontrada en la verificación del bloque): con `origin` fijo
como string, `@fastify/cors` responde siempre `Access-Control-Allow-Origin: <WEB_ORIGIN>`, sin
comparar contra el `Origin` real del request — es el navegador quien bloquea la lectura de la
respuesta si su propio origen no coincide con ese valor, no el servidor quien omite el header. El
criterio real y verificable es que el header refleja exactamente `WEB_ORIGIN`, nunca un valor
derivado del request ni un wildcard.

## Block 3 — Tema compartido y shadcn/ui sobre Base UI

**Files**
- `apps/web/src/app/globals.css` (nuevo) — tokens CSS (color, tipografía, espaciado), sin
  `tailwind.config.js` (AGENTS.md).
- `apps/web/components.json` (nuevo) — configuración de shadcn/ui apuntando a Base UI.
- `apps/web/src/components/ui/` (nuevo) — componentes base instalados vía CLI de shadcn/ui: botón,
  input/textarea, toast (Base UI), skeleton/spinner.
- `apps/web/package.json` (modificado) — agrega `tailwindcss`, `tw-animate-css` (no
  `tailwindcss-animate`, per AGENTS.md), `@base-ui-components/react` (o el paquete equivalente de
  Base UI vigente), `class-variance-authority`, `clsx`, `tailwind-merge`.

**Logic**

Tokens de color pre-validados contra WCAG 2.1 AA (contraste ≥4.5:1 texto normal, ≥3:1 texto grande —
NFR-04) antes de fijarlos, y de espaciado con un mínimo de 24×24px CSS para todo destino táctil
(NFR-03). Un único archivo de tokens (`globals.css`) es la única fuente de verdad — ningún componente
de este ticket declara color, tipografía o espaciado por su cuenta (AC-01).

shadcn/ui se configura sobre Base UI, no Radix: no se instala `sonner` (el toast va por el
componente `toast` de Base UI) ni `tailwindcss-animate` (se usa `tw-animate-css`).

**Input validation**

N/A.

**Error handling**

N/A — configuración estática, sin runtime que pueda fallar.

**Required tests**

- [ ] Un componente de prueba que usa los tokens (ej. un botón) no declara ningún valor de color,
      tipografía o espaciado inline ni en su propio CSS — solo clases que resuelven a los tokens
      compartidos (verificado por inspección del CSS generado o por un lint de convención simple).
- [ ] Los pares de color texto/fondo de los tokens cumplen el contraste mínimo de WCAG AA —
      verificado con un test que calcula el ratio de contraste sobre los valores de token
      declarados (no requiere un navegador real).

**Completion criterion**

Los 2 tests pasan, `shadcn` puede instalar componentes nuevos sin error (`components.json` válido),
y no existe ningún `tailwind.config.js` en `apps/web`.

## Block 4 — Módulo de notificaciones emergentes

**Files**
- `apps/web/src/lib/notifications/` (nuevo) — el módulo centralizado de dismissal (funciones
  `notify`/`dismiss`/`getActiveNotifications` sobre el singleton `toast` de Base UI).
- `apps/web/src/lib/notifications/notifications.test.ts` (nuevo)
- `apps/web/src/app/layout.tsx` (modificado) — monta `<Toaster />` (instalado en Block 3, nunca
  montado hasta ahora). Sin esto, `notify()` actualiza su estado interno correctamente pero no
  renderiza nada visible — hallazgo de la implementación de este bloque, no anticipado al
  escribir la spec.

**Logic**

Un único módulo (no un componente ad-hoc por pantalla) que expone `notify(type, message)` y aplica
la política de dismissal: máximo 3 notificaciones simultáneas, descartando una de éxito antes que
una de error cuando hay que liberar lugar (FR-02, RF-67 de `PRD.md`). Ninguna pantalla ni componente
implementa su propia lógica de descarte — todas llaman a este módulo. Cada notificación de error
permanece visible hasta que la persona la descarta explícitamente; una de éxito es breve y se
autodescarta (RF-64, RF-66, RF-80 de `PRD.md`).

**Input validation**

- `type`: `"success" | "error"`, sin otros valores.
- `message`: string no vacío — un mensaje vacío no se muestra (previene notificaciones fantasma).

**Error handling**

- N/A — este módulo no realiza I/O; es estado de UI puro.

**Required tests**

- [ ] Con 3 notificaciones ya visibles, una cuarta de éxito entrante descarta la más vieja de éxito
      antes que cualquier error.
- [ ] Con 3 notificaciones visibles, todas de error, una cuarta de éxito no desplaza ninguna (no hay
      éxito que descartar) — comportamiento a definir explícitamente: se acumula un cuarto slot
      temporal o se descarta la de error más vieja. Fijado: descarta la de error más vieja solo si
      no hay ninguna de éxito disponible para liberar lugar primero.
- [ ] Una notificación de error no se autodescarta con el paso del tiempo; solo por acción explícita
      de la persona.
- [ ] Una notificación de éxito se autodescarta tras un tiempo fijo, sin acción de la persona.
- [ ] `message` vacío no agrega ninguna notificación visible.

**Completion criterion**

Los 5 tests pasan, y ningún otro archivo del repo (fuera de este módulo) implementa lógica de
descarte de notificaciones — verificado por inspección en la revisión de arquitectura de CODE.

## Block 5 — Cliente API con stub `x-user-id`

**Files**
- `apps/web/src/lib/api/client.ts` (nuevo) — wrapper de `fetch` que adjunta el header.
- `apps/web/.env.example` (nuevo) — documenta `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_STUB_USER_ID`.
- `apps/web/src/lib/api/client.test.ts` (nuevo)

**Logic**

Un módulo único (`apiClient`) que envuelve `fetch` y adjunta `x-user-id: ${STUB_USER_ID}` a toda
request hacia `/expenses`, sin exponer el header como campo editable en ningún formulario. El valor
por defecto documentado en `.env.example` es el usuario real de seed de `apps/api`
(`00000000-0000-4000-8000-000000000001`, `prisma/seed.ts`), para que el flujo funcione en dev sin
configuración adicional. La URL base de la API (`NEXT_PUBLIC_API_URL`) es la otra variable de
entorno — ambas con prefijo `NEXT_PUBLIC_` porque se leen desde el cliente (RF-03 exige que la
pantalla, no un route handler de servidor, dispare las requests).

**API contract**

No define un endpoint propio; es el cliente para `POST /expenses` y `GET /expenses` ya documentados
en Block 6/Block 8.

**Input validation**

N/A — no procesa input de usuario, solo adjunta configuración fija.

**Error handling**

- Si `NEXT_PUBLIC_API_URL` o `NEXT_PUBLIC_STUB_USER_ID` no están configuradas, el cliente lanza un
  error explícito y descriptivo al primer uso (fail-fast en dev), en vez de hacer requests a
  `undefined`.

**Required tests**

- [ ] Toda request que el cliente arma hacia `/expenses` incluye el header `x-user-id` con el valor
      configurado — sin que el llamador lo pase.
- [ ] Sad path: si `NEXT_PUBLIC_STUB_USER_ID` no está configurada, el cliente lanza antes de armar
      la request, no envía un header vacío o `"undefined"`.

**Completion criterion**

Los 2 tests pasan, y ningún componente de los bloques siguientes construye una URL o adjunta el
header manualmente — todos pasan por este cliente.

## Block 6 — Formulario de carga con validación

**Files**
- `apps/web/src/components/expense-form.tsx` (nuevo)
- `apps/web/src/components/expense-form.test.tsx` (nuevo)

**Logic**

Un único campo de texto libre (`textarea`, no `input`, para admitir frases largas) con un botón de
envío. Validación cliente antes de invocar la API: campo vacío o más de 500 caracteres se rechaza
localmente (RNF-07 de `PRD.md`), sin red de por medio. El error se muestra al perder el foco o al
intentar enviar — nunca mientras se escribe por primera vez — y se oculta apenas el valor pasa a ser
válido (RF-70, RF-81 de `PRD.md`). El mensaje de error está asociado al campo vía `aria-describedby`
para que un lector de pantalla lo anuncie, y el campo lleva `aria-invalid` cuando está en error
(RF-69 de `PRD.md`).

**API contract**

No invoca la API en este bloque — el submit real es Block 7. Este bloque deja el formulario listo
con su `onSubmit` como punto de extensión.

**Input validation**

- Campo de texto: requerido (no vacío tras `trim()`), máximo 500 caracteres (RNF-07 de `PRD.md`,
  mismo tope que `apps/api` aplica server-side — la validación cliente es una mejora de UX, no
  reemplaza al 400/422 del servidor).

**Error handling**

- Campo vacío al intentar enviar → mensaje "Escribí un gasto antes de guardar." (o equivalente),
  sin invocar la API.
- Más de 500 caracteres → mensaje "Máximo 500 caracteres." con un contador visible, sin invocar la
  API.

**Required tests**

- [ ] El campo vacío muestra el error al perder el foco, no mientras se escribe la primera letra.
- [ ] El campo con 501 caracteres muestra el error de longitud.
- [ ] Corregir el valor a uno válido oculta el error sin necesidad de un nuevo intento de envío.
- [ ] El mensaje de error está asociado al campo vía `aria-describedby`, y el campo tiene
      `aria-invalid="true"` mientras el error está visible.
- [ ] El botón de envío es alcanzable y operable solo con teclado (Tab + Enter/Space), con un
      indicador de foco visible.

**Completion criterion**

Los 5 tests pasan, y el formulario no realiza ninguna llamada de red en este bloque (verificado con
un mock de `fetch` que falla si se invoca).

## Block 7 — Submit, resultado interpretado y rechazo

**Files**
- `apps/web/src/components/expense-form.tsx` (modificado) — conecta el `onSubmit` al cliente de
  Block 5.
- `apps/web/src/lib/rejection-messages.ts` (nuevo) — mapeo de los 8 `reason` de rechazo del PRD-001
  a mensajes en español.
- `apps/web/src/components/expense-form.test.tsx` (modificado)
- `apps/web/src/lib/rejection-messages.test.ts` (nuevo)

**Logic**

Al enviar, invoca `POST /expenses` vía el cliente de Block 5. Mientras la request está en curso, el
botón muestra un indicador de progreso y queda deshabilitado (RF-62, RF-79 de `PRD.md`). La
respuesta 201 trae `{amount, place, when, category, categoryOrigin, description, name, type,
currency}` (sin `id` — confirmado contra `apps/api/src/routes/expenses.ts:58-68`): se muestra el
detalle interpretado (concepto/Nombre, monto, categoría, fecha) separado visualmente, con el monto
como dato de mayor peso visual (RF-71, RF-72 de `PRD.md`), y se limpia el campo.

Una respuesta 422 trae `{reason: <uno de 8 valores>}` (`empty_left_segment`,
`amount_indeterminate`, `amount_malformed`, `amount_zero`, `empty_place`, `future_date`,
`date_out_of_window`, `length_exceeded` — `packages/domain/src/types.ts`): se mapea a un mensaje en
español vía `rejection-messages.ts` y se muestra en una notificación de error (Block 4), sin crear
nada. Una respuesta 400 (`{error: "validation_error", details: [...]}`) —solo alcanzable si la
validación cliente del Block 6 se elude, ya que ese caso ya está cubierto localmente— se trata igual
que un 500: notificación de error genérica, no se intenta parsear `details`. Una respuesta 401 o 500
también se muestra como notificación de error genérica.

**API contract**

- Método + path: `POST /expenses` (ya existe, sin modificar).
- Request: `{ input: string }`.
- Response 201: `{amount: string, place: string, when: string, category: string, categoryOrigin:
  string, description: string, name: string, type: string, currency: string}`.
- Response 422: `{reason: string}` — uno de los 8 valores documentados arriba.
- Response 400: `{error: "validation_error", details: ZodIssue[]}`.
- Response 401: `{error: "unauthorized"}`.
- Response 500: `{error: "internal_error"}`.
- Auth: header `x-user-id`, adjuntado por el cliente de Block 5.

**Input validation**

Ya cubierta en Block 6 — este bloque no revalida, solo maneja las respuestas del servidor.

**Error handling**

- 422 → notificación de error con el mensaje mapeado del `reason`, campo de texto conservado (no se
  limpia, para que la persona pueda corregir sin reescribir).
- 400/401/500 → notificación de error genérica ("Ocurrió un error, intentá de nuevo." o
  equivalente), campo de texto conservado.
- Falla de red (sin respuesta del servidor) → mismo tratamiento que 500.

**Required tests**

- [ ] 201 con Monto y Lugar reconocibles muestra el detalle interpretado separado visualmente, con
      el monto como dato de mayor peso visual, y limpia el campo.
- [ ] Mientras la request está en curso, el botón muestra el indicador de progreso y queda
      deshabilitado; al resolver, vuelve a su estado normal.
- [ ] Cada uno de los 8 `reason` de rechazo produce el mensaje en español correspondiente (test
      parametrizado, uno por valor).
- [ ] 422 no limpia el campo de texto y no agrega nada al resultado interpretado.
- [ ] 400/401/500 muestran una notificación de error genérica sin intentar leer `reason` de la
      respuesta.
- [ ] Una falla de red (fetch rechaza) se trata igual que un 500.

**Completion criterion**

Los 6 tests pasan, y `rejection-messages.ts` cubre los 8 valores de `RejectionReason` sin ningún
`default` que enmascare un valor no mapeado (un valor no cubierto debe fallar el test, no caer en un
mensaje genérico silencioso).

## Block 8 — Listado: carga inicial, vacío y error

**Files**
- `apps/web/src/components/expense-list.tsx` (nuevo)
- `apps/web/src/components/expense-list.test.tsx` (nuevo)

**Logic**

Al montar la pantalla, pide `GET /expenses` (sin `limit` explícito, usa el default 50 del servidor)
vía el cliente de Block 5. Mientras carga, muestra un estado de carga; si la lista viene vacía,
muestra un mensaje explicativo en lenguaje llano, sin tratamiento visual de error, con una acción
que lleva el foco al formulario del Block 6 (RF-60, RF-61 de `PRD.md`). Si la request falla (401,
500, red), muestra el error en el lugar que ocuparía la lista, con un control de reintento que
repite la carga sin recargar la página (RF-65 de `PRD.md`).

**API contract**

- Método + path: `GET /expenses` (ya existe, sin modificar).
- Request: sin body, sin query param explícito (usa el default `limit=50`).
- Response 200: `{expenses: [{id, amount, place, when, category, categoryOrigin, description,
  name, type, currency}]}`.
- Response 401/500: mismos bodies genéricos que el POST.
- Auth: header `x-user-id`, adjuntado por el cliente de Block 5.

**Input validation**

N/A — sin input de usuario en este bloque (el `limit` queda en su default; no hay UI de paginación
en el alcance de este ticket).

**Error handling**

- 401/500/red → estado de error en el lugar de la lista, con botón de reintento que vuelve a llamar
  `GET /expenses` sin recargar la página.
- 200 con `expenses: []` → estado vacío, distinto del estado de error (nunca se confunden).

**Required tests**

- [ ] Al montar con datos, muestra el listado.
- [ ] Al montar con `expenses: []`, muestra el estado vacío (no el de error), y su acción lleva el
      foco al formulario de carga.
- [ ] Al fallar la carga inicial (401/500/red simulada), muestra el error en el lugar de la lista
      con un control de reintento.
- [ ] Activar el reintento vuelve a pedir `GET /expenses` sin recargar la página (verificado
      contando invocaciones del mock de `fetch`).

**Completion criterion**

Los 4 tests pasan, y el estado vacío y el estado de error usan marcado/estilos visualmente
distintos entre sí (verificado por la ausencia de la clase/atributo de error en el caso vacío).

## Block 9 — Reflejar creación, presentación de filas, wrap

**Files**
- `apps/web/src/components/expense-list.tsx` (modificado) — recibe el gasto recién creado e inserta
  en posición.
- `apps/web/src/app/page.tsx` (modificado) — conecta `expense-form` y `expense-list` en la misma
  pantalla, pasando el callback de creación exitosa.
- `apps/web/src/components/expense-row.tsx` (nuevo) — la fila individual del listado.
- `apps/web/src/components/expense-list.test.tsx` (modificado)
- `apps/web/src/components/expense-row.test.tsx` (nuevo)

**Logic**

Cuando el Block 7 crea un gasto con éxito, el nuevo gasto se inserta en el listado en la posición
que le corresponde según `when` descendente — no siempre como la primera fila (PRD loop 1: FR-11 se
corrigió tras detectar que `GET /expenses` ordena por fecha del gasto, no por momento de carga; un
gasto cargado hoy con fecha de hace 3 días aparece entre los de esa fecha, no arriba de todo).

La respuesta 201 del POST no trae `id` (confirmado en Block 7) — se genera un id local temporal
(`crypto.randomUUID()`) solo para la key de React hasta que la próxima carga completa del listado
lo reemplace por el id real del servidor; esto no afecta ninguna lógica de negocio, es puramente de
renderizado.

Cada fila (`expense-row.tsx`) separa visualmente fecha, concepto (Nombre), monto y categoría, con
el monto como dato de mayor peso visual (RF-72 de `PRD.md`). El concepto envuelve en varias líneas
si es largo, sin truncar, dejando crecer la fila en alto; el listado completo delega el scroll
vertical a la página, sin un contenedor de alto máximo con scroll propio (RF-74, RF-75 de `PRD.md`).

**Input validation**

N/A.

**Error handling**

N/A — este bloque no realiza I/O propio, consume el resultado ya manejado por Block 7/Block 8.

**Required tests**

- [ ] Un gasto creado con `when` de hoy se inserta antes que uno existente con `when` de ayer.
- [ ] Un gasto creado con `when` de hace 3 días se inserta DESPUÉS de uno existente con `when` de
      ayer — el caso que corrigió el PRD loop 1, y el que demuestra que no siempre va arriba.
- [ ] Cada fila muestra fecha, concepto, monto y categoría visualmente separados, con el monto como
      elemento de mayor peso visual (verificado por una clase/estilo distintivo, no por inferencia).
- [ ] Un concepto de 200+ caracteres en un contenedor de 360px de ancho envuelve en varias líneas,
      sin truncar (sin `text-overflow: ellipsis` ni recorte) y sin scroll horizontal.
- [ ] El listado no tiene su propio contenedor con `overflow-y: auto`/`scroll` — el scroll vertical
      queda delegado al documento.
- [ ] Con `page.tsx` completo (formulario + listado), tabular con teclado desde el primer control
      hasta el último alcanza y opera el 100% de los controles interactivos de la pantalla, cada
      uno mostrando un indicador de foco visible — valida AC-14 a nivel de pantalla completa, no
      solo por componente aislado.
- [ ] `page.tsx` completo, medido en un viewport simulado de 360px y uno de 1280px, no produce
      scroll horizontal del documento y todo control queda íntegramente dentro del viewport —
      valida AC-13 a nivel de pantalla completa.

**Completion criterion**

Los 5 tests pasan, y `expense-form`/`expense-list` quedan conectados en `page.tsx` de forma que un
flujo completo (cargar un gasto → verlo aparecer en su posición correcta) es demostrable end-to-end
con Testing Library, sin mockear la posición del DOM.

## Final verification

- Una persona puede escribir un gasto en `apps/web`, verlo confirmado con su interpretación
  (monto/lugar/categoría/fecha separados) y encontrarlo en el listado, en la posición cronológica
  que corresponde por `when`.
- Un gasto rechazado (cualquiera de los 8 motivos) muestra su mensaje en español, sin crear nada y
  sin limpiar el campo.
- El listado maneja sus tres estados (con datos, vacío, error-con-reintento) de forma distinguible.
- Ningún componente declara color/tipografía/espaciado propio, ni implementa su propia lógica de
  descarte de notificaciones, ni construye una URL o header de auth por su cuenta.
- `apps/api` acepta requests cross-origin desde `WEB_ORIGIN` con los métodos correctos declarados
  explícitamente.
- El 100% de los controles interactivos de la pantalla es operable por teclado con foco visible, y
  la pantalla no tiene scroll horizontal entre 360px y 1280px.
- `pnpm test` (raíz) pasa completo, incluida la suite ya existente de `apps/api`/`packages/*` sin
  modificaciones de comportamiento fuera de Block 2 (CORS).
