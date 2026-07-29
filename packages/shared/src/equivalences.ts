/**
 * Sistema Mexicano de Alimentos Equivalentes (SMAE) — group vocabulary.
 *
 * This file carries the GROUP NAMES only, which are published nomenclature.
 * It deliberately contains NO reference macros per equivalente and NO gram
 * sizes per food: those are clinical reference data that must come from the
 * practitioner's own SMAE tables. Inventing them would produce
 * authoritative-looking numbers with no source.
 *
 * How the app uses them: the practitioner records "one equivalente of this
 * food = N g", and the plan then counts equivalentes per group alongside the
 * grams and kilocalories it already computes from the food's own nutrients.
 * The count is a counting device, never a substitute for the nutrient data.
 */

export const EQUIVALENCE_GROUP_IDS = [
  'verduras',
  'frutas',
  'cereales_sin_grasa',
  'cereales_con_grasa',
  'leguminosas',
  'aoa_muy_bajo',
  'aoa_bajo',
  'aoa_moderado',
  'aoa_alto',
  'leche_descremada',
  'leche_semidescremada',
  'leche_entera',
  'leche_con_azucar',
  'aceites_sin_proteina',
  'aceites_con_proteina',
  'azucares_sin_grasa',
  'azucares_con_grasa',
  'libres_energia',
] as const;

export type EquivalenceGroupId = (typeof EQUIVALENCE_GROUP_IDS)[number];

export const EQUIVALENCE_GROUP_LABELS: Record<EquivalenceGroupId, string> = {
  verduras: 'Verduras',
  frutas: 'Frutas',
  cereales_sin_grasa: 'Cereales y tubérculos sin grasa',
  cereales_con_grasa: 'Cereales y tubérculos con grasa',
  leguminosas: 'Leguminosas',
  aoa_muy_bajo: 'AOA muy bajo aporte de grasa',
  aoa_bajo: 'AOA bajo aporte de grasa',
  aoa_moderado: 'AOA moderado aporte de grasa',
  aoa_alto: 'AOA alto aporte de grasa',
  leche_descremada: 'Leche descremada',
  leche_semidescremada: 'Leche semidescremada',
  leche_entera: 'Leche entera',
  leche_con_azucar: 'Leche con azúcar',
  aceites_sin_proteina: 'Aceites y grasas sin proteína',
  aceites_con_proteina: 'Aceites y grasas con proteína',
  azucares_sin_grasa: 'Azúcares sin grasa',
  azucares_con_grasa: 'Azúcares con grasa',
  libres_energia: 'Alimentos libres de energía',
};
