import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddHistoryEntryUseCase,
  AddPatientPhotoUseCase,
  CreateConsultationUseCase,
  CreateMeasurementSessionUseCase,
  ExportPatientUseCase,
  GetPatientPhotoDataUseCase,
  ListConsentsUseCase,
  ListConsultationsUseCase,
  ListHistoryUseCase,
  ListMeasurementSessionsUseCase,
  CreateCoachUseCase,
  LinkPatientToCoachUseCase,
  ListPatientCoachLinksUseCase,
  ListPatientPhotosUseCase,
  RecordConsentUseCase,
  SignConsultationUseCase,
  type PhotoStorage,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteClinicalHistoryRepository } from './sqlite-clinical-history-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqlitePhotoRepository } from './sqlite-photo-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteCoachRepository } from './sqlite-coach-repository';
import { SqliteUnitOfWork } from '../unit-of-work';

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagen-de-progreso'),
]);

class MemoryPhotoStorage implements PhotoStorage {
  private files = new Map<string, Uint8Array>();
  save(name: string, bytes: Uint8Array): void {
    this.files.set(name, bytes);
  }
  read(name: string): Uint8Array {
    const bytes = this.files.get(name);
    if (!bytes) throw new Error(`missing ${name}`);
    return bytes;
  }
  remove(name: string): void {
    this.files.delete(name);
  }
}

/** Full-stack export test: real migrations, repositories, and use cases. */

let db: SqliteDatabase;
let patientId: string;
let exportUseCase: ExportPatientUseCase;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-07-22T12:00:00.000Z') + idCounter * 1000),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  const patients = new SqlitePatientRepository(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  const uow = new SqliteUnitOfWork(db);
  const consultations = new SqliteConsultationRepository(db);
  const history = new SqliteClinicalHistoryRepository(db);
  const consents = new SqliteConsentRepository(db);
  const consultationDeps = { uow, consultations, patients, audit, ctx };
  const historyDeps = { uow, history, patients, audit, ctx };
  const consentDeps = { uow, consents, patients, audit, ctx };

  const patient = createPatient(
    {
      fileNumber: 7,
      firstName: 'Diego',
      lastName: 'Fuentes',
      dateOfBirth: '1985-06-30',
      sexAtBirth: 'male',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;

  const created = new CreateConsultationUseCase(consultationDeps).execute({
    patientId,
    consultationDate: '2026-07-20',
    consultationType: 'initial',
    subjective: 'Primera consulta.',
  });
  new SignConsultationUseCase(consultationDeps).execute({ consultationId: created.id });
  const entry = new AddHistoryEntryUseCase(historyDeps).execute({
    patientId,
    category: 'allergy',
    content: 'Alergia a nueces',
  });
  new AddHistoryEntryUseCase(historyDeps).execute({
    patientId,
    category: 'allergy',
    content: 'Alergia a nueces y cacahuates',
    supersedesId: entry.id,
  });
  new RecordConsentUseCase(consentDeps).execute({
    patientId,
    consentType: 'data_processing',
    noticeVersion: 'AVISO-2026-07',
    decision: 'accepted',
    method: 'written',
  });
  new RecordConsentUseCase(consentDeps).execute({
    patientId,
    consentType: 'photo',
    noticeVersion: 'AVISO-2026-07',
    decision: 'accepted',
    method: 'written',
  });

  const measurementDeps = {
    uow,
    measurements: new SqliteMeasurementRepository(db),
    patients,
    consultations,
    audit,
    ctx,
  };
  new CreateMeasurementSessionUseCase(measurementDeps).execute({
    patientId,
    measuredAt: '2026-07-20',
    weightKg: 82,
    heightCm: 175,
  });
  const photoDeps = {
    uow,
    photos: new SqlitePhotoRepository(db),
    storage: new MemoryPhotoStorage(),
    patients,
    consents,
    consultations,
    audit,
    ctx,
    sha256: (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex'),
  };
  new AddPatientPhotoUseCase(photoDeps).execute({
    patientId,
    kind: 'front',
    capturedAt: '2026-07-20',
    originalFileName: 'frente.png',
    bytes: PNG_BYTES,
  });

  exportUseCase = new ExportPatientUseCase({
    patients,
    listConsultations: new ListConsultationsUseCase(consultationDeps),
    listHistory: new ListHistoryUseCase(historyDeps),
    listConsents: new ListConsentsUseCase(consentDeps),
    listMeasurements: new ListMeasurementSessionsUseCase(measurementDeps),
    listPhotos: new ListPatientPhotosUseCase(photoDeps),
    getPhotoData: new GetPatientPhotoDataUseCase(photoDeps),
    listCoachLinks: new ListPatientCoachLinksUseCase({ coaches: new SqliteCoachRepository(db) }),
    toBase64: (bytes) => Buffer.from(bytes).toString('base64'),
    audit,
    ctx,
    appVersion: '0.1.0-test',
  });
});

describe('ExportPatientUseCase', () => {
  it('produces a self-describing document with the complete clinical record', () => {
    const document = exportUseCase.execute({ patientId });
    expect(document).toMatchObject({
      format: 'ajnutrition-patient-export',
      formatVersion: 2,
      appVersion: '0.1.0-test',
      encryption: 'none',
      included: [
        'patient',
        'consultations',
        'clinicalHistory',
        'consents',
        'measurements',
        'photos',
        'coachLinks',
      ],
      excluded: ['auditEvents', 'mealPlans', 'coachContactDetails'],
    });
    expect(document.sensitivityWarning).toContain('SIN CIFRAR');
    expect(document.patient).toMatchObject({ fileNumber: 7, firstName: 'Diego' });
    expect(document.consultations).toHaveLength(1);
    expect(document.consultations[0]?.status).toBe('signed');
    // Superseded history travels too — the export is the full record.
    expect(document.clinicalHistory).toHaveLength(2);
    expect(document.consents).toHaveLength(2);
    expect(document.measurements).toHaveLength(1);
    expect(document.measurements[0]?.weightKg).toBe(82);
    // The photo is embedded — the export stands alone without the app.
    expect(document.photos).toHaveLength(1);
    expect(Buffer.from(document.photos[0]?.dataBase64 ?? '', 'base64')).toEqual(PNG_BYTES);
    // Round-trips through JSON without loss.
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it('records an audit event with counts but no clinical content', () => {
    exportUseCase.execute({ patientId });
    const row = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'patient.export'`)
      .get() as { metadata_json: string };
    expect(JSON.parse(row.metadata_json)).toEqual({
      consultations: 1,
      historyEntries: 2,
      consents: 2,
      measurements: 1,
      photos: 1,
      coachLinks: 0,
    });
    expect(row.metadata_json).not.toContain('nueces');
  });

  it('throws NOT_FOUND for an unknown patient and audits nothing', () => {
    try {
      exportUseCase.execute({ patientId: '00000000-0000-4000-8000-0000000000ff' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'patient.export'`)
      .get() as { n: number };
    expect(count.n).toBe(0);
  });
});

describe('coach links in the export', () => {
  it('includes the referral history and declares it in the manifest', () => {
    // "You recorded that I train with Carlos" is personal data about the
    // patient, so an ARCO access request has to surface it. A manifest that
    // silently omits a table is a manifest that lies.
    const coachRepo = new SqliteCoachRepository(db);
    const coachDeps = {
      uow: new SqliteUnitOfWork(db),
      coaches: coachRepo,
      patients: new SqlitePatientRepository(db),
      audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
      ctx,
    };
    const coach = new CreateCoachUseCase(coachDeps).execute({
      displayName: 'Carlos Ruiz',
      notes: 'tarifa acordada',
      phone: '5512345678',
    });
    new LinkPatientToCoachUseCase(coachDeps).execute({ patientId, coachId: coach.id });

    const document = exportUseCase.execute({ patientId });

    expect(document.included).toContain('coachLinks');
    expect(document.coachLinks).toHaveLength(1);
    expect(document.coachLinks[0]?.coachDisplayName).toBe('Carlos Ruiz');

    // The coach's own contact details and commercial notes are the coach's,
    // not the patient's, and the manifest says they are excluded.
    expect(document.excluded).toContain('coachContactDetails');
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain('tarifa acordada');
    expect(serialized).not.toContain('5512345678');
  });
});
