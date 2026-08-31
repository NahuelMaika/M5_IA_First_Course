# PRD FEAT-006: Alta de gasto por audio (transcripción + extracción)

| Field | Value |
|-------|-------|
| Ticket | FEAT-006 |
| Tracker | none |
| Date | 2026-08-25 |
| PRD loops | 0 |

## Context and Problem

PRD-001 define dos canales de entrada para un gasto: texto tipeado y audio. El canal de texto ya
está completo — FEAT-002 lo persiste vía `POST /expenses`, reutilizando el motor de extracción y
categorización de FEAT-001a/b (`@ggasia/domain` + `@ggasia/categorization`) — pero el canal de audio
(RF-34 a RF-37, RNF-09) nunca se implementó. Hoy `createExpense(deps, userId, rawInput)` solo acepta
texto; no existe forma de enviar un archivo de audio a la API.

El contexto de uso predominante del producto es "teléfono, de pie, inmediatamente después de
gastar" (PRD-001, sección Personas). Tipear una frase completa en ese contexto es más fricción que
hablarla; cerrar el canal de audio es lo que hace del alta "una sola frase" también cuando escribir
no es cómodo.

## Goals

- Permitir que un usuario autenticado registre un gasto enviando un archivo de audio en lugar de
  texto, con el mismo resultado que si hubiera tipeado el equivalente.
- Reutilizar el motor de extracción/categorización existente sin duplicar ni adaptar sus reglas
  para el canal de audio (RF-35).
- No persistir en ningún momento los bytes del audio enviado (RF-36).
- Acotar el tamaño de archivo aceptado antes de gastar la llamada al servicio de transcripción
  (RNF-09).

## Functional Requirements

- FR-01: El sistema debe exponer un endpoint que reciba un archivo de audio de un usuario
  autenticado y lo transcriba a texto mediante un servicio externo de transcripción (RF-34).
- FR-02: El sistema debe pasar el texto transcripto al mismo motor de extracción/categorización que
  usa el canal de texto (`createExpense` / `@ggasia/domain` + `@ggasia/categorization`), sin reglas
  de extracción propias del canal de audio (RF-35).
- FR-03: El sistema debe descartar los bytes del audio recibido inmediatamente después de obtener
  la transcripción, sin escribirlos en disco ni en base de datos en ningún punto del flujo (RF-36).
- FR-04: El sistema debe rechazar la solicitud cuando la transcripción resulte en una cadena vacía
  o compuesta únicamente por espacios, sin invocar al motor de extracción (RF-37).
- FR-05: El sistema debe rechazar todo archivo de audio que supere los 25 MB antes de enviarlo al
  servicio de transcripción (RNF-09).
- FR-06: El sistema debe ofrecer en la pantalla de carga de gastos un control para grabar audio
  desde el micrófono del dispositivo, como alternativa al campo de texto existente.
- FR-07: El sistema debe mantener habilitado y operable el control de detener grabación mientras
  hay una grabación de audio en curso (RF-63).
- FR-08: El sistema debe mostrar un indicador de progreso mientras el audio grabado se envía y se
  transcribe, deshabilitando el control que disparó el envío hasta que la operación termina
  (RF-62, RF-79).
- FR-09: El sistema debe mostrar, tras crear un gasto por audio, el mismo detalle de lo interpretado
  que muestra el canal de texto (RF-71), separando concepto, monto, categoría y fecha.

## Non-Functional Requirements

- NFR-01: El envío de un audio y la creación del gasto resultante deben completarse en menos de 8
  segundos en el percentil 95, medidos desde que el usuario detiene la grabación hasta que recibe
  la confirmación o el rechazo. *(Más laxo que RNF-01 del PRD maestro, que rige el canal de texto:
  este flujo agrega una llamada de red a un servicio externo de transcripción que el canal de texto
  no tiene.)*
- NFR-02: El servicio de transcripción debe ser la única dependencia de IA de este ticket; la
  aplicación completa debe seguir funcionando por el canal de texto si la transcripción está
  deshabilitada o no responde (PRD-001, "Riesgos y Dependencias").
- NFR-03: El sistema debe rechazar la solicitud de audio si el usuario no está autenticado, con el
  mismo criterio de control de acceso que `POST /expenses` (RF-08).

## Acceptance Criteria

- AC-01 (FR-01, FR-02): WHEN un usuario autenticado envía un audio que menciona Monto y Lugar, THE
  sistema SHALL transcribirlo, procesarlo con el motor de extracción existente y crear el gasto con
  Monto y Lugar coincidentes con lo expresado en el audio (cubre RF-34/RF-35 y AC-06/AC-41 de
  PRD-001).
- AC-02 (FR-03): WHEN un gasto se crea a partir de un audio, THE sistema SHALL no dejar ningún
  registro del audio original en disco ni en base de datos, en ningún punto posterior a la
  respuesta (cubre RF-36 y AC-42 de PRD-001).
- AC-03 (FR-04): IF la transcripción de un audio recibido resulta vacía o solo espacios, THEN THE
  sistema SHALL rechazar la solicitud sin crear ningún gasto ni invocar al motor de extracción
  (cubre RF-37 y AC-43 de PRD-001).
- AC-04 (FR-05): IF un usuario envía un archivo de audio de más de 25 MB, THEN THE sistema SHALL
  rechazarlo sin haber invocado al servicio de transcripción (cubre RNF-09 y AC-44 de PRD-001).
- AC-05 (FR-01): IF el servicio externo de transcripción responde con error o no responde dentro del
  timeout configurado, THEN THE sistema SHALL rechazar la solicitud con un error explícito, sin
  crear ningún gasto ni dejar el audio persistido.
- AC-06 (FR-07): WHILE hay una grabación de audio en curso, THE sistema SHALL mantener habilitado y
  operable el control de detener grabación (cubre RF-63 de PRD-001).
- AC-07 (FR-01): IF un usuario intenta enviar un audio sin sesión activa, THEN THE sistema SHALL
  rechazar la solicitud con el mismo criterio de autenticación que rige `POST /expenses` (cubre
  RF-08 de PRD-001).
- AC-08 (FR-06): WHEN el navegador del usuario no expone acceso al micrófono (permiso denegado o
  API no disponible), THE sistema SHALL informarlo con una notificación y SHALL mantener disponible
  el campo de texto como alternativa.
- AC-09 (FR-08): WHEN un usuario envía un audio grabado, THE sistema SHALL mostrar un indicador de
  progreso y SHALL mantener deshabilitado el control de envío hasta que la operación termina.
- AC-10 (FR-09): WHEN el sistema crea un gasto a partir de un audio, THE sistema SHALL mostrar el
  detalle interpretado separando visualmente concepto, monto, categoría y fecha.

## Out of Scope

- Reglas de extracción específicas del canal de audio: el texto transcripto se procesa exactamente
  igual que el texto tipeado (PRD-001, RF-35).
- Reconocimiento del marcador `#categoría` o del separador de descripción por voz: un gasto por
  audio siempre nace con categoría automática y sin descripción, igual que declara PRD-001 en
  "Riesgos y Dependencias"; la corrección posterior es manual (RF-02).
- Centavos dictados por audio: solo se reconocen numerales enteros (PRD-001, Fuera de Alcance).
- Selección del proveedor concreto de transcripción y su configuración de credenciales: es una
  decisión de diseño que se resuelve en PLAN (ADR), no en este PRD.
- Grabación de audio en segundo plano o mientras la pestaña no tiene foco.
- Edición o recorte del audio antes de enviarlo.

## Risks and Mitigations

- **Riesgo**: el servicio externo de transcripción no está disponible o degrada su latencia →
  mitigado por AC-05 (rechazo explícito, sin crear un gasto a medias) y por NFR-02 (el canal de
  texto sigue funcionando sin este servicio).
- **Riesgo**: un archivo de audio grande consume ancho de banda y tiempo de proceso innecesarios →
  mitigado por FR-05/AC-04, que corta en el borde antes de invocar el servicio externo.
- **Riesgo**: un audio ambiguo o con ruido produce una transcripción que el motor de extracción
  rechaza (por ejemplo, sin Monto reconocible) → se acepta: el usuario recibe el mismo rechazo que
  tendría el equivalente tipeado (RF-25 de PRD-001) y puede reintentar o tipear.
- **Riesgo**: el permiso de micrófono del navegador puede estar denegado → mitigado por AC-08, que
  deja el campo de texto como alternativa siempre disponible.

## Dependencies

- El motor de extracción/categorización de FEAT-001a/b (`@ggasia/domain`,
  `@ggasia/categorization`), consumido sin modificaciones (FR-02).
- El endpoint `POST /expenses` y su capa `routes → service → repository` (FEAT-002), que este
  ticket reutiliza pasándole el texto ya transcripto en lugar de bifurcar el flujo de creación.
- Servicio externo de transcripción de audio (PRD-001, "Riesgos y Dependencias") — a elegir en PLAN.
- Rama base: `feat/FEAT-005a-expenses-edit-delete` (incluye ya el fix FIX-002 de posicionamiento del
  Select), aún no mergeada a `main`.
