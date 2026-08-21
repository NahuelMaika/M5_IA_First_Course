# PRD FEAT-003b: UI de carga y listado de gastos

| Field | Value |
|-------|-------|
| Ticket | FEAT-003b |
| Tracker | none |
| Date | 2026-08-20 |
| PRD loops | 1 |

## Context and Problem

Segundo sub-ticket del split de FEAT-003 (ver `prd-FEAT-003.md`). Depende de `GET /expenses`
(FEAT-003a) y reutiliza `POST /expenses` (FEAT-002) sin modificarlos. Levanta `apps/web` desde cero
y construye la primera pantalla real del producto: la pantalla de Gastos, con el formulario de
carga por texto libre y el listado de lo ya cargado — el primer corte end-to-end usable del
Objetivo 1 de `PRD.md`: "ingresar por escrito los datos del gasto y que de forma automática se
agregue y se clasifique".

No incluye autenticación real (ver `prd-FEAT-003.md` para el porqué). Identifica al usuario con el
mismo stub `x-user-id` de FEAT-002/FEAT-003a, fijo por variable de entorno. **El siguiente ticket
de esta feature, FEAT-004, reemplaza este stub por login y sesión reales**, sin cambiar el resto de
esta pantalla.

## Goals

- Que una persona pueda escribir una frase de gasto en el navegador, ver cómo el sistema la
  interpretó (monto, lugar, categoría, fecha) y encontrarla después en una lista, sin usar la API
  directamente.
- Sentar la base de `apps/web` (tema compartido, política de dismissal de notificaciones
  centralizada) de forma que las próximas pantallas (login, categorías, notificaciones) la
  extiendan en vez de reinventarla.

## Functional Requirements

### Bootstrap de `apps/web`

- FR-01: El sistema debe levantar `apps/web` (Next.js 16 / React 19) con una única configuración de
  tema compartida (tokens de Tailwind CSS 4), sin que la pantalla de Gastos declare valores propios
  de color, tipografía o espaciado (RF-49 de `PRD.md`, acotado a esta pantalla).
- FR-02: El sistema debe centralizar la política de descarte de notificaciones emergentes en un
  único módulo, nunca en el componente que las dispara (`AGENTS.md`), limitando a 3 la cantidad
  visible simultáneamente y descartando una de éxito antes que una de error cuando debe liberar
  lugar (RF-67 de `PRD.md`).
- FR-03: El sistema debe adjuntar automáticamente el header `x-user-id`, con un valor fijo
  configurado por variable de entorno apuntando al usuario de seed de FEAT-002, a toda request que
  la pantalla de Gastos haga a `/expenses` — sin que la interfaz lo exponga como campo editable.

### Carga

- FR-04: El sistema debe ofrecer un formulario de un único campo de texto libre para cargar un
  gasto, con un control de envío que invoca `POST /expenses` con lo escrito.
- FR-05: El sistema debe rechazar el envío del formulario, antes de invocar la API, cuando el campo
  está vacío o supera los 500 caracteres del input crudo (RNF-07 de `PRD.md`), señalándolo con un
  mensaje de texto junto al campo, una marca visual y la asociación del mensaje al campo para un
  lector de pantalla (RF-69 de `PRD.md`).
- FR-06: El sistema debe mostrar ese error de campo cuando pierde el foco o al intentar enviar, y
  ocultarlo apenas el valor pasa a ser válido, nunca mientras se escribe por primera vez (RF-70,
  RF-81 de `PRD.md`).
- FR-07: El sistema debe mostrar un indicador de progreso en el control de envío y mantenerlo
  deshabilitado mientras la request a `POST /expenses` está en curso (RF-62, RF-79 de `PRD.md`).
- FR-08: El sistema debe mostrar, cuando `POST /expenses` responde 201, el detalle de lo que el
  sistema interpretó — concepto, monto, categoría y fecha — separados visualmente entre sí, con el
  monto como dato de mayor peso visual (RF-71, RF-72 de `PRD.md`), y limpiar el campo de texto para
  la siguiente carga.
- FR-09: El sistema debe mostrar, cuando `POST /expenses` responde 422, el motivo del rechazo en una
  notificación emergente que permanece visible hasta que la persona la descarta explícitamente, sin
  crear ningún gasto (RF-64, RF-66 de `PRD.md`).

### Listado

- FR-10: El sistema debe cargar y mostrar, al entrar a la pantalla, el listado de gastos del
  usuario vía `GET /expenses` (FEAT-003a), ordenado con los más recientes primero (RF-48 de
  `PRD.md`).
- FR-11: El sistema debe reflejar en el listado, sin recargar la página, todo gasto creado con
  éxito desde el formulario de esta misma pantalla (RF-68 de `PRD.md`), insertándolo en la
  posición que le corresponde según el orden por fecha del gasto (`when`) que ya aplica
  `GET /expenses` (FEAT-003a) — no necesariamente al principio de la lista, si su fecha es
  anterior a la de otros gastos ya visibles.
- FR-12: El sistema debe presentar cada gasto del listado separando visualmente su fecha, su
  concepto (Nombre), su monto y su categoría, con el monto como dato de mayor peso visual (RF-72 de
  `PRD.md`).
- FR-13: El sistema debe mostrar un estado vacío explicativo, en lenguaje llano y sin tratamiento
  visual de error, cuando el listado no tiene elementos, con una acción que lleve el foco al
  formulario de carga de esta misma pantalla (RF-60, RF-61 de `PRD.md`).
- FR-14: El sistema debe mostrar el error de la carga inicial del listado en el lugar que ocuparía
  la lista, acompañado de un control de reintento que repita la carga sin recargar la página (RF-65
  de `PRD.md`).
- FR-15: El sistema debe envolver en varias líneas el texto de longitud arbitraria del concepto de
  cada gasto, dejando crecer en alto su fila, sin truncarlo, y debe delegar el desplazamiento
  vertical del listado al scroll de la página, sin un contenedor de alto máximo con scroll propio
  (RF-74, RF-75 de `PRD.md`).

## Non-Functional Requirements

- NFR-01: La carga de un gasto y la carga del listado deben completarse en menos de 3 segundos,
  medido en el percentil 95 (p95) de las requests (RNF-01 de `PRD.md`).
- NFR-02: La pantalla de Gastos debe renderizarse sin scroll horizontal del documento en anchos de
  viewport desde 360 px hasta 1280 px, con todo control íntegramente dentro del viewport (RNF-12 de
  `PRD.md`).
- NFR-03: Todo destino táctil de la pantalla de Gastos debe medir al menos 24 × 24 px CSS (RNF-11
  de `PRD.md`).
- NFR-04: La paleta de colores de la pantalla de Gastos debe cumplir WCAG 2.1 nivel AA: contraste
  mínimo de 4.5:1 para texto normal y 3:1 para texto grande (RNF-10 de `PRD.md`).
- NFR-05: El 100% de los controles interactivos de la pantalla de Gastos debe ser operable por
  teclado y mostrar un indicador de foco visible (RNF-13 de `PRD.md`).

## Acceptance Criteria

- AC-01 (FR-01): WHEN se inspecciona el CSS de la pantalla de Gastos, THE system SHALL NOT declarar
  valores de color, tipografía o espaciado fuera de los tokens de tema compartidos.
- AC-02 (FR-03): WHEN la pantalla de Gastos hace cualquier request a `/expenses`, THE system SHALL
  incluir el header `x-user-id` con el valor configurado, sin que la persona lo haya ingresado.
- AC-03 (FR-04, FR-08): WHEN la persona escribe una frase con Monto y Lugar reconocibles y la envía,
  THE system SHALL crear el gasto y SHALL mostrar concepto, monto, categoría y fecha separados
  visualmente, con el monto como dato de mayor peso visual.
- AC-04 (FR-05): IF la persona intenta enviar el formulario con el campo vacío o con más de 500
  caracteres, THEN THE system SHALL NOT invocar `POST /expenses` y SHALL mostrar el error junto al
  campo.
- AC-05 (FR-06): WHEN la persona corrige un campo inválido a un valor válido, THE system SHALL
  ocultar el mensaje de error sin esperar un nuevo envío.
- AC-06 (FR-09): IF `POST /expenses` responde 422, THEN THE system SHALL mostrar el motivo en una
  notificación que permanece visible hasta que la persona la descarta y SHALL NOT agregar nada al
  listado.
- AC-07 (FR-07): WHILE la request de creación está en curso, THE system SHALL mostrar el indicador
  de progreso en el control de envío y SHALL mantenerlo deshabilitado.
- AC-08 (FR-10, FR-12): WHEN la persona entra a la pantalla de Gastos y ya tiene gastos cargados,
  THE system SHALL mostrar el listado ordenado con los más recientes primero, con fecha, concepto,
  monto y categoría separados.
- AC-09 (FR-11): WHEN un gasto se crea con éxito, THE system SHALL agregarlo al listado visible sin
  recargar la página, insertado en la posición que le corresponde según el orden por `when` —
  no necesariamente como la primera fila.
- AC-10 (FR-13): IF el usuario no tiene ningún gasto cargado, THEN THE system SHALL mostrar un
  estado vacío explicativo sin tratamiento visual de error, con una acción que lleve el foco al
  formulario.
- AC-11 (FR-14): IF la carga inicial del listado falla, THEN THE system SHALL mostrar el error en
  el lugar de la lista con un control de reintento que repita la carga sin recargar la página.
- AC-12 (FR-02): WHEN se acumulan más de 3 notificaciones emergentes simultáneas, THE system SHALL
  descartar una de éxito antes que una de error para liberar lugar.
- AC-13 (NFR-02, NFR-03, NFR-04): WHEN se recorre la pantalla de Gastos en un viewport de 360 px y
  en uno de 1280 px, THE system SHALL NOT mostrar scroll horizontal del documento, todo destino
  táctil SHALL medir al menos 24×24 px CSS y todo texto SHALL cumplir el contraste mínimo de
  RNF-10.
- AC-14 (NFR-05): WHEN se tabula por los controles de la pantalla de Gastos usando solo el teclado,
  THE system SHALL permitir alcanzar y operar el 100% de ellos, cada uno mostrando un indicador de
  foco visible.
- AC-15 (FR-15): WHEN el concepto de un gasto del listado es más largo que el ancho disponible en
  un viewport de 360 px, THE system SHALL envolverlo en varias líneas dejando crecer la fila en
  alto, sin truncarlo y sin abrir un contenedor de scroll propio para el listado.

## Out of Scope

- Login, registro, logout y sesión real (RF-08, RF-12, RF-13, RF-24, RNF-04, RNF-05, RNF-06 de
  `PRD.md`) — **siguiente ticket de esta feature: FEAT-004**, que reemplaza el stub `x-user-id` de
  FR-03 tanto en `apps/api` como en `apps/web`.
- Modificación y eliminación de gastos (RF-02, RF-03, RF-04, RF-44 de `PRD.md`) y sus diálogos de
  edición/confirmación (RF-55 a RF-59, RF-77, RF-78) — el listado de este ticket es de solo
  lectura.
- Corrección manual de categoría (RF-42) — depende de la edición de gastos, fuera de alcance.
- Pantallas de Login, Registro, Categorías y Notificaciones (RF-49 parcial de `PRD.md`) — este
  ticket construye únicamente la pantalla de Gastos.
- Encabezado de navegación persistente entre secciones y acción de cerrar sesión (RF-50, RF-51) —
  no hay otras pantallas a las que navegar ni sesión real que cerrar.
- Redirección de la ruta raíz según sesión activa (RF-52) y ocultamiento de nav en login/registro
  (RF-53, RF-54) — no aplican sin login real; la ruta raíz sirve directamente la pantalla de
  Gastos.
- CRUD de categorías (RF-16 a RF-20) y su marca visual de predefinida (RF-76) — no hay pantalla de
  categorías en este ticket.
- Resúmenes diarios y mensuales (RF-09 a RF-11, RF-73 de `PRD.md`).
- Entrada por audio y su control de grabación (RF-34 a RF-37, RF-63).
- Multi-moneda visible: el listado muestra la moneda que persiste FEAT-002 (siempre ARS hoy), sin
  selector ni conversión.

## Risks and Mitigations

- **Riesgo**: el stub `x-user-id` fijo por variable de entorno hace que toda persona que abra la
  pantalla vea y cargue gastos como el mismo usuario de seed — no hay aislamiento entre personas
  reales todavía. **Mitigación**: aceptado de forma explícita, igual que en FEAT-002/FEAT-003a;
  queda resuelto en FEAT-004, sin el cual este ticket no debe considerarse desplegable a usuarios
  reales.
- **Riesgo**: la política de dismissal de notificaciones (FR-02) se centraliza ahora en un único
  módulo para que FEAT-004 y las pantallas siguientes lo reutilicen; si se implementa ad-hoc en el
  componente del formulario, cada pantalla nueva reintroduce la regla de los 3 máximos por su
  cuenta. **Mitigación**: `AGENTS.md` ya lo exige; se valida en `daw-validate-arch` durante CODE.

## Dependencies

- `PRD.md` (PRD-001) — origen de todo RF-/RNF- citado sin prefijo de ticket en este documento.
- `prd-FEAT-002.md` — define el mecanismo `x-user-id` y el usuario de seed que FR-03 reutiliza, y
  el contrato exacto de `POST /expenses` que este ticket consume sin modificar.
- `prd-FEAT-003a.md` — define el contrato de `GET /expenses` que FR-10 consume; debe estar
  mergeado (o su rama disponible) antes de implementar el listado.
- `AGENTS.md` — política de dismissal centralizada de notificaciones (FR-02).
- Next.js 16 / React 19, Tailwind CSS 4 y shadcn/ui sobre Base UI (`AGENTS.md` → Stack) — este
  ticket crea `apps/web` desde cero; no existe ningún código de frontend previo en el repo.
- **FEAT-004** (próximo ticket, aún no definido) — reemplaza el stub `x-user-id` de FR-03 por login
  y sesión reales; ningún cambio de este ticket debe asumir que el stub es permanente.

## Historial de Cambios

- **v1.1 — 2026-08-21**: corrige FR-11/AC-09, que asumían que un gasto recién creado siempre se
  agrega al principio del listado. FEAT-003a implementó `GET /expenses` ordenado por `when`
  (fecha del gasto), no por momento de carga — un gasto con fecha anterior a otros ya visibles
  debe insertarse en su posición cronológica, no arriba de todo. Detectado al re-validar el PRD
  al abrir este sub-ticket, tras el cierre de FEAT-003a.
- **v1.0** — versión inicial, sub-ticket b del split de FEAT-003.
