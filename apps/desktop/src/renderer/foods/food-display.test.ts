import { describe, expect, it } from 'vitest';
import { categoryChipClass, paginate } from './food-display';

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

describe('paginate', () => {
  const items = Array.from({ length: 60 }, (_, i) => i);

  it('slices full and partial pages', () => {
    expect(paginate(items, 0, 25)).toMatchObject({ totalPages: 3, safePage: 0 });
    expect(paginate(items, 0, 25).pageItems).toHaveLength(25);
    expect(paginate(items, 2, 25).pageItems).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it('clamps out-of-range pages instead of returning an empty view', () => {
    expect(paginate(items, 99, 25).safePage).toBe(2);
    expect(paginate(items, -5, 25).safePage).toBe(0);
    expect(paginate(items, 99, 25).pageItems).toHaveLength(10);
  });

  it('handles an empty list with a single empty page', () => {
    expect(paginate([], 3, 25)).toEqual({ totalPages: 1, safePage: 0, pageItems: [] });
  });
});
