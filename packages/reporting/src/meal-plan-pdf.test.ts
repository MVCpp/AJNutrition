import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateMealPlanPdf, type MealPlanPdfInput } from './meal-plan-pdf';
import type { MealPlanDto } from '@ajnutrition/shared';

// Minimal valid 1x1 PNG.
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

const enriched = (values: Record<string, number>, complete = true) =>
  Object.entries(values).map(([nutrientId, amount]) => ({
    nutrientId,
    nameEs: nutrientId,
    unit: 'g',
    amount,
    complete,
  }));

const plan: MealPlanDto = {
  id: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-000000000002',
  name: 'Plan de reducción',
  days: 1,
  status: 'draft',
  consultationId: null,
  targets: { energyKcal: 2220, proteinG: 111, carbohydrateG: 278, fatG: 74 },
  targetSource: {
    type: 'measurement',
    reeKcal: 1755,
    reeFormulaVersion: 1,
    pal: 1.55,
    adjustmentKcal: -500,
    measuredAt: '2026-07-23',
  },
  allergies: ['Alergia a nueces'],
  dayPlans: [
    {
      dayIndex: 0,
      meals: [
        {
          slot: 'breakfast',
          items: [
            {
              id: '00000000-0000-4000-8000-000000000003',
              itemType: 'food',
              label: 'Tortilla de maíz',
              quantityLabel: '100 g',
              totals: enriched({ energy_kcal: 218 }),
            },
          ],
          totals: enriched({ energy_kcal: 218 }),
        },
        { slot: 'snack1', items: [], totals: enriched({ energy_kcal: 0 }) },
        { slot: 'lunch', items: [], totals: enriched({ energy_kcal: 0 }) },
        { slot: 'snack2', items: [], totals: enriched({ energy_kcal: 0 }) },
        { slot: 'dinner', items: [], totals: enriched({ energy_kcal: 0 }) },
      ],
      totals: enriched({ energy_kcal: 218, protein_g: 5.7, carbohydrate_g: 44.6, fat_g: 2.9 }),
    },
  ],
  notes: 'Beber 2 L de agua al día.',
  createdAt: '2026-07-23T12:00:00.000Z',
};

const input: MealPlanPdfInput = {
  practitioner: {
    fullName: 'L.N. Alejandra Jiménez',
    title: 'Licenciada en Nutrición',
    license: '12345678',
    phone: '+52 55 0000 0000',
    email: 'contacto@ejemplo.mx',
    address: null,
    logo: { bytes: PNG_1PX, mime: 'image/png' },
  },
  patientName: 'Héctor Ramírez',
  patientFileNumber: 7,
  plan,
  slotLabels: {
    breakfast: 'Desayuno',
    snack1: 'Colación',
    lunch: 'Comida',
    snack2: 'Colación',
    dinner: 'Cena',
  },
  photos: [
    { kindLabel: 'Frente', capturedAt: '2026-07-23', bytes: PNG_1PX, mime: 'image/png' },
    { kindLabel: 'Espalda', capturedAt: '2026-07-23', bytes: PNG_1PX, mime: 'image/png' },
  ],
  generatedAt: '2026-07-23',
  appVersion: '0.1.0-test',
};

describe('generateMealPlanPdf', () => {
  it('produces a valid PDF with header, plan page, and photos page', async () => {
    const bytes = await generateMealPlanPdf(input);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
    // updateMetadata: false — load() otherwise stamps its own Producer over ours.
    const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2); // plan + photos
    expect(reloaded.getTitle()).toBe('Plan alimentario - Plan de reducción');
    expect(reloaded.getProducer()).toContain('AJNutrition');
  });

  it('works without practitioner profile and without photos', async () => {
    const bytes = await generateMealPlanPdf({ ...input, practitioner: null, photos: [] });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('handles a 7-day plan across page breaks', async () => {
    const baseDay = plan.dayPlans[0];
    if (!baseDay) throw new Error('fixture day missing');
    const breakfast = baseDay.meals[0];
    if (!breakfast) throw new Error('fixture meal missing');
    const fullDay = {
      ...baseDay,
      // Every slot populated so each day takes realistic vertical space.
      meals: baseDay.meals.map((meal) => ({ ...meal, items: breakfast.items })),
    };
    const sevenDays: MealPlanDto = {
      ...plan,
      days: 7,
      dayPlans: Array.from({ length: 7 }, (_, dayIndex) => ({ ...fullDay, dayIndex })),
    };
    const bytes = await generateMealPlanPdf({ ...input, plan: sevenDays, photos: [] });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
