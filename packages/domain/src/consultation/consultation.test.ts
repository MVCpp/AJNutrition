import { describe, expect, it } from 'vitest';
import type { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { createAmendment, createConsultation, signConsultation } from './consultation';

const FIXED_NOW = new Date('2026-07-22T12:00:00.000Z');
const ctx: DomainContext = {
  now: () => FIXED_NOW,
  newId: () => '00000000-0000-4000-8000-0000000000c1',
};

const validInput = {
  patientId: '00000000-0000-4000-8000-000000000001',
  consultationDate: '2026-07-22',
  consultationType: 'initial' as const,
  subjective: 'Refiere fatiga por las tardes.',
};

describe('createConsultation', () => {
  it('creates a draft with trimmed sections and empty sections as null', () => {
    const consultation = createConsultation(
      { ...validInput, objective: '  Peso 82 kg  ', plan: '   ' },
      ctx,
    );
    expect(consultation).toMatchObject({
      status: 'draft',
      signedAt: null,
      subjective: 'Refiere fatiga por las tardes.',
      objective: 'Peso 82 kg',
      assessment: null,
      plan: null,
      version: 1,
    });
  });

  it('rejects a future encounter date', () => {
    expect(() =>
      createConsultation({ ...validInput, consultationDate: '2026-07-23' }, ctx),
    ).toThrowError();
  });

  it('rejects a note with no content in any SOAP section', () => {
    try {
      createConsultation({ ...validInput, subjective: '  ', objective: undefined }, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).fieldErrors).toEqual({ subjective: ['at_least_one_section'] });
    }
  });
});

describe('signConsultation', () => {
  it('signs a draft exactly once and bumps the version', () => {
    const draft = createConsultation(validInput, ctx);
    const signed = signConsultation(draft, ctx);
    expect(signed).toMatchObject({
      status: 'signed',
      signedAt: FIXED_NOW.toISOString(),
      version: 2,
    });
    expect(() => signConsultation(signed, ctx)).toThrowError();
  });
});

describe('createAmendment', () => {
  it('refuses amendments on drafts', () => {
    const draft = createConsultation(validInput, ctx);
    expect(() =>
      createAmendment(draft, { reason: 'corrección', content: 'texto' }, ctx),
    ).toThrowError();
  });

  it('creates an amendment on a signed consultation without touching the original', () => {
    const signed = signConsultation(createConsultation(validInput, ctx), ctx);
    const amendment = createAmendment(
      signed,
      { reason: 'Dato omitido', content: 'El paciente también reporta cefalea.' },
      ctx,
    );
    expect(amendment).toMatchObject({
      consultationId: signed.id,
      reason: 'Dato omitido',
      content: 'El paciente también reporta cefalea.',
    });
    expect(signed.subjective).toBe('Refiere fatiga por las tardes.');
  });

  it('requires reason and content', () => {
    const signed = signConsultation(createConsultation(validInput, ctx), ctx);
    expect(() => createAmendment(signed, { reason: '  ', content: 'x' }, ctx)).toThrowError();
    expect(() => createAmendment(signed, { reason: 'motivo', content: ' ' }, ctx)).toThrowError();
  });
});
