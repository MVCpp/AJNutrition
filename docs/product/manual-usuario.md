# NutriPlan — Manual de uso

Guía para la nutrióloga que usa la aplicación. Todo ocurre en esta
computadora: no hay servidores, no hay nube y nadie más puede ver los
expedientes.

---

## 1. La primera vez

Al abrir NutriPlan por primera vez aparece **Configuración inicial**.

1. Elija una **frase de acceso** larga y memorable (varias palabras poco
   relacionadas funcionan mejor que una contraseña corta y rara). Con ella se
   cifra toda la base de datos: sin la frase, los datos no pueden leerse.
2. La aplicación muestra **una sola vez** una **clave de recuperación**.
   Escríbala y guárdela fuera de esta computadora — en papel, en una caja
   fuerte o en un gestor de contraseñas.

> Si pierde la frase de acceso **y** la clave de recuperación, los expedientes
> son irrecuperables. Nadie puede descifrarlos: ni el desarrollador, ni
> soporte técnico, ni nosotros.

### Bloqueo

La aplicación se bloquea sola tras un periodo de inactividad, al bloquear o
suspender Windows y al cerrarla. Para desbloquear se pide la frase de acceso;
tras varios intentos fallidos hay que esperar unos segundos antes de
reintentar. El botón 🔒 **Bloquear** del encabezado la bloquea de inmediato.

El tiempo de inactividad se ajusta en ⚙️ **Ajustes**.

**Sobre lo que está escribiendo**: el bloqueo por inactividad **nunca se
pospone**. Ocurre justo cuando usted ya no está frente a la computadora, y
dejar un expediente abierto en una pantalla sola es peor que perder un
párrafo. Para que casi nunca se pierda nada:

- los **borradores de consulta se guardan solos** mientras escribe;
- si hay texto sin guardar, el encabezado muestra «● Cambios sin guardar»;
- al bloquear **usted mismo** con el botón 🔒, la aplicación le avisa antes.

Una consulta nueva que aún no ha guardado ni una vez sí se pierde: guárdela
una vez (queda como borrador) y a partir de ahí se cuida sola.

---

## 2. Las secciones

| Sección         | Para qué                                                          |
| --------------- | ----------------------------------------------------------------- |
| 🏠 Inicio       | Resumen del día: citas de hoy y próximas                          |
| 📅 Agenda       | Citas por semana, reprogramar, registrar la consulta              |
| 👥 Pacientes    | Alta de pacientes y acceso al expediente                          |
| 🏋️ Entrenadores | Entrenadores que le refieren pacientes, y quién entrena con quién |
| 🥑 Alimentos    | Catálogos USDA y de México, más los alimentos que usted capture   |
| 🍲 Recetas      | Recetas con totales calculados                                    |
| 👤 Perfil       | Sus datos y logotipo para los PDF; asistente de IA                |
| ⚙️ Ajustes      | Bloqueo automático y respaldos automáticos                        |

Puede cambiar de sección con un formulario a medio llenar: al volver, lo que
escribió sigue ahí.

---

## 3. Expediente del paciente

Desde **Pacientes**, «Nuevo paciente» pide nombre, fecha de nacimiento y sexo
al nacer (el resto es opcional). Al abrir un paciente se llega a su expediente,
organizado en pestañas:

- **Consultas** — notas SOAP (Subjetivo, Objetivo, Evaluación, Plan). Una
  consulta empieza como **borrador** y puede editarse; al **firmarla** queda
  inmutable. Lo que se firmó nunca se borra ni se reescribe: las correcciones
  se agregan como **enmiendas**, y ambas versiones quedan visibles.
  Dentro de cada consulta se capturan además laboratorios 🧪 y adherencia ✅.
  Con **Plantilla** inserta texto que usted misma guardó («Primera consulta —
  adulto», «Control mensual»): escriba una nota, pulse «Guardar como plantilla»
  y reutilícela cuantas veces quiera. Las plantillas no pertenecen a ningún
  paciente y borrar una no cambia ninguna consulta ya escrita.
- **Historia clínica** — antecedentes por categoría. También son entradas
  permanentes: corregir una crea una versión nueva y conserva la anterior.
- **Consentimientos** — quedan registrados con la decisión, la versión del
  aviso de privacidad y el método (verbal, escrito o digital). Retirar un
  consentimiento no borra el histórico.
- **Fotografías** — requieren consentimiento de fotografías vigente. Se
  guardan cifradas; nunca quedan como archivos de imagen normales.
- **Mediciones** — peso, talla, cintura, cadera, pliegues y composición
  corporal por bioimpedancia (InBody y similares).
- **Planes** — planes de alimentación.

### Mediciones y cálculos

Se capturan **valores medidos**; la aplicación calcula IMC, ICC, ICT, GER y
demás. Cada resultado guarda **qué fórmula y qué versión** lo produjo, así que
un cálculo hecho hoy sigue siendo interpretable dentro de dos años aunque la
fórmula cambie. Si el paciente queda fuera de la población del estudio
original, el valor se marca con una advertencia.

En ⚙️ Ajustes, **Fórmulas y versiones** revisa cuáles de sus resultados
guardados darían un valor distinto con la versión actual de su fórmula. Es
sólo un reporte: los resultados históricos nunca se reescriben, para que un
cálculo hecho hace un año siga significando lo mismo. Usted decide, paciente
por paciente, si vale la pena volver a medir.

Los datos de bioimpedancia se guardan **tal como los reporta el equipo** y
nunca se mezclan con las fórmulas: son dos fuentes distintas y así se ven.

En **Progreso** cada métrica es un botón: ábralo para ver un año de historia
con inicio, actual, cambio, mínimo, máximo y promedio. Con **📈 Reporte de
progreso** genera un PDF para el paciente: sólo lo medido y su evolución —
nunca sus notas ni su evaluación clínica.

Con **📷 Comparar fotos** vea el antes y el ahora lado a lado (misma pose).

---

## 3 bis. Entrenadores

Si un entrenador personal le manda varios de sus clientes, regístrelo en
**Entrenadores** y vincule a cada paciente desde la pestaña **Entrenador** de
su expediente. A partir de ahí puede filtrar la lista de pacientes por
entrenador y abrir un entrenador para ver a sus pacientes vinculados.

**Vincular a un entrenador no autoriza a enviarle nada.** Es una nota
administrativa suya, igual que saber qué médico refirió a alguien.

Para autorizar que un entrenador vea el progreso de un paciente hacen falta dos
pasos, en este orden:

1. Registre en la pestaña **Consentimientos** un consentimiento de
   **«Transferencia a terceros»** otorgado por el paciente.
2. En la pestaña **Entrenador**, elija ese consentimiento y marque qué podrá
   ver el entrenador.

**Cada consentimiento autoriza a un solo entrenador.** Si el paciente cambia de
entrenador, hace falta un consentimiento nuevo: el anterior amparaba otra
conversación.

Si el paciente retira el consentimiento, la autorización deja de tener efecto
**de inmediato**, sin que usted tenga que hacer nada más; la pantalla lo
indica. Nunca se comparten notas de consulta, antecedentes, padecimientos,
medicamentos, alergias, laboratorios ni diagnósticos, sin importar qué marque.

Con la autorización vigente aparece **«Generar reporte para el entrenador»**,
que guarda un PDF donde usted elija. Desde la ficha del entrenador puede
generar de una vez el reporte de todos sus pacientes: se crea un PDF por cada
paciente con autorización vigente y se le indica a quién se omitió y por qué.

El documento dice en su portada para quién se preparó, bajo qué consentimiento
y qué contiene; esa nota se repite en todas las páginas. **La aplicación nunca
envía nada por sí sola**: usted decide cuándo y a quién entrega el archivo.

Detalles que conviene saber:

- **Un paciente tiene un solo entrenador a la vez.** Si cambia de gimnasio,
  retire la vinculación y cree la nueva; la anterior se conserva en el
  historial.
- **Retirar una vinculación no borra nada.** Queda registrada, con la fecha.
- **Archivar a un entrenador** lo oculta de las listas pero no toca ninguna
  vinculación existente.
- Un paciente archivado deja de contar como paciente vinculado, aunque su
  vinculación sigue visible en su propio expediente.
- Las **notas del entrenador** son comerciales (tarifas, gimnasio). La
  información clínica de un paciente va en su expediente, nunca ahí.

---

## 4. Alimentos, recetas y planes

**Alimentos** trae dos catálogos incluidos:

- **USDA** — 299 alimentos de referencia (Foundation Foods).
- **México** — 1,748 alimentos de la Tabla de composición de alimentos
  extendida (CONABIO / INCMNSZ, 2019).

Los filtros de arriba permiten ver sólo los suyos, sólo los importados, sólo
USDA o sólo México. Los catálogos son de sólo lectura: para modificar uno,
créelo como alimento propio. También puede **importar un CSV** con sus
alimentos y etiquetar **alérgenos**.

**Archivar**: si capturó un alimento o una receta por error, o no quiere ver
cierto alimento del catálogo, use **Archivar**. No se borra nada: desaparece de
los buscadores y de los planes nuevos, pero los planes que ya hizo siguen
mostrándolo igual. Puede reactivarlo cuando quiera.

**Medidas caseras**: en cualquier alimento (incluidos los de los catálogos) puede
definir «1 pieza = 30 g» o «1 taza = 240 g» con el botón **Medidas**. Al armar un
plan elija la medida junto a la cantidad: el plan impreso dirá «2 × 1 pieza
(60 g)», que es lo que el paciente necesita leer. Los gramos siguen siendo la
base de todos los cálculos. Si más adelante corrige o borra una medida, los
planes ya entregados no cambian.

**Equivalentes (SMAE)**: en cada alimento, el botón **Equivalentes** permite
registrar «1 equivalente = N gramos» para el grupo que corresponda (verduras,
cereales sin grasa, AOA bajo aporte de grasa…). **La aplicación no trae esos
valores ni los inventa**: se toman de sus propias tablas del Sistema Mexicano
de Alimentos Equivalentes. Una vez registrados, cada día del plan muestra
cuántos equivalentes lleva por grupo, junto a los gramos y las kilocalorías de
siempre. Las recetas no se cuentan: habría que contar sus ingredientes uno por
uno, y contar medio plato sería peor que no contarlo.

Para no capturarlos uno por uno, **Importar equivalentes** carga un CSV con
las columnas `alimento, grupo, gramos`. El nombre debe coincidir exactamente
con el de la lista; si no se encuentra, si el grupo no existe o si el nombre
corresponde a dos alimentos, esa fila **no se importa y se le reporta**: una
coincidencia aproximada pondría el equivalente en el alimento equivocado.

Dentro de un plan, **Equivalentes prescritos** permite indicar cuántos
equivalentes por grupo debe llevar cada día («4 cereales sin grasa, 3 AOA bajo
aporte de grasa»). Cada día mostrará «llevados / prescritos» y se pondrá en
ámbar cuando falte o sobre más de medio equivalente.

**Distribución por comida**: reparta la energía del día entre desayuno,
colaciones, comida y cena (por ejemplo 25/10/30/10/25). Cada tiempo de comida
mostrará su objetivo en kcal y se pondrá en ámbar cuando se aleje más de 15 %.
Es una guía: nunca impide agregar nada.

**Versiones**: cada vez que **activa** un plan se guarda una copia de cómo
quedó — es lo que el paciente recibió ese día. Si después sigue editando el
plan, esas copias no cambian. El botón **Versiones** las muestra.

**Duplicar un plan**: dentro de un plan, **Duplicar plan** crea una copia con
los mismos días y alimentos. Si la copia es para **otro paciente**, se conservan
las kilocalorías pero la meta queda como _manual_: la medición del paciente
original nunca se le atribuye a alguien más.

**Planes**: se define la meta (desde una medición con GER × factor de
actividad, o manual en kcal), se agregan alimentos y recetas por día y comida,
y los totales se recalculan al momento. La aplicación **bloquea** alimentos que
contengan un alérgeno registrado como alergia vigente del paciente, y ⇄
**Sustituir** propone intercambios de la misma categoría con energía
equivalente. Un plan se exporta a **PDF** con su logotipo y sus datos.

**Recordatorios**: si los deja activados (⚙️ Ajustes), Windows le avisa unos
minutos antes de cada cita, mientras NutriPlan esté abierto y desbloqueado. El
aviso sólo dice la hora — nunca el nombre del paciente ni el motivo, porque los
avisos del sistema pueden verse con la pantalla bloqueada.

---

## 5. Respaldos — lo más importante de este manual

La computadora se puede perder, robar o descomponer. Los respaldos son la
única protección.

- **Manual**: botón **Crear respaldo** del encabezado. Genera un archivo
  `.ajnbackup` cifrado que sólo se abre con su frase de acceso.
- **Automático** (⚙️ Ajustes): elija una carpeta — idealmente en una **memoria
  externa o una carpeta sincronizada en la nube** — y active la casilla. Cada
  día se guarda una copia y se conservan las últimas N; las copias que usted
  creó a mano nunca se borran.

> Un respaldo en el mismo disco duro no sirve de nada si ese disco falla.

**Restaurar**: bloquee la aplicación; en la pantalla de bloqueo está
«Restaurar desde un respaldo». Se muestran primero los datos del archivo
(fecha, versión) y se pide la frase de acceso **con la que se creó ese
respaldo**. La restauración reemplaza los datos actuales y conserva una copia
de reversa. El respaldo incluye las fotografías, así que puede restaurarse en
una computadora nueva.

**Ensaye una restauración al menos una vez**, antes de necesitarla de verdad.

---

## 6. Asistente de IA (opcional)

Está apagado. Si lo activa en **Perfil**, con una clave de API de Anthropic,
puede generar **borradores** de resumen de evolución.

Antes de que salga cualquier dato de esta computadora deben cumplirse tres
condiciones: el asistente activado, una clave guardada y un consentimiento de
«Procesamiento con IA» **vigente para ese paciente**.

- **Se envía**: cifras ya calculadas, edad y sexo, con las fechas convertidas
  a días relativos.
- **Nunca se envía**: nombre, número de expediente, correo, teléfono, fechas
  reales ni el texto libre de sus notas.

El resultado es un borrador que aparece en una ventana de revisión, con una
advertencia de que puede contener errores. **No se guarda solo**: si le sirve,
usted lo copia. Los números los calcula siempre la aplicación, nunca el modelo.

---

## 7. Si algo sale mal

| Situación                            | Qué hacer                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Olvidó la frase de acceso            | Pantalla de bloqueo → «Olvidé mi frase de acceso» y use la clave de recuperación. Se le pedirá una frase nueva. |
| «Demasiados intentos fallidos»       | Es la protección contra adivinanzas. Espere los segundos indicados.                                             |
| «La base de datos local está dañada» | Restaure el respaldo más reciente desde la pantalla de bloqueo.                                                 |
| Falló una actualización              | Sus datos se restauran solos al estado anterior. Vuelva a instalar la versión anterior o restaure un respaldo.  |
| El respaldo automático no corre      | Revise en ⚙️ Ajustes que la carpeta exista (¿memoria desconectada?) y que la casilla esté activada.             |
| Un cálculo se ve raro                | Cada resultado indica su fórmula y versión; verifique los valores capturados en la medición.                    |

---

## 8. Suscripción

Solo aparece si su copia de NutriPlan requiere licencia. Lo encuentra en
**Ajustes → Suscripción**, y el estado también se muestra en la pantalla de
bloqueo, antes de escribir su frase de acceso.

| Estado            | Qué significa                                              |
| ----------------- | ---------------------------------------------------------- |
| Periodo de prueba | Todo funciona. Verá los días restantes.                    |
| Activa            | Todo funciona.                                             |
| Por vencer        | Su pago venció, pero **todo sigue funcionando** unos días. |
| Vencida           | **Solo lectura.**                                          |

**Lo más importante: sus expedientes siempre son suyos.** Aunque la suscripción
venza, puede seguir abriéndolos, buscándolos, imprimiéndolos, exportándolos y
respaldándolos exactamente como siempre. Lo único que no podrá hacer es
**guardar información nueva** —pacientes, consultas, mediciones o planes— hasta
que active una licencia. Bloquear y desbloquear la aplicación tampoco cambia.

Para activar una licencia: copie el texto que recibió (empieza con `NPL1.`) y
péguelo en Ajustes → Suscripción → **Activar licencia**. Si le enviaron un
archivo `.nplic`, use **Cargar desde archivo…** en su lugar.

Si pide soporte, mencione el **folio de licencia** y el **equipo** que aparecen
en esa misma pantalla. El identificador de equipo es un número aleatorio de
esta instalación: no dice nada de su computadora ni de sus pacientes.

---

## 9. Dos advertencias

- El **expediente exportado** (JSON) **no está cifrado**. Trátelo como un
  expediente impreso: quien tenga el archivo tiene los datos.
- Firmar una consulta es definitivo. Es intencional: un expediente clínico no
  debe poder reescribirse en silencio.
