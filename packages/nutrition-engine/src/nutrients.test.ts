import { describe, expect, it } from 'vitest';
import { atwaterEnergyKcal, energyCoherenceWarning, isKnownNutrient, NUTRIENTS } from './nutrients';

describe('nutrient registry', () => {
  it('every nutrient declares id, Spanish name, unit, and category', () => {
    for (const [key, def] of Object.entries(NUTRIENTS)) {
      expect(def.id).toBe(key);
      expect(def.nameEs.length).toBeGreaterThan(2);
      expect(def.unit.length).toBeGreaterThan(0);
    }
    expect(isKnownNutrient('protein_g')).toBe(true);
    expect(isKnownNutrient('vibranium_mg')).toBe(false);
  });
});

describe('Atwater energy (USDA Handbook 74)', () => {
  it('computes 4/4/9 exactly', () => {
    expect(atwaterEnergyKcal(10, 20, 5)).toBe(4 * 10 + 4 * 20 + 9 * 5);
    expect(atwaterEnergyKcal(0, 0, 0)).toBe(0);
  });
});

describe('energy coherence warning', () => {
  it('accepts values within tolerance', () => {
    // Atwater: 4·3 + 4·12 + 9·1 = 69; declared 65 is within 15%.
    expect(energyCoherenceWarning(65, 3, 12, 1)).toBeNull();
    expect(energyCoherenceWarning(0, 0, 0, 0)).toBeNull();
  });

  it('flags a likely macro typo without blocking', () => {
    // Declared 100 kcal but macros say 900 (fat typed as 100 g).
    expect(energyCoherenceWarning(100, 0, 0, 100)).toBe('energy_macro_mismatch');
    // Declared 500 kcal for zero macros.
    expect(energyCoherenceWarning(500, 0, 0, 0)).toBe('energy_macro_mismatch');
  });
});
