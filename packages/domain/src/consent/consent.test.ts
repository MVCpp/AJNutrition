import { describe, expect, it } from 'vitest';
import type { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { createConsentRecord, currentConsentByType, withdrawConsent } from './consent';

let tick = 0;
const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-07-22T12:00:00.000Z') + tick * 1000),
  newId: () => `00000000-0000-4000-8000-${String((tick += 1)).padStart(12, '0')}`,
};

const PATIENT = '00000000-0000-4000-8000-000000000001';

const base = {
  patientId: PATIENT,
  consentType: 'data_processing' as const,
  noticeVersion: 'AVISO-2026-07',
  decision: 'accepted' as const,
  method: 'written' as const,
};

describe('createConsentRecord', () => {
  it('creates an accepted record with trimmed fields', () => {
    const record = createConsentRecord({ ...base, noticeVersion: '  AVISO-2026-07  ' }, ctx);
    expect(record).toMatchObject({
      consentType: 'data_processing',
      noticeVersion: 'AVISO-2026-07',
      status: 'accepted',
      withdrawnAt: null,
      notes: null,
    });
  });

  it('creates declined records too — a refusal is also a legal fact', () => {
    const record = createConsentRecord({ ...base, decision: 'declined' }, ctx);
    expect(record.status).toBe('declined');
  });

  it('rejects an empty notice version', () => {
    expect(() => createConsentRecord({ ...base, noticeVersion: '   ' }, ctx)).toThrowError();
  });
});

describe('withdrawConsent', () => {
  it('withdraws an accepted consent exactly once', () => {
    const record = createConsentRecord(base, ctx);
    const withdrawn = withdrawConsent(record, ctx);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.withdrawnAt).not.toBeNull();
    try {
      withdrawConsent(withdrawn, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('cannot withdraw a declined consent', () => {
    const declined = createConsentRecord({ ...base, decision: 'declined' }, ctx);
    expect(() => withdrawConsent(declined, ctx)).toThrowError();
  });
});

describe('currentConsentByType', () => {
  it('the latest decision per type wins', () => {
    const first = createConsentRecord(base, ctx);
    const second = createConsentRecord({ ...base, decision: 'declined' }, ctx);
    const photo = createConsentRecord({ ...base, consentType: 'photo' }, ctx);
    const current = currentConsentByType([first, second, photo]);
    expect(current.get('data_processing')?.id).toBe(second.id);
    expect(current.get('photo')?.id).toBe(photo.id);
    expect(current.get('ai_processing')).toBeUndefined();
  });
});
