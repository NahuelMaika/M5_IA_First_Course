# kb.md: Base de Conocimiento — Categorización y Extracción de Gastos

> Anexo del PRD-001. Define los criterios que usa el sistema para analizar el input
> (texto o audio transcripto), clasificar el gasto automáticamente, y el modelo de datos del gasto.
> Bloqueante para RF-05, RF-06, AC-05, AC-06 — ver PRD.md.

## Categorías Predefinidas

| Categoría       | Ejemplos de gasto                                  |
| --------------- | -------------------------------------------------- |
| Comida          | Supermercado, restaurantes, delivery, kiosco       |
| Transporte      | Nafta, colectivo, subte, taxi/remis, apps de viaje |
| Entretenimiento | Cine, streaming, salidas, bares                    |
| Servicios       | Luz, gas, agua, internet, celular,cable            |
| Salud           | Farmacia, médico, obra social, gimnasio            |
| Alquiler        | Alquiler de vivienda, expensas                     |
| Indumentaria    | Ropa, calzado                                      |
| Hogar           | Limpieza, bazar, ferretería, muebles               |
| Cuidado personal| Peluquería, perfumería, cosmética                  |
| Mascotas        | Veterinaria, alimento balanceado, accesorios       |
| Otros           | Cualquier gasto que no encaje en las anteriores    |

## Normalización y Tokenización (RF-05)

Todas las etapas del pipeline —fechas, marcador, numerales, monto, muletillas y palabras clave—
comparan "por token completo". Esta sección define qué es un token, de una sola vez, para que las
seis etapas comparen igual. Sin esto, cada etapa admitiría su propia interpretación y el set de
tests dorado no sería derivable (Principio III).

**Normalización para comparar.** Se aplica *solo al comparar*, nunca al valor guardado: el Lugar y
la Descripción se persisten tal como los escribió el usuario.

1. Minúsculas.
2. Unicode NFD y descarte de marcas diacríticas: `médico` ≡ `medico`, `sábado` ≡ `sabado`.
3. Colapso de espacios en blanco consecutivos y recorte de los extremos.

**Definición de token.** Un token es una secuencia maximal de letras y/o dígitos, con tres
excepciones que existen porque los ejemplos ya aprobados de este documento las exigen:

| Carácter | Corta el token | Motivo |
| --- | --- | --- |
| espacio, tabulación, salto de línea | **sí** | separador natural |
| `.` `,` entre dígitos | **no** | forman parte del número (`1.500`, `1500,50`) |
| `/` entre dígitos | **no** | forma parte de `dd/mm[/aaaa]` |
| `-` entre letras | **no** | `anti-mosquitos` es un solo token |
| `#` al inicio de un token | **no** | es el marcador de categoría |
| `$` | **no se descarta** | es la marca de Monto — ver abajo |
| cualquier otro signo de puntuación | **sí** | `café,` tokeniza a `café` y matchea Comida |

La puntuación que corta se descarta; no queda como token propio. Un token vacío nunca existe.

**El `$` y el `#` sobreviven a la tokenización a propósito**, y son las dos únicas marcas que lo
hacen: son señales que el usuario escribe con intención, no puntuación decorativa. Si el `$` se
descartara, las filas "varios números, exactamente uno con `$`" de la tabla de desempate del Monto
dejarían de ser evaluables y `2 cafés $3000` sería indistinguible de `2 cafés 3000`.

El `$` marca al número que le sigue en cualquiera de sus dos formas admitidas:

| Escrito | Tokeniza como | Número marcado |
| --- | --- | --- |
| `$3000` | un token `$3000` | `3000` |
| `$ 3000` | dos tokens, `$` y `3000` | `3000` |
| `3000$` | `3000` y un `$` que no precede a ningún número | **ninguno** — el `$` se descarta |
| `$` suelto, sin número después | un `$` sin efecto | ninguno |

**Definición de número.** Un número es un token compuesto **únicamente** por dígitos y, opcionalmente,
por los separadores `.` y `,` entre ellos, con un `$` inmediatamente adelante como único prefijo
admitido. Por lo tanto:

| Input | ¿Números? | Motivo |
| --- | --- | --- |
| `nafta 8000` | `8000` | token de solo dígitos |
| `local 24hs 5000` | `5000` | `24hs` mezcla dígitos y letras: **no** es número |
| `a las 21hs pizza 9000` | `9000` | idem — las expresiones de hora nunca aportan números |
| `ruta 2 5000` | `2`, `5000` | dos tokens numéricos → cae en la tabla de desempate del Monto |

`ruta 2 5000` termina **rechazado** por tener dos números sin `$`. Es deliberado: el sistema no
puede saber si `2` es la ruta o el precio, y ya está fijado que un valor de dinero adivinado en
silencio es peor que pedir el reingreso. El usuario desambigua con `ruta 2 $5000`.

**Largos máximos.** Ningún requisito los pide, pero un campo de texto sin techo en un endpoint
público es un defecto. Son guardas, no reglas de producto, y se rechazan antes de intentar
interpretar nada:

| Campo | Tope | Referencia |
| --- | --- | --- |
| Input crudo | 500 caracteres | el ejemplo más largo de este documento tiene 45 |
| Lugar | 200 | derivado del input, pero `PATCH` lo escribe directo |
| Descripción | 300 | idem |
| Nombre | 512 | cubre `Lugar - Descripción` en su peor caso (200 + 3 + 300) |
| Nombre de categoría | 60 | un nombre de categoría más largo no es un nombre |

**Signo menos.** El `-` solo sobrevive entre letras, así que nunca forma parte de un número: en
`café -500` el guion se descarta como puntuación y el número es `500`. Un monto negativo es por lo
tanto **inexpresable** desde el input, y no hace falta ninguna regla adicional para prohibirlo. La
regla de "monto no positivo se rechaza" queda cubriendo el único caso alcanzable por esta vía, el
cero, y el resto de los caminos de escritura (`PATCH`) donde el valor llega ya estructurado.

**Input vacío o solo espacios.** Se rechaza por la vía normal: no hay número, así que falla el Monto
por la primera fila de la tabla de desempate. No es un caso especial ni tiene un motivo de rechazo
propio.

## Extracción de Campos desde Texto Libre (RF-05)

Sobre el input crudo del usuario (ej: "nafta 8000 ayer"):

**Paso 0 — Corte por el separador de Descripción.** Si el input contiene ` - ` (guion rodeado de
espacios), el **primer** ` - ` parte el input en dos: el segmento izquierdo alimenta Monto, Lugar,
Cuando y Categoría; el derecho es Descripción literal. Exigir los espacios alrededor evita romper
palabras con guion. Si no hay separador, todo el input es el segmento izquierdo y Descripción queda
vacía. Monto, fecha y marcador de categoría se buscan **solo en el segmento izquierdo**.

**Forma exacta del separador**: guion medio ASCII (`-`, U+002D) con **al menos un** carácter de
espacio en blanco a cada lado. Varios espacios, o una tabulación, cuentan igual. **No** son
separadores el guion largo (`—`), el guion medio tipográfico (`–`) ni el espacio duro (U+00A0):
ninguno se escribe con el teclado sin intención, y aceptarlos volvería impredecible qué texto
termina en Descripción.

**Segmento izquierdo vacío** (`- solo un comentario`, o un input que arranca con el separador): se
rechaza. No hay Monto ni Lugar de dónde sacarlos, así que cae bajo el mismo criterio que cualquier
otro input sin Monto. La edge case ya documentada cubre el caso simétrico —segmento derecho vacío—
que **no** se rechaza.

- **Monto**: valor numérico del segmento izquierdo, interpretado con **convención es-AR**: el punto separa miles y la coma separa decimales (`$1.500` → `1500`; `1500,50` → `1500.50`). Las referencias temporales se reconocen y se quitan **antes** de buscar el monto, para que una fecha con dígitos no se confunda con el importe. Los numerales escritos en palabras ya fueron convertidos a dígitos en este punto (ver "Numerales en Palabras"). Obligatorio; se rechaza el input y se pide reingreso si el monto no es mayor que cero. Cuál número gana, sobre los que quedan:

  | Números presentes | Resultado |
  |---|---|
  | Ninguno | Rechazo |
  | Exactamente uno | Ese es el Monto, lleve `$` o no |
  | Varios, exactamente uno con `$` | Gana el que lleva `$` (`"2 cafés $3000"` → 3000) |
  | Varios, ninguno con `$` | **Rechazo** (`"2 cafés 3000"` es ambiguo) |
  | Varios, más de uno con `$` | Rechazo |

  El sistema nunca elige por posición ni por tamaño: en un campo de dinero, un valor adivinado en silencio es peor que pedir el reingreso.

  **Forma del `$`**: prefijo pegado al número (`$3000`) o separado por espacios (`$ 3000`). Nunca
  sufijo: `3000$` no lleva marca. Una sola convención mantiene evaluable la tabla de desempate.

  **Formas malformadas — todas se rechazan**, por la misma razón que la fila "varios sin `$`":

  | Input | Resultado | Motivo |
  | --- | --- | --- |
  | `café 1.5` | **Rechazo** | grupo de miles de menos de tres dígitos. No es 1500 ni 1,5: es ambiguo, y elegir una lectura es adivinar |
  | `café 1.50` | **Rechazo** | idem |
  | `café 1500,555` | **Rechazo** | más de dos decimales. No se trunca ni se redondea |
  | `café 1.500,50` | 1500.50 | bien formado: grupos de miles de tres dígitos y dos decimales |

  El monto máximo aceptado es 999.999.999,99, el mismo tope que los numerales en palabras.
- **Lugar**: lo que queda del segmento izquierdo después de quitar el monto, las palabras de fecha reconocidas, el marcador de categoría y las muletillas (ver "Descarte de Muletillas"). Obligatorio — mismo criterio de rechazo que Monto, evaluado **después** del descarte.
- **Cuando**: se reconoce un **conjunto cerrado** de referencias temporales, comparando por token completo y sin distinguir mayúsculas ni acentos (`sábado` = `sabado`):
  - `hoy` → fecha actual; `ayer` → un día atrás; `anteayer` → dos días atrás.
  - Nombre de día de la semana (`lunes`…`domingo`): resuelve a la ocurrencia más reciente sin pasarse de hoy; si el día nombrado es hoy, resuelve a hoy.
  - Fecha explícita `dd/mm` (año en curso) o `dd/mm/aaaa`, con el **día primero** (convención es-AR): `3/8` es 3 de agosto.

  Si el input trae varias referencias reconocidas, la **primera** define Cuando; todas se quitan igual del texto antes de calcular Lugar. Si la fecha resultante es futura, se rechaza el input y se pide reingreso: un gasto registra dinero ya gastado. Si no hay ninguna referencia, se aplica RF-07 (fecha actual).

  **`dd/mm` calendario-inválido** (`31/2`, `45/13`, `0/5`): **no se reconoce** como referencia
  temporal. No es un error de fecha, es texto que no matchea el conjunto cerrado — así que queda
  dentro de Lugar, exactamente igual que `hace 3 días` o `el finde`. La consecuencia es coherente y
  vale documentarla: al no reconocerse, sus dígitos siguen siendo un número y pueden disparar el
  rechazo por varios números sin `$`.

  **Piso de retroactividad**: la fecha del gasto no puede ser anterior al primer día del mes que
  queda **12 meses cerrados** hacia atrás — la misma ventana que ya acota la generación de resúmenes
  mensuales (RF-11, FR-040). No es una constante nueva: es la misma. Con eso, todo gasto que se puede
  cargar cae dentro de una ventana que el sistema todavía podría resumir, y un año tipeado mal
  (`3/8/1998`) se rechaza en vez de crear un gasto que ningún resumen va a cubrir jamás.

  **`dd/mm` que resuelve al futuro** (`31/12` cargado en enero): se **rechaza**, sin inferir el año
  anterior. El día de la semana sí resuelve hacia atrás, pero ahí la ocurrencia pasada es la única
  lectura posible; en `dd/mm` el usuario pudo tipear mal el día tanto como haber querido el año
  pasado, y elegir por él es adivinar. Quien quiso diciembre pasado escribe `31/12/2025`.

  **Frontera de token**: `dd/mm[/aaaa]` matchea como token completo, igual que el resto del
  conjunto cerrado. `3/8` matchea; `ruta3/8` no, porque es un solo token con letras.

  **Expresiones de hora** (`a las 3`, `21hs`, `20:30`) no pertenecen al conjunto cerrado y **no** se
  reconocen. `21hs` no es número por mezclar dígitos y letras, así que no interfiere con el Monto;
  `a las 3` sí deja un número suelto y puede disparar el rechazo por ambigüedad. Es el
  comportamiento buscado: el sistema no adivina si ese `3` es la hora o el precio.
- **Categoría**: solo se toma del input mediante el **marcador explícito** `#nombre` (un token, sin espacios, ej: `"milanesas 18000 #almuerzos"`). El marcador se quita del texto antes de calcular Lugar. Si el nombre marcado no corresponde a una categoría existente, se crea (RF-14, RF-15). Sin marcador —o con un `#` suelto o seguido de espacio, que no cuenta como marcador— se aplica la Categorización Automática (más abajo) y **nunca** se crea una categoría.

  - **Caracteres válidos** después del `#`: letras (con acentos y `ñ`), dígitos, `-` y `_`. Ningún
    otro. El nombre resultante debe cumplir además la validación de nombre de categoría (RF-19: no
    vacío). Un `#` seguido de un carácter no admitido no es marcador y queda como texto común.
  - **Resolución contra las existentes**: con **la misma normalización** que define la unicidad de
    nombres de categoría —minúsculas, sin acentos, espacios colapsados—. Es obligatorio que sea la
    misma: si el marcador resolviera por coincidencia exacta, `#Almuerzos` crearía un duplicado de
    `almuerzos` que la propia regla de unicidad prohíbe.
  - **Alcance de la resolución**: solo las categorías visibles para ese usuario —predefinidas
    vigentes y propias vigentes—. Nunca la categoría de otro usuario.
  - **Nombre que coincide con una categoría dada de baja**: se crea una **nueva**. Una baja lógica
    libera el nombre, así que reusarlo es crear, no revivir. La categoría vieja sigue dada de baja y
    sus gastos históricos siguen apuntando a ella.
  - **Varios marcadores** (`#a #b`): gana el **primero**, y todos se quitan del texto antes de
    calcular Lugar. Es la misma regla que ya rige para varias referencias temporales.
  - **Rechazo posterior del input**: si el input se rechaza por falta de Monto o de Lugar, **no se
    crea ninguna categoría**. La creación del marcador y la del gasto ocurren en la misma
    transacción; un input rechazado no deja rastro.
- **Descripción**: el segmento a la derecha del separador ` - `, tomado **literal**: no se le quitan muletillas, ni fechas, ni montos, porque es un comentario del usuario y no un campo a interpretar. Sin separador, o si el segmento derecho queda vacío (ej: input terminado en ` - `), Descripción queda vacía.

Ejemplos del corte por separador (el Nombre generado por RF-22 se muestra para ver la simetría):

| Input del usuario                             | Lugar       | Descripción           | Nombre generado                    |
| --------------------------------------------- | ----------- | --------------------- | ---------------------------------- |
| `milanesas 18000`                             | `milanesas` | (vacía)               | `milanesas`                        |
| `milanesas 18000 - con los pibes`             | `milanesas` | `con los pibes`       | `milanesas - con los pibes`        |
| `gasté 18000 en milanesas hoy - cumple de Ana`| `milanesas` | `cumple de Ana`       | `milanesas - cumple de Ana`        |
| `compré un anti-mosquitos 4000`               | `anti-mosquitos` | (vacía)          | `anti-mosquitos`                   |
| `milanesas 18000 - `                          | `milanesas` | (vacía)               | `milanesas`                        |

## Numerales en Palabras (RF-05, AC-06)

El audio es la razón de esta regla: nadie dicta "mil quinientos" esperando que se escriba `1500`, y
los transcriptores devuelven a veces dígitos y a veces palabras. Sin este paso, AC-06 se cumpliría
solo cuando el proveedor coopera, que no es un criterio evaluable. La conversión aplica también al
texto tipeado, porque el audio y el texto deben compartir exactamente las mismas reglas (AC-06).

**Posición en el pipeline**: sobre el segmento izquierdo, después de quitar las referencias
temporales y el marcador de categoría, y **antes** de buscar el Monto. La Descripción nunca se
convierte: es texto literal.

**Tabla de numerales** (comparación por token completo, sin distinguir mayúsculas ni acentos):

| Rango           | Tokens                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 0–15            | `cero`, `uno`, `dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve`, `diez`, `once`, `doce`, `trece`, `catorce`, `quince` |
| 16–29           | `dieciséis`…`diecinueve`, `veinte`, `veintiuno`/`veintiún`, `veintidós`…`veintinueve` (un solo token)                              |
| Decenas         | `treinta`, `cuarenta`, `cincuenta`, `sesenta`, `setenta`, `ochenta`, `noventa`                                                    |
| Centenas        | `cien`, `ciento`, `doscientos`, `trescientos`, `cuatrocientos`, `quinientos`, `seiscientos`, `setecientos`, `ochocientos`, `novecientos` |
| Multiplicadores | `mil`, `millón`, `millones`                                                                                                       |

**Reglas de composición**:

1. **Secuencia contigua**: los tokens numerales adyacentes forman un único numeral. `mil quinientos`
   → 1500. La `y` que une una decena con su unidad (`treinta y cinco`) forma parte del numeral y no
   se trata como conector.
2. **Suma dentro del grupo, multiplicación con `mil` / `millones`**: `dos mil trescientos` → 2300;
   `un millón` → 1000000.
3. **Tope**: se soportan valores hasta 999.999.999. Un numeral mayor no se reconoce y queda como
   texto, con lo cual el input termina rechazado por falta de Monto.
4. **Sin decimales**: no se convierten formas como `mil quinientos con cincuenta`. Los centavos
   dictados no están soportados; en ARS prácticamente no se usan y admitirlos duplicaría la
   gramática.
5. **`un`, `una`, `uno` aislados NO se convierten.** Son artículos, y están en la lista de
   conectores del Descarte de Muletillas. Solo valen como numeral cuando integran una secuencia
   mayor (`un millón`, `veintiún mil`). Sin esta excepción, `me compré una remera 25000` y
   `compré un anti-mosquitos 4000` pasarían a tener dos números sin `$` y serían rechazados,
   contradiciendo los ejemplos ya aprobados de este documento.
6. **Moneda adyacente**: `peso` o `pesos` inmediatamente a continuación del monto reconocido se
   descarta junto con él (`mil quinientos pesos` → `1500`). No se reconoce ninguna otra unidad ni
   abreviatura.

Una vez convertido, el valor entra a la tabla de desempate de Monto **sin ningún privilegio**: si
quedan varios números y ninguno lleva `$`, el input se rechaza igual. Un numeral en palabras no es
más confiable que uno en dígitos.

| Input (tipeado o transcripto)         | Monto | Lugar       | Resultado                                                             |
| ------------------------------------- | ----- | ----------- | --------------------------------------------------------------------- |
| `gasté mil quinientos en nafta`       | 1500  | `nafta`     | Transporte                                                            |
| `mil quinientos pesos de luz`         | 1500  | `luz`       | Servicios                                                             |
| `treinta y cinco mil el alquiler`     | 35000 | `alquiler`  | Alquiler                                                              |
| `me compré una remera 25000`          | 25000 | `remera`    | Indumentaria — `una` aislada no es numeral (regla 5)                  |
| `dos cafés mil quinientos`            | —     | —           | Rechazo: dos números y ninguno con `$`                                |
| `gasté mil en nafta el tres de agosto`| —     | —           | Rechazo: `tres` es numeral y `de agosto` no es referencia temporal reconocida |

## Descarte de Muletillas (RF-05)

El usuario habla natural ("gasté 18000 en milanesas hoy"), no telegráfico. Sin este paso, el verbo y
la preposición terminan dentro de Lugar, ensucian el Nombre generado (RF-22) y arrastran ruido a la
categorización por palabras clave (RF-06).

La limpieza es **determinista**: se aplica sobre el texto que queda tras quitar Monto, las palabras
de fecha y el marcador de categoría, en este orden y sin intervención de IA.

1. **Comparación**: siempre por **token completo**, sin distinguir mayúsculas ni acentos. Nunca por
   substring — así `cable` no pierde la `a` de la lista y `delivery` queda intacto.
2. **Quitar verbos de gasto** en cualquier posición: `gasté`, `gasto`, `gastamos`, `pagué`, `pago`,
   `pagamos`, `compré`, `compra`, `compramos`, `puse`, `salió`, `costó`, `me`, `se`, `fue`.

   Esta lista y la de conectores del punto 3 son **cerradas y normativas**, con el mismo estatus que
   la tabla de palabras clave: agregar o quitar un token es un cambio de comportamiento, obliga a
   revisar la invariante de disjunción contra las palabras clave y sus plurales, y obliga a volver a
   medir SC-003.
3. **Recortar conectores en los extremos**: mientras el primer o el último token esté en `en`, `de`,
   `del`, `a`, `al`, `por`, `para`, `con`, `y`, `el`, `la`, `los`, `las`, `un`, `una`, `lo`, `que`,
   `mi` — se descarta y se vuelve a evaluar. Los conectores **interiores no se tocan**, para no
   romper lugares con nombre compuesto (`obra social`, `casa de comidas`).

   El bucle **termina** cuando ni el primer ni el último token están en la lista, o cuando no queda
   ningún token. "Extremo" siempre se evalúa sobre el estado actual: quitar un token convierte a su
   vecino en el nuevo extremo y vuelve a evaluarse. Con un solo token restante que esté en la lista,
   se descarta y Lugar queda vacío. Así el resultado es único e independiente del orden en que se
   recorra, que es lo que hace derivable el set de tests.
4. **Normalizar espacios**. Si Lugar queda vacío, se rechaza el input y se pide reingreso (mismo
   criterio que Monto ausente). **Solo el vacío rechaza**: un Lugar de un único carácter o de un
   único token corto (`kiosco`, `luz`, `x`) es válido y se acepta. No existe un largo mínimo — la
   evidencia de qué se compró es del usuario, y exigirle más caracteres sería inventar una regla que
   ningún requisito pide.

Ningún token de esta lista pertenece a la tabla de palabras clave de Categorización Automática **ni a
sus plurales derivados** (regla 3 de las Reglas de coincidencia), así que el descarte nunca puede
hacer perder una categoría. Esta invariante debe cubrirse con un test que recorra ambas listas: es la
única forma de que agregar una muletilla más adelante no rompa una categoría en silencio.

Los ejemplos de abajo no llevan separador ` - `, así que en todos Descripción queda vacía.

| Input del usuario                 | Lugar resultante | Categoría   |
| --------------------------------- | ---------------- | ----------- |
| `café 1500`                       | `café`           | Comida      |
| `nafta 8000 ayer`                 | `nafta`          | Transporte  |
| `gasté 18000 en milanesas hoy`    | `milanesas`      | Comida (`milanesa` + plural) |
| `pagué 12000 de luz`              | `luz`            | Servicios   |
| `me compré una remera 25000`      | `remera`         | Indumentaria |
| `cena en la casa de mi vieja 3000`| `cena en la casa de mi vieja` | Comida (`cena`) |
| `gasté 5000 en`                   | (vacío)          | rechazado   |
| `milanesas 18000 #almuerzos`      | `milanesas`      | `almuerzos` (se crea si no existe) |
| `pagué 3000 de nafta # ayer`      | `nafta`          | Transporte (el `#` suelto no es marcador) |

## Extracción desde Audio (RF-05, AC-06)

El audio se transcribe a texto y se procesa con las mismas reglas de las secciones anteriores. No hay reglas de extracción distintas para audio — la única diferencia es el paso previo de transcripción.

Esa simetría es la que hace que AC-06 dependa de "Numerales en Palabras": como el monto dictado llega
transcripto como palabras o como dígitos según el proveedor, la conversión de numerales es lo que
permite que un audio con Monto y Lugar produzca siempre el mismo gasto que el texto equivalente.

## Categorización Automática (RF-06)

Si el input no trae el marcador `#nombre`, el sistema busca coincidencias de palabras clave **solo en Lugar** contra la lista de abajo. La primera categoría con coincidencia gana. Si ninguna matchea, se asigna **Otros**.

**Reglas de coincidencia.** Son las mismas del Descarte de Muletillas, para que todas las etapas del pipeline comparen igual:

1. **Por token completo, nunca por substring**, sin distinguir mayúsculas ni acentos (`medico` = `médico`, `Almacen` = `almacén`). Por lo tanto `supermercadito` **no** matchea `supermercado`, y `naftalina` **no** matchea `nafta`: ante evidencia parcial el sistema asigna `Otros` y deja que el usuario corrija, en lugar de afirmar una categoría con seguridad (Principio II de la constitución).
2. **Las palabras clave de más de un token** (`obra social`) matchean únicamente como **secuencia contigua de tokens en ese orden**: matchean dentro de `obra social swiss medical`, pero no si los dos tokens aparecen separados o invertidos.
3. **Cada palabra clave matchea también su plural regular**, porque la gente escribe `farmacias` y
   `dos cines` con la misma naturalidad que el singular. La derivación es mecánica, no hay una
   segunda tabla que mantener sincronizada:

   | Terminación de la clave       | Plural            | Ejemplos                                          |
   | ----------------------------- | ----------------- | ------------------------------------------------- |
   | Vocal no acentuada            | `+s`              | `farmacia`→`farmacias`, `cine`→`cines`, `taxi`→`taxis` |
   | Consonante distinta de `z`    | `+es`             | `bar`→`bares`, `tren`→`trenes`, `remis`→`remises`, `doctor`→`doctores` |
   | `z`                           | `z` → `ces`       | `luz`→`luces`                                     |

   Las claves de más de un token pluralizan todos sus tokens (`obra social` → `obras sociales`).
   `expensas` y `anteojos` ya figuran en plural, así que matchean además sus singulares `expensa` y
   `anteojo`. Las marcas, siglas y extranjerismos **no** tienen forma plural reconocida: no
   pluralizan de forma regular en español y generar `netflixes` sería ruido sin ningún input real
   detrás. La lista invariante es: `delivery`, `streaming`, `netflix`, `spotify`, `uber`, `cabify`,
   `internet`, `edenor`, `edesur`, `rappi`, `pedidosya`, `mcdonalds`, `coto`, `carrefour`, `jumbo`,
   `changomas`, `makro`, `ypf`, `shell`, `axion`, `didi`, `gnc`, `vtv`, `abl`, `arba`, `afip`,
   `wifi`, `flow`, `telecom`, `movistar`, `fibertel`, `telecentro`, `directv`, `metrogas`, `aysa`,
   `disney`, `youtube`, `twitch`, `steam`, `xbox`, `playstation`, `nintendo`, `osde`, `swiss`,
   `medicus`, `galeno`, `gym`, `spa`, `jean`, `sommier`, `shampoo`.

   El plural no relaja la regla 1: se sigue comparando por token completo, así que `farmacias`
   matchea y `farmacéutica` no.
4. **El orden de las categorías en la lista de abajo es normativo**: define cuál gana cuando Lugar contiene palabras clave de más de una. `super y farmacia` cae en Comida porque Comida está antes que Salud. Reordenar la lista, o mover una palabra clave de una categoría a otra, es un cambio de comportamiento y obliga a volver a medir RNF-02 / SC-003.

**La categorización automática corre una sola vez, al crear el gasto.** Editar el `Lugar` de un
gasto existente **no** vuelve a categorizarlo: la categoría queda como está y se cambia a mano si
hace falta. Es lo que preserva la medición de RNF-02 / SC-003, que compara la categoría sugerida al
crear contra la vigente hoy — si una edición del Lugar recategorizara en silencio, el sistema
estaría corrigiéndose a sí mismo y contándolo como acierto propio. También evita el efecto sorpresa
de que arreglar un typo en el Lugar te mueva la categoría que ya habías elegido a mano.

La Descripción **nunca** influye en la categoría, aunque contenga palabras clave: es un comentario narrativo del usuario, no evidencia de qué se compró. Dejarla clasificar haría que `"milanesas 18000 - fuimos al cine después"` cayera en Entretenimiento por el `cine` del comentario, cuando lo que se compró fueron milanesas — una categoría equivocada afirmada con seguridad, que es justo lo que prohíbe el Principio II de la constitución. Cotejando solo Lugar, ese gasto resuelve por `milanesa` → Comida. Y cuando ni Lugar aporta evidencia, el sistema asigna `Otros` y deja que el usuario corrija.

El número de cada categoría **es** su orden de evaluación (regla 4). `Otros` no figura acá: no tiene
palabras clave, es el resultado cuando ninguna de las diez matchea.

**1. Comida** (66)
: supermercado, super, almacén, restaurante, delivery, kiosco, verdulería, panadería, desayuno,
  almuerzo, merienda, cena, vianda, picada, café, cafetería, milanesa, empanada, pizza, hamburguesa,
  asado, choripán, pancho, sándwich, sanguche, sushi, tarta, ensalada, medialuna, pan, helado,
  alfajor, galletita, chocolate, yerba, gaseosa, fiambre, queso, leche, huevo, carne, pollo,
  pescado, verdura, fruta, fideo, arroz, rotisería, carnicería, pescadería, fiambrería, heladería,
  pizzería, parrilla, dietética, comedor, mayorista, chino, rappi, pedidosya, mcdonalds, coto,
  carrefour, jumbo, changomas, makro

**2. Transporte** (35)
: nafta, combustible, colectivo, subte, tren, taxi, remis, uber, cabify, peaje, estacionamiento,
  gnc, gasoil, ypf, shell, axion, bondi, sube, micro, combi, pasaje, boleto, didi, cochera, garaje,
  gomería, lavadero, mecánico, taller, vtv, patente, autopista, avión, moto, bicicleta

**3. Entretenimiento** (28)
: cine, streaming, netflix, spotify, bar, boliche, previa, salida, teatro, recital, concierto, show,
  festival, museo, disney, youtube, twitch, steam, playstation, xbox, nintendo, videojuego, pub,
  bowling, karaoke, fiesta, cancha, fútbol

**4. Servicios** (23)
: luz, gas, agua, internet, celular, cable, edenor, edesur, metrogas, aysa, telecom, movistar,
  fibertel, flow, telecentro, directv, abl, arba, afip, monotributo, impuesto, wifi, teléfono

**5. Salud** (42)
: farmacia, médico, doctor, obra social, gimnasio, dentista, oculista, prepaga, osde, swiss, galeno,
  medicus, hospital, clínica, sanatorio, laboratorio, análisis, radiografía, vacuna, kinesiólogo,
  psicólogo, psiquiatra, nutricionista, pediatra, ginecólogo, cardiólogo, traumatólogo, dermatólogo,
  terapia, remedio, medicamento, pastilla, gym, pilates, yoga, natación, pádel, masaje, óptica,
  anteojos, lente, ortodoncia

**6. Alquiler** (4)
: alquiler, expensas, renta, inmobiliaria

**7. Indumentaria** (14)
: ropa, indumentaria, remera, pantalón, jean, campera, buzo, camisa, vestido, pollera, abrigo,
  zapatilla, zapato, calzado

**8. Hogar** (21)
: ferretería, bazar, mueble, colchón, sommier, sábana, toalla, almohada, cortina, vajilla, olla,
  sartén, detergente, lavandina, jabón, escoba, trapo, limpieza, lamparita, enchufe, herramienta

**9. Cuidado personal** (16)
: peluquería, peluquero, barbería, barbero, manicura, pedicura, depilación, tintura, perfumería,
  perfume, shampoo, champú, desodorante, maquillaje, cosmética, spa

**10. Mascotas** (9)
: veterinaria, veterinario, mascota, perro, gato, balanceado, cucha, antipulgas, pipeta

**Total: 258 palabras clave.**

Dos decisiones de esta lista que no se leen solas:

- **`comida` NO es palabra clave de Comida**, a propósito. Con Mascotas al final del orden,
  `"comida para perro"` matchearía `comida` en la categoría 1 y nunca llegaría a `perro` en la 10.
  Sin esa clave, resuelve por `perro` → Mascotas, y `"comida 5000"` a secas cae en `Otros`, que es
  lo honesto: no dice qué se compró.
- **Las categorías 7 a 10 se agregaron al final** justamente porque el orden es normativo:
  appendear no altera ninguna clasificación que ya funcionaba.

## Modelo de Datos: Gasto

Campos que el sistema debe registrar en cada gasto (soporta RF-01):

| Campo       | Descripción                                     |
| ----------- | ----------------------------------------------- |
| Monto       | Monto que se gastó.                             |
| Lugar       | Lugar o en qué se gastó.                        |
| Cuando      | Fecha del gasto.                                |
| Categoría   | Categoría a la que pertenece el gasto.          |
| Descripción | Comentario opcional sobre el gasto.             |
| Nombre      | Identificador simple del gasto para el usuario. |
| Tipo        | Personal o Pareja.                              |

## Reglas de Completado por Defecto

- **Cuando** (RF-07): si no se especifica, se usa la fecha actual del sistema.
- **Nombre** (RF-22): si no se especifica, `Lugar` si Descripción está vacía, o `"Lugar - Descripción"` si Descripción fue ingresada.

  El Nombre generado contiene el mismo ` - ` que actúa como separador en el input, y eso es
  intencional: el separador solo se interpreta al **leer** un input crudo. El Nombre es una cadena de
  presentación, se guarda ya resuelta y **nunca se vuelve a parsear**, así que no hay ambigüedad
  posible. Alcanza con no reinyectar un Nombre guardado por la vía de creación desde texto libre.
- **Tipo** (RF-23): si no se especifica, `Personal`.
