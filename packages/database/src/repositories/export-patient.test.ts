import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddHistoryEntryUseCase,
  CreateConsultationUseCase,
  ExportPatientUseCase,
  ListConsentsUseCase,
  ListConsultationsUseCase,
  ListHistoryUseCase,
  RecordConsentUseCase,
  SignConsultationUseCase,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteClinicalHistoryRepository } from './sqlite-clinical-history-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

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

  exportUseCase = new ExportPatientUseCase({
    patients,
    listConsultations: new ListConsultationsUseCase(consultationDeps),
    listHistory: new ListHistoryUseCase(historyDeps),
    listConsents: new ListConsentsUseCase(consentDeps),
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
      formatVersion: 1,
      appVersion: '0.1.0-test',
      encryption: 'none',
      included: ['patient', 'consultations', 'clinicalHistory', 'consents'],
      excluded: ['auditEvents', 'attachments'],
    });
    expect(document.sensitivityWarning).toContain('SIN CIFRAR');
    expect(document.patient).toMatchObject({ fileNumber: 7, firstName: 'Diego' });
    expect(document.consultations).toHaveLength(1);
    expect(document.consultations[0]?.status).toBe('signed');
    // Superseded history travels too — the export is the full record.
    expect(document.clinicalHistory).toHaveLength(2);
    expect(document.consents).toHaveLength(1);
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
      consents: 1,
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
