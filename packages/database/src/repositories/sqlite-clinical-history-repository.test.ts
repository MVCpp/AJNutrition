import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  AddHistoryEntryUseCase,
  ListHistoryUseCase,
  type ClinicalHistoryDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteClinicalHistoryRepository } from './sqlite-clinical-history-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: ClinicalHistoryDeps;
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
    history: new SqliteClinicalHistoryRepository(db),
    patients,
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Sofía',
      lastName: 'Reyes',
      dateOfBirth: '1988-09-12',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

describe('clinical history lifecycle against real SQLite', () => {
  it('adds entries and lists only live ones by default', () => {
    const useCase = new AddHistoryEntryUseCase(deps);
    useCase.execute({ patientId, category: 'allergy', content: 'Alergia a mariscos' });
    useCase.execute({ patientId, category: 'medication', content: 'Metformina 850 mg' });

    const live = new ListHistoryUseCase({ history: deps.history }).execute({ patientId });
    expect(live).toHaveLength(2);
    expect(live.every((e) => e.supersededAt === null)).toBe(true);
  });

  it('superseding preserves the old entry as history and links the chain', () => {
    const useCase = new AddHistoryEntryUseCase(deps);
    const first = useCase.execute({
      patientId,
      category: 'medication',
      content: 'Metformina 850 mg',
    });
    const second = useCase.execute({
      patientId,
      category: 'medication',
      content: 'Metformina 850 mg + losartán 50 mg',
      supersedesId: first.id,
    });

    const live = new ListHistoryUseCase({ history: deps.history }).execute({ patientId });
    expect(live).toHaveLength(1);
    expect(live[0]?.content).toBe('Metformina 850 mg + losartán 50 mg');

    const all = new ListHistoryUseCase({ history: deps.history }).execute({
      patientId,
      includeSuperseded: true,
    });
    expect(all).toHaveLength(2);
    const old = all.find((e) => e.id === first.id);
    expect(old).toMatchObject({
      content: 'Metformina 850 mg',
      supersededById: second.id,
      supersededAt: '2026-07-22T12:00:00.000Z',
    });
  });

  it('refuses to supersede the same entry twice (no lost history)', () => {
    const useCase = new AddHistoryEntryUseCase(deps);
    const first = useCase.execute({ patientId, category: 'allergy', content: 'Polen' });
    useCase.execute({
      patientId,
      category: 'allergy',
      content: 'Polen y ácaros',
      supersedesId: first.id,
    });
    try {
      useCase.execute({
        patientId,
        category: 'allergy',
        content: 'Otra versión',
        supersedesId: first.id,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
    // The failed attempt rolled back completely: no orphan third entry.
    const all = new ListHistoryUseCase({ history: deps.history }).execute({
      patientId,
      includeSuperseded: true,
    });
    expect(all).toHaveLength(2);
  });

  it('refuses cross-category supersede', () => {
    const useCase = new AddHistoryEntryUseCase(deps);
    const first = useCase.execute({ patientId, category: 'allergy', content: 'Polen' });
    expect(() =>
      useCase.execute({
        patientId,
        category: 'medication',
        content: 'Nada que ver',
        supersedesId: first.id,
      }),
    ).toThrowError();
  });

  it('audit records category but never clinical content', () => {
    new AddHistoryEntryUseCase(deps).execute({
      patientId,
      category: 'pathological',
      content: 'Diabetes tipo 2 diagnosticada en 2019',
    });
    const row = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'clinical-history.add'`)
      .get() as { metadata_json: string };
    expect(row.metadata_json).toContain('pathological');
    expect(row.metadata_json).not.toContain('Diabetes');
  });
});
