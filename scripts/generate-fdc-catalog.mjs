#!/usr/bin/env node
/**
 * Distills a USDA FoodData Central "Foundation Foods" JSON release into the
 * bundled catalog module packages/database/src/fdc/catalog.ts.
 *
 * Usage:
 *   1. Download the Foundation Foods JSON release from
 *      https://fdc.nal.usda.gov/download-datasets (e.g.
 *      FoodData_Central_foundation_food_json_2025-04-24.zip) and unzip it.
 *   2. node scripts/generate-fdc-catalog.mjs <path-to-json> <release-date>
 *
 * Data license: USDA FoodData Central data are in the public domain (CC0).
 * Citation: U.S. Department of Agriculture, Agricultural Research Service.
 * FoodData Central. fdc.nal.usda.gov.
 *
 * Nutrient VALUES are copied verbatim (per 100 g). Only display names are
 * localized to es-MX through the phrase dictionary below; the original
 * English description is preserved alongside, and fdcId gives permanent
 * provenance back to the source record.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , sourcePath, releaseDate] = process.argv;
if (!sourcePath || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate ?? '')) {
  console.error(
    'Usage: node scripts/generate-fdc-catalog.mjs <foundation-json> <release YYYY-MM-DD>',
  );
  process.exit(1);
}

/** FDC nutrient ids → catalog fields. Energy prefers measured kcal (1008), then Atwater general (2047), then Atwater specific (2048). */
const NUTRIENTS = {
  protein: 1003,
  fat: 1004,
  carbohydrate: 1005,
  energyKcal: 1008,
  energyAtwaterGeneral: 2047,
  energyAtwaterSpecific: 2048,
  fiber: 1079,
  sodium: 1093,
};

const CATEGORY_ES = {
  'Legumes and Legume Products': 'Leguminosas',
  'Vegetables and Vegetable Products': 'Verduras',
  'Sausages and Luncheon Meats': 'Embutidos',
  'Nut and Seed Products': 'Nueces y semillas',
  'Dairy and Egg Products': 'Lácteos y huevo',
  'Fruits and Fruit Juices': 'Frutas y jugos',
  'Baked Products': 'Panificados',
  'Spices and Herbs': 'Especias y hierbas',
  'Fats and Oils': 'Grasas y aceites',
  'Poultry Products': 'Aves',
  'Soups, Sauces, and Gravies': 'Sopas y salsas',
  'Finfish and Shellfish Products': 'Pescados y mariscos',
  'Restaurant Foods': 'Comida de restaurante',
  'Beef Products': 'Res',
  Sweets: 'Dulces',
  'Pork Products': 'Cerdo',
  'Cereal Grains and Pasta': 'Cereales y pastas',
  Beverages: 'Bebidas',
  'Lamb, Veal, and Game Products': 'Cordero y caza',
};

/**
 * Comma-token phrase dictionary (es-MX). FDC descriptions are formulaic
 * ("Apples, fuji, with skin, raw"); each token is looked up case-insensitively
 * and unmatched tokens (variety names etc.) pass through unchanged.
 */
const TOKEN_ES = {
  // ── food nouns ──
  flour: 'harina',
  beans: 'frijoles',
  cheese: 'queso',
  beef: 'carne de res',
  nuts: 'nueces',
  oil: 'aceite',
  chicken: 'pollo',
  mushroom: 'champiñón',
  mushrooms: 'champiñones',
  fish: 'pescado',
  egg: 'huevo',
  eggs: 'huevos',
  pork: 'cerdo',
  squash: 'calabaza',
  yogurt: 'yogur',
  lettuce: 'lechuga',
  apples: 'manzanas',
  tomatoes: 'jitomates',
  tomato: 'jitomate',
  milk: 'leche',
  sausage: 'salchicha',
  peppers: 'pimientos',
  cabbage: 'col',
  rice: 'arroz',
  seeds: 'semillas',
  carrots: 'zanahorias',
  onions: 'cebollas',
  potatoes: 'papas',
  plantains: 'plátano macho',
  juice: 'jugo',
  kale: 'col rizada (kale)',
  'grapefruit juice': 'jugo de toronja',
  bread: 'pan',
  sauce: 'salsa',
  ham: 'jamón',
  melons: 'melones',
  turkey: 'pavo',
  butter: 'mantequilla',
  bananas: 'plátanos',
  'soy milk': 'leche de soya',
  'almond milk': 'leche de almendra',
  spinach: 'espinacas',
  'orange juice': 'jugo de naranja',
  'grape juice': 'jugo de uva',
  cream: 'crema',
  oats: 'avena',
  grapes: 'uvas',
  'blackeye pea': 'frijol de ojo negro',
  crustaceans: 'crustáceos',
  hummus: 'hummus',
  frankfurter: 'salchicha frankfurt',
  'onion rings': 'aros de cebolla',
  pickles: 'pepinillos',
  peaches: 'duraznos',
  mustard: 'mostaza',
  kiwifruit: 'kiwi',
  'kiwifruit (kiwi)': 'kiwi',
  nectarines: 'nectarinas',
  olives: 'aceitunas',
  cookies: 'galletas',
  figs: 'higos',
  oranges: 'naranjas',
  pears: 'peras',
  pear: 'pera',
  salt: 'sal',
  sugars: 'azúcares',
  broccoli: 'brócoli',
  ketchup: 'catsup',
  garlic: 'ajo',
  'apple juice': 'jugo de manzana',
  'cranberry juice': 'jugo de arándano',
  'tomato juice': 'jugo de jitomate',
  'oat milk': 'leche de avena',
  buttermilk: 'suero de leche',
  'peanut butter': 'crema de cacahuate',
  'sesame butter': 'crema de ajonjolí (tahini)',
  'almond butter': 'crema de almendra',
  flaxseed: 'linaza',
  'cottage cheese': 'queso cottage',
  'cream cheese': 'queso crema',
  pineapple: 'piña',
  cherries: 'cerezas',
  'sweet potatoes': 'camotes',
  celery: 'apio',
  cucumber: 'pepino',
  strawberries: 'fresas',
  raspberries: 'frambuesas',
  blueberries: 'moras azules',
  applesauce: 'puré de manzana',
  buckwheat: 'trigo sarraceno',
  millet: 'mijo',
  peanuts: 'cacahuates',
  chickpeas: 'garbanzos',
  'chickpeas (garbanzo beans': 'garbanzos',
  lentils: 'lentejas',
  peas: 'chícharos',
  cauliflower: 'coliflor',
  collards: 'berza',
  'brussels sprouts': 'coles de Bruselas',
  beets: 'betabeles',
  eggplant: 'berenjena',
  apricot: 'chabacano',
  'chia seeds': 'semillas de chía',
  bulgur: 'trigo bulgur',
  'wild rice': 'arroz salvaje',
  arugula: 'arúgula',
  asparagus: 'espárragos',
  avocado: 'aguacate',
  corn: 'maíz',
  'corn flour': 'harina de maíz',
  mandarin: 'mandarina',
  plum: 'ciruela',
  'sorghum bran': 'salvado de sorgo',
  'sorghum flour': 'harina de sorgo',
  'sorghum grain': 'grano de sorgo',
  sorghum: 'sorgo',
  lamb: 'cordero',
  bison: 'bisonte',
  rutabaga: 'rutabaga (nabo sueco)',
  blackberries: 'zarzamoras',
  tomatillos: 'tomate verde (tomatillo)',
  leeks: 'poro',
  'green onion': 'cebolla de cambray',
  shallots: 'chalotes',
  mango: 'mango',
  almonds: 'almendras',
  yolk: 'yema',
  coconut: 'coco',
  drumstick: 'pierna',
  breast: 'pechuga',
  parmesan: 'parmesano',
  // ── modifiers / preparations ──
  raw: 'crudo',
  dry: 'seco',
  canned: 'enlatado',
  green: 'verde',
  white: 'blanco',
  boneless: 'sin hueso',
  unenriched: 'no enriquecido',
  'sodium added': 'con sodio agregado',
  'drained and rinsed': 'escurrido y enjuagado',
  'drained solids': 'sólidos escurridos',
  peeled: 'pelado',
  plain: 'natural',
  red: 'rojo',
  ground: 'molido',
  'with skin': 'con piel',
  cooked: 'cocido',
  restaurant: 'restaurante',
  'from concentrate': 'de concentrado',
  refrigerated: 'refrigerado',
  'shelf stable': 'de anaquel',
  'shelf-stable': 'de anaquel',
  'whole grain': 'integral',
  frozen: 'congelado',
  unsweetened: 'sin azúcar',
  yellow: 'amarillo',
  'separable lean only': 'solo carne magra',
  choice: 'calidad choice',
  whole: 'entero',
  'with salt added': 'con sal agregada',
  pasteurized: 'pasteurizado',
  dried: 'deshidratado',
  nonfat: 'descremado',
  loin: 'lomo',
  select: 'calidad select',
  'whole milk': 'leche entera',
  enriched: 'enriquecido',
  unbleached: 'sin blanquear',
  'with added vitamin c': 'con vitamina C agregada',
  'not fortified': 'no fortificado',
  bell: 'morrón',
  'without skin': 'sin piel',
  solid: 'sólido',
  'farm raised': 'de granja',
  'meat and skin': 'carne y piel',
  'meat only': 'solo carne',
  american: 'americano',
  greek: 'griego',
  skinless: 'sin piel',
  sliced: 'rebanado',
  'trimmed to 0" fat': 'sin grasa visible',
  'trimmed to 1/8" fat': 'con 3 mm de grasa',
  fluid: 'líquido',
  'grade a': 'grado A',
  large: 'grande',
  'all-purpose': 'todo uso',
  creamy: 'cremoso',
  'full fat': 'entero',
  leaf: 'de hoja',
  sweet: 'dulce',
  seedless: 'sin semillas',
  seeded: 'despepitado',
  black: 'negro',
  'sugar added': 'con azúcar agregada',
  grain: 'grano',
  pearled: 'perlado',
  'root removed': 'sin raíz',
  snap: 'ejote',
  'dry roasted': 'tostado en seco',
  prepared: 'preparado',
  grated: 'rallado',
  'commercially prepared': 'comercial',
  lowfat: 'bajo en grasa',
  '2% milkfat': '2% de grasa',
  braised: 'estofado',
};

function translate(description) {
  const joined = description
    .split(',')
    .map((token) => token.trim())
    .map((token) => TOKEN_ES[token.toLowerCase()] ?? token)
    .join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

const round2 = (value) => Math.round(value * 100) / 100;

const data = JSON.parse(readFileSync(sourcePath, 'utf8'));
const source = data.FoundationFoods;
if (!Array.isArray(source)) {
  console.error('Input does not look like a Foundation Foods release (FoundationFoods missing).');
  process.exit(1);
}

const skipped = [];
const catalog = [];
for (const food of source) {
  const byId = {};
  for (const entry of food.foodNutrients ?? []) {
    if (entry.nutrient && entry.amount !== undefined) byId[entry.nutrient.id] = entry.amount;
  }
  const energy =
    byId[NUTRIENTS.energyKcal] ??
    byId[NUTRIENTS.energyAtwaterGeneral] ??
    byId[NUTRIENTS.energyAtwaterSpecific];
  const protein = byId[NUTRIENTS.protein];
  let carbohydrate = byId[NUTRIENTS.carbohydrate];
  const fat = byId[NUTRIENTS.fat];
  if ([energy, protein, carbohydrate, fat].some((v) => v === undefined)) {
    skipped.push(food.fdcId);
    continue;
  }
  // Carbohydrate-by-difference can come out slightly negative for meats — a
  // measurement artifact meaning "effectively zero". Clamp tiny negatives;
  // anything beyond -1 g is treated as bad data and skipped.
  if (carbohydrate < 0) {
    if (carbohydrate < -1) {
      skipped.push(food.fdcId);
      continue;
    }
    carbohydrate = 0;
  }
  if ([energy, protein, fat].some((v) => v < 0)) {
    skipped.push(food.fdcId);
    continue;
  }
  const entry = {
    fdcId: food.fdcId,
    name: translate(food.description),
    nameEn: food.description,
    category: CATEGORY_ES[food.foodCategory?.description] ?? food.foodCategory?.description ?? null,
    energyKcal: round2(energy),
    proteinG: round2(protein),
    carbohydrateG: round2(carbohydrate),
    fatG: round2(fat),
  };
  if (byId[NUTRIENTS.fiber] !== undefined) entry.fiberG = round2(byId[NUTRIENTS.fiber]);
  if (byId[NUTRIENTS.sodium] !== undefined) entry.sodiumMg = round2(byId[NUTRIENTS.sodium]);
  catalog.push(entry);
}
catalog.sort((a, b) => a.fdcId - b.fdcId);

const header = `/**
 * AUTO-GENERATED by scripts/generate-fdc-catalog.mjs — do not edit by hand.
 *
 * Source: USDA FoodData Central, Foundation Foods release ${releaseDate}
 *         (https://fdc.nal.usda.gov/download-datasets). Public domain (CC0).
 * Citation: U.S. Department of Agriculture, Agricultural Research Service.
 *           FoodData Central. fdc.nal.usda.gov.
 *
 * Nutrient values are verbatim per 100 g of edible portion. Energy prefers
 * the measured kcal value (nutrient 1008), then Atwater general factors
 * (2047), then Atwater specific factors (2048). Display names are localized
 * to es-MX by a phrase dictionary; nameEn preserves the original description
 * and fdcId links back to the source record. ${catalog.length} foods bundled${
   skipped.length > 0 ? `; ${skipped.length} skipped for incomplete core macros` : ''
 }.
 */
`;

const lines = catalog.map((f) => `  ${JSON.stringify(f)},`).join('\n');
const output = `${header}
export interface FdcCatalogFood {
  fdcId: number;
  name: string;
  nameEn: string;
  category: string | null;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
}

export const FDC_CATALOG_RELEASE = ${JSON.stringify(releaseDate)};

export const FDC_CATALOG: readonly FdcCatalogFood[] = [
${lines}
];
`;

const outPath = path.join('packages', 'database', 'src', 'fdc', 'catalog.ts');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, output);
console.log(`Wrote ${catalog.length} foods to ${outPath} (skipped ${skipped.length}).`);
