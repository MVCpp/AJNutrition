import { describe, expect, it } from 'vitest';
import { categoryChipClass } from './food-display';

describe('categoryChipClass', () => {
  it('maps the bundled catalog categories to their group colors', () => {
    expect(categoryChipClass('Verduras')).toContain('emerald');
    expect(categoryChipClass('Frutas y jugos')).toContain('orange');
    expect(categoryChipClass('Cereales y pastas')).toContain('amber');
    expect(categoryChipClass('Leguminosas')).toContain('lime');
    expect(categoryChipClass('Nueces y semillas')).toContain('yellow');
    expect(categoryChipClass('Pescados y mariscos')).toContain('cyan');
    expect(categoryChipClass('Res')).toContain('rose');
    expect(categoryChipClass('Cerdo')).toContain('rose');
    expect(categoryChipClass('Embutidos')).toContain('rose');
    expect(categoryChipClass('Bebidas')).toContain('violet');
    expect(categoryChipClass('Dulces')).toContain('pink');
    expect(categoryChipClass('Sopas y salsas')).toContain('fuchsia');
    expect(categoryChipClass('Especias y hierbas')).toContain('teal');
    expect(categoryChipClass('Comida de restaurante')).toContain('indigo');
  });

  it('ignores accents and case (Lácteos y huevo → sky)', () => {
    expect(categoryChipClass('Lácteos y huevo')).toContain('sky');
    expect(categoryChipClass('lacteos')).toContain('sky');
    expect(categoryChipClass('PANIFICADOS')).toContain('amber');
  });

  it('respects word boundaries for short keywords', () => {
    // "Avena" is a cereal — must not match the /aves?/ meat rule.
    expect(categoryChipClass('Avena')).toContain('amber');
    expect(categoryChipClass('Aves')).toContain('rose');
    // "res" only as a whole word: "restaurante" is not meat.
    expect(categoryChipClass('Comida de restaurante')).toContain('indigo');
  });

  it('gives unknown categories a stable deterministic color', () => {
    const a = categoryChipClass('Mi categoría rara');
    expect(a).toBe(categoryChipClass('Mi categoría rara'));
    expect(a).toMatch(/^bg-\S+ text-\S+$/);
  });
});
