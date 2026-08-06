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

function photoConsentFor(patientId = PATIENT, decision: 'accepted' | 'declined' = 'accepted') {
  return createConsentRecord(
    {
      patientId,
      consentType: 'photo',
      noticeVersion: 'AVISO-2026-08',
      decision,
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
    const decision = evaluateCoachShare(grant, link, consent, null);
    expect(decision.effective).toBe(true);
    expect(decision.reason).toBeNull();
    expect(decision.scope).toEqual(SCOPE);
  });

  it('stops the moment the patient withdraws consent — no job, no cache', () => {
    // The whole point of C-2. A stored "active" flag would keep sharing until
    // something remembered to clear it; this is derived on every read.
    const { link, consent, grant } = fixture();
    const withdrawn = withdrawConsent(consent, ctx);
    const decision = evaluateCoachShare(grant, link, withdrawn, null);
    expect(decision.effective).toBe(false);
    expect(decision.reason).toBe('consent_not_accepted');
  });

  it('stops when the referral itself is revoked', () => {
    const { link, consent, grant } = fixture();
    const decision = evaluateCoachShare(
      grant,
      revokePatientCoachLink(link, undefined, ctx),
      consent,
      null,
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
      null,
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
    expect(evaluateCoachShare(grant, link, wrong, null).reason).toBe('consent_wrong_type');
  });

  it("refuses another patient's consent", () => {
    const { link, grant } = fixture();
    expect(evaluateCoachShare(grant, link, consentFor(OTHER_PATIENT), null).reason).toBe(
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
    expect(evaluateCoachShare(grant, link, declined, null).reason).toBe('consent_not_accepted');
    expect(evaluateCoachShare(grant, link, null, null).reason).toBe('consent_missing');
  });

  it('always returns an EMPTY scope when it refuses', () => {
    // A caller that reads `.scope` without checking `.effective` must still
    // get nothing. The safe outcome cannot depend on asking the question the
    // right way round.
    const { link, consent, grant } = fixture();
    const refusals = [
      evaluateCoachShare(revokeCoachShareGrant(grant, undefined, ctx), link, consent, null),
      evaluateCoachShare(grant, revokePatientCoachLink(link, undefined, ctx), consent, null),
      evaluateCoachShare(grant, link, withdrawConsent(consent, ctx), null),
      evaluateCoachShare(grant, link, null, null),
      evaluateCoachShare(grant, link, consentFor(OTHER_PATIENT), null),
    ];
    for (const decision of refusals) {
      expect(decision.effective).toBe(false);
      expect(Object.values(decision.scope).some(Boolean)).toBe(false);
    }
  });
});

describe('photos need the photo consent too, not just the transfer consent', () => {
  function withPhotos() {
    const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    const consent = consentFor();
    const grant = createCoachShareGrant(
      { linkId: link.id, consentId: consent.id, scope: { ...SCOPE, photos: true } },
      ctx,
    );
    return { link, consent, grant };
  }

  it('shares photos while both consents are live', () => {
    const { link, consent, grant } = withPhotos();
    const decision = evaluateCoachShare(grant, link, consent, photoConsentFor());
    expect(decision.effective).toBe(true);
    expect(decision.scope.photos).toBe(true);
  });

  it('drops photos when the photo consent is withdrawn, and keeps sharing the rest', () => {
    // The app refuses to accept a photo without a live photo consent. Sending
    // one to a trainer after the patient withdrew it would make the withdrawal
    // mean less than it did the day she signed it.
    const { link, consent, grant } = withPhotos();
    const decision = evaluateCoachShare(
      grant,
      link,
      consent,
      withdrawConsent(photoConsentFor(), ctx),
    );
    expect(decision.effective).toBe(true);
    expect(decision.scope.photos).toBe(false);
    // Narrowing, not refusing: the measurements were authorised separately.
    expect(decision.scope.measurements).toBe(true);
    // And what was GRANTED is untouched — the record of the authorisation is
    // not rewritten by a change to a different consent.
    expect(grant.scope.photos).toBe(true);
  });

  it('drops photos when there is no photo consent at all, or it was declined', () => {
    const { link, consent, grant } = withPhotos();
    expect(evaluateCoachShare(grant, link, consent, null).scope.photos).toBe(false);
    expect(
      evaluateCoachShare(grant, link, consent, photoConsentFor(PATIENT, 'declined')).scope.photos,
    ).toBe(false);
  });

  it("refuses another patient's photo consent", () => {
    const { link, consent, grant } = withPhotos();
    expect(
      evaluateCoachShare(grant, link, consent, photoConsentFor(OTHER_PATIENT)).scope.photos,
    ).toBe(false);
  });

  it('refuses outright when photos were the only thing granted', () => {
    // Nothing lawful is left to send, so this is not a narrower report — it is
    // no report, with a reason that says which consent is missing.
    const link = createPatientCoachLink({ patientId: PATIENT, coachId: COACH }, ctx);
    const consent = consentFor();
    const grant = createCoachShareGrant(
      {
        linkId: link.id,
        consentId: consent.id,
        scope: {
          measurements: false,
          bodyComposition: false,
          planTargets: false,
          adherence: false,
          photos: true,
        },
      },
      ctx,
    );
    const decision = evaluateCoachShare(grant, link, consent, null);
    expect(decision.effective).toBe(false);
    expect(decision.reason).toBe('photo_consent_missing');
    expect(Object.values(decision.scope).some(Boolean)).toBe(false);
  });
});

describe('assertShareAllowed', () => {
  it('throws AUTHORIZATION when the decision refuses, and passes when it does not', () => {
    const { link, consent, grant } = fixture();
    expect(() => assertShareAllowed(evaluateCoachShare(grant, link, consent, null))).not.toThrow();
    try {
      assertShareAllowed(evaluateCoachShare(grant, link, withdrawConsent(consent, ctx), null));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
  });
});
