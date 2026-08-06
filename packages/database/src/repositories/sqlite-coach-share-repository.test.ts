import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext, type Patient } from '@ajnutrition/domain';
import {
  CreateCoachUseCase,
  GetPatientSharingUseCase,
  GrantCoachShareUseCase,
  LinkPatientToCoachUseCase,
  RecordConsentUseCase,
  RevokeCoachLinkUseCase,
  RevokeCoachShareUseCase,
  WithdrawConsentUseCase,
  type CoachShareDeps,
  type ConsentDeps,
} from '@ajnutrition/application';
import type { AppError, ShareScopeDto } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteCoachRepository } from './sqlite-coach-repository';
import { SqliteCoachShareRepository } from './sqlite-coach-share-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: CoachShareDeps;
let consentDeps: ConsentDeps;
let patientRepo: SqlitePatientRepository;
let coachRepo: SqliteCoachRepository;
let sharesRepo: SqliteCoachShareRepository;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-08-05T12:00:00.000Z') + idCounter * 1000),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

const SCOPE: ShareScopeDto = {
  measurements: true,
  bodyComposition: true,
  planTargets: false,
  adherence: false,
  photos: false,
};

function addPatient(fileNumber: number, firstName: string): Patient {
  const patient = createPatient(
    {
      fileNumber,
      firstName,
      lastName: 'Márquez',
      dateOfBirth: '1990-05-14',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patientRepo.insert(patient);
  return patient;
}

function acceptTransferConsent(patientId: string) {
  return new RecordConsentUseCase(consentDeps).execute({
    patientId,
    consentType: 'third_party_transfer',
    noticeVersion: 'AVISO-2026-08',
    decision: 'accepted',
    method: 'written',
  });
}

/** Patient + coach + active referral, the precondition for every grant. */
function referral(fileNumber = 1) {
  const coach = new CreateCoachUseCase(deps).execute({ displayName: `Coach ${fileNumber}` });
  const patient = addPatient(fileNumber, 'Elena');
  const link = new LinkPatientToCoachUseCase(deps).execute({
    patientId: patient.id,
    coachId: coach.id,
  });
  return { coach, patient, link };
}

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  patientRepo = new SqlitePatientRepository(db);
  coachRepo = new SqliteCoachRepository(db);
  sharesRepo = new SqliteCoachShareRepository(db);
  const consents = new SqliteConsentRepository(db);
  const uow = new SqliteUnitOfWork(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  consentDeps = { uow, consents, patients: patientRepo, audit, ctx };
  deps = {
    uow,
    coaches: coachRepo,
    patients: patientRepo,
    shares: sharesRepo,
    consents,
    audit,
    ctx,
  };
});

describe('granting a share', () => {
  it('authorises exactly the chosen scope, backed by the consent', () => {
    const { patient, link } = referral();
    const consent = acceptTransferConsent(patient.id);

    const grant = new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: consent.id,
      scope: SCOPE,
    });

    expect(grant.effective).toBe(true);
    expect(grant.reason).toBeNull();
    expect(grant.effectiveScope).toEqual(SCOPE);
    expect(grant.consentId).toBe(consent.id);
  });

  it('refuses without a consent of the right type', () => {
    const { patient, link } = referral();
    const wrongType = new RecordConsentUseCase(consentDeps).execute({
      patientId: patient.id,
      consentType: 'data_processing',
      noticeVersion: 'AVISO-2026-08',
      decision: 'accepted',
      method: 'written',
    });
    try {
      new GrantCoachShareUseCase(deps).execute({
        linkId: link.id,
        consentId: wrongType.id,
        scope: SCOPE,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('refuses a declined consent and a withdrawn one', () => {
    const { patient, link } = referral();
    const declined = new RecordConsentUseCase(consentDeps).execute({
      patientId: patient.id,
      consentType: 'third_party_transfer',
      noticeVersion: 'AVISO-2026-08',
      decision: 'declined',
      method: 'verbal',
    });
    const grant = new GrantCoachShareUseCase(deps);
    expect(() =>
      grant.execute({ linkId: link.id, consentId: declined.id, scope: SCOPE }),
    ).toThrow();

    const accepted = acceptTransferConsent(patient.id);
    new WithdrawConsentUseCase(consentDeps).execute({ consentId: accepted.id });
    expect(() =>
      grant.execute({ linkId: link.id, consentId: accepted.id, scope: SCOPE }),
    ).toThrow();
  });

  it("refuses another patient's consent", () => {
    const { link } = referral(1);
    const other = addPatient(2, 'Bruno');
    const otherConsent = acceptTransferConsent(other.id);
    expect(() =>
      new GrantCoachShareUseCase(deps).execute({
        linkId: link.id,
        consentId: otherConsent.id,
        scope: SCOPE,
      }),
    ).toThrow();
  });

  it('refuses to reuse one consent for a second coach — a blanket consent is not consent', () => {
    const first = referral(1);
    const consent = acceptTransferConsent(first.patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: first.link.id,
      consentId: consent.id,
      scope: SCOPE,
    });

    // Same patient, different trainer, same consent.
    const secondCoach = new CreateCoachUseCase(deps).execute({ displayName: 'Otro' });
    new RevokeCoachLinkUseCase(deps).execute({ linkId: first.link.id });
    const secondLink = new LinkPatientToCoachUseCase(deps).execute({
      patientId: first.patient.id,
      coachId: secondCoach.id,
    });

    try {
      new GrantCoachShareUseCase(deps).execute({
        linkId: secondLink.id,
        consentId: consent.id,
        scope: SCOPE,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('refuses a second live grant for the same referral', () => {
    const { patient, link } = referral();
    const grant = new GrantCoachShareUseCase(deps);
    grant.execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    expect(() =>
      grant.execute({
        linkId: link.id,
        consentId: acceptTransferConsent(patient.id).id,
        scope: SCOPE,
      }),
    ).toThrow();
  });

  it('refuses a grant that shares nothing', () => {
    const { patient, link } = referral();
    expect(() =>
      new GrantCoachShareUseCase(deps).execute({
        linkId: link.id,
        consentId: acceptTransferConsent(patient.id).id,
        scope: {
          measurements: false,
          bodyComposition: false,
          planTargets: false,
          adherence: false,
          photos: false,
        },
      }),
    ).toThrow();
  });
});

describe('withdrawal stops sharing immediately', () => {
  it('a withdrawn consent makes the grant ineffective on the very next read', () => {
    // The whole point of C-2. Nothing is recomputed, migrated or swept: the
    // answer is derived from the consent every time it is asked.
    const { patient, link } = referral();
    const consent = acceptTransferConsent(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: consent.id,
      scope: SCOPE,
    });

    const sharing = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    });
    expect(sharing.execute({ patientId: patient.id }).grants[0]?.effective).toBe(true);

    new WithdrawConsentUseCase(consentDeps).execute({ consentId: consent.id });

    const after = sharing.execute({ patientId: patient.id }).grants[0];
    expect(after?.effective).toBe(false);
    expect(after?.reason).toBe('consent_not_accepted');
    // And nothing may be shared, even by a caller that ignores `effective`.
    expect(Object.values(after?.effectiveScope ?? {}).some(Boolean)).toBe(false);
    // The grant row itself is untouched — the record of what was authorised
    // survives, which is what makes the history answerable.
    expect(after?.revokedAt).toBeNull();
    expect(after?.scope).toEqual(SCOPE);
  });

  it('ending the referral also stops the sharing', () => {
    const { patient, link } = referral();
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    new RevokeCoachLinkUseCase(deps).execute({ linkId: link.id });

    const grants = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    }).execute({ patientId: patient.id }).grants;
    expect(grants[0]?.effective).toBe(false);
    expect(grants[0]?.reason).toBe('link_revoked');
  });

  it('revoking the authorisation itself, twice, is a conflict the second time', () => {
    const { patient, link } = referral();
    const grant = new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    const revoke = new RevokeCoachShareUseCase(deps);
    const revoked = revoke.execute({ grantId: grant.id, reason: 'la paciente lo pidió' });
    expect(revoked.effective).toBe(false);
    expect(revoked.reason).toBe('grant_revoked');
    expect(() => revoke.execute({ grantId: grant.id })).toThrow();
  });
});

describe('the sharing panel', () => {
  it('offers only accepted, unspent third_party_transfer consents', () => {
    const { patient, link } = referral();
    // Wrong type, and a withdrawn one: neither may be offered.
    new RecordConsentUseCase(consentDeps).execute({
      patientId: patient.id,
      consentType: 'photo',
      noticeVersion: 'AVISO-2026-08',
      decision: 'accepted',
      method: 'written',
    });
    const withdrawn = acceptTransferConsent(patient.id);
    new WithdrawConsentUseCase(consentDeps).execute({ consentId: withdrawn.id });
    const usable = acceptTransferConsent(patient.id);

    const sharing = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    });
    expect(sharing.execute({ patientId: patient.id }).eligibleConsents).toEqual([
      expect.objectContaining({ consentId: usable.id }),
    ]);

    // Spending it removes it from the list.
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: usable.id,
      scope: SCOPE,
    });
    expect(sharing.execute({ patientId: patient.id }).eligibleConsents).toEqual([]);
  });

  it('keeps every authorisation ever made, so "who could see my data" is answerable', () => {
    const { patient, link } = referral();
    const grant = new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    new RevokeCoachShareUseCase(deps).execute({ grantId: grant.id });

    const grants = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    }).execute({ patientId: patient.id }).grants;
    expect(grants).toHaveLength(1);
    expect(grants[0]?.revokedAt).not.toBeNull();
    expect(grants[0]?.coachDisplayName).toBe('Coach 1');
  });
});

describe('audit', () => {
  it('records which categories were authorised, and no free text', () => {
    const { patient, link } = referral();
    const grant = new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    new RevokeCoachShareUseCase(deps).execute({
      grantId: grant.id,
      reason: 'la paciente cambió de opinión',
    });

    const rows = db
      .prepare(`SELECT action, metadata_json FROM audit_events WHERE action LIKE 'coach.share%'`)
      .all() as Array<{ action: string; metadata_json: string | null }>;
    expect(rows.map((r) => r.action)).toEqual(['coach.share.grant', 'coach.share.revoke']);

    const granted = JSON.parse(rows[0]?.metadata_json ?? '{}') as Record<string, unknown>;
    expect(granted['measurements']).toBe(true);
    expect(granted['photos']).toBe(false);
    expect(granted['noticeVersion']).toBe('AVISO-2026-08');

    const all = rows.map((r) => r.metadata_json ?? '').join(' ');
    expect(all).not.toContain('cambió de opinión');
    expect(all).not.toContain('Elena');
  });
});
