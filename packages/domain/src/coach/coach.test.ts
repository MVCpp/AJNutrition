import { describe, expect, it } from 'vitest';
import type { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { createCoach, setCoachStatus, updateCoachDetails } from './coach';
import {
  activePatientCoachLink,
  createPatientCoachLink,
  revokePatientCoachLink,
} from './patient-coach-link';

let tick = 0;
const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-08-05T12:00:00.000Z') + tick * 1000),
  newId: () => `00000000-0000-4000-8000-${String((tick += 1)).padStart(12, '0')}`,
};

const PATIENT = '00000000-0000-4000-8000-00000000aaaa';
const COACH = '00000000-0000-4000-8000-00000000bbbb';

describe('createCoach', () => {
  it('trims details and starts active', () => {
    const coach = createCoach(
      { displayName: '  Carlos Ruiz  ', organization: ' Gimnasio Norte ', email: ' c@r.mx ' },
      ctx,
    );
    expect(coach).toMatchObject({
      displayName: 'Carlos Ruiz',
      organization: 'Gimnasio Norte',
      email: 'c@r.mx',
      phone: null,
      notes: null,
      status: 'active',
      archivedAt: null,
      version: 1,
    });
  });

  it('rejects a blank name', () => {
    try {
      createCoach({ displayName: '   ' }, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      const error = err as AppError;
      expect(error.code).toBe('VALIDATION');
      expect(error.fieldErrors?.['displayName']).toEqual(['required']);
    }
  });
});

describe('updateCoachDetails', () => {
  it('bumps the version and clears emptied optional fields', () => {
    const coach = createCoach({ displayName: 'Carlos', phone: '5512345678' }, ctx);
    const updated = updateCoachDetails(coach, { displayName: 'Carlos Ruiz' }, ctx);
    expect(updated.displayName).toBe('Carlos Ruiz');
    expect(updated.phone).toBeNull();
    expect(updated.version).toBe(coach.version + 1);
    expect(updated.createdAt).toBe(coach.createdAt);
  });
});

describe('setCoachStatus', () => {
  it('archives and restores, stamping archivedAt only while archived', () => {
    const coach = createCoach({ displayName: 'Carlos' }, ctx);
    const archived = setCoachStatus(coach, 'archived', ctx);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).not.toBeNull();

    const restored = setCoachStatus(archived, 'active', ctx);
    expect(restored.status).toBe('active');
    expect(restored.archivedAt).toBeNull();
  });

  it('refuses a no-op transition rather than silently succeeding', () => {
    const coach = createCoach({ displayName: 'Carlos' }, ctx);
    expect(() => setCoachStatus(coach, 'active', ctx)).toThrow();
  });
});

describe('patient–coach links', () => {
  it('starts active and carries no authorisation of its own', () => {
    const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    expect(link).toMatchObject({
      patientId: PATIENT,
      coachId: COACH,
      revokedAt: null,
      revokedReason: null,
    });
    // The link is a referral fact. Nothing on it grants permission to share
    // anything — that is a third_party_transfer consent, added in C-2.
    expect(Object.keys(link)).not.toContain('consentId');
    expect(Object.keys(link)).not.toContain('scope');
  });

  it('revokes with a reason, and refuses to revoke twice', () => {
    const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    const revoked = revokePatientCoachLink(link, '  cambió de gimnasio  ', ctx);
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe('cambió de gimnasio');

    try {
      revokePatientCoachLink(revoked, undefined, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('keeps the revoked row so past referrals stay answerable', () => {
    const first = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    const revoked = revokePatientCoachLink(first, undefined, ctx);
    const second = createPatientCoachLink({ patientId: PATIENT, coachId: 'other-coach' }, ctx);

    const history = [revoked, second];
    expect(activePatientCoachLink(history)?.coachId).toBe('other-coach');
    expect(history).toHaveLength(2);
  });

  it('reports no active trainer once the only link is revoked', () => {
    const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    expect(activePatientCoachLink([revokePatientCoachLink(link, undefined, ctx)])).toBeNull();
    expect(activePatientCoachLink([])).toBeNull();
  });
});
