import { describe, expect, it } from 'vitest';
import type { DomainContext } from '../common/context';
import { createFood, normalizeFoodName } from './food';

const ctx: DomainContext = {
  now: () => new Date('2026-07-23T12:00:00.000Z'),
  newId: () => '00000000-0000-4000-8000-0000000000f1',
};

const KNOWN = new Set(['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g']);
const base = {
  name: 'Tortilla de maíz',
  nutrients: { energy_kcal: 218, protein_g: 5.7, carbohydrate_g: 44.6, fat_g: 2.9 },
  isKnownNutrient: (id: string) => KNOWN.has(id),
};

describe('normalizeFoodName (accent-insensitive search key)', () => {
  it.each([
    ['Tortilla de Maíz', 'tortilla de maiz'],
    ['Plátano macho', 'platano macho'],
    ['AZÚCAR', 'azucar'],
    ['  Café  ', 'cafe'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeFoodName(input)).toBe(expected);
  });
});

describe('createFood', () => {
  it('creates a custom food with per-100g basis and normalized name', () => {
    const food = createFood(base, ctx);
    expect(food).toMatchObject({
      name: 'Tortilla de maíz',
      nameNormalized: 'tortilla de maiz',
      source: 'custom',
      status: 'active',
      basisGrams: 100,
    });
    expect(food.nutrients['energy_kcal']).toBe(218);
  });

  it('rejects unknown nutrients and negative amounts', () => {
    expect(() =>
      createFood({ ...base, nutrients: { ...base.nutrients, magic_dust: 1 } }, ctx),
    ).toThrowError();
    expect(() =>
      createFood({ ...base, nutrients: { ...base.nutrients, protein_g: -1 } }, ctx),
    ).toThrowError();
  });

  it('rejects an empty name', () => {
    expect(() => createFood({ ...base, name: '   ' }, ctx)).toThrowError();
  });
});
