/**
 * Generates packages/database/src/mx/catalog.ts from the CONABIO/INCMNSZ
 * "Tabla de composición de alimentos extendida 2019".
 *
 * Usage: node scripts/generate-mx-catalog.mjs <registros-json> <retrieved YYYY-MM-DD>
 *
 * The input file is the full dump of the `registros` GraphQL model (with
 * nested caracteristicas_cuantitativas) from
 * https://nutricion-siagro.conabio.gob.mx/graphql, paginated with
 * `registros(pagination:{limit,offset})`. License: Creative Commons
 * Atribución 4.0 Internacional (stated on https://siagro.conabio.gob.mx/,
 * "Cómo citar y contacto"), compatible with LibreUso MX.
 *
 * Rules (mirrors generate-fdc-catalog.mjs where applicable):
 * - Values are verbatim per 100 g of edible portion (per the dataset's
 *   technical notes). A food is bundled only when all four core macros are
 *   present: Energía [kcal], Proteína bruta [g], Hidratos de carbono [g],
 *   Extracto etéreo [g]. Nothing is ever invented or zero-filled.
 * - Fiber uses "Fibra dietaria total" only; "Fibra bruta" (crude fiber) is
 *   NOT dietary fiber and is deliberately ignored.
 * - The table holds multiple regional samples of the same food. One
 *   representative per distinct normalized name is bundled: the sample with
 *   the most nutrient values, tie-broken by lowest conabio_id. Its values
 *   stay verbatim and conabioId points at that exact sample.
 * - Allergen tags are inferred for identity cases only (the food IS the
 *   allergen), never "may contain".
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , inputPath, retrievedDate] = process.argv;
if (!inputPath || !/^\d{4}-\d{2}-\d{2}$/.test(retrievedDate ?? '')) {
  console.error(
    'Usage: node scripts/generate-mx-catalog.mjs <registros-json> <retrieved YYYY-MM-DD>',
  );
  process.exit(1);
}

const CATEGORY_ES = {
  ADEREZO: 'Aderezos',
  'ALGAS Y HONGOS': 'Algas y hongos',
  'AZÚCARES, MIELES Y DULCES': 'Azúcares, mieles y dulces',
  FRUTAS: 'Frutas',
  HUEVO: 'Huevo',
  'HUEVO AVES': 'Huevo',
  'HUEVO REPTILES': 'Huevo',
  INSECTOS: 'Insectos',
  'LECHE Y DERIVADOS': 'Leche y derivados',
  'OTRAS SEMILLAS': 'Otras semillas',
  'PESCADOS Y MARISCOS': 'Pescados y mariscos',
  'SEMILLAS DE CEREALES Y DERIVADOS': 'Cereales y derivados',
  'SEMILLAS DE LEGUMINOSAS Y DERIVADOS': 'Leguminosas y derivados',
  'BEBIDAS ALCOHOLICAS Y NO ALCOHOLICAS': 'Bebidas',
  'TUBERCULOS, BULBOS Y RAICES': 'Tubérculos, bulbos y raíces',
  VARIOS: 'Varios',
  'ALIMENTOS INFANTILES': 'Alimentos infantiles',
  'CARNES, VISCERAS Y DERIVADOS': 'Carnes y derivados',
};

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Identity-only allergen inference (the food IS the allergen source). */
function inferAllergens(name, tipo) {
  const n = ` ${strip(name)} `;
  const has = (...words) => words.some((w) => n.includes(` ${w} `) || n.includes(` ${w},`));
  const tags = new Set();
  if (tipo.startsWith('HUEVO') || has('huevo')) tags.add('egg');
  if (
    tipo === 'LECHE Y DERIVADOS' ||
    has('leche', 'queso', 'yogurt', 'yoghurt', 'mantequilla', 'crema', 'jocoque', 'suero')
  )
    tags.add('milk');
  if (tipo === 'PESCADOS Y MARISCOS') {
    if (has('camaron', 'jaiba', 'cangrejo', 'langosta', 'langostino', 'acocil'))
      tags.add('crustaceans');
    else if (
      has('ostion', 'ostra', 'almeja', 'pulpo', 'calamar', 'caracol', 'mejillon', 'abulon', 'callo')
    )
      tags.add('mollusks');
    else tags.add('fish');
  }
  if (has('trigo', 'cebada', 'centeno', 'gluten')) tags.add('gluten');
  if (has('cacahuate', 'cacahuates', 'mani')) tags.add('peanut');
  if (
    has(
      'nuez',
      'nueces',
      'almendra',
      'almendras',
      'avellana',
      'pistache',
      'macadamia',
      'pecana',
      'piñon',
      'pinon',
    )
  )
    tags.add('tree_nuts');
  if (has('soya')) tags.add('soy');
  if (has('ajonjoli', 'sesamo')) tags.add('sesame');
  return [...tags].sort();
}

const round2 = (v) => Math.round(v * 100) / 100;

const rows = JSON.parse(readFileSync(inputPath, 'utf8'));
console.log(`Read ${rows.length} registros.`);

const candidates = [];
let skippedCore = 0;
for (const row of rows) {
  const name = (row.descripcion_alimento ?? '').trim();
  if (!name) {
    skippedCore += 1;
    continue;
  }
  const values = new Map();
  for (const edge of row.caracteristicas_cuantitativasConnection.edges) {
    const node = edge.node;
    values.set(`${node.nombre}|${node.unidad}`, node.valor);
  }
  const energy = values.get('Energía|kcal');
  const protein = values.get('Proteína bruta|g');
  const carbohydrate = values.get('Hidratos de carbono|g');
  const fat = values.get('Extracto etéreo|g');
  if (
    [energy, protein, carbohydrate, fat].some(
      (v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0,
    )
  ) {
    skippedCore += 1;
    continue;
  }
  candidates.push({
    conabioId: Number(row.conabio_id),
    name,
    tipo: row.tipo_alimento ?? '',
    energy,
    protein,
    carbohydrate,
    fat,
    fiber: values.get('Fibra dietaria total|g'),
    sodium: values.get('Sodio|mg'),
    richness: values.size,
  });
}

// One representative per distinct normalized name: richest nutrient panel,
// tie-break lowest conabio_id (deterministic).
const byName = new Map();
for (const c of candidates) {
  const key = strip(c.name);
  const cur = byName.get(key);
  if (
    !cur ||
    c.richness > cur.richness ||
    (c.richness === cur.richness && c.conabioId < cur.conabioId)
  ) {
    byName.set(key, c);
  }
}
const picked = [...byName.values()].sort((a, b) => a.conabioId - b.conabioId);

const catalog = picked.map((c) => {
  const entry = {
    conabioId: c.conabioId,
    name: c.name,
    category: CATEGORY_ES[c.tipo] ?? null,
    energyKcal: round2(c.energy),
    proteinG: round2(c.protein),
    carbohydrateG: round2(c.carbohydrate),
    fatG: round2(c.fat),
  };
  if (typeof c.fiber === 'number' && c.fiber >= 0) entry.fiberG = round2(c.fiber);
  if (typeof c.sodium === 'number' && c.sodium >= 0) entry.sodiumMg = round2(c.sodium);
  const allergens = inferAllergens(c.name, c.tipo);
  if (allergens.length > 0) entry.allergens = allergens;
  return entry;
});

const header = `/**
 * AUTO-GENERATED by scripts/generate-mx-catalog.mjs — do not edit by hand.
 *
 * Source: "Tabla de composición de alimentos extendida 2019" (INCMNSZ),
 *         published by CONABIO in the SiAgroBD
 *         (https://nutricion-siagro.conabio.gob.mx/, retrieved ${retrievedDate}).
 * License: Creative Commons Atribución 4.0 Internacional (CC BY 4.0),
 *         compatible with LibreUso MX, as stated on
 *         https://siagro.conabio.gob.mx/.
 * Citation: Bourges Rodríguez, H. G. N., Camacho Parra, M. A., Morales
 *         Guerrero, J. C. 2019. "Composición de alimentos mexicanos Base de
 *         Datos Extensa". Instituto Nacional de Ciencias Médicas y Nutrición
 *         Salvador Zubirán.
 *
 * Nutrient values are verbatim per 100 g of edible portion from one
 * representative sample per distinct food name (richest nutrient panel,
 * tie-break lowest conabio_id); conabioId links back to that exact sample.
 * Fiber is "Fibra dietaria total" only (crude fiber is ignored).
 * ${catalog.length} foods bundled; ${skippedCore} registros skipped for incomplete core macros; ${
   candidates.length - catalog.length
 } duplicate regional samples collapsed.
 */
`;

// A single JSON literal parsed at module load: a 1,700+ element object-literal
// array trips TS2590 (union too complex) and slows tsc; the interface plus
// seed tests still guard the shape.
const json = JSON.stringify(catalog)
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');
const output = `${header}
export interface MxCatalogFood {
  conabioId: number;
  name: string;
  category: string | null;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
  /** Conservatively inferred allergen tags (identity cases only). */
  allergens?: string[];
}

export const MX_CATALOG_RETRIEVED = ${JSON.stringify(retrievedDate)};

export const MX_CATALOG: readonly MxCatalogFood[] = JSON.parse(
  \`${json}\`,
) as MxCatalogFood[];
`;

const outPath = path.join('packages', 'database', 'src', 'mx', 'catalog.ts');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output);
console.log(
  `Wrote ${catalog.length} foods to ${outPath} (skipped ${skippedCore} incomplete, collapsed ${candidates.length - catalog.length} duplicates).`,
);
