# PRD-001: GGasIA — App de gestión de gastos con carga por texto o audio

## Contexto y Problema

Mis amigos, mi novia y yo tratamos de llevar nuestras cuentas al dia y anotar todos los gastos pero se hace una tarea tediosa y repetitiva.
Hay veces que uno se olvida de agregar varios gastos y tiene que hacer memoria para saber en que gastó.
Despues de olvidarme varias veces, deje de anotar por ese mes y retome al mes siguiente desde cero pero siempre algo me olvido o termino en el mismo ciclo.
Cuando anotamos hay que pensar en que categoria encasillar ese gasto, como llamarlo o describirlo para acordarnos de una manera simple de que fue ese gasto,
si fue un gasto personal o un gasto en pareja (que pagamos mitad y mitad).

**Personas**

- **Titular de la cuenta**: registra sus propios gastos, corrige lo que el sistema interpretó
  mal y revisa sus resúmenes. Es el único rol del producto: no hay administradores, ni cuentas
  compartidas, ni vinculación entre usuarios.
- **Contexto de uso predominante**: teléfono, de pie, inmediatamente después de gastar. De ahí
  que la carga sea una sola frase y que la interfaz deba ser usable desde 360 px de ancho.

## Objetivos

Ingresar por audio o por escrito los datos del gasto y que de forma automatica se agregue y se clasifique el gasto, dejando que el humano modifique a mano lo generado.
Ofrecer, para cada día ya cerrado, un pequeño resumen de lo que se ingresó ese día y del gasto acumulado del mes en curso.
Ofrecer, para cada mes ya cerrado, un pequeño resumen de los gastos en cada categoría, mostrando los balances comparando con el mes anterior y ordenadas de mayor gasto a menor.
Reducir de esta forma el tiempo de subida de datos, dolores de cabeza para el usuario y mantener al usuario utilizando la app y subiendo sus gastos.

## Requerimientos Funcionales

### Gestión de gastos

- RF-01: Un usuario autenticado debe poder crear un gasto nuevo.
- RF-02: Un usuario autenticado debe poder modificar un gasto propio.
- RF-03: Un usuario autenticado debe poder eliminar un gasto propio.
- RF-04: El sistema debe solicitar confirmación al usuario antes de eliminar un gasto.
- RF-44: El sistema debe eliminar de forma permanente el gasto cuya eliminación el usuario
  confirmó, sin conservar una copia recuperable.
- RF-45: El sistema debe registrar el monto de cada gasto con exactamente dos decimales y junto
  a su moneda.
- RF-48: El sistema debe devolver el listado de gastos ordenado con los más recientes primero.

### Interpretación del input

- RF-05: El sistema debe extraer los campos del gasto desde el input del usuario aplicando, en
  el orden fijado por kb.md, el corte por separador de descripción, el reconocimiento de la
  referencia temporal, el reconocimiento del marcador de categoría, la conversión de numerales
  en palabras, la determinación del monto y el descarte de muletillas.
- RF-07: El sistema debe agregar el dia/mes/año actual al gasto si el usuario no ingreso el cuando.
- RF-22: El sistema debe generar automáticamente el campo 'Nombre' de un gasto cuando el usuario no lo especifique, usando el valor de Lugar si Descripción está vacía, o "Lugar - Descripción" si Descripción fue ingresada.
- RF-23: El sistema debe asignar el campo 'Tipo' = Personal por defecto en un gasto cuando el usuario no lo especifique.
- RF-25: El sistema debe rechazar el input cuando no puede determinar un único Monto mayor que
  cero, según la tabla de desempate de kb.md.
- RF-26: El sistema debe rechazar el input cuando el Lugar resultante queda vacío después del
  descarte de muletillas.
- RF-27: El sistema debe rechazar el gasto cuya fecha resuelva a un día posterior al día actual.
- RF-28: El sistema debe rechazar el gasto cuya fecha sea anterior al primer día del mes que
  queda 12 meses cerrados hacia atrás.

### Categorización

- RF-06: El sistema debe asignar la categoría del gasto de forma determinista cuando el usuario
  no la especificó, comparando por token completo el campo Lugar contra la tabla de palabras
  clave de kb.md, en el orden normativo que esa tabla define.
- RF-29: El sistema debe asignar la categoría sin intervención de ningún modelo de lenguaje ni
  servicio de inferencia externo.
- RF-30: El sistema debe asignar la categoría `Otros` cuando ninguna palabra clave coincide con
  el Lugar.
- RF-31: El sistema debe tomar la categoría desde el input únicamente mediante el marcador
  explícito `#nombre`, y nunca desde el resto del texto.
- RF-32: El sistema debe descartar por completo un input rechazado, sin dejar creada ninguna
  categoría que su marcador hubiera originado.
- RF-33: El sistema debe conservar la categoría vigente de un gasto cuando se modifica su campo
  Lugar.
- RF-41: El sistema debe registrar, en cada gasto creado sin marcador de categoría, cuál fue la
  categoría que asignó automáticamente.
- RF-42: El sistema debe registrar, de forma inmutable, el instante de la primera corrección
  manual de la categoría de un gasto: ni una corrección posterior ni la vuelta a la categoría
  originalmente sugerida lo modifican.
- RF-43: El sistema debe conservar en cada gasto el input crudo tal como lo escribió el usuario
  y el canal por el que ingresó, sin permitir su edición posterior.

### Entrada por audio

- RF-34: El sistema debe transcribir a texto un archivo de audio enviado por un usuario
  autenticado.
- RF-35: El sistema debe procesar el texto transcripto con las mismas reglas de extracción que
  aplica al texto tipeado, sin reglas propias del canal de audio.
- RF-36: El sistema debe descartar los bytes del audio una vez obtenida la transcripción, sin
  persistirlos en disco ni en base de datos.
- RF-37: El sistema debe rechazar el audio cuya transcripción resulte vacía.

### Categorías

- RF-14: Si el usuario ingresó un gasto con una categoría que no existe, el sistema debe crear esa categoría.
- RF-15: El sistema debe asociar la categoría creada por RF-14 al gasto ingresado que la originó.
- RF-16: Un usuario autenticado debe poder crear una Categoría.
- RF-17: Un usuario autenticado debe poder modificar una Categoría propia creada.
- RF-18: Un usuario autenticado debe poder eliminar una Categoría propia creada.
- RF-19: El sistema debe rechazar la creación de una categoría con nombre vacío.
- RF-20: El sistema debe rechazar la creación de una categoría cuyo nombre, tras normalizarse,
  coincida con el de otra categoría vigente visible para ese usuario.
- RF-21: El sistema debe proveer un conjunto de categorías predefinidas, disponibles para todos los usuarios.
- RF-46: El sistema debe considerar equivalentes dos nombres de categoría que coincidan luego de
  pasarlos a minúsculas, quitarles los acentos y colapsar sus espacios.
- RF-47: El sistema debe evaluar la unicidad y la resolución de un nombre de categoría
  únicamente contra las categorías vigentes visibles para ese usuario: las predefinidas y las
  propias.

### Resúmenes

- RF-09: El sistema debe generar el resumen de un día ya cerrado la primera vez que el usuario
  consulta sus resúmenes con posterioridad a ese cierre.
- RF-10: El sistema debe incluir en el resumen diario el detalle de los gastos de ese día y el
  total acumulado del mes hasta ese día.
- RF-11: El sistema debe generar, para cada mes ya cerrado, un resumen con el total gastado por
  categoría ordenado de mayor a menor, incluyendo la comparación de cada categoría contra el mes
  anterior.
- RF-38: El sistema debe generar como máximo un resumen por usuario, tipo y período.
- RF-39: El sistema debe limitar la generación retroactiva a los 7 días cerrados y los 12 meses
  cerrados más recientes.
- RF-40: El sistema debe calcular los límites de día y de mes en una única zona horaria de
  negocio configurada para toda la aplicación.

### Cuentas y sesión

- RF-08: El sistema debe requerir autenticacion (email + contraseña) si no hay un usuario autenticado.
- RF-12: El sistema debe permitir que nuevos usuarios se registren con email + contraseña.
- RF-13: Al registrarse un usuario nuevo, el sistema debe verificar que no exista otro usuario con ese email ya registrado.
- RF-24: Un usuario autenticado debe poder cerrar su sesión de forma explícita, quedando esa sesión invalidada para cualquier uso posterior.

### Interfaz: estructura y navegación

- RF-49: El sistema debe presentar sus cinco pantallas con interfaz propia —inicio de sesión,
  registro, gastos, categorías y notificaciones— con una única configuración de tema compartida,
  sin valores de color, tipografía o espaciado definidos por pantalla.
- RF-50: El sistema debe ofrecer, en toda pantalla autenticada, un encabezado de navegación
  persistente con acceso a Gastos, Categorías y Notificaciones y una acción visible de cierre de
  sesión.
- RF-51: El sistema debe colapsar el conjunto de enlaces de navegación detrás de un control de
  menú en viewports angostos, operable por teclado y cerrable con `Escape`.
- RF-52: El sistema debe redirigir la ruta raíz a la pantalla de gastos cuando hay sesión activa
  y a la de inicio de sesión cuando no la hay, sin renderizar interfaz propia.
- RF-53: El sistema debe ocultar la navegación autenticada y la acción de cerrar sesión en las
  pantallas de inicio de sesión y de registro.
- RF-54: El sistema debe ofrecer un enlace directo entre la pantalla de inicio de sesión y la de
  registro, en ambos sentidos.

### Interfaz: acciones destructivas y edición

- RF-55: El sistema debe solicitar la confirmación de una acción destructiva dentro de su propia
  interfaz, sin usar el diálogo de confirmación nativo del navegador. Las acciones destructivas
  son exactamente dos: eliminar un gasto y eliminar una categoría.
- RF-56: El sistema debe identificar por su nombre al elemento afectado dentro del diálogo de
  confirmación.
- RF-77: El sistema debe etiquetar las acciones del diálogo de confirmación con el verbo
  correspondiente (Eliminar / Cancelar).
- RF-57: El sistema debe ubicar el foco inicial del diálogo de confirmación en la acción de
  eliminar.
- RF-58: El sistema debe editar un gasto o una categoría en un diálogo modal, con los campos
  precargados con los valores vigentes.
- RF-78: El sistema debe cerrar el diálogo de edición automáticamente tras un guardado exitoso.
- RF-59: El sistema debe descartar los cambios sin guardar al cerrar el diálogo de edición por
  cancelación, `Escape` o clic fuera, sin pedir una confirmación adicional.

### Interfaz: estados de carga, vacío y error

- RF-60: El sistema debe mostrar un estado vacío explicativo, en lenguaje llano y sin tratamiento
  visual de error, en cada lista que puede quedar sin elementos.
- RF-61: El sistema debe ofrecer, en el estado vacío de gastos y de categorías, una acción que
  lleve el foco al formulario de creación de esa misma pantalla.
- RF-62: El sistema debe mostrar un indicador de progreso en el control que dispara cada acción
  asíncrona.
- RF-79: El sistema debe mantener deshabilitado el control que disparó una acción asíncrona hasta
  que esa acción termina.
- RF-63: El sistema debe mantener habilitado y operable el control de detener grabación mientras
  hay una grabación de audio en curso.
- RF-64: El sistema debe presentar todo error devuelto por la API en una notificación emergente
  que no bloquee el resto de la pantalla.
- RF-65: El sistema debe presentar el error de carga inicial de una lista en el lugar que
  ocuparía esa lista, acompañado de un control de reintento que repita la carga sin recargar la
  página.
- RF-66: El sistema debe mantener visible una notificación de error hasta que la persona la
  descarta explícitamente.
- RF-67: El sistema debe limitar a 3 la cantidad de notificaciones emergentes visibles
  simultáneamente, descartando una notificación de éxito antes que una de error cuando debe
  liberar lugar.
- RF-68: El sistema debe reflejar toda mutación exitosa en la lista correspondiente.
- RF-80: El sistema debe mostrar una notificación emergente breve que confirme el resultado de
  cada mutación exitosa.

### Interfaz: formularios y legibilidad

- RF-69: El sistema debe señalar un campo de formulario inválido de tres formas simultáneas: un
  mensaje de texto junto al campo, una marca visual en el propio campo, y la asociación del
  mensaje al campo para que un lector de pantalla lo anuncie.
- RF-70: El sistema debe mostrar el error de un campo cuando ese campo pierde el foco o al
  intentar enviar el formulario, y nunca mientras se escribe por primera vez.
- RF-81: El sistema debe ocultar el error ya visible de un campo apenas el valor de ese campo
  pasa a ser válido.
- RF-71: El sistema debe mostrar, tras crear un gasto, el detalle de lo que interpretó,
  separando visualmente concepto, monto, categoría y fecha.
- RF-72: El sistema debe presentar cada gasto del listado separando visualmente su fecha, su
  concepto, su monto y su categoría, con el monto como dato de mayor peso visual.
- RF-73: El sistema debe presentar cada resumen en una superficie propia, con su tipo y período
  como encabezado y el total de ese período como su dato de mayor peso visual.
- RF-74: El sistema debe envolver en varias líneas el texto de longitud arbitraria proveniente de
  datos del usuario, dejando crecer en alto su contenedor, sin truncarlo.
- RF-75: El sistema debe delegar el desplazamiento vertical de sus listas al scroll de la página,
  sin alojarlas en contenedores de alto máximo con scroll propio.
- RF-76: El sistema debe distinguir una categoría predefinida mediante una marca visual separada
  de su nombre, perceptible por un lector de pantalla y no dependiente únicamente del color.

## Requerimientos No Funcionales

- RNF-01: La creación, modificación y eliminación de un gasto debe completarse en menos de 3 segundos, medido en el percentil 95 (p95) de las requests.
- RNF-02: Al menos el 85% de la categorizacion automatica no debe ser cambiada por el usuario.
- RNF-03: Las contraseñas deben almacenarse con hash seguro (bcrypt o argon2), nunca en texto plano.
- RNF-04: La sesión de un usuario autenticado debe expirar tras 24 h de inactividad.
- RNF-05: El sistema debe permitir 9 intentos de inicio de sesión fallidos consecutivos sin
  demora. A partir del 10.º intento fallido debe rechazar el siguiente intento, sin evaluar las
  credenciales, durante `min(2^(n-10) × 1 s, 5 min)`, donde `n` es la cantidad de fallos
  consecutivos acumulados. El contador debe considerarse reiniciado cuando pasan 60 minutos sin
  un nuevo fallo. La demora debe vencer por el solo paso del tiempo, sin bloqueos permanentes ni
  que requieran intervención manual, y debe aplicarse igual exista o no una cuenta con ese email:
  como el producto no ofrece recuperación de contraseña, un bloqueo sin salida equivaldría a la
  pérdida definitiva de la cuenta.
- RNF-06: La sesión debe representarse con un identificador opaco de al menos 32 bytes
  aleatorios; el sistema debe almacenar únicamente su hash, de modo que un volcado completo de la
  base de datos no permita reconstruir ninguna sesión activa.
- RNF-07: El sistema debe rechazar, antes de intentar interpretarlos, los textos que superen
  estos topes: input crudo 500 caracteres, Lugar 200, Descripción 300, Nombre 512, nombre de
  categoría 60.
- RNF-08: El sistema debe aceptar montos de hasta 999.999.999,99 y registrarlos con precisión de
  2 decimales; un valor con más de 2 decimales debe rechazarse, nunca truncarse ni redondearse.
- RNF-09: El sistema debe rechazar todo archivo de audio mayor a 25 MB antes de enviar un solo
  byte al servicio de transcripción.
- RNF-10: La paleta de colores debe cumplir WCAG 2.1 nivel AA: contraste mínimo de 4.5:1 para
  texto normal y de 3:1 para texto grande, en las cinco pantallas.
- RNF-11: Todo destino táctil debe medir al menos 24 × 24 px CSS (WCAG 2.2 SC 2.5.8).
- RNF-12: Las cinco pantallas deben renderizarse sin scroll horizontal del documento en anchos de
  viewport desde 360 px hasta 1280 px, con todo control íntegramente dentro del viewport.
- RNF-13: El 100% de los controles interactivos debe ser operable por teclado y mostrar un
  indicador de foco visible.
- RNF-14: El listado de gastos debe devolver 50 elementos por consulta de forma predeterminada y
  admitir hasta 200; el de resúmenes, 30 de forma predeterminada y hasta 100. Un valor fuera de
  rango debe rechazarse, no ajustarse en silencio.
- RNF-15: El 100% de los arranques con una variable de configuración requerida ausente o inválida
  debe terminar sin atender ninguna solicitud: 0 requests servidas con configuración inválida.

## Criterios de Aceptación (Gherkin)

- AC-01 (RF-01, RF-05, RF-06, RF-07; campos según kb.md, sección "Modelo de Datos: Gasto"): Dado que un usuario autenticado ingresa un gasto con Monto, Lugar y opcionalmente Categoría, Fecha y Descripción, cuando el sistema procesa el input,
  entonces crea el gasto con Monto = ingresado, Lugar = ingresado, Fecha = ingresada o fecha actual, Categoría = ingresada o inferida automáticamente, Descripción = ingresada o vacía, en menos de 3 segundos (RNF-01).
- AC-02 (RF-02): Dado que un usuario autenticado visualiza un gasto existente, cuando modifica uno o más campos y confirma el cambio, entonces el gasto se actualiza con los nuevos valores y
  la modificación se refleja en menos de 3 segundos (RNF-01).
- AC-03 (RF-03, RF-04): Dado que un usuario autenticado selecciona eliminar un gasto, cuando el sistema muestra la confirmación y el usuario la acepta, entonces el gasto es eliminado permanentemente y desaparece de la lista en menos de 3 segundos (RNF-01).
- AC-04 (RF-03, RF-04): Dado que un usuario autenticado selecciona eliminar un gasto, cuando el sistema muestra la confirmación y el usuario la cancela, entonces el gasto no se elimina y permanece sin cambios.
- AC-05 (RF-05; criterios de extracción de campos opcionales adicionales en Anexo kb.md): Dado un gasto ingresado por texto libre que incluye al menos Monto y Lugar (ej: "café 1500"), cuando el sistema analiza el input, entonces el gasto creado tiene Monto y Lugar no vacíos y coincidentes con los valores explícitos del input.
- AC-06 (RF-05): Dado un gasto ingresado por audio que menciona al menos Monto y Lugar, cuando el sistema transcribe y analiza el audio, entonces el gasto creado tiene Monto y Lugar no vacíos y coincidentes con lo expresado en el audio.
- AC-07 (RNF-04): Dado que un usuario autenticado estuvo inactivo por 24 horas, cuando intenta realizar cualquier acción, entonces el sistema invalida la sesión, redirige al login y solicita reautenticación.
- AC-08 (RF-08): Dado que un usuario no autenticado intenta acceder a una funcionalidad de la app, cuando el sistema detecta que no hay sesión activa, entonces redirige al login y solicita email + contraseña, bloqueando el acceso hasta autenticarse.
- AC-09 (RF-09, RF-10): Dado que un usuario autenticado registró gastos durante un día ya cerrado, cuando consulta sus resúmenes, entonces obtiene un resumen de ese día que incluye el detalle de los gastos ingresados y el total acumulado del mes.
- AC-10 (RF-09): Dado que un usuario autenticado no registró ningún gasto durante un día ya cerrado, cuando consulta sus resúmenes, entonces no existe resumen para ese día.
- AC-11 (RF-11): Dado que un usuario autenticado registró gastos durante un mes ya cerrado, cuando consulta sus resúmenes, entonces obtiene un resumen con el total gastado por categoría, ordenado de mayor a menor, junto con la comparación de cada categoría contra el mes anterior.
- AC-12 (RF-11): Dado que es el primer mes de uso del usuario y no existe un mes anterior con el cual comparar, cuando consulta sus resúmenes, entonces no existe resumen para ese mes.
- AC-13 (RF-12): Dado que una persona no registrada completa el formulario de registro con email y contraseña válidos, cuando envía la solicitud, entonces el sistema crea la cuenta y el usuario queda registrado en el sistema.
- AC-14 (RF-13): Dado que una persona intenta registrarse con un email que ya pertenece a otro usuario, cuando envía la solicitud de registro, entonces el sistema rechaza el registro y muestra un error indicando que el email ya está en uso.
- AC-15 (RF-14, RF-15): Dado que un usuario autenticado ingresa un gasto especificando una categoría que no existe previamente, cuando el sistema procesa el gasto, entonces crea la nueva categoría y la asocia al gasto ingresado.
- AC-16 (RF-16): Dado que un usuario autenticado completa el nombre de una nueva categoría, cuando confirma la creación, entonces el sistema crea la categoría y queda disponible para asignar a gastos.
- AC-17 (RF-17): Dado que un usuario autenticado visualiza una categoría propia existente, cuando modifica su nombre y confirma el cambio, entonces la categoría se actualiza con el nuevo valor y los gastos ya asociados a ella mantienen la referencia.
- AC-18 (RF-18): Dado que un usuario autenticado selecciona eliminar una categoría propia existente, cuando el sistema muestra la confirmación y el usuario la acepta, entonces la categoría se marca con FECHA_BAJA (baja lógica), deja de estar disponible para asignar a nuevos gastos, y los gastos que ya la tenían asignada permanecen intactos, conservando la referencia a esa categoría.
- AC-19 (RF-18): Dado que un usuario autenticado selecciona eliminar una categoría propia y el sistema muestra la confirmación, cuando el usuario la cancela, entonces la categoría no se elimina y permanece sin cambios.
- AC-20 (RF-19): Dado que un usuario autenticado intenta crear una categoría con el nombre vacío, cuando confirma la creación, entonces el sistema rechaza la operación y no crea la categoría.
- AC-21 (RF-20): Dado que un usuario autenticado intenta crear una categoría con un nombre igual al de una categoría ya existente, cuando confirma la creación, entonces el sistema rechaza la operación y no crea la categoría duplicada.
- AC-22 (RF-22): Dado que un usuario autenticado ingresa un gasto sin especificar el campo Nombre, cuando el sistema procesa el input, entonces genera un Nombre igual a Lugar si Descripción está vacía, o "Lugar - Descripción" si Descripción fue ingresada.
- AC-23 (RF-23): Dado que un usuario autenticado ingresa un gasto sin especificar el campo Tipo, cuando el sistema procesa el input, entonces asigna Tipo = Personal por defecto.
- AC-24 (RF-21): Dado que un usuario autenticado accede a la lista de categorías disponibles, cuando el sistema las muestra, entonces incluye tanto las categorías predefinidas del sistema como las categorías propias que el usuario haya creado.
- AC-25 (control de acceso — gastos; RF-01, RF-02, RF-03): Dado que un usuario autenticado intenta ver, modificar o eliminar un gasto creado por otro usuario, cuando el sistema procesa la solicitud, entonces deniega el acceso y no expone ni modifica ese gasto.
- AC-26 (control de acceso — categorías; RF-17, RF-18): Dado que un usuario autenticado intenta modificar o eliminar una categoría que no creó él mismo (ya sea de otro usuario o predefinida del sistema), cuando el sistema procesa la solicitud, entonces deniega la operación y no modifica ni elimina esa categoría.
- AC-27 (RNF-02): Dado un conjunto de gastos ingresados por usuarios durante un mes calendario (mismo ciclo que el resumen mensual de RF-11), cuando se compara la categoría asignada automáticamente por el sistema contra la categoría final del gasto (después de eventuales correcciones manuales del usuario), entonces al menos el 85% de los gastos de ese mes coincide sin haber sido corregido.
- AC-28 (RF-24): Dado que un usuario autenticado cierra su sesión, cuando intenta volver a operar reutilizando esa misma sesión, entonces el sistema deniega el acceso y exige autenticarse de nuevo, aunque no hayan pasado las 24 h de RNF-04.
- AC-29 (RNF-05): Dado un email sobre el que se acumulan intentos de inicio de sesión fallidos consecutivos, cuando se supera el umbral definido, entonces el sistema rechaza los intentos siguientes sin evaluar las credenciales durante una espera que crece con cada fallo y vence sola; y el freno se aplica igual exista o no una cuenta con ese email, para no revelar cuáles están registrados.
- AC-30 (RF-25): Dado un input con dos números y ninguno marcado con `$` (ej: `"2 cafés 3000"`),
  cuando el sistema lo procesa, entonces no crea ningún gasto y devuelve un rechazo pidiendo el
  reingreso.
- AC-31 (RF-25): Dado un input con varios números y exactamente uno marcado con `$` (ej:
  `"2 cafés $3000"`), cuando el sistema lo procesa, entonces crea el gasto con Monto = 3000.
- AC-32 (RF-25, RNF-08): Dado un input con un monto malformado (`"café 1.5"` o `"café 1500,555"`),
  cuando el sistema lo procesa, entonces no crea ningún gasto y devuelve un rechazo.
- AC-33 (RF-26): Dado un input cuyo texto restante queda vacío tras el descarte de muletillas
  (ej: `"gasté 5000 en"`), cuando el sistema lo procesa, entonces no crea ningún gasto y devuelve
  un rechazo pidiendo el reingreso.
- AC-34 (RF-27): Dado un input cuya referencia temporal resuelve a un día posterior a hoy, cuando
  el sistema lo procesa, entonces no crea ningún gasto y devuelve un rechazo.
- AC-35 (RF-28): Dado un input con una fecha explícita anterior al primer día del mes que queda
  12 meses cerrados hacia atrás, cuando el sistema lo procesa, entonces no crea ningún gasto y
  devuelve un rechazo.
- AC-36 (RF-06, RF-29, RF-30): Dado un Lugar sin ninguna palabra clave de la tabla de kb.md,
  cuando el sistema lo categoriza, entonces asigna `Otros`, sin haber consultado ningún servicio
  externo de inferencia.
- AC-37 (RF-06): Dado un Lugar que contiene palabras clave de dos categorías distintas, cuando el
  sistema lo categoriza, entonces asigna la que aparece primero en el orden normativo de kb.md.
- AC-38 (RF-31): Dado un input que menciona una palabra clave sin el marcador `#`, cuando el
  sistema lo procesa, entonces no crea ninguna categoría nueva y aplica la categorización
  automática.
- AC-39 (RF-32): Dado un input con un marcador `#nombre` de una categoría inexistente que además
  carece de Monto válido, cuando el sistema lo procesa, entonces no crea el gasto y tampoco queda
  creada la categoría del marcador.
- AC-40 (RF-33): Dado un gasto existente con categoría asignada, cuando el usuario modifica
  únicamente su Lugar, entonces la categoría del gasto permanece sin cambios.
- AC-41 (RF-34, RF-35): Dado un audio que menciona Monto y Lugar, cuando el sistema lo transcribe
  y procesa, entonces produce el mismo gasto que produciría el texto equivalente tipeado.
- AC-42 (RF-36): Dado un audio procesado con éxito, cuando la transcripción termina, entonces no
  queda ningún registro del audio en disco ni en base de datos.
- AC-43 (RF-37): Dado un audio cuya transcripción resulta vacía, cuando el sistema la recibe,
  entonces no crea ningún gasto y devuelve un rechazo.
- AC-44 (RNF-09): Dado un archivo de audio de más de 25 MB, cuando el usuario lo envía, entonces
  el sistema lo rechaza sin haber invocado al servicio de transcripción.
- AC-45 (RF-09, RF-38): Dado un usuario que consulta sus resúmenes dos veces seguidas sin
  registrar gastos entre ambas, cuando el sistema atiende la segunda consulta, entonces la
  cantidad de resúmenes es idéntica a la de la primera.
- AC-46 (RF-39): Dado un usuario que vuelve a consultar sus resúmenes después de 40 días sin usar
  la aplicación, cuando el sistema los genera, entonces genera a lo sumo los 7 días cerrados más
  recientes y no los anteriores.
- AC-47 (RF-40): Dado un gasto registrado a las 23:30 hora local de la zona de negocio
  configurada, cuando el sistema calcula el resumen diario, entonces ese gasto pertenece al día
  local de su registro y no al día siguiente en UTC.
- AC-48 (RF-41, RF-42, RNF-02): Dado un gasto creado con categoría automática, cuando el usuario
  la corrige por primera vez y luego la corrige otra vez, entonces el sistema conserva la
  categoría originalmente sugerida y el instante de la primera corrección, sin actualizarlo.
- AC-49 (RF-43): Dado un gasto ya creado, cuando el usuario intenta modificar su input crudo o su
  canal de ingreso, entonces el sistema no aplica el cambio.
- AC-50 (RF-44): Dado un gasto eliminado, cuando el usuario intenta eliminarlo o consultarlo
  nuevamente, entonces el sistema responde que no existe.
- AC-51 (RF-20, RF-46, RF-47): Dado un usuario con una categoría propia llamada `Almuerzos`,
  cuando intenta crear otra llamada `almuerzos`, entonces el sistema rechaza la creación; y
  cuando otro usuario distinto crea `almuerzos`, entonces el sistema la crea.
- AC-52 (RF-46, RF-47): Dado un usuario que dio de baja su categoría `Almuerzos`, cuando ingresa
  un gasto con el marcador `#almuerzos`, entonces el sistema crea una categoría nueva y los
  gastos históricos siguen apuntando a la dada de baja.
- AC-53 (RNF-05): Dado un email con 10 intentos de inicio de sesión fallidos consecutivos, cuando
  se realiza el 11.º intento de inmediato, entonces el sistema lo rechaza sin evaluar la
  contraseña; y cuando se realiza pasados 60 minutos sin fallos nuevos, entonces lo evalúa
  normalmente.
- AC-54 (RNF-15): Dada una configuración de entorno con una variable requerida ausente o
  inválida, cuando el sistema arranca, entonces termina su ejecución sin atender ninguna
  solicitud.
- AC-55 (RF-55, RF-56, RF-57, RF-77): Dado un gasto o una categoría que el usuario decide eliminar,
  cuando la interfaz pide confirmación, entonces el diálogo pertenece a la propia aplicación —no
  es el nativo del navegador—, nombra al elemento afectado, etiqueta sus acciones como Eliminar y
  Cancelar y ubica el foco inicial en Eliminar; y cuando el usuario cancela, entonces no se
  realiza ninguna llamada a la API.
- AC-56 (RF-64, RF-65, RF-66, RF-67): Dado un error devuelto por la API durante una mutación,
  cuando la respuesta llega, entonces se muestra en una notificación emergente que permanece
  visible hasta que la persona la descarta; y dado un error en la carga inicial de una lista,
  entonces se muestra en el lugar de la lista con un control de reintento.
- AC-57 (RNF-10, RNF-11, RNF-12): Dado un viewport de 360 px y otro de 1280 px, cuando se recorre
  cada una de las cinco pantallas, entonces no hay scroll horizontal del documento, todo control
  queda íntegro dentro del viewport, todo destino táctil mide al menos 24 × 24 px CSS y todo
  texto cumple el contraste mínimo de RNF-10.
- AC-58 (RF-45, RNF-08): Dado un gasto ingresado con un monto de dos decimales (ej: `1.500,50`),
  cuando el sistema lo persiste, entonces conserva los dos decimales y la moneda del gasto.
- AC-59 (RF-48, RNF-14): Dado un usuario con más gastos que el tope de la consulta, cuando pide
  su listado sin indicar cantidad, entonces recibe los 50 más recientes en orden descendente por
  fecha; y cuando pide una cantidad fuera del rango admitido, entonces el sistema rechaza la
  consulta en lugar de ajustarla.
- AC-60 (RF-49): Dado el conjunto de las cinco pantallas con interfaz propia, cuando se revisa su
  código, entonces todas consumen la misma configuración de tema y ninguna declara valores
  propios de color, tipografía o espaciado.
- AC-61 (RF-50, RF-52): Dada una sesión activa, cuando la persona visita la ruta raíz, entonces
  llega a la pantalla de gastos sin pantalla intermedia; y cuando visita gastos, categorías o
  notificaciones, entonces ve el mismo encabezado con acceso a las tres secciones y la acción de
  cerrar sesión.
- AC-62 (RF-51): Dado un viewport angosto con la navegación colapsada, cuando la persona abre el
  menú con el teclado y elige una sección, entonces llega al destino en dos interacciones y el
  menú se cierra; y cuando presiona `Escape` con el menú abierto, entonces el menú se cierra.
- AC-63 (RF-52, RF-53, RF-54): Dada ninguna sesión activa, cuando la persona visita la ruta raíz,
  entonces es redirigida al inicio de sesión; y cuando está en inicio de sesión o registro,
  entonces no ve navegación autenticada ni acción de cerrar sesión, y sí ve un enlace directo a
  la otra pantalla.
- AC-64 (RF-58, RF-59, RF-78): Dado un gasto o una categoría existente, cuando la persona abre su
  edición, entonces se abre un diálogo modal con los campos precargados con los valores vigentes;
  cuando guarda con éxito, entonces el diálogo se cierra solo; y cuando presiona `Escape` con
  cambios sin guardar, entonces el diálogo se cierra, no se pide confirmación adicional y el
  elemento queda como estaba.
- AC-65 (RF-60, RF-61): Dada una lista de gastos o de categorías sin elementos, cuando la persona
  entra a esa pantalla, entonces ve un mensaje que explica por qué está vacía, sin tratamiento
  visual de error; y cuando activa la acción sugerida, entonces el foco queda en el formulario de
  creación de esa misma pantalla, sin abrir otra pantalla ni un diálogo.
- AC-66 (RF-62, RF-63, RF-79): Dada una acción asíncrona disparada desde un control, cuando la acción
  comienza, entonces ese control muestra el indicador de progreso y queda deshabilitado hasta que
  termina; y dada una grabación de audio en curso, entonces el control de detener permanece
  habilitado y operable.
- AC-67 (RF-68, RF-80): Dado un gasto o una categoría creado, editado o eliminado con éxito, cuando la
  API responde, entonces la lista correspondiente refleja el cambio y aparece una notificación
  emergente que confirma el resultado.
- AC-68 (RF-69, RF-70, RF-81): Dado un campo de formulario obligatorio que la persona deja vacío, cuando
  el campo pierde el foco, entonces aparece un mensaje de texto junto al campo, el campo queda
  marcado visualmente y el mensaje queda asociado al campo para un lector de pantalla; y cuando
  la persona escribe un valor válido, entonces el error desaparece.
- AC-69 (RF-71, RF-72, RF-73): Dado un gasto recién creado, cuando el sistema muestra lo que
  interpretó, entonces concepto, monto, categoría y fecha aparecen separados y no concatenados en
  una única línea; y el mismo criterio se cumple en cada fila del listado de gastos y en cada
  resumen, donde el monto y el total del período son, respectivamente, el dato de mayor peso
  visual.
- AC-70 (RF-74, RF-75): Dada una descripción de gasto o un nombre de categoría más largos que el
  ancho disponible, cuando se los muestra en un viewport de 360 px, entonces el texto se envuelve
  en varias líneas, la fila crece en alto, no se trunca y no aparece scroll horizontal ni un
  contenedor con scroll propio.
- AC-71 (RF-76): Dada una lista con categorías predefinidas y propias, cuando la persona la
  recorre, entonces las predefinidas exhiben una marca separada del nombre, perceptible sin
  depender del color y anunciada por un lector de pantalla, y no ofrecen acciones de renombrar ni
  eliminar.
- AC-72 (RNF-06): Dado un volcado completo de la base de datos, cuando se intenta reconstruir una
  sesión activa a partir de su contenido, entonces no se obtiene ningún identificador de sesión
  utilizable.
- AC-73 (RNF-07): Dado un input crudo de más de 500 caracteres, o un Lugar, una Descripción, un
  Nombre o un nombre de categoría que supere su tope, cuando el sistema lo recibe, entonces lo
  rechaza sin intentar interpretarlo.
- AC-74 (RNF-13): Dado el recorrido completo de cada pantalla usando solo el teclado, cuando se
  tabula por sus controles, entonces se alcanza y se opera el 100% de ellos y cada uno muestra un
  indicador de foco visible.
- AC-75 (RNF-03): Dada una cuenta recién registrada, cuando se inspecciona el registro almacenado
  del usuario, entonces la contraseña figura únicamente como hash de bcrypt o argon2 y su valor en
  texto plano no aparece en ningún campo ni en ningún registro de log.

## Fuera de Alcance

- La aplicación es web, no hay app mobile nativa.
- La unica moneda disponible van a ser ARS pero el sistema debe poder soportar otras monedas en caso de expansión de la misma.
- No se van a poder exportar datos en PDF,Excel,CSV, etc.
- No va a haber integración con aplicaciónes de bancos.
- El campo 'Tipo' (Personal/Pareja) es únicamente informativo; el sistema no calcula ni gestiona la división del gasto entre los miembros de la pareja.
- No hay vinculación entre cuentas de usuario: cada gasto es visible únicamente para el usuario que lo creó, sin excepción para gastos de tipo Pareja.
- No hay recuperación ni restablecimiento de contraseña. Una contraseña olvidada deja la cuenta inaccesible de forma definitiva: es una limitación aceptada, no una omisión.
- La categorización de gastos no utiliza modelos de lenguaje ni servicios de inferencia: es
  determinista y por palabras clave. La IA interviene únicamente en la transcripción de audio.
- No existe ningún proceso programado, tarea de fondo, envío por email ni notificación push: los
  resúmenes se generan cuando el usuario los consulta.
- Los resúmenes de períodos anteriores a la ventana de RF-39 no se generan y no son recuperables
  después.
- No hay modo oscuro; la aplicación define un único tema claro.
- No hay paginación de listas: los listados se acotan por el tope de RNF-14.
- No hay telemetría ni instrumentación de tiempos en la interfaz.
- Una sesión expirada durante una acción en curso se presenta como cualquier otro error de API;
  la persona permanece en la pantalla y la redirección al inicio de sesión ocurre recién al
  recargar o navegar.
- La interfaz no valida el contenido de una respuesta exitosa de la API: renderiza lo que recibe.
- Los centavos dictados por audio no están soportados; solo se reconocen numerales enteros.

## Historial de Cambios

- **v1.2 — 2026-08-08**: se corrige la descripción del motor de categorización, que no usa IA
  sino reglas deterministas por palabras clave, y se elimina "API de Claude" de las dependencias.
  Se reescriben RF-05, RF-06, RF-09, RF-10, RF-11, RF-20, RNF-05, AC-09 a AC-12 y el título. Se
  agregan las personas del producto, RF-25 a RF-81, RNF-06 a RNF-15, AC-30 a AC-75 y nueve ítems
  de Fuera de Alcance. Motivo: el PRD v1.1 no permitía reconstruir la aplicación — describía un
  motor de IA que no existe, un envío programado de notificaciones que no existe, y no contenía
  ningún requerimiento de interfaz.

  Se suman, del primer despliegue real, una dependencia y un riesgo: la interfaz y la API quedan
  publicadas en dominios distintos, lo que condiciona el mecanismo de sesión de RNF-06 y el
  control de acceso de AC-08; y la configuración que distingue un entorno desplegado de uno
  local tiene valor por defecto, un hueco que RNF-15 no cubre. Los detalles operativos del
  despliegue no viven acá: están en AGENTS.md.
- **v1.1 — 2026-07-30** (aprobado por el product owner): se agregan RF-24 (cierre de sesión explícito), RNF-05 (espera progresiva ante intentos de login fallidos), AC-28 y AC-29, y se declara fuera de alcance la recuperación de contraseña. Motivo: `specs/004-auth` requería estas dos capacidades y el PRD no las cubría; el Principio V de la constitución exige la enmienda antes de implementarlas, no una justificación en el plan.
- **v1.0** — versión inicial.

## Anexos

- kb.md — define los criterios de categorización automática, de extracción de campos desde texto/audio y el modelo de datos del gasto. Bloqueante para RF-05, RF-06, RF-25 a RF-33, AC-05, AC-06.

## Riesgos y Dependencias

- **Dependencia**: kb.md — bloqueante para RF-05, RF-06, RF-25 a RF-33, AC-05, AC-06.
- **Dependencia**: base de datos PostgreSQL con soporte de texto insensible a mayúsculas para los
  emails.
- **Dependencia**: servicio externo de transcripción de audio. Es la única dependencia de IA del
  producto y solo afecta a RF-34; toda la aplicación debe funcionar con la transcripción
  deshabilitada.
- **Dependencia**: la aplicación se publica como dos servicios en dominios distintos —la interfaz
  por un lado y la API por otro—, de modo que toda llamada del navegador cruza orígenes. Eso
  condiciona el mecanismo de sesión de RNF-06 y el control de acceso de AC-08: la cookie debe
  emitirse con los atributos que un navegador exige entre sitios distintos, y la API debe declarar
  un único origen autorizado. Un despliegue en un origen no declarado queda inutilizable, no
  degradado.
- **Riesgo**: el reconocimiento por palabras clave falla ante términos nuevos o regionales → se
  amplía la tabla de kb.md, y todo cambio en ella obliga a volver a medir RNF-02.
- **Riesgo**: reordenar categorías o mover una palabra clave de una a otra cambia clasificaciones
  ya funcionando → el orden de la tabla es normativo y su modificación exige volver a medir
  RNF-02.
- **Riesgo**: por audio no puede dictarse el marcador `#` ni el separador de descripción, de modo
  que un gasto ingresado por audio siempre nace con categoría automática y sin descripción → se
  asume; la corrección manual posterior está cubierta por RF-02.
- **Riesgo**: sin recuperación de contraseña, un olvido deja la cuenta inaccesible de forma
  definitiva → limitación aceptada y declarada en Fuera de Alcance; RNF-05 garantiza que ningún
  bloqueo por intentos fallidos sea permanente.
- **Riesgo**: la configuración que distingue un entorno desplegado de uno local tiene un valor
  por defecto, de modo que un despliegue al que se le omite queda corriendo con los ajustes de
  desarrollo sin emitir ningún error. RNF-15 no lo cubre: exige abortar ante una variable
  *requerida* ausente, y ésta no lo es. El síntoma aparece recién en el navegador, como un fallo
  de autenticación que no lo es → pendiente de decidir si se vuelve requerida.
