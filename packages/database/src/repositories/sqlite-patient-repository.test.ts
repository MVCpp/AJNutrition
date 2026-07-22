import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import { CreatePatientUseCase } from '@ajnutrition/application';
import { AppError } from '@ajnutrition/shared';
import { runMigrations, assertSchemaNotAhead } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

/**
 * Integration tests against a real in-memory SQLite database running the real
 * migrations — this also verifies the Drizzle schema matches migrations.ts.
 */

let db: SqliteDatabase;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-21T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

function openTestDb(): SqliteDatabase {
  return openInMemoryDatabase();
}

beforeEach(() => {
  idCounter = 0;
  db = openTestDb();
  runMigrations(db);
});

const validInput = {
  fileNumber: 1,
  firstName: 'María',
  lastName: 'García',
  dateOfBirth: '1990-05-14',
  sexAtBirth: 'female' as const,
};

describe('migrations', () => {
  it('applies all migrations exactly once (idempotent)', () => {
    const first = runMigrations(db);
    expect(first.applied).toHaveLength(0);
    expect(first.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('rejects a database from a newer application version', () => {
    db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (999, ?, ?)').run(
      'from_the_future',
      new Date().toISOString(),
    );
    expect(() => assertSchemaNotAhead(db)).toThrowError(AppError);
  });
});

describe('SqlitePatientRepository', () => {
  it('round-trips a patient through insert and findById', () => {
    const repo = new SqlitePatientRepository(db);
    const patient = createPatient(validInput, ctx);
    repo.insert(patient);
    expect(repo.findById(patient.id)).toEqual(patient);
  });

  it('enforces unique file numbers at the database level', () => {
    const repo = new SqlitePatientRepository(db);
    repo.insert(createPatient(validInput, ctx));
    expect(() => repo.insert(createPatient({ ...validInput, firstName: 'Otra' }, ctx))).toThrow();
  });

  it('escapes LIKE wildcards in search input', () => {
    const repo = new SqlitePatientRepository(db);
    repo.insert(createPatient(validInput, ctx));
    expect(repo.search({ search: '%' })).toHaveLength(0);
    expect(repo.search({ search: 'garcía' })).toHaveLength(1);
  });

  it('excludes archived patients unless requested', () => {
    const repo = new SqlitePatientRepository(db);
    const patient = createPatient(validInput, ctx);
    repo.insert(patient);
    db.prepare(`UPDATE patients SET status = 'archived' WHERE id = ?`).run(patient.id);
    expect(repo.search({})).toHaveLength(0);
    expect(repo.search({ includeArchived: true })).toHaveLength(1);
  });

  it('detects duplicates case-insensitively', () => {
    const repo = new SqlitePatientRepository(db);
    repo.insert(createPatient(validInput, ctx));
    expect(repo.existsDuplicate('maría', 'GARCÍA', '1990-05-14')).toBe(true);
    expect(repo.existsDuplicate('maría', 'GARCÍA', '1991-01-01')).toBe(false);
  });
});

describe('CreatePatientUseCase against real SQLite', () => {
  function makeUseCase() {
    return new CreatePatientUseCase({
      uow: new SqliteUnitOfWork(db),
      patients: new SqlitePatientRepository(db),
      audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
      ctx,
    });
  }

  const command = {
    firstName: 'Juan',
    lastName: 'Pérez',
    dateOfBirth: '1985-03-02',
    sexAtBirth: 'male' as const,
  };

  it('commits patient and audit event together', () => {
    const dto = makeUseCase().execute(command);
    const patientCount = db.prepare('SELECT COUNT(*) AS n FROM patients').get() as { n: number };
    const auditRows = db
      .prepare('SELECT action, entity_id, result FROM audit_events')
      .all() as Array<{ action: string; entity_id: string; result: string }>;
    expect(patientCount.n).toBe(1);
    expect(auditRows).toEqual([{ action: 'patient.create', entity_id: dto.id, result: 'success' }]);
  });

  it('rolls back everything when the duplicate guard fires', () => {
    const useCase = makeUseCase();
    useCase.execute(command);
    expect(() => useCase.execute(command)).toThrowError(AppError);
    const patientCount = db.prepare('SELECT COUNT(*) AS n FROM patients').get() as { n: number };
    const auditCount = db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number };
    expect(patientCount.n).toBe(1);
    expect(auditCount.n).toBe(1);
  });

  it('never writes clinical or contact detail into audit metadata', () => {
    makeUseCase().execute({ ...command, email: 'privado@example.com', phone: '+52 55 1234 5678' });
    const row = db.prepare('SELECT metadata_json FROM audit_events').get() as {
      metadata_json: string | null;
    };
    expect(row.metadata_json ?? '').not.toContain('privado');
    expect(row.metadata_json ?? '').not.toContain('5678');
  });
});
