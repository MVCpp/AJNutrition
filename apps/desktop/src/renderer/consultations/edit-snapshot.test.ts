import { describe, expect, it } from 'vitest';
import type { ConsultationDto } from '@ajnutrition/shared';
import { editSnapshot } from './ConsultationCard';

const stored: ConsultationDto = {
  id: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-0000000000aa',
  consultationDate: '2026-07-28',
  consultationType: 'follow_up',
  subjective: 'Refiere mejor apego',
  objective: null,
  assessment: null,
  plan: null,
  status: 'draft',
  signedAt: null,
  amendments: [],
  createdAt: '2026-07-28T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
};

const form = {
  consultationDate: stored.consultationDate,
  consultationType: stored.consultationType,
  subjective: stored.subjective ?? '',
  objective: '',
  assessment: '',
  plan: '',
};

describe('editSnapshot (autosave comparison)', () => {
  it('treats a form that matches the stored draft as clean', () => {
    expect(editSnapshot(form)).toBe(editSnapshot(stored));
  });

  it('ignores whitespace the update command would trim', () => {
    // Otherwise a single trailing space keeps the form permanently "dirty"
    // and autosave fires every few seconds forever.
    expect(editSnapshot({ ...form, subjective: 'Refiere mejor apego   ' })).toBe(
      editSnapshot(stored),
    );
  });

  it('detects real edits in every field', () => {
    expect(editSnapshot({ ...form, subjective: 'Otra cosa' })).not.toBe(editSnapshot(stored));
    expect(editSnapshot({ ...form, plan: 'Aumentar proteína' })).not.toBe(editSnapshot(stored));
    expect(editSnapshot({ ...form, consultationDate: '2026-07-27' })).not.toBe(
      editSnapshot(stored),
    );
    expect(editSnapshot({ ...form, consultationType: 'initial' })).not.toBe(editSnapshot(stored));
  });
});
