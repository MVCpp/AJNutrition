import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext, type Patient } from '@ajnutrition/domain';
import {
  BuildCoachPackUseCase,
  BuildCoachReportUseCase,
  CreateCoachUseCase,
  CreateMeasurementSessionUseCase,
  ListMeasurementSessionsUseCase,
  type MeasurementDeps,
  GetPatientSharingUseCase,
  GrantCoachShareUseCase,
  LinkPatientToCoachUseCase,
  RecordConsentUseCase,
  RevokeCoachLinkUseCase,
  RevokeCoachShareUseCase,
  SetPatientStatusUseCase,
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
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: CoachShareDeps;
let consentDeps: ConsentDeps;
let patientRepo: SqlitePatientRepository;
let coachRepo: SqliteCoachRepository;
let sharesRepo: SqliteCoachShareRepository;
let measurementDeps: MeasurementDeps;
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

function acceptPhotoConsent(patientId: string) {
  return new RecordConsentUseCase(consentDeps).execute({
    patientId,
    consentType: 'photo',
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
  measurementDeps = {
    uow,
    measurements: new SqliteMeasurementRepository(db),
    patients: patientRepo,
    consultations: new SqliteConsultationRepository(db),
    audit,
    ctx,
  };
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

  it('refuses a photos-only grant when there is no photo consent — it would be born ineffective', () => {
    const { patient, link } = referral();
    try {
      new GrantCoachShareUseCase(deps).execute({
        linkId: link.id,
        consentId: acceptTransferConsent(patient.id).id,
        scope: {
          measurements: false,
          bodyComposition: false,
          planTargets: false,
          adherence: false,
          photos: true,
        },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('allows photos ALONGSIDE other data without a photo consent, because the rest still shares', () => {
    // And the photos begin sharing by themselves if a photo consent is recorded
    // later — no re-grant, because effectiveness is derived on every read.
    const { patient, link } = referral();
    const grant = new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: { ...SCOPE, photos: true },
    });
    expect(grant.effective).toBe(true);
    expect(grant.scope.photos).toBe(true);
    expect(grant.effectiveScope.photos).toBe(false);

    acceptPhotoConsent(patient.id);
    const after = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    }).execute({ patientId: patient.id });
    expect(after.grants[0]?.effectiveScope.photos).toBe(true);
    expect(after.photoConsentActive).toBe(true);
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

describe('the coach report', () => {
  function reportDeps() {
    return {
      ...deps,
      listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
      listPlans: { execute: () => [] },
      getPlan: {
        execute: () => {
          throw new Error('not used');
        },
      },
      listAdherence: { execute: () => [] },
      listPhotos: { execute: () => [] },
    };
  }

  function measure(patientId: string) {
    new CreateMeasurementSessionUseCase(measurementDeps).execute({
      patientId,
      measuredAt: '2026-08-01',
      weightKg: 82,
      heightCm: 175,
      waistCm: 90,
      bodyFatPercent: 24,
    });
  }

  it('refuses to build anything without an effective authorisation', () => {
    const { link } = referral();
    try {
      new BuildCoachReportUseCase(reportDeps()).execute({ linkId: link.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
  });

  it('stops the moment the consent is withdrawn, mid-session', () => {
    const { patient, link } = referral();
    measure(patient.id);
    const consent = acceptTransferConsent(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: consent.id,
      scope: SCOPE,
    });

    const builder = new BuildCoachReportUseCase(reportDeps());
    expect(builder.execute({ linkId: link.id }).metrics.length).toBeGreaterThan(0);

    new WithdrawConsentUseCase(consentDeps).execute({ consentId: consent.id });
    expect(() => builder.execute({ linkId: link.id })).toThrow();
  });

  it('includes only what the scope allows — body composition off means it is absent', () => {
    const { patient, link } = referral();
    measure(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      // Raw anthropometry only.
      scope: { ...SCOPE, bodyComposition: false },
    });

    const report = new BuildCoachReportUseCase(reportDeps()).execute({ linkId: link.id });
    const labels = report.metrics.map((metric) => metric.label);
    expect(labels).toContain('Peso (kg)');
    expect(labels).toContain('Cintura (cm)');
    // Recorded on the session, but out of scope, so it never reaches the DTO.
    expect(labels).not.toContain('Grasa corporal (%)');
    expect(JSON.stringify(report)).not.toContain('24');
  });

  it('carries the consent that authorised it, for the document to state', () => {
    const { coach, patient, link } = referral();
    measure(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    const report = new BuildCoachReportUseCase(reportDeps()).execute({ linkId: link.id });
    expect(report.consentNoticeVersion).toBe('AVISO-2026-08');
    expect(report.consentDecidedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(report.coachName).toBe('Coach 1');
    // Carried so the export can be audited against the coach: a log entry that
    // cannot say who received a document cannot answer an ARCO request.
    expect(report.coachId).toBe(coach.id);
    expect(report.scopeLabels).toEqual(['mediciones y peso', 'composición corporal']);
  });

  it('never carries photos unless photos were granted', () => {
    const { patient, link } = referral();
    measure(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    const withPhotos = {
      ...reportDeps(),
      listPhotos: {
        execute: () => [{ id: 'p1', kind: 'front', capturedAt: '2026-08-01' } as never],
      },
    };
    expect(new BuildCoachReportUseCase(withPhotos).execute({ linkId: link.id }).photos).toEqual([]);
  });

  it('stops sending photos when the PHOTO consent is withdrawn, and keeps sending the rest', () => {
    // Two consents have to be live before a body photo reaches a trainer: the
    // transfer consent permits the sharing, the photo consent permits the
    // photograph. The app refuses to accept a photo without the second one, so
    // continuing to send them after a withdrawal would make that withdrawal
    // mean less than it did the day she signed it.
    const { patient, link } = referral();
    measure(patient.id);
    const photoConsent = acceptPhotoConsent(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: { ...SCOPE, photos: true },
    });
    const withPhotos = {
      ...reportDeps(),
      listPhotos: {
        execute: () => [
          { id: '00000000-0000-4000-8000-0000000000ff', kind: 'front', capturedAt: '2026-08-01' },
        ],
      },
    } as never as ReturnType<typeof reportDeps>;

    const builder = new BuildCoachReportUseCase(withPhotos);
    const before = builder.execute({ linkId: link.id });
    expect(before.photos).toHaveLength(1);
    expect(before.scopeLabels).toContain('fotografías de progreso');

    new WithdrawConsentUseCase(consentDeps).execute({ consentId: photoConsent.id });

    const after = builder.execute({ linkId: link.id });
    expect(after.photos).toEqual([]);
    // Narrowing, not refusing — the measurements were authorised separately,
    // and the document must stop claiming photos it no longer carries.
    expect(after.metrics.length).toBeGreaterThan(0);
    expect(after.scope.photos).toBe(false);
    expect(after.scopeLabels).not.toContain('fotografías de progreso');
  });

  it('shows the narrowing on the sharing panel instead of silently dropping it', () => {
    const { patient, link } = referral();
    const photoConsent = acceptPhotoConsent(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: { ...SCOPE, photos: true },
    });
    new WithdrawConsentUseCase(consentDeps).execute({ consentId: photoConsent.id });

    const grant = new GetPatientSharingUseCase({
      coaches: coachRepo,
      shares: sharesRepo,
      consents: consentDeps.consents,
    }).execute({ patientId: patient.id }).grants[0];
    expect(grant?.effective).toBe(true);
    // What was authorised is not rewritten by a change to a different consent.
    expect(grant?.scope.photos).toBe(true);
    expect(grant?.effectiveScope.photos).toBe(false);
  });

  it('refuses outright when photos were the only thing authorised and that consent lapses', () => {
    // Such a grant can no longer be CREATED without a live photo consent, so
    // the only way into this state is a withdrawal after the fact — which is
    // exactly the state that must refuse rather than produce an empty document.
    const { patient, link } = referral();
    const photoConsent = acceptPhotoConsent(patient.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: {
        measurements: false,
        bodyComposition: false,
        planTargets: false,
        adherence: false,
        photos: true,
      },
    });
    new WithdrawConsentUseCase(consentDeps).execute({ consentId: photoConsent.id });

    // Nothing lawful is left to send.
    try {
      new BuildCoachReportUseCase(reportDeps()).execute({ linkId: link.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
  });
});

describe('the coach pack', () => {
  it('reports on the authorised trainees and says who was skipped, and why', () => {
    // A batch that quietly left someone out reads as "everyone was included".
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const authorised = addPatient(1, 'Autorizada');
    const noGrant = addPatient(2, 'SinAutorizacion');
    const withdrawn = addPatient(3, 'Retirada');

    const linkFor = (patientId: string) =>
      new LinkPatientToCoachUseCase(deps).execute({ patientId, coachId: coach.id });

    const a = linkFor(authorised.id);
    new CreateMeasurementSessionUseCase(measurementDeps).execute({
      patientId: authorised.id,
      measuredAt: '2026-08-01',
      weightKg: 70,
      heightCm: 165,
    });
    new GrantCoachShareUseCase(deps).execute({
      linkId: a.id,
      consentId: acceptTransferConsent(authorised.id).id,
      scope: SCOPE,
    });

    linkFor(noGrant.id);

    const w = linkFor(withdrawn.id);
    const wConsent = acceptTransferConsent(withdrawn.id);
    new GrantCoachShareUseCase(deps).execute({
      linkId: w.id,
      consentId: wConsent.id,
      scope: SCOPE,
    });
    new WithdrawConsentUseCase(consentDeps).execute({ consentId: wConsent.id });

    const pack = new BuildCoachPackUseCase({
      ...deps,
      listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
      listPlans: { execute: () => [] },
      getPlan: {
        execute: () => {
          throw new Error('not used');
        },
      },
      listAdherence: { execute: () => [] },
      listPhotos: { execute: () => [] },
    }).execute({ coachId: coach.id });

    expect(pack.reports).toHaveLength(1);
    expect(pack.reports[0]?.patientName).toContain('Autorizada');
    expect(pack.skipped).toEqual(
      expect.arrayContaining([
        { patientName: 'SinAutorizacion Márquez', reason: 'no_authorisation' },
        { patientName: 'Retirada Márquez', reason: 'consent_not_accepted' },
      ]),
    );
  });

  it('names an archived trainee in the skip list instead of dropping her from the batch', () => {
    // She is not a current trainee, so she is not in the pack — but the trainee
    // query that hides her also hid her from the skip list, and a batch that
    // omits someone in silence reads as "everyone was included". The
    // authorisation here is perfectly live; only the patient's status is not.
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Archivada');
    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: patient.id,
      coachId: coach.id,
    });
    new CreateMeasurementSessionUseCase(measurementDeps).execute({
      patientId: patient.id,
      measuredAt: '2026-08-01',
      weightKg: 70,
      heightCm: 165,
    });
    new GrantCoachShareUseCase(deps).execute({
      linkId: link.id,
      consentId: acceptTransferConsent(patient.id).id,
      scope: SCOPE,
    });
    new SetPatientStatusUseCase({
      uow: consentDeps.uow,
      patients: patientRepo,
      audit: consentDeps.audit,
      ctx,
    }).execute({ patientId: patient.id, status: 'archived' });

    const packDeps = {
      ...deps,
      listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
      listPlans: { execute: () => [] },
      getPlan: {
        execute: () => {
          throw new Error('not used');
        },
      },
      listAdherence: { execute: () => [] },
      listPhotos: { execute: () => [] },
    };
    const pack = new BuildCoachPackUseCase(packDeps).execute({ coachId: coach.id });
    expect(pack.reports).toEqual([]);
    expect(pack.skipped).toEqual([
      { patientName: 'Archivada Márquez', reason: 'patient_archived' },
    ]);

    // And the individual report still builds from her own expediente: archiving
    // a patient is an administrative status, not a withdrawal of consent.
    expect(
      new BuildCoachReportUseCase(packDeps).execute({ linkId: link.id }).patientName,
    ).toContain('Archivada');
  });
});
