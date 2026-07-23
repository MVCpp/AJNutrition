import { describe, expect, it } from 'vitest';
import type { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { assertCanSupersede, createHistoryEntry } from './clinical-history';

const ctx: DomainContext = {
  now: () => new Date('2026-07-22T12:00:00.000Z'),
  newId: () => '00000000-0000-4000-8000-0000000000h1'.replace('h', 'a'),
};

const PATIENT = '00000000-0000-4000-8000-000000000001';

describe('createHistoryEntry', () => {
  it('creates an immutable, non-superseded entry with trimmed content', () => {
    const entry = createHistoryEntry(
      { patientId: PATIENT, category: 'allergy', content: '  Alergia a mariscos  ' },
      ctx,
    );
    expect(entry).toMatchObject({
      patientId: PATIENT,
      category: 'allergy',
      content: 'Alergia a mariscos',
      supersededAt: null,
      supersededById: null,
    });
  });

  it('rejects empty content', () => {
    expect(() =>
      createHistoryEntry({ patientId: PATIENT, category: 'allergy', content: '   ' }, ctx),
    ).toThrowError();
  });
});

describe('assertCanSupersede', () => {
  const base = createHistoryEntry(
    { patientId: PATIENT, category: 'medication', content: 'Metformina 850 mg' },
    ctx,
  );

  it('allows superseding a live entry of the same patient and category', () => {
    expect(() => assertCanSupersede(base, PATIENT, 'medication')).not.toThrow();
  });

  it('rejects cross-patient supersede', () => {
    try {
      assertCanSupersede(base, '00000000-0000-4000-8000-000000000099', 'medication');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('rejects cross-category supersede', () => {
    expect(() => assertCanSupersede(base, PATIENT, 'allergy')).toThrowError();
  });

  it('rejects superseding an already-superseded entry', () => {
    const superseded = {
      ...base,
      supersededAt: '2026-07-22T12:00:00.000Z',
      supersededById: '00000000-0000-4000-8000-000000000002',
    };
    expect(() => assertCanSupersede(superseded, PATIENT, 'medication')).toThrowError();
  });
});
