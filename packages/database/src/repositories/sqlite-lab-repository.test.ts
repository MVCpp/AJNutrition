import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  ListLabResultsUseCase,
  RecordLabResultsUseCase,
  type LabDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteLabRepository } from './sqlite-lab-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: LabDeps;
let patientId: string;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-24T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-b000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  const patients = new SqlitePatientRepository(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    labs: new SqliteLabRepository(db),
    patients,
    consultations: new SqliteConsultationRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Rosa',
      lastName: 'Camacho',
      dateOfBirth: '1988-02-02',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

describe('lab results against real SQLite', () => {
  it('records a batch and flags out-of-range values against the report reference', () => {
    const recorded = new RecordLabResultsUseCase(deps).execute({
      patientId,
      collectedAt: '2026-07-20',
      entries: [
        { analyte: 'Glucosa', value: 112, unit: 'mg/dL', referenceLow: 70, referenceHigh: 99 },
        { analyte: 'HDL', value: 55, unit: 'mg/dL', referenceLow: 40 },
        { analyte: 'TSH', value: 2.1, unit: 'µUI/mL' },
      ],
    });
    expect(recorded).toHaveLength(3);
    expect(recorded.find((e) => e.analyte === 'Glucosa')?.outOfRange).toBe(true);
    expect(recorded.find((e) => e.analyte === 'HDL')?.outOfRange).toBe(false);
    // Without a reference range nothing is ever flagged.
    expect(recorded.find((e) => e.analyte === 'TSH')?.outOfRange).toBe(false);

    const listed = new ListLabResultsUseCase({ labs: deps.labs }).execute({ patientId });
    expect(listed).toHaveLength(3);

    // Audit carries analyte names, never values.
    const audit = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'lab.record'`)
      .get() as { metadata_json: string };
    expect(audit.metadata_json).toContain('Glucosa');
    expect(audit.metadata_json).not.toContain('112');
  });

  it('rejects future collection dates and foreign consultations', () => {
    expect(() =>
      new RecordLabResultsUseCase(deps).execute({
        patientId,
        collectedAt: '2027-01-01',
        entries: [{ analyte: 'Glucosa', value: 90, unit: 'mg/dL' }],
      }),
    ).toThrowError();
    try {
      new RecordLabResultsUseCase(deps).execute({
        patientId,
        collectedAt: '2026-07-20',
        consultationId: '00000000-0000-4000-b000-0000000000ff',
        entries: [{ analyte: 'Glucosa', value: 90, unit: 'mg/dL' }],
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });
});
