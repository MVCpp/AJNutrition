# Catálogo mexicano incluido (INCMNSZ / CONABIO)

## Fuente

- **Base**: "Tabla de composición de alimentos extendida 2019", compilada por el
  Instituto Nacional de Ciencias Médicas y Nutrición Salvador Zubirán (INCMNSZ)
  y publicada por CONABIO en el SiAgroBD.
- **Portal**: https://nutricion-siagro.conabio.gob.mx/ (API GraphQL
  `https://nutricion-siagro.conabio.gob.mx/graphql`, modelo `registros`).
- **Fecha de descarga**: 2026-07-25 (3,930 registros).
- **Licencia**: Creative Commons Atribución 4.0 Internacional (CC BY 4.0),
  compatible con LibreUso MX, según se declara en
  https://siagro.conabio.gob.mx/ (sección "Cómo citar y contacto").
- **Cita oficial**: Bourges Rodríguez, H. G. N., Camacho Parra, M. A., Morales
  Guerrero, J. C. 2019. "Composición de alimentos mexicanos Base de Datos
  Extensa". Instituto Nacional de Ciencias Médicas y Nutrición Salvador
  Zubirán.

## Reglas de inclusión (sin inventar datos)

- Los valores son **verbatim, por 100 g de porción comestible**, tal como los
  publica la fuente (notas técnicas del propio dataset).
- Solo se incluye un alimento si tiene los **cuatro macros base**: Energía
  [kcal], Proteína bruta [g], Hidratos de carbono [g] y Extracto etéreo [g].
  1,211 registros se omitieron por macros incompletos; nunca se rellenan
  con ceros ni se estiman.
- **Fibra**: solo se usa "Fibra dietaria total". La "Fibra bruta" (cruda) no
  es fibra dietética y se ignora deliberadamente.
- **Sodio** [mg] se incluye cuando existe.
- La tabla original contiene múltiples muestras regionales del mismo
  alimento. Se incluye **una muestra representativa por nombre**: la de panel
  nutrimental más completo, con desempate por `conabio_id` más bajo (971
  muestras duplicadas colapsadas). Los valores siguen siendo verbatim de esa
  muestra exacta y `conabio_id` enlaza al registro original.
- **Alérgenos**: inferencia conservadora solo de identidad (el alimento ES el
  alérgeno: queso → leche, camarón → crustáceos). La nutrióloga puede
  reetiquetar cualquier alimento del catálogo.

## Resultado

1,748 alimentos incluidos con `source = 'mx'`, sembrados de forma idempotente
al desbloquear (clave de idempotencia: `conabio_id` único, migración 20). Las
filas del catálogo son de solo lectura; las etiquetas de alérgenos sí son
editables.

## Actualización

1. Descargar el dump completo del modelo `registros` (GraphQL, paginado con
   `registros(pagination:{limit,offset})`, incluyendo
   `caracteristicas_cuantitativasConnection`).
2. `node scripts/generate-mx-catalog.mjs <registros.json> <fecha YYYY-MM-DD>`
3. Revisar el diff de `packages/database/src/mx/catalog.ts` y correr las
   pruebas (`mx/seed.test.ts`).
