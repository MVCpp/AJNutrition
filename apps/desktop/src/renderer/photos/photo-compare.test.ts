import { describe, expect, it } from 'vitest';
import type { PhotoDto } from '@ajnutrition/shared';
import { comparableKinds, photosByKind } from './PhotoCompare';

function photo(id: string, kind: PhotoDto['kind'], capturedAt: string): PhotoDto {
  return {
    id,
    patientId: '00000000-0000-4000-8000-0000000000aa',
    kind,
    capturedAt,
    originalFileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    consultationId: null,
    createdAt: `${capturedAt}T10:00:00.000Z`,
  } as PhotoDto;
}

const photos = [
  photo('c', 'front', '2026-07-01'),
  photo('a', 'front', '2026-01-15'),
  photo('b', 'front', '2026-04-10'),
  photo('d', 'back', '2026-04-10'),
];

describe('photosByKind', () => {
  it('groups by pose and orders each group oldest first', () => {
    const grouped = photosByKind(photos);
    expect(grouped.get('front')?.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(grouped.get('back')?.map((p) => p.id)).toEqual(['d']);
  });
});

describe('comparableKinds', () => {
  it('offers only poses with at least two captures', () => {
    // Comparing two different angles would read as a change that never happened.
    expect(comparableKinds(photos)).toEqual(['front']);
  });

  it('offers nothing when there is only one photo per pose', () => {
    expect(comparableKinds([photo('a', 'front', '2026-01-15')])).toEqual([]);
  });
});
