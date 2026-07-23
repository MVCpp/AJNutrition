import { roundTo } from './units';

/**
 * Versioned formula registry (§13.1). Every entry carries its real citation,
 * intended population, and rounding policy. Formulas are pure functions:
 * same inputs → same result, forever. A formula is NEVER edited after
 * release — corrections ship as a new version, and stored results keep the
 * version they were computed with (§13.4 provenance).
 */

export interface CalculationResult {
  formulaId: string;
  formulaVersion: number;
  /** Exact inputs used, for reproducibility. */
  inputs: Record<string, number | string>;
  rawResult: number;
  roundedResult: number;
  unit: string;
  /** Machine codes, e.g. 'population_out_of_range'. Never blocking. */
  warnings: string[];
}

export interface FormulaMeta {
  id: string;
  name: string;
  version: number;
  citation: string;
  population: string;
  inputs: string[];
  outputUnit: string;
  roundingPolicy: string;
}

export const FORMULAS: Record<string, FormulaMeta> = {
  bmi: {
    id: 'bmi',
    name: 'Índice de masa corporal (IMC)',
    version: 1,
    citation:
      'World Health Organization. Physical status: the use and interpretation of anthropometry. ' +
      'WHO Technical Report Series 854. Geneva: WHO; 1995.',
    population: 'Adultos. La clasificación OMS no aplica a población pediátrica ni embarazo.',
    inputs: ['weightKg', 'heightCm'],
    outputUnit: 'kg/m²',
    roundingPolicy: '1 decimal, redondeo half-up',
  },
  waist_height_ratio: {
    id: 'waist_height_ratio',
    name: 'Índice cintura-talla',
    version: 1,
    citation:
      'World Health Organization. Waist circumference and waist–hip ratio: report of a WHO ' +
      'expert consultation, Geneva, 8–11 December 2008. Geneva: WHO; 2011.',
    population: 'Adultos.',
    inputs: ['waistCm', 'heightCm'],
    outputUnit: 'razón',
    roundingPolicy: '2 decimales, redondeo half-up',
  },
  waist_hip_ratio: {
    id: 'waist_hip_ratio',
    name: 'Índice cintura-cadera',
    version: 1,
    citation:
      'World Health Organization. Waist circumference and waist–hip ratio: report of a WHO ' +
      'expert consultation, Geneva, 8–11 December 2008. Geneva: WHO; 2011.',
    population: 'Adultos.',
    inputs: ['waistCm', 'hipCm'],
    outputUnit: 'razón',
    roundingPolicy: '2 decimales, redondeo half-up',
  },
  mifflin_st_jeor_ree: {
    id: 'mifflin_st_jeor_ree',
    name: 'Gasto energético en reposo (Mifflin-St Jeor)',
    version: 1,
    citation:
      'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive ' +
      'equation for resting energy expenditure in healthy individuals. ' +
      'Am J Clin Nutr. 1990;51(2):241-247.',
    population:
      'Adultos sanos de 19 a 78 años (población del estudio original). Requiere sexo registrado.',
    inputs: ['weightKg', 'heightCm', 'ageYears', 'sex'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
};

export function bmi(weightKg: number, heightCm: number): CalculationResult {
  const heightM = heightCm / 100;
  const raw = weightKg / (heightM * heightM);
  return {
    formulaId: 'bmi',
    formulaVersion: 1,
    inputs: { weightKg, heightCm },
    rawResult: raw,
    roundedResult: roundTo(raw, 1),
    unit: 'kg/m²',
    warnings: [],
  };
}

export function waistHeightRatio(waistCm: number, heightCm: number): CalculationResult {
  const raw = waistCm / heightCm;
  return {
    formulaId: 'waist_height_ratio',
    formulaVersion: 1,
    inputs: { waistCm, heightCm },
    rawResult: raw,
    roundedResult: roundTo(raw, 2),
    unit: 'razón',
    warnings: [],
  };
}

export function waistHipRatio(waistCm: number, hipCm: number): CalculationResult {
  const raw = waistCm / hipCm;
  return {
    formulaId: 'waist_hip_ratio',
    formulaVersion: 1,
    inputs: { waistCm, hipCm },
    rawResult: raw,
    roundedResult: roundTo(raw, 2),
    unit: 'razón',
    warnings: [],
  };
}

export function mifflinStJeorRee(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: 'female' | 'male',
): CalculationResult {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const raw = sex === 'male' ? base + 5 : base - 161;
  const warnings: string[] = [];
  if (ageYears < 19 || ageYears > 78) warnings.push('population_out_of_range');
  return {
    formulaId: 'mifflin_st_jeor_ree',
    formulaVersion: 1,
    inputs: { weightKg, heightCm, ageYears, sex },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings,
  };
}
