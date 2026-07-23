import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DomainContext } from '@ajnutrition/domain';
import {
  AddHistoryEntryUseCase,
  AddPatientPhotoUseCase,
  DeletePatientPhotoUseCase,
  ExportPatientUseCase,
  GetPatientPhotoDataUseCase,
  ListPatientPhotosUseCase,
  ListConsentsUseCase,
  RecordConsentUseCase,
  WithdrawConsentUseCase,
  AmendConsultationUseCase,
  CreateConsultationUseCase,
  CreatePatientUseCase,
  GetPatientUseCase,
  ListConsultationsUseCase,
  ListHistoryUseCase,
  ListPatientsUseCase,
  SignConsultationUseCase,
  type AuditLog,
  type ClinicalHistoryDeps,
  type ConsentDeps,
  type ConsultationDeps,
  type PhotoDeps,
} from '@ajnutrition/application';
import {
  assertSchemaNotAhead,
  checkIntegrity,
  openDatabase,
  runMigrations,
  SqliteAuditLog,
  SqliteClinicalHistoryRepository,
  SqliteConsentRepository,
  SqliteConsultationRepository,
  SqlitePhotoRepository,
  SqlitePatientRepository,
  SqliteUnitOfWork,
  type SqliteDatabase,
} from '@ajnutrition/database';
import { AppError } from '@ajnutrition/shared';
import { EncryptedPhotoStorage } from './encrypted-photo-storage';

export interface AppContainer {
  db: SqliteDatabase;
  audit: AuditLog;
  useCases: {
    createPatient: CreatePatientUseCase;
    listPatients: ListPatientsUseCase;
    getPatient: GetPatientUseCase;
    createConsultation: CreateConsultationUseCase;
    listConsultations: ListConsultationsUseCase;
    signConsultation: SignConsultationUseCase;
    amendConsultation: AmendConsultationUseCase;
    addHistoryEntry: AddHistoryEntryUseCase;
    listHistory: ListHistoryUseCase;
    recordConsent: RecordConsentUseCase;
    withdrawConsent: WithdrawConsentUseCase;
    listConsents: ListConsentsUseCase;
    exportPatient: ExportPatientUseCase;
    addPhoto: AddPatientPhotoUseCase;
    listPhotos: ListPatientPhotosUseCase;
    getPhotoData: GetPatientPhotoDataUseCase;
    deletePhoto: DeletePatientPhotoUseCase;
  };
}

/**
 * Composition root. Runs at every unlock in the main process:
 * opens the encrypted database, refuses downgrade scenarios, verifies
 * integrity, applies pending migrations, wires repositories and use cases.
 * The AuthManager owns its lifecycle (created on unlock, closed on lock).
 */
export function createContainer(
  userDataPath: string,
  appVersion: string,
  dbKeyHex: string,
  attachmentKey: Buffer,
): AppContainer {
  const dataDir = path.join(userDataPath, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(path.join(dataDir, 'ajnutrition.db3'), dbKeyHex);

  const integrity = checkIntegrity(db);
  if (!integrity.ok) {
    throw new AppError({
      code: 'INTEGRITY',
      message:
        'La base de datos local está dañada. Restaure una copia de seguridad antes de continuar.',
      internalDetail: integrity.detail,
    });
  }

  assertSchemaNotAhead(db);
  runMigrations(db);

  const ctx: DomainContext = {
    now: () => new Date(),
    newId: () => randomUUID(),
  };

  const patients = new SqlitePatientRepository(db);
  const consultations = new SqliteConsultationRepository(db);
  const audit = new SqliteAuditLog(db, { appVersion, now: ctx.now, newId: ctx.newId });
  const uow = new SqliteUnitOfWork(db);
  const consultationDeps: ConsultationDeps = { uow, consultations, patients, audit, ctx };
  const history = new SqliteClinicalHistoryRepository(db);
  const historyDeps: ClinicalHistoryDeps = { uow, history, patients, audit, ctx };
  const consents = new SqliteConsentRepository(db);
  const consentDeps: ConsentDeps = { uow, consents, patients, audit, ctx };
  const listConsultations = new ListConsultationsUseCase(consultationDeps);
  const listHistory = new ListHistoryUseCase(historyDeps);
  const listConsents = new ListConsentsUseCase(consentDeps);
  const photoStorage = new EncryptedPhotoStorage(
    path.join(userDataPath, 'attachments'),
    attachmentKey,
  );
  const photoDeps: PhotoDeps = {
    uow,
    photos: new SqlitePhotoRepository(db),
    storage: photoStorage,
    patients,
    consents,
    audit,
    ctx,
    sha256: (bytes) => createHash('sha256').update(bytes).digest('hex'),
  };

  return {
    db,
    audit,
    useCases: {
      createPatient: new CreatePatientUseCase({ uow, patients, audit, ctx }),
      listPatients: new ListPatientsUseCase(patients),
      getPatient: new GetPatientUseCase(patients),
      createConsultation: new CreateConsultationUseCase(consultationDeps),
      listConsultations,
      signConsultation: new SignConsultationUseCase(consultationDeps),
      amendConsultation: new AmendConsultationUseCase(consultationDeps),
      addHistoryEntry: new AddHistoryEntryUseCase(historyDeps),
      listHistory,
      recordConsent: new RecordConsentUseCase(consentDeps),
      withdrawConsent: new WithdrawConsentUseCase(consentDeps),
      listConsents,
      exportPatient: new ExportPatientUseCase({
        patients,
        listConsultations,
        listHistory,
        listConsents,
        audit,
        ctx,
        appVersion,
      }),
      addPhoto: new AddPatientPhotoUseCase(photoDeps),
      listPhotos: new ListPatientPhotosUseCase(photoDeps),
      getPhotoData: new GetPatientPhotoDataUseCase(photoDeps),
      deletePhoto: new DeletePatientPhotoUseCase(photoDeps),
    },
  };
}
