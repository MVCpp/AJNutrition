import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddPatientPhotoUseCase,
  DeletePatientPhotoUseCase,
  GetPatientPhotoDataUseCase,
  ListPatientPhotosUseCase,
  RecordConsentUseCase,
  WithdrawConsentUseCase,
  type PhotoDeps,
  type PhotoStorage,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqlitePhotoRepository } from './sqlite-photo-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

/** In-memory fake for the encrypted storage port (real adapter lives in main). */
class FakePhotoStorage implements PhotoStorage {
  readonly files = new Map<string, Uint8Array>();
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

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let db: SqliteDatabase;
let deps: PhotoDeps;
let storage: FakePhotoStorage;
let patientId: string;
let recordConsent: RecordConsentUseCase;
let withdrawConsent: WithdrawConsentUseCase;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-07-23T12:00:00.000Z') + idCounter * 1000),
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
  const consents = new SqliteConsentRepository(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  const uow = new SqliteUnitOfWork(db);
  storage = new FakePhotoStorage();
  deps = {
    uow,
    photos: new SqlitePhotoRepository(db),
    storage,
    patients,
    consents,
    audit,
    ctx,
    sha256: (bytes) => `hash-${bytes.length}`.padEnd(64, '0'),
  };
  recordConsent = new RecordConsentUseCase({ uow, consents, patients, audit, ctx });
  withdrawConsent = new WithdrawConsentUseCase({ uow, consents, patients, audit, ctx });

  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Rocío',
      lastName: 'Salazar',
      dateOfBirth: '1993-11-02',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

function grantPhotoConsent() {
  return recordConsent.execute({
    patientId,
    consentType: 'photo',
    noticeVersion: 'AVISO-2026-07',
    decision: 'accepted',
    method: 'written',
  });
}

const addInput = () => ({
  patientId,
  kind: 'front' as const,
  capturedAt: '2026-07-23',
  originalFileName: 'rocio-frente.jpg',
  bytes: JPEG,
});

describe('patient photos lifecycle against real SQLite', () => {
  it('refuses to add a photo without an active photo consent', () => {
    try {
      new AddPatientPhotoUseCase(deps).execute(addInput());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
    expect(storage.files.size).toBe(0);
  });

  it('refuses when the photo consent was withdrawn', () => {
    const consent = grantPhotoConsent();
    withdrawConsent.execute({ consentId: consent.id });
    expect(() => new AddPatientPhotoUseCase(deps).execute(addInput())).toThrowError();
  });

  it('adds, lists, reads, and deletes a photo with consent — fully audited', () => {
    grantPhotoConsent();
    const photo = new AddPatientPhotoUseCase(deps).execute(addInput());
    expect(photo).toMatchObject({ kind: 'front', mimeType: 'image/jpeg' });

    const listed = new ListPatientPhotosUseCase({ photos: deps.photos }).execute({ patientId });
    expect(listed).toHaveLength(1);

    const data = new GetPatientPhotoDataUseCase({
      photos: deps.photos,
      storage: deps.storage,
    }).execute({ photoId: photo.id });
    expect(Buffer.from(data.bytes).equals(Buffer.from(JPEG))).toBe(true);

    new DeletePatientPhotoUseCase(deps).execute({ photoId: photo.id });
    expect(
      new ListPatientPhotosUseCase({ photos: deps.photos }).execute({ patientId }),
    ).toHaveLength(0);
    expect(storage.files.size).toBe(0);

    const actions = db
      .prepare(`SELECT action FROM audit_events WHERE entity_type = 'photo' ORDER BY occurred_at`)
      .all() as Array<{ action: string }>;
    expect(actions.map((a) => a.action)).toEqual(['photo.add', 'photo.delete']);
  });

  it('audit never contains the original file name (may contain the patient name)', () => {
    grantPhotoConsent();
    new AddPatientPhotoUseCase(deps).execute(addInput());
    const rows = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'photo.add'`)
      .all() as Array<{ metadata_json: string }>;
    expect(rows[0]?.metadata_json).not.toContain('rocio');
  });

  it('cleans up stored bytes when the metadata insert fails (no orphan trap)', () => {
    grantPhotoConsent();
    const useCase = new AddPatientPhotoUseCase(deps);
    useCase.execute(addInput());
    // Same generated ids replayed would violate PK... instead: drop the table
    // to force the insert to fail after bytes were saved.
    db.exec('DROP TABLE patient_photos');
    expect(() => useCase.execute(addInput())).toThrowError();
    // Only the first photo's bytes remain — the failed attempt was cleaned up.
    expect(storage.files.size).toBe(1);
  });

  it('rejects a renamed executable at the domain gate', () => {
    grantPhotoConsent();
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    try {
      new AddPatientPhotoUseCase(deps).execute({ ...addInput(), bytes: exe });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
    expect(storage.files.size).toBe(0);
  });
});
