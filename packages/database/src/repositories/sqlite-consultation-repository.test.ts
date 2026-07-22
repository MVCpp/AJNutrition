import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AmendConsultationUseCase,
  CreateConsultationUseCase,
  ListConsultationsUseCase,
  SignConsultationUseCase,
  type ConsultationDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: ConsultationDeps;
let patientId: string;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-22T12:00:00.000Z'),
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
  deps = {
    uow: new SqliteUnitOfWork(db),
    consultations: new SqliteConsultationRepository(db),
    patients,
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Laura',
      lastName: 'Mendoza',
      dateOfBirth: '1992-04-05',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

const command = () => ({
  patientId,
  consultationDate: '2026-07-20',
  consultationType: 'initial' as const,
  subjective: 'Motivo de consulta: control de peso.',
  plan: 'Plan alimentario inicial.',
});

describe('consultation lifecycle against real SQLite', () => {
  it('creates, lists, signs, and amends with a full audit trail', () => {
    const created = new CreateConsultationUseCase(deps).execute(command());
    expect(created.status).toBe('draft');

    const signed = new SignConsultationUseCase(deps).execute({ consultationId: created.id });
    expect(signed).toMatchObject({ status: 'signed', signedAt: '2026-07-22T12:00:00.000Z' });

    const amended = new AmendConsultationUseCase(deps).execute({
      consultationId: created.id,
      reason: 'Dato omitido',
      content: 'También refiere insomnio ocasional.',
    });
    expect(amended.amendments).toHaveLength(1);

    const listed = new ListConsultationsUseCase({ consultations: deps.consultations }).execute({
      patientId,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.amendments[0]?.reason).toBe('Dato omitido');

    const auditActions = db
      .prepare('SELECT action FROM audit_events ORDER BY occurred_at, action')
      .all() as Array<{ action: string }>;
    expect(auditActions.map((a) => a.action)).toEqual([
      'consultation.amend',
      'consultation.create',
      'consultation.sign',
    ]);
  });

  it('a signed consultation keeps its original text after amendment (immutability)', () => {
    const created = new CreateConsultationUseCase(deps).execute(command());
    new SignConsultationUseCase(deps).execute({ consultationId: created.id });
    new AmendConsultationUseCase(deps).execute({
      consultationId: created.id,
      reason: 'Corrección',
      content: 'Peso registrado era 81.5 kg, no 82 kg.',
    });
    const row = db
      .prepare('SELECT subjective, plan, status FROM consultations WHERE id = ?')
      .get(created.id) as { subjective: string; plan: string; status: string };
    expect(row).toEqual({
      subjective: 'Motivo de consulta: control de peso.',
      plan: 'Plan alimentario inicial.',
      status: 'signed',
    });
  });

  it('rejects consultations for a nonexistent patient and stores nothing', () => {
    try {
      new CreateConsultationUseCase(deps).execute({
        ...command(),
        patientId: '00000000-0000-4000-8000-0000000000ff',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM consultations').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('signing twice yields CONFLICT', () => {
    const created = new CreateConsultationUseCase(deps).execute(command());
    new SignConsultationUseCase(deps).execute({ consultationId: created.id });
    try {
      new SignConsultationUseCase(deps).execute({ consultationId: created.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('amending a draft yields CONFLICT and stores no amendment', () => {
    const created = new CreateConsultationUseCase(deps).execute(command());
    expect(() =>
      new AmendConsultationUseCase(deps).execute({
        consultationId: created.id,
        reason: 'Motivo',
        content: 'Contenido',
      }),
    ).toThrowError();
    const count = db.prepare('SELECT COUNT(*) AS n FROM consultation_amendments').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  it('optimistic update detects stale versions at the SQL level', () => {
    const created = new CreateConsultationUseCase(deps).execute(command());
    const loaded = deps.consultations.findById(created.id);
    expect(loaded).not.toBeNull();
    if (loaded === null) throw new Error('unreachable');
    // Simulate two writers deriving from the same version.
    const first = {
      ...loaded,
      status: 'signed' as const,
      signedAt: ctx.now().toISOString(),
      version: loaded.version + 1,
    };
    deps.consultations.update(first);
    expect(() => deps.consultations.update(first)).toThrowError();
  });

  it('database FK refuses amendments for unknown consultations', () => {
    expect(() =>
      deps.consultations.insertAmendment({
        id: ctx.newId(),
        consultationId: '00000000-0000-4000-8000-0000000000ee',
        reason: 'motivo',
        content: 'contenido',
        createdAt: ctx.now().toISOString(),
      }),
    ).toThrowError();
  });
});
