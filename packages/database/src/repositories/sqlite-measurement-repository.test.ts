import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  CreateMeasurementSessionUseCase,
  ListMeasurementSessionsUseCase,
  type MeasurementDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: MeasurementDeps;
let patientId: string;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-23T12:00:00.000Z'),
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
    measurements: new SqliteMeasurementRepository(db),
    patients,
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  // Born 1991-07-23 → exactly 35 years old at the measurement date below.
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Andrés',
      lastName: 'Molina',
      dateOfBirth: '1991-07-23',
      sexAtBirth: 'male',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

const fullCommand = () => ({
  patientId,
  measuredAt: '2026-07-23',
  weightKg: 80,
  heightCm: 180,
  waistCm: 90,
  hipCm: 100,
});

describe('measurement sessions against real SQLite', () => {
  it('stores raw values and all four calculations with provenance', () => {
    const dto = new CreateMeasurementSessionUseCase(deps).execute(fullCommand());
    expect(dto).toMatchObject({ weightKg: 80, heightCm: 180, waistCm: 90, hipCm: 100 });
    expect(dto.calculated.map((c) => c.formulaId).sort()).toEqual([
      'bmi',
      'mifflin_st_jeor_ree',
      'waist_height_ratio',
      'waist_hip_ratio',
    ]);
    const bmiCalc = dto.calculated.find((c) => c.formulaId === 'bmi');
    // 80 / 1.8² = 24.69
    expect(bmiCalc).toMatchObject({ roundedResult: 24.7, formulaVersion: 1, unit: 'kg/m²' });
    // Mifflin male 35y: 10·80 + 6.25·180 − 5·35 + 5 = 1755
    const ree = dto.calculated.find((c) => c.formulaId === 'mifflin_st_jeor_ree');
    expect(ree).toMatchObject({ roundedResult: 1755, unit: 'kcal/día' });

    // Provenance frozen at the SQL level: exact inputs stored per calculation
    // (Gherkin "Preserve calculation provenance" — a future formula v2 must
    // not alter what was stored here).
    const row = db
      .prepare(
        `SELECT inputs_json, formula_version FROM calculated_values WHERE formula_id = 'bmi'`,
      )
      .get() as { inputs_json: string; formula_version: number };
    expect(JSON.parse(row.inputs_json)).toEqual({ weightKg: 80, heightCm: 180 });
    expect(row.formula_version).toBe(1);
  });

  it('rejects an impossible height and saves NOTHING (Gherkin: reject invalid height)', () => {
    try {
      new CreateMeasurementSessionUseCase(deps).execute({ ...fullCommand(), heightCm: 20 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
      expect((err as AppError).fieldErrors).toHaveProperty('height_cm');
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM measurement_sessions').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });

  it('runs only the formulas whose inputs exist (weight alone → no calculations)', () => {
    const dto = new CreateMeasurementSessionUseCase(deps).execute({
      patientId,
      measuredAt: '2026-07-23',
      weightKg: 80,
    });
    expect(dto.calculated).toHaveLength(0);
    expect(dto.weightKg).toBe(80);
    expect(dto.heightCm).toBeNull();
  });

  it('lists sessions newest-first with values and calculations rehydrated', () => {
    const useCase = new CreateMeasurementSessionUseCase(deps);
    useCase.execute({ ...fullCommand(), measuredAt: '2026-07-01' });
    useCase.execute({ ...fullCommand(), weightKg: 78.5, measuredAt: '2026-07-23' });

    const sessions = new ListMeasurementSessionsUseCase({
      measurements: deps.measurements,
    }).execute({ patientId });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.measuredAt).toBe('2026-07-23');
    expect(sessions[0]?.weightKg).toBe(78.5);
    expect(sessions[1]?.calculated.length).toBe(4);
  });

  it('audit records which metrics were captured but never the clinical values', () => {
    new CreateMeasurementSessionUseCase(deps).execute(fullCommand());
    const row = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'measurement.create'`)
      .get() as { metadata_json: string };
    // Exact-object equality: ONLY these keys exist, so no clinical value can
    // hide in the metadata. (A substring check would false-positive on the
    // '80' inside the patient UUID.)
    expect(JSON.parse(row.metadata_json)).toEqual({
      patientId,
      metrics: 'weight_kg,height_cm,waist_cm,hip_cm',
      calculations: 4,
    });
  });

  it('rejects a future measurement date', () => {
    expect(() =>
      new CreateMeasurementSessionUseCase(deps).execute({
        ...fullCommand(),
        measuredAt: '2026-07-24',
      }),
    ).toThrowError();
  });
});
