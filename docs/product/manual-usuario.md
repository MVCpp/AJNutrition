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

| Sección      | Para qué                                                        |
| ------------ | --------------------------------------------------------------- |
| 🏠 Inicio    | Resumen del día: citas de hoy y próximas                        |
| 📅 Agenda    | Citas por semana, reprogramar, registrar la consulta            |
| 👥 Pacientes | Alta de pacientes y acceso al expediente                        |
| 🥑 Alimentos | Catálogos USDA y de México, más los alimentos que usted capture |
| 🍲 Recetas   | Recetas con totales calculados                                  |
| 👤 Perfil    | Sus datos y logotipo para los PDF; asistente de IA              |
| ⚙️ Ajustes   | Bloqueo automático y respaldos automáticos                      |

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

Los datos de bioimpedancia se guardan **tal como los reporta el equipo** y
nunca se mezclan con las fórmulas: son dos fuentes distintas y así se ven.

En **Progreso** cada métrica es un botón: ábralo para ver un año de historia
con inicio, actual, cambio, mínimo, máximo y promedio. Con **📈 Reporte de
progreso** genera un PDF para el paciente: sólo lo medido y su evolución —
nunca sus notas ni su evaluación clínica.

Con **📷 Comparar fotos** vea el antes y el ahora lado a lado (misma pose).

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

## 8. Dos advertencias

- El **expediente exportado** (JSON) **no está cifrado**. Trátelo como un
  expediente impreso: quien tenga el archivo tiene los datos.
- Firmar una consulta es definitivo. Es intencional: un expediente clínico no
  debe poder reescribirse en silencio.
