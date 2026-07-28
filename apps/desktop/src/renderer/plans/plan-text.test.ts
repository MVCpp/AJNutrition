import { describe, expect, it } from 'vitest';
import type { MealPlanDto } from '@ajnutrition/shared';
import { planDayToText } from './plan-text';

function total(nutrientId: string, amount: number, complete = true) {
  return { nutrientId, nameEs: nutrientId, unit: 'g', amount, complete };
}

const plan = {
  id: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-0000000000aa',
  name: 'Plan de reducción',
  days: 2,
  status: 'active',
  targets: { energyKcal: 1800, proteinG: 90, carbohydrateG: 200, fatG: 60 },
  targetSource: {},
  consultationId: null,
  allergies: [],
  notes: null,
  createdAt: '2026-07-28T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
  dayPlans: [
    {
      dayIndex: 0,
      meals: [
        {
          slot: 'breakfast',
          items: [
            {
              id: 'i1',
              itemType: 'food',
              label: 'Tortilla de maíz',
              quantityLabel: '2 × 1 pieza (60 g)',
              totals: [],
            },
          ],
          totals: [],
        },
        { slot: 'snack1', items: [], totals: [] },
        {
          slot: 'lunch',
          items: [
            {
              id: 'i2',
              itemType: 'recipe',
              label: 'Chilaquiles',
              quantityLabel: '2 porción(es)',
              totals: [],
            },
          ],
          totals: [],
        },
        { slot: 'snack2', items: [], totals: [] },
        { slot: 'dinner', items: [], totals: [] },
      ],
      totals: [
        total('energy_kcal', 1799.96),
        total('protein_g', 90.4),
        total('carbohydrate_g', 200),
        total('fat_g', 60),
      ],
    },
    { dayIndex: 1, meals: [], totals: [] },
  ],
} as unknown as MealPlanDto;

describe('planDayToText', () => {
  it('renders the day the way the patient will read it', () => {
    const text = planDayToText(plan, 0);
    expect(text).toBe(
      [
        'Plan de reducción — Día 1',
        '',
        '*Desayuno*',
        '• Tortilla de maíz — 2 × 1 pieza (60 g)',
        '',
        '*Comida*',
        '• Chilaquiles — 2 porción(es)',
        '',
        'Total del día: 1800 kcal · P 90.4 g · HC 200 g · G 60 g',
      ].join('\n'),
    );
  });

  it('skips empty meals instead of printing hollow headings', () => {
    expect(planDayToText(plan, 0)).not.toContain('Colación');
  });

  it('carries the incomplete-data warning with the plan', () => {
    const incomplete = {
      ...plan,
      dayPlans: [
        {
          ...plan.dayPlans[0],
          totals: [total('energy_kcal', 1200, false)],
        },
        plan.dayPlans[1],
      ],
    } as unknown as MealPlanDto;
    expect(planDayToText(incomplete, 0)).toContain('aproximados');
  });

  it('says so when the day is empty, rather than sending a bare title', () => {
    expect(planDayToText(plan, 1)).toContain('(Sin alimentos)');
  });

  it('returns nothing for a day that does not exist', () => {
    expect(planDayToText(plan, 9)).toBe('');
  });
});
