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
  harris_benedict_ree: {
    id: 'harris_benedict_ree',
    name: 'Gasto energético en reposo (Harris-Benedict, original)',
    version: 1,
    citation:
      'Harris JA, Benedict FG. A biometric study of human basal metabolism. ' +
      'Proc Natl Acad Sci U S A. 1918;4(12):370-373.',
    population:
      'Adultos. Tiende a sobreestimar 5-15% frente a Mifflin-St Jeor en poblaciones actuales. ' +
      'Requiere sexo registrado.',
    inputs: ['weightKg', 'heightCm', 'ageYears', 'sex'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
  harris_benedict_revised_ree: {
    id: 'harris_benedict_revised_ree',
    name: 'Gasto energético en reposo (Harris-Benedict revisada 1984)',
    version: 1,
    citation:
      'Roza AM, Shizgal HM. The Harris Benedict equation reevaluated: resting energy ' +
      'requirements and the body cell mass. Am J Clin Nutr. 1984;40(1):168-182.',
    population: 'Adultos. Reajuste de los coeficientes originales. Requiere sexo registrado.',
    inputs: ['weightKg', 'heightCm', 'ageYears', 'sex'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
  katch_mcardle_ree: {
    id: 'katch_mcardle_ree',
    name: 'Gasto energético en reposo (Katch-McArdle)',
    version: 1,
    citation:
      'Katch FI, McArdle WD. Prediction of body density from simple anthropometric ' +
      'measurements. Hum Biol. 1973;45(3):445-455; McArdle WD, Katch FI, Katch VL. ' +
      'Exercise Physiology: Nutrition, Energy, and Human Performance. 8.ª ed. ' +
      'Wolters Kluwer; 2015. GER = 370 + 21.6 × MLG (kg).',
    population:
      'Adultos con porcentaje de grasa corporal medido. Independiente de sexo y edad ' +
      '(usa masa libre de grasa).',
    inputs: ['weightKg', 'bodyFatPercent'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
  cunningham_ree: {
    id: 'cunningham_ree',
    name: 'Gasto energético en reposo (Cunningham 1980)',
    version: 1,
    citation:
      'Cunningham JJ. A reanalysis of the factors influencing basal metabolic rate in ' +
      'normal adults. Am J Clin Nutr. 1980;33(11):2372-2374. GER = 500 + 22 × MLG (kg).',
    population:
      'Adultos, frecuente en deportistas y personas activas. Requiere porcentaje de grasa ' +
      'corporal medido.',
    inputs: ['weightKg', 'bodyFatPercent'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
  who_fao_unu_ree: {
    id: 'who_fao_unu_ree',
    name: 'Gasto energético en reposo (OMS/FAO/UNU)',
    version: 1,
    citation:
      'FAO/WHO/UNU. Energy and protein requirements: report of a joint FAO/WHO/UNU Expert ' +
      'Consultation. WHO Technical Report Series 724. Geneva: WHO; 1985 (ecuaciones por peso, ' +
      'sexo y grupo de edad).',
    population:
      'Bandas de edad 10-18, 18-30, 30-60 y >60 años. Menores de 18 fuera de la población ' +
      'clínica v1 (advertencia). Requiere sexo registrado.',
    inputs: ['weightKg', 'ageYears', 'sex'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
  ireton_jones_ree: {
    id: 'ireton_jones_ree',
    name: 'Gasto energético (Ireton-Jones 1992)',
    version: 1,
    citation:
      'Ireton-Jones CS, Turner WW Jr, Liepa GU, Baxter CR. Equations for the estimation of ' +
      'energy expenditures in patients with burns with special reference to ventilatory ' +
      'status. J Burn Care Rehabil. 1992;13(3):330-333.',
    population:
      'Pacientes clínicos u hospitalizados (trauma, quemaduras, ventilación mecánica). ' +
      'Variante espontánea: 629 − 11·edad + 25·peso − 609·obesidad (obesidad operacionalizada ' +
      'como IMC ≥ 30, OMS). Variante ventilada: 1784 − 11·edad + 5·peso + 244·sexo masculino + ' +
      '239·trauma + 804·quemadura.',
    inputs: ['ageYears', 'weightKg', 'sex', 'ventilated', 'trauma', 'burn', 'obese'],
    outputUnit: 'kcal/día',
    roundingPolicy: 'Entero, redondeo half-up',
  },
};

export const TEE_PAL_META: FormulaMeta = {
  id: 'tee_pal',
  name: 'Gasto energético total (GER × PAL)',
  version: 1,
  citation:
    'FAO/WHO/UNU. Human energy requirements: report of a joint FAO/WHO/UNU Expert ' +
    'Consultation, Rome, 17-24 October 2001. FAO Food and Nutrition Technical Report Series 1.',
  population:
    'Adultos. Rangos PAL del informe: sedentario 1.40-1.69, activo 1.70-1.99, vigoroso 2.00-2.40.',
  inputs: ['reeKcal', 'pal'],
  outputUnit: 'kcal/día',
  roundingPolicy: 'Entero, redondeo half-up',
};
FORMULAS['tee_pal'] = TEE_PAL_META;

export function teeFromPal(reeKcal: number, pal: number): CalculationResult {
  const raw = reeKcal * pal;
  const warnings: string[] = [];
  if (pal < 1.4 || pal > 2.4) warnings.push('pal_out_of_reference_range');
  return {
    formulaId: 'tee_pal',
    formulaVersion: 1,
    inputs: { reeKcal, pal },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings,
  };
}

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

export function harrisBenedictRee(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: 'female' | 'male',
): CalculationResult {
  const raw =
    sex === 'male'
      ? 66.473 + 13.7516 * weightKg + 5.0033 * heightCm - 6.755 * ageYears
      : 655.0955 + 9.5634 * weightKg + 1.8496 * heightCm - 4.6756 * ageYears;
  const warnings: string[] = ['tends_to_overestimate_modern_populations'];
  if (ageYears < 18) warnings.push('population_out_of_range');
  return {
    formulaId: 'harris_benedict_ree',
    formulaVersion: 1,
    inputs: { weightKg, heightCm, ageYears, sex },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings,
  };
}

export function harrisBenedictRevisedRee(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: 'female' | 'male',
): CalculationResult {
  const raw =
    sex === 'male'
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears;
  const warnings: string[] = [];
  if (ageYears < 18) warnings.push('population_out_of_range');
  return {
    formulaId: 'harris_benedict_revised_ree',
    formulaVersion: 1,
    inputs: { weightKg, heightCm, ageYears, sex },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings,
  };
}

/** Fat-free mass in kg from total weight and measured body-fat percentage. */
export function fatFreeMassKg(weightKg: number, bodyFatPercent: number): number {
  return weightKg * (1 - bodyFatPercent / 100);
}

export function katchMcArdleRee(weightKg: number, bodyFatPercent: number): CalculationResult {
  const ffm = fatFreeMassKg(weightKg, bodyFatPercent);
  const raw = 370 + 21.6 * ffm;
  return {
    formulaId: 'katch_mcardle_ree',
    formulaVersion: 1,
    inputs: { weightKg, bodyFatPercent, fatFreeMassKg: roundTo(ffm, 2) },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings: [],
  };
}

export function cunninghamRee(weightKg: number, bodyFatPercent: number): CalculationResult {
  const ffm = fatFreeMassKg(weightKg, bodyFatPercent);
  const raw = 500 + 22 * ffm;
  return {
    formulaId: 'cunningham_ree',
    formulaVersion: 1,
    inputs: { weightKg, bodyFatPercent, fatFreeMassKg: roundTo(ffm, 2) },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings: [],
  };
}

/** WHO TRS 724 (1985) weight-based coefficients: raw = a·weightKg + b. */
const WHO_FAO_UNU_BANDS: Array<{
  minAge: number;
  maxAgeExclusive: number;
  male: { a: number; b: number };
  female: { a: number; b: number };
}> = [
  { minAge: 10, maxAgeExclusive: 18, male: { a: 17.5, b: 651 }, female: { a: 12.2, b: 746 } },
  { minAge: 18, maxAgeExclusive: 30, male: { a: 15.3, b: 679 }, female: { a: 14.7, b: 496 } },
  { minAge: 30, maxAgeExclusive: 60, male: { a: 11.6, b: 879 }, female: { a: 8.7, b: 829 } },
  { minAge: 60, maxAgeExclusive: Infinity, male: { a: 13.5, b: 487 }, female: { a: 10.5, b: 596 } },
];

export function whoFaoUnuRee(
  weightKg: number,
  ageYears: number,
  sex: 'female' | 'male',
): CalculationResult {
  const band =
    WHO_FAO_UNU_BANDS.find((b) => ageYears >= b.minAge && ageYears < b.maxAgeExclusive) ??
    WHO_FAO_UNU_BANDS[0];
  if (band === undefined) throw new Error('unreachable');
  const coeff = sex === 'male' ? band.male : band.female;
  const raw = coeff.a * weightKg + coeff.b;
  const warnings: string[] = [];
  if (ageYears < 18) warnings.push('population_out_of_range');
  return {
    formulaId: 'who_fao_unu_ree',
    formulaVersion: 1,
    inputs: { weightKg, ageYears, sex, band: `${band.minAge}-${band.maxAgeExclusive}` },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings,
  };
}

export interface IretonJonesFlags {
  ventilated: boolean;
  trauma: boolean;
  burn: boolean;
  /** Operationalized as WHO obesity (BMI ≥ 30) when derived from a session. */
  obese: boolean;
}

export function iretonJonesRee(
  ageYears: number,
  weightKg: number,
  sex: 'female' | 'male',
  flags: IretonJonesFlags,
): CalculationResult {
  const raw = flags.ventilated
    ? 1784 -
      11 * ageYears +
      5 * weightKg +
      244 * (sex === 'male' ? 1 : 0) +
      239 * (flags.trauma ? 1 : 0) +
      804 * (flags.burn ? 1 : 0)
    : 629 - 11 * ageYears + 25 * weightKg - 609 * (flags.obese ? 1 : 0);
  return {
    formulaId: 'ireton_jones_ree',
    formulaVersion: 1,
    inputs: {
      ageYears,
      weightKg,
      sex,
      ventilated: flags.ventilated ? 1 : 0,
      trauma: flags.trauma ? 1 : 0,
      burn: flags.burn ? 1 : 0,
      obese: flags.obese ? 1 : 0,
    },
    rawResult: raw,
    roundedResult: roundTo(raw, 0),
    unit: 'kcal/día',
    warnings: ['clinical_population_formula'],
  };
}

/** REE formula ids a meal plan may use as its energy basis. */
export const REE_FORMULA_IDS = [
  'mifflin_st_jeor_ree',
  'harris_benedict_ree',
  'harris_benedict_revised_ree',
  'katch_mcardle_ree',
  'cunningham_ree',
  'who_fao_unu_ree',
  'ireton_jones_ree',
] as const;
export type ReeFormulaId = (typeof REE_FORMULA_IDS)[number];
