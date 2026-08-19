# PRD FEAT-001b: Motor de extracción de campos del gasto

| Field | Value |
|-------|-------|
| Ticket | FEAT-001b |
| Tracker | none |
| Date | 2026-08-11 |
| PRD loops | 1 |

## Context and Problem

Este es el segundo sub-ticket de FEAT-001 (ver `prd-FEAT-001.md`, el PRD padre). Depende de
FEAT-001a: consume su categorizador a través del puerto que ese ticket expone, y corre sobre el
monorepo que ese ticket levanta.

Es la pieza que convierte lo que el usuario escribe —`gasté 18000 en milanesas hoy`, `nafta 8000
ayer`, `milanesas 18000 - con los pibes`— en un gasto estructurado con Monto, Lugar, Cuando,
Categoría, Descripción, Nombre y Tipo. Sin ella el producto no tiene razón de existir: el usuario
volvería a completar un formulario campo por campo, que es exactamente la tarea tediosa que motivó
el PRD-001.

`kb.md` define el pipeline completo y su orden importa: corte por el separador de descripción,
reconocimiento de la referencia temporal, reconocimiento del marcador de categoría, conversión de
numerales en palabras, determinación del monto y descarte de muletillas. Ejecutar esas seis etapas
en otro orden produce resultados distintos con el mismo input.

La otra mitad del trabajo es igual de importante y se olvida más: **decidir cuándo no interpretar**.
Un valor de dinero adivinado en silencio es peor que pedirle al usuario que reescriba la frase, y
`kb.md` fija cuándo rechazar —monto indeterminable o malformado, Lugar vacío, fecha futura, fecha
fuera de la ventana de retroactividad—. Cada rechazo lleva su motivo, para que la interfaz pueda
decir qué corregir en lugar de un genérico "no se pudo".

Lo que hoy no existe y este ticket resuelve: no hay ningún lugar del sistema capaz de convertir una
frase en un gasto, ni de rechazarla explicando qué le falta.

## Goals

1. Entregar `packages/domain` puro, sin dependencias de runtime, implementando las seis etapas de
   `kb.md` en el orden que ese documento fija.
2. Producir un gasto completo o un rechazo con motivo identificable, sin estados intermedios
   ambiguos.
3. Consumir el categorizador de FEAT-001a por su puerto, sin acoplarse a la implementación concreta.
4. Dejar el motor listo para que la API lo invoque sin tocar su código, y sin que ninguna regla de
   negocio quede del lado de HTTP.

## Functional Requirements

- FR-01: El sistema debe partir el input crudo por el primer separador ` - `, tomando el segmento
  derecho como Descripción literal y el izquierdo como única fuente de Monto, Lugar, Cuando y
  Categoría, y debe rechazar el input cuyo segmento izquierdo quede vacío.
- FR-02: El sistema debe reconocer las referencias temporales del conjunto cerrado de `kb.md`,
  resolver Cuando con la primera y quitar todas del texto antes de calcular Lugar.
- FR-03: El sistema debe recibir la fecha de referencia como parámetro de entrada y asignarla como
  Cuando cuando el input no trae ninguna referencia temporal reconocida, sin leer el reloj del
  sistema.
- FR-04: El sistema debe reconocer el marcador de categoría `#nombre` únicamente con los caracteres
  admitidos por `kb.md`, tomar el primero y quitar todos del texto antes de calcular Lugar.
- FR-05: El sistema debe convertir los numerales escritos en palabras a dígitos según la tabla de
  `kb.md`, después de quitar las referencias temporales y el marcador y antes de determinar el
  Monto.
- FR-06: El sistema debe determinar el Monto aplicando la tabla de desempate de `kb.md`,
  interpretándolo con convención es-AR y registrándolo con exactamente dos decimales.
- FR-07: El sistema debe descartar los verbos de gasto en cualquier posición y recortar los
  conectores de los extremos hasta que ni el primero ni el último token pertenezcan a las listas
  cerradas, y el resultado es el Lugar.
- FR-08: El sistema debe generar el Nombre del gasto cuando no se especifica, usando Lugar si
  Descripción está vacía o `Lugar - Descripción` si fue ingresada.
- FR-09: El sistema debe asignar Tipo = Personal cuando el gasto no especifica Tipo.
- FR-10: El sistema debe obtener la categoría del gasto a través del puerto del categorizador, e
  incluir en el resultado la categoría asignada junto con el origen de esa asignación.
- FR-11: El sistema debe rechazar el input devolviendo un motivo identificable y distinto por cada
  regla de rechazo, en lugar de un rechazo genérico.
- FR-12: El sistema debe rechazar los textos que superan los topes de largo de `kb.md` antes de
  intentar interpretarlos.
- FR-13: El sistema debe devolver los rechazos sin ningún efecto colateral, en particular sin
  señalar la creación de la categoría que un marcador hubiera originado.
- FR-14: El sistema debe rechazar el Monto cuando resulte igual a cero, dado que un valor negativo
  es inexpresable desde el input de texto libre (`kb.md`).

## Non-Functional Requirements

- NFR-01: La cobertura de tests de `packages/domain` debe ser de al menos 90% en líneas, ramas y
  funciones.
- NFR-02: El paquete `packages/domain` debe declarar 0 dependencias de runtime de terceros.
- NFR-03: El motor debe interpretar un input de hasta 500 caracteres en menos de 10 ms en el
  percentil 95, medido sobre 1000 ejecuciones en la suite de tests.
- NFR-04: El sistema debe rechazar antes de interpretar los textos que superen estos topes: input
  crudo 500 caracteres, Lugar 200, Descripción 300, Nombre 512.
- NFR-05: El sistema debe aceptar montos de hasta 999.999.999,99 con precisión de 2 decimales, y
  debe rechazar todo valor con más de 2 decimales sin truncarlo ni redondearlo.
- NFR-06: El test de invariante debe recorrer el 100% de los tokens de las 2 listas cerradas de
  muletillas contra las 258 palabras clave de `kb.md` y sus plurales derivados.

## Acceptance Criteria

- AC-01: WHEN el input contiene ` - ` (FR-01), THE sistema SHALL tomar el segmento a la derecha del
  primer separador como Descripción literal: `milanesas 18000 - con los pibes` produce Lugar
  `milanesas` y Descripción `con los pibes`.
- AC-02: IF el input termina en ` - ` y el segmento derecho queda vacío (FR-01), THEN THE sistema
  SHALL interpretar el gasto igual con Descripción vacía: `milanesas 18000 - ` produce Lugar
  `milanesas`.
- AC-03: IF el segmento izquierdo queda vacío (FR-01), THEN THE sistema SHALL rechazar el input:
  `- solo un comentario` se rechaza.
- AC-04: WHEN el input contiene una referencia temporal del conjunto cerrado (FR-02), THE sistema
  SHALL resolver Cuando con la primera y quitar todas del texto: `nafta 8000 ayer` produce Cuando =
  el día anterior a la fecha de referencia y Lugar `nafta`.
- AC-05: WHEN el input contiene una fecha `dd/mm` calendario-inválida (FR-02), THE sistema SHALL no
  reconocerla como referencia temporal y SHALL dejar su texto dentro del cálculo de Lugar: `31/2` no
  resuelve fecha.
- AC-06: WHEN el input no contiene ninguna referencia temporal reconocida (FR-03), THE sistema SHALL
  asignar como Cuando la fecha de referencia recibida como parámetro: `café 1500` con fecha de
  referencia 2026-08-11 produce Cuando = 2026-08-11.
- AC-07: WHEN el segmento izquierdo contiene uno o más marcadores `#nombre` (FR-04), THE sistema
  SHALL tomar el primero y quitar todos del texto: `milanesas 18000 #almuerzos` produce Lugar
  `milanesas` y nombre marcado `almuerzos`.
- AC-08: IF el `#` aparece suelto o seguido de un carácter no admitido (FR-04), THEN THE sistema
  SHALL tratarlo como texto común y aplicar la categorización automática: `pagué 3000 de nafta #
  ayer` produce Lugar `nafta` y Categoría Transporte.
- AC-09: WHEN el segmento izquierdo contiene un numeral escrito en palabras (FR-05), THE sistema
  SHALL convertirlo a dígitos antes de determinar el Monto: `gasté mil quinientos en nafta` produce
  Monto 1500, y `treinta y cinco mil el alquiler` produce Monto 35000 y Lugar `alquiler`.
- AC-10: WHEN el input contiene `un`, `una` o `uno` aislados (FR-05), THE sistema SHALL tratarlos
  como artículos y no como numerales: `me compré una remera 25000` produce Monto 25000 y Lugar
  `remera`.
- AC-11: WHEN el segmento izquierdo contiene exactamente un número (FR-06), THE sistema SHALL
  tomarlo como Monto lleve o no `$`: `café 1500` produce Monto 1500.
- AC-12: WHEN el segmento izquierdo contiene varios números y exactamente uno lleva `$` (FR-06), THE
  sistema SHALL tomar como Monto el marcado: `2 cafés $3000` produce Monto 3000.
- AC-13: WHEN el monto viene con separadores es-AR bien formados (FR-06, NFR-05), THE sistema SHALL
  leer el punto como miles y la coma como decimales y conservar los dos decimales: `café 1.500,50`
  produce Monto 1500.50.
- AC-14: WHEN quedan verbos de gasto o conectores en los extremos del texto restante (FR-07), THE
  sistema SHALL descartarlos hasta estabilizar el texto —`gasté 18000 en milanesas hoy` produce
  Lugar `milanesas`— y SHALL dejar intactos los conectores interiores: `cena en la casa de mi vieja
  3000` produce Lugar `cena en la casa de mi vieja`.
- AC-15: WHEN el gasto se interpreta sin Nombre explícito (FR-08), THE sistema SHALL generar Nombre
  = Lugar con Descripción vacía, y Nombre = `Lugar - Descripción` cuando hay Descripción:
  `milanesas 18000 - con los pibes` produce Nombre `milanesas - con los pibes`.
- AC-16: WHEN el gasto se interpreta sin Tipo explícito (FR-09), THE sistema SHALL asignar Tipo =
  Personal.
- AC-17: WHEN el gasto se interpreta sin marcador de categoría (FR-10), THE sistema SHALL obtener la
  categoría invocando el puerto del categorizador con el Lugar, e incluir en el resultado esa
  categoría y el origen `automatica`, y WHEN se interpreta con marcador, THE sistema SHALL informar
  el origen `marcador`.
- AC-18: IF el segmento izquierdo contiene varios números y ninguno lleva `$`, o no contiene ninguno
  (FR-11), THEN THE sistema SHALL rechazar el input con el motivo de monto indeterminable: `2 cafés
  3000` y `ruta 2 5000` se rechazan.
- AC-19: IF el monto está malformado (FR-11, NFR-05), THEN THE sistema SHALL rechazar el input con
  el motivo de monto malformado: `café 1.5`, `café 1.50` y `café 1500,555` se rechazan.
- AC-20: IF el texto restante queda vacío tras el descarte de muletillas (FR-11), THEN THE sistema
  SHALL rechazar el input con el motivo de lugar vacío: `gasté 5000 en` se rechaza.
- AC-21: IF la referencia temporal resuelve a un día posterior a la fecha de referencia (FR-11),
  THEN THE sistema SHALL rechazar el input con el motivo de fecha futura, sin inferir el año
  anterior: `31/12` con fecha de referencia en enero se rechaza.
- AC-22: IF la fecha resuelta es anterior al primer día del mes que queda 12 meses cerrados hacia
  atrás (FR-11), THEN THE sistema SHALL rechazar el input con el motivo de fecha fuera de ventana:
  `3/8/1998` se rechaza.
- AC-23: IF el input crudo supera los 500 caracteres, o Lugar los 200, o Descripción los 300, o
  Nombre los 512 (FR-12, NFR-04), THEN THE sistema SHALL rechazarlo con el motivo de largo excedido
  sin intentar interpretarlo.
- AC-24: IF un input con marcador `#nombre` de una categoría inexistente se rechaza por cualquier
  motivo (FR-13), THEN THE sistema SHALL devolver el rechazo sin señalar la creación de esa
  categoría.
- AC-25: WHEN el test de invariante recorre las 2 listas cerradas de muletillas contra las 258
  palabras clave y sus plurales derivados (NFR-06), THE sistema SHALL no presentar ninguna
  intersección entre ambos conjuntos.
- AC-26: WHEN se ejecuta la suite con reporte de cobertura (NFR-01, NFR-02), THE sistema SHALL
  alcanzar al menos 90% de líneas, ramas y funciones en `packages/domain`, y THE `package.json` del
  paquete SHALL declarar 0 dependencias de runtime de terceros.
- AC-27: WHEN se mide la interpretación de un input de 500 caracteres sobre 1000 ejecuciones
  (NFR-03), THE sistema SHALL resolverlo en menos de 10 ms en el percentil 95.
- AC-28: IF el Monto resuelto es igual a cero (FR-14), THEN THE sistema SHALL rechazar el input con
  un motivo identificable: `café 0` se rechaza.

## Out of Scope

- La tabla de palabras clave, su orden normativo, la derivación de plurales y la resolución del
  nombre marcado contra las categorías vigentes. Todo eso es FEAT-001a; este ticket lo consume por
  el puerto.
- La API HTTP, la persistencia con Prisma, la interfaz y la autenticación.
- La transcripción de audio (RF-34 a RF-37 del PRD-001). El motor es agnóstico al canal, de modo que
  el texto transcripto lo atraviesa con las mismas reglas, pero el servicio de transcripción no se
  integra.
- La edición y la eliminación de gastos (RF-02, RF-03, RF-04, RF-33, RF-44 del PRD-001). Este ticket
  solo interpreta un input nuevo.
- Los resúmenes diarios y mensuales (RF-09 a RF-11 del PRD-001).
- El soporte de centavos dictados por audio: `kb.md` declara que solo se reconocen numerales
  enteros.
- La medición de RNF-02 del PRD-001 (85% de acierto sin corrección), diferida según la decisión
  registrada en el PRD padre.

## Risks and Mitigations

- **Riesgo**: las seis etapas de `kb.md` tienen un orden que importa, y una implementación que las
  reordene puede pasar todos los tests de cada etapa aislada y fallar de punta a punta. →
  Mitigación: los casos del conjunto dorado ejercitan el pipeline completo desde el input crudo,
  nunca una etapa suelta; AC-09 y AC-04 en particular cubren la interacción entre fecha, numerales y
  monto.
- **Riesgo**: agregar una muletilla a las listas cerradas puede tapar una palabra clave y romper una
  categoría en silencio. → Mitigación: AC-25 verifica la ausencia de intersección sobre el 100% de
  ambos conjuntos, y `kb.md` exige explícitamente ese test.
- **Riesgo**: la interpretación del monto es el punto donde un error se traduce en dinero mal
  registrado, y las formas malformadas (`1.5`, `1500,555`) se parecen mucho a las válidas. →
  Mitigación: AC-13 y AC-19 fijan las cuatro formas que `kb.md` ya resolvió, y NFR-05 prohíbe
  truncar y redondear.
- **Riesgo**: la ventana de retroactividad y el rechazo de fechas futuras dependen de la fecha
  actual, y un test que lea el reloj del sistema se vuelve inestable con el paso del tiempo. →
  Mitigación: FR-03 obliga a inyectar la fecha de referencia; el motor nunca lee el reloj, así que
  todos los casos son deterministas.
- **Riesgo**: este ticket depende de FEAT-001a, de modo que empezarlo antes de que ese cierre deja
  el puerto del categorizador sin definir. → Mitigación: el orden de implementación a → b está
  registrado en el PRD padre, y AC-17 se verifica contra un doble del puerto, no contra la
  implementación concreta.

## Dependencies

- `docs/daw/prd/kb.md` — anexo normativo y bloqueante. Aporta la tokenización, las seis etapas de
  extracción con su orden, la tabla de desempate del monto, la tabla de numerales en palabras, las
  listas cerradas de muletillas y conectores, los topes de largo y las reglas de completado por
  defecto.
- `docs/daw/prd/PRD.md` (PRD-001) — origen de los requerimientos que este ticket implementa: RF-05,
  RF-07, RF-22, RF-23, RF-25 a RF-28, RF-31, RF-32, RF-41, RF-45, RNF-07, RNF-08.
- `docs/daw/prd/prd-FEAT-001.md` — PRD padre, con las decisiones de alcance vigentes para este
  sub-ticket.
- **FEAT-001a** (`docs/daw/prd/prd-FEAT-001a.md`) — bloqueante. Aporta el monorepo, el paquete
  `packages/domain` inicializado y el puerto del categorizador que FR-10 consume.
- `AGENTS.md`, sección "Architecture conventions" — impone la pureza del paquete, su consumo
  compilado desde `dist/` y el consumo del categorizador a través de su puerto (FR-10).
- Node.js ≥ 22, pnpm workspaces, TypeScript 7 y Vitest 4 — declarados en `AGENTS.md`, sección
  "Stack". Los introduce FEAT-001a.
