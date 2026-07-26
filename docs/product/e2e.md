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
