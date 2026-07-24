# Catálogo alimentario USDA FoodData Central

La aplicación incluye un catálogo base de alimentos tomado de **USDA FoodData
Central, colección "Foundation Foods", versión 2025-04-24**.

- **Fuente**: <https://fdc.nal.usda.gov/download-datasets>
- **Licencia**: dominio público (CC0). Cita sugerida: _U.S. Department of
  Agriculture, Agricultural Research Service. FoodData Central.
  fdc.nal.usda.gov._
- **Contenido**: 299 alimentos con valores por 100 g de porción comestible
  (energía, proteína, hidratos de carbono, lípidos y, cuando la fuente los
  reporta, fibra y sodio). Los alimentos de la colección que no reportan los
  cuatro macronutrientes básicos se omiten (41 en esta versión): un valor
  ausente nunca se inventa como cero.
- **Energía**: se prefiere el valor medido en kcal (nutriente 1008); si no
  existe, factores de Atwater generales (2047) y por último específicos (2048).
- **Hidratos por diferencia**: la fuente puede reportar valores ligeramente
  negativos en carnes (artefacto de medición que significa «efectivamente
  cero»); los valores entre −1 y 0 g se registran como 0 y cualquier valor
  menor a −1 g descarta el alimento.
- **Nombres**: los valores nutrimentales son textuales de la fuente; solo el
  nombre visible se localiza a es-MX mediante un diccionario de frases en
  `scripts/generate-fdc-catalog.mjs`. El campo `nameEn` del módulo generado
  conserva la descripción original y `fdcId` enlaza al registro fuente.
- **Integración**: los alimentos se siembran al desbloquear la aplicación
  (idempotente, `fdc_id` único), con `source = 'fdc'` y son de **solo
  lectura** en la interfaz. La búsqueda usa FTS5 con prefijos de palabra y
  recurre a búsqueda por subcadena si no hay coincidencias.

## Actualizar la versión del catálogo

1. Descargar y descomprimir el JSON de Foundation Foods desde la página de
   descargas de FDC.
2. `node scripts/generate-fdc-catalog.mjs <ruta-al-json> <fecha-de-versión>`
3. Revisar el diff de `packages/database/src/fdc/catalog.ts` y correr las
   pruebas. Los alimentos nuevos se sembrarán en el siguiente desbloqueo;
   los existentes no se modifican.
