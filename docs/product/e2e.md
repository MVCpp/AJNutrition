# Pruebas E2E (Playwright)

## Ejecución

```bash
pnpm --filter @ajnutrition/desktop package   # construye .vite/build + renderer
pnpm e2e                                     # corre e2e/app.spec.ts
```

En Windows, ambos comandos deben correrse desde PowerShell (no WSL), igual que
`pnpm dev`.

## Cómo se lanza la app

Playwright lanza el **binario de Electron de desarrollo**
(`node_modules/electron`) apuntando a `apps/desktop`, de modo que ejecuta el
mismo bundle de producción (`.vite/build/main.js`) que `pnpm package` acaba de
generar.

No se usa el `.exe` empaquetado: ese binario tiene el fusible
`EnableNodeCliInspectArguments` **desactivado** (endurecimiento de release,
ver `docs/security/threat-model.md`), lo que bloquea el driver de Playwright y
provoca un timeout al lanzar. Ese endurecimiento es intencional y no debe
relajarse para las pruebas.

## Aislamiento

Cada corrida arranca con dos variables de entorno:

- `AJN_USER_DATA_DIR` — carpeta temporal nueva; las pruebas **nunca** tocan la
  base de datos real de la consulta. También se aplica antes del bloqueo de
  instancia única, así que puede haber un `pnpm dev` abierto al mismo tiempo.
- `AJN_E2E=1` — omite el diálogo de confirmación al cerrar, que al ser
  síncrono bloquearía el cierre automatizado.

Ambas son inertes fuera de las pruebas.

## Cobertura actual

Un recorrido serial (el estado de cada paso alimenta al siguiente):

1. Configuración inicial: frase de acceso y cifrado de la base.
2. Clave de recuperación: se muestra una sola vez y exige confirmar que se
   guardó (el botón Continuar está deshabilitado hasta marcar la casilla).
3. Alta de paciente desde el modal dedicado.
4. Catálogo mexicano sembrado y buscable (badge MX).
5. Bloqueo y desbloqueo con la misma frase.
6. Entrenadores (C-1..C-3): alta de entrenador, vinculación de un paciente,
   consentimiento de transferencia a terceros, autorización con su alcance, y
   retiro del consentimiento.
7. Fotografías: consentimiento, alta mediante diálogo nativo, y cierre del
   visor con su propio botón.
8. Respaldo cifrado y exportación del expediente, verificados **sobre el
   archivo en disco**.

The suite also covers the unsaved-changes guard: typing in a consultation
raises the header warning, a manual lock answered with "no" leaves the app
unlocked with the text intact, and closing the form clears the warning.

### Why the coach journey is here and not only in the unit suite

Two properties are worth the cost of an E2E, because both are about whether a
rule is _reached_ rather than whether it is correct:

- **A referral link authorises nothing.** After linking a patient to a trainer,
  the panel still asks for a consent and offers no way to authorise anything.
- **Withdrawing the consent stops the sharing on the very next read.** The
  withdrawal is recorded on one tab and the authorisation is dead on the next —
  no job, no cache, no sweep.

That second test was verified to bite: deleting the `consent.status` check from
`evaluateCoachShare`, rebuilding and re-running fails exactly that test and
nothing else. If it ever passes with that check removed, it has stopped testing
what it claims to.

## Diálogos nativos

`answerNextDialog` hace que el proceso principal conteste su propio diálogo,
una sola vez, restaurando el original después de la llamada.

Existe porque **ninguna ruta de archivo viene del renderer**: siempre la elige
un diálogo nativo que vive en main, lo cual es una decisión de seguridad
deliberada (una ruta en un campo IPC sería una primitiva de escritura
arbitraria). El precio era que Playwright no podía tocar esos flujos. Con el
stub, todo sigue bajo prueba menos el selector del sistema operativo: el
handler, su contrato Zod, el caso de uso, la base de datos y la auditoría.

Los dos flujos que escriben datos del paciente a un archivo se verifican
**sobre los bytes en disco**, no sobre el mensaje en pantalla: un banner de
éxito es lo que el renderer cree; los bytes son lo que recibe un ladrón, un
regulador o el propio paciente. El respaldo se comprueba con una búsqueda de
bytes que NO encuentra el apellido, y la exportación con la misma búsqueda que
SÍ lo encuentra — el par es lo que hace significativa la primera.

The coach report export is **not** driven. It could be now — the stub handles
its save dialog like any other — but everything that decides whether it may be
produced is already covered above, and what the PDF contains is pinned by the
unit tests in `packages/reporting`.

## En CI

El job `E2E journey (windows)` corre el recorrido completo en cada push. Dos
pasos existen por razones que no son obvias:

- `pnpm fix:native` — pnpm instala el driver de SQLite para la ABI del Node del
  sistema; la suite lo ejecuta bajo Electron, que tiene otra. Sin esto la app
  muere al primer desbloqueo con `NODE_MODULE_VERSION`.
- `ELECTRON_SKIP_BINARY_DOWNLOAD: ''` a nivel de job — el workflow lo pone en
  `'1'` globalmente porque los demás jobs no necesitan el binario. Este sí: lo
  lanza.

Solo Windows: es la plataforma de la practicante (S-113), y una corrida de un
recorrido serial vale más que el mismo recorrido tres veces. Si falla, el
contexto que escribe Playwright se sube como artefacto `e2e-failure-context`,
que es la única forma de ver qué decía la pantalla.

## Running the unit suite the way CI does

Locally the suite is usually run through the Electron binary
(`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run`) because
better-sqlite3 is built against Electron's ABI. CI instead runs plain
`pnpm exec vitest run`, so a main-process module that imports `electron` at the
top level passes locally and fails there with "Electron failed to install
correctly". Keep testable main-process modules free of electron imports and let
the caller inject the electron-facing part — `appointment-reminders.ts` takes a
`notify` callback for exactly this reason.
