import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  ListConsentsUseCase,
  RecordConsentUseCase,
  WithdrawConsentUseCase,
  type ConsentDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: ConsentDeps;
let patientId: string;
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
  deps = {
    uow: new SqliteUnitOfWork(db),
    consents: new SqliteConsentRepository(db),
    patients,
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Elena',
      lastName: 'Vargas',
      dateOfBirth: '1990-03-14',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

const command = () => ({
  patientId,
  consentType: 'data_processing' as const,
  noticeVersion: 'AVISO-2026-07',
  decision: 'accepted' as const,
  method: 'written' as const,
});

describe('consent lifecycle against real SQLite', () => {
  it('records grant and withdrawal with a full audit trail', () => {
    const granted = new RecordConsentUseCase(deps).execute(command());
    expect(granted).toMatchObject({ status: 'accepted', noticeVersion: 'AVISO-2026-07' });

    const withdrawn = new WithdrawConsentUseCase(deps).execute({ consentId: granted.id });
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.withdrawnAt).not.toBeNull();

    const actions = db
      .prepare('SELECT action FROM audit_events ORDER BY occurred_at')
      .all() as Array<{ action: string }>;
    expect(actions.map((a) => a.action)).toEqual(['consent.grant', 'consent.withdraw']);
  });

  it('a withdrawn consent stays in the history — nothing is deleted', () => {
    const granted = new RecordConsentUseCase(deps).execute(command());
    new WithdrawConsentUseCase(deps).execute({ consentId: granted.id });
    new RecordConsentUseCase(deps).execute({ ...command(), noticeVersion: 'AVISO-2026-08' });

    const history = new ListConsentsUseCase({ consents: deps.consents }).execute({ patientId });
    expect(history).toHaveLength(2);
    expect(history.map((c) => c.status)).toEqual(['withdrawn', 'accepted']);
  });

  it('withdrawal is guarded at the SQL level against double-withdraw', () => {
    const granted = new RecordConsentUseCase(deps).execute(command());
    new WithdrawConsentUseCase(deps).execute({ consentId: granted.id });
    try {
      new WithdrawConsentUseCase(deps).execute({ consentId: granted.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('declined consents cannot be withdrawn', () => {
    const declined = new RecordConsentUseCase(deps).execute({
      ...command(),
      decision: 'declined',
    });
    expect(() =>
      new WithdrawConsentUseCase(deps).execute({ consentId: declined.id }),
    ).toThrowError();
  });

  it('rejects consents for a nonexistent patient', () => {
    try {
      new RecordConsentUseCase(deps).execute({
        ...command(),
        patientId: '00000000-0000-4000-8000-0000000000ff',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
  });

  it('audit contains type and notice version but never the notes', () => {
    new RecordConsentUseCase(deps).execute({
      ...command(),
      notes: 'Firmado en presencia de su esposa',
    });
    const row = db.prepare(`SELECT metadata_json FROM audit_events`).get() as {
      metadata_json: string;
    };
    expect(row.metadata_json).toContain('data_processing');
    expect(row.metadata_json).toContain('AVISO-2026-07');
    expect(row.metadata_json).not.toContain('esposa');
  });
});
