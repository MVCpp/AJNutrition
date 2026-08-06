import { describe, expect, it } from 'vitest';
import type { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { createConsentRecord, withdrawConsent, type ConsentRecord } from '../consent/consent';
import { createPatientCoachLink, revokePatientCoachLink } from './patient-coach-link';
import {
  assertShareAllowed,
  createCoachShareGrant,
  evaluateCoachShare,
  revokeCoachShareGrant,
  type ShareScope,
} from './coach-share-grant';

let tick = 0;
const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-08-05T12:00:00.000Z') + tick * 1000),
  newId: () => `00000000-0000-4000-8000-${String((tick += 1)).padStart(12, '0')}`,
};

const PATIENT = '00000000-0000-4000-8000-00000000aaaa';
const OTHER_PATIENT = '00000000-0000-4000-8000-00000000dddd';
const COACH = '00000000-0000-4000-8000-00000000bbbb';

const SCOPE: ShareScope = {
  measurements: true,
  bodyComposition: true,
  planTargets: false,
  adherence: false,
  photos: false,
};

function consentFor(patientId = PATIENT): ConsentRecord {
  return createConsentRecord(
    {
      patientId,
      consentType: 'third_party_transfer',
      noticeVersion: 'AVISO-2026-08',
      decision: 'accepted',
      method: 'written',
    },
    ctx,
  );
}

function fixture() {
  const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
  const consent = consentFor();
  const grant = createCoachShareGrant(
    { linkId: link.id, consentId: consent.id, scope: SCOPE },
    ctx,
  );
  return { link, consent, grant };
}

describe('createCoachShareGrant', () => {
  it('refuses a grant that shares nothing', () => {
    try {
      createCoachShareGrant(
        {
          linkId: 'l',
          consentId: 'c',
          scope: {
            measurements: false,
            bodyComposition: false,
            planTargets: false,
            adherence: false,
            photos: false,
          },
        },
        ctx,
      );
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('cannot be built without a consent id', () => {
    const { grant } = fixture();
    expect(grant.consentId).toBeTruthy();
    expect(grant.revokedAt).toBeNull();
  });
});

describe('evaluateCoachShare', () => {
  it('allows sharing exactly the granted scope while everything is in order', () => {
    const { link, consent, grant } = fixture();
    const decision = evaluateCoachShare(grant, link, consent);
    expect(decision.effective).toBe(true);
    expect(decision.reason).toBeNull();
    expect(decision.scope).toEqual(SCOPE);
  });

  it('stops the moment the patient withdraws consent — no job, no cache', () => {
    // The whole point of C-2. A stored "active" flag would keep sharing until
    // something remembered to clear it; this is derived on every read.
    const { link, consent, grant } = fixture();
    const withdrawn = withdrawConsent(consent, ctx);
    const decision = evaluateCoachShare(grant, link, withdrawn);
    expect(decision.effective).toBe(false);
    expect(decision.reason).toBe('consent_not_accepted');
  });

  it('stops when the referral itself is revoked', () => {
    const { link, consent, grant } = fixture();
    const decision = evaluateCoachShare(
      grant,
      revokePatientCoachLink(link, undefined, ctx),
      consent,
    );
    expect(decision.effective).toBe(false);
    expect(decision.reason).toBe('link_revoked');
  });

  it('stops when the grant is revoked', () => {
    const { link, consent, grant } = fixture();
    const decision = evaluateCoachShare(
      revokeCoachShareGrant(grant, undefined, ctx),
      link,
      consent,
    );
    expect(decision.effective).toBe(false);
    expect(decision.reason).toBe('grant_revoked');
  });

  it('refuses a consent of the wrong type — data_processing is not permission to transfer', () => {
    const { link, grant } = fixture();
    const wrong = createConsentRecord(
      {
        patientId: PATIENT,
        consentType: 'data_processing',
        noticeVersion: 'AVISO-2026-08',
        decision: 'accepted',
        method: 'written',
      },
      ctx,
    );
    expect(evaluateCoachShare(grant, link, wrong).reason).toBe('consent_wrong_type');
  });

  it("refuses another patient's consent", () => {
    const { link, grant } = fixture();
    expect(evaluateCoachShare(grant, link, consentFor(OTHER_PATIENT)).reason).toBe(
      'consent_wrong_patient',
    );
  });

  it('refuses a declined consent, and a missing one', () => {
    const { link, grant } = fixture();
    const declined = createConsentRecord(
      {
        patientId: PATIENT,
        consentType: 'third_party_transfer',
        noticeVersion: 'AVISO-2026-08',
        decision: 'declined',
        method: 'verbal',
      },
      ctx,
    );
    expect(evaluateCoachShare(grant, link, declined).reason).toBe('consent_not_accepted');
    expect(evaluateCoachShare(grant, link, null).reason).toBe('consent_missing');
  });

  it('always returns an EMPTY scope when it refuses', () => {
    // A caller that reads `.scope` without checking `.effective` must still
    // get nothing. The safe outcome cannot depend on asking the question the
    // right way round.
    const { link, consent, grant } = fixture();
    const refusals = [
      evaluateCoachShare(revokeCoachShareGrant(grant, undefined, ctx), link, consent),
      evaluateCoachShare(grant, revokePatientCoachLink(link, undefined, ctx), consent),
      evaluateCoachShare(grant, link, withdrawConsent(consent, ctx)),
      evaluateCoachShare(grant, link, null),
      evaluateCoachShare(grant, link, consentFor(OTHER_PATIENT)),
    ];
    for (const decision of refusals) {
      expect(decision.effective).toBe(false);
      expect(Object.values(decision.scope).some(Boolean)).toBe(false);
    }
  });
});

describe('assertShareAllowed', () => {
  it('throws AUTHORIZATION when the decision refuses, and passes when it does not', () => {
    const { link, consent, grant } = fixture();
    expect(() => assertShareAllowed(evaluateCoachShare(grant, link, consent))).not.toThrow();
    try {
      assertShareAllowed(evaluateCoachShare(grant, link, withdrawConsent(consent, ctx)));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
  });
});
