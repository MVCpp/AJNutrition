import { z } from 'zod';

/**
 * Fixed allergen vocabulary — the major allergens of NOM-051-SCFI/SSA1-2010
 * (Mexican labeling norm) plus sulfites. Structured tags on foods and on
 * allergy/intolerance history entries enable hard-blocking in meal plans;
 * free-text clinical narrative stays in the history entry content.
 */
export const ALLERGEN_IDS = [
  'gluten',
  'milk',
  'egg',
  'fish',
  'crustaceans',
  'mollusks',
  'peanut',
  'tree_nuts',
  'soy',
  'sesame',
  'sulfites',
] as const;

export const AllergenIdSchema = z.enum(ALLERGEN_IDS);
export type AllergenId = z.infer<typeof AllergenIdSchema>;

export const ALLERGEN_LABELS: Record<AllergenId, string> = {
  gluten: 'Gluten',
  milk: 'Leche',
  egg: 'Huevo',
  fish: 'Pescado',
  crustaceans: 'Crustáceos',
  mollusks: 'Moluscos',
  peanut: 'Cacahuate',
  tree_nuts: 'Nueces de árbol',
  soy: 'Soya',
  sesame: 'Ajonjolí',
  sulfites: 'Sulfitos',
};
