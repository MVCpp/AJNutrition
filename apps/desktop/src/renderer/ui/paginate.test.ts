import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

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
