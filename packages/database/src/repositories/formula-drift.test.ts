import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  CreateMeasurementSessionUseCase,
  ListFormulaDriftUseCase,
  type MeasurementDeps,
} from '@ajnutrition/application';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: MeasurementDeps;
let patients: SqlitePatientRepository;
let patientId: string;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-29T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-d000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  patients = new SqlitePatientRepository(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    measurements: new SqliteMeasurementRepository(db),
    patients,
    consultations: new SqliteConsultationRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Héctor',
      lastName: 'Ramírez',
      dateOfBirth: '1991-07-23',
      sexAtBirth: 'male',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

describe('formula version drift', () => {
  it('reports nothing while every stored result matches the shipped version', () => {
    new CreateMeasurementSessionUseCase(deps).execute({
      patientId,
      measuredAt: '2026-07-20',
      weightKg: 80,
      heightCm: 180,
    });

    expect(new ListFormulaDriftUseCase({ ...deps }).execute()).toEqual([]);
  });

  it('reports a stored result the current engine would compute differently', () => {
    new CreateMeasurementSessionUseCase(deps).execute({
      patientId,
      measuredAt: '2026-07-20',
      weightKg: 80,
      heightCm: 180,
    });

    // Simulate a stored result that today's engine no longer reproduces —
    // what a released formula correction looks like from this side. (The
    // schema refuses version < 1, which is itself the right constraint.)
    db.prepare(`UPDATE calculated_values SET rounded_result = 99.9 WHERE formula_id = 'bmi'`).run();

    const drift = new ListFormulaDriftUseCase({ ...deps }).execute();
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      patientFileNumber: 1,
      measuredAt: '2026-07-20',
      formulaId: 'bmi',
      storedVersion: 1,
      storedResult: 99.9,
      currentVersion: 1,
      currentResult: 24.7,
    });
    // Reporting only: the stored row is untouched.
    const row = db
      .prepare(`SELECT rounded_result FROM calculated_values WHERE formula_id = 'bmi'`)
      .get() as { rounded_result: number };
    expect(row.rounded_result).toBe(99.9);
  });
});
