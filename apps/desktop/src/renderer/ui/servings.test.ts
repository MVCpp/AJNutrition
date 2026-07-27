import { describe, expect, it } from 'vitest';
import type { FoodServingDto } from '@ajnutrition/shared';
import { parseQuantity, resolveGrams, servingOptionLabel, servingToGrams } from './servings';

const SERVINGS: FoodServingDto[] = [
  { id: 'a', name: '1 pieza', grams: 30 },
  { id: 'b', name: '1 taza', grams: 30.1 },
];

describe('parseQuantity', () => {
  it('accepts the decimal comma and rejects anything unusable', () => {
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity(' 2 ')).toBe(2);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('dos')).toBeNull();
  });
});

describe('servingToGrams', () => {
  it('rounds to 0.1 g instead of storing float noise', () => {
    expect(servingToGrams(3, 30.1)).toBe(90.3);
    expect(servingToGrams(1.5, 30)).toBe(45);
  });
});

describe('resolveGrams', () => {
  it('treats a blank measure as grams already', () => {
    expect(resolveGrams('120', '', SERVINGS)).toBe(120);
  });

  it('multiplies by the chosen measure', () => {
    expect(resolveGrams('2', 'a', SERVINGS)).toBe(60);
    expect(resolveGrams('3', 'b', SERVINGS)).toBe(90.3);
  });

  it('refuses a measure that no longer exists rather than reading it as grams', () => {
    // Silently falling back to grams would enter 2 g where 60 g was meant.
    expect(resolveGrams('2', 'borrada', SERVINGS)).toBeNull();
  });

  it('returns null while the quantity is not usable', () => {
    expect(resolveGrams('', 'a', SERVINGS)).toBeNull();
    expect(resolveGrams('abc', '', SERVINGS)).toBeNull();
  });
});

describe('servingOptionLabel', () => {
  it('shows the gram equivalent so the choice is never ambiguous', () => {
    expect(servingOptionLabel(SERVINGS[0] as FoodServingDto)).toBe('1 pieza (30 g)');
  });
});
