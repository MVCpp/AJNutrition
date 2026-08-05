import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext, type Patient } from '@ajnutrition/domain';
import {
  CreateCoachUseCase,
  GetCoachUseCase,
  GetPatientCoachUseCase,
  LinkPatientToCoachUseCase,
  ListCoachesUseCase,
  ListPatientsUseCase,
  RevokeCoachLinkUseCase,
  SetCoachStatusUseCase,
  UpdateCoachUseCase,
  type CoachDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteCoachRepository } from './sqlite-coach-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: CoachDeps;
let patientRepo: SqlitePatientRepository;
let coachRepo: SqliteCoachRepository;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date(Date.parse('2026-08-05T12:00:00.000Z') + idCounter * 1000),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  },
};

function addPatient(fileNumber: number, firstName: string, lastName: string): Patient {
  const patient = createPatient(
    { fileNumber, firstName, lastName, dateOfBirth: '1990-05-14', sexAtBirth: 'female' },
    ctx,
  );
  patientRepo.insert(patient);
  return patient;
}

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  patientRepo = new SqlitePatientRepository(db);
  coachRepo = new SqliteCoachRepository(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    coaches: coachRepo,
    patients: patientRepo,
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
});

describe('coaches', () => {
  it('creates, lists and updates a coach', () => {
    const created = new CreateCoachUseCase(deps).execute({
      displayName: 'Carlos Ruiz',
      organization: 'Gimnasio Norte',
    });
    expect(created.activeTraineeCount).toBe(0);

    const listed = new ListCoachesUseCase({ coaches: coachRepo }).execute({});
    expect(listed).toHaveLength(1);

    const updated = new UpdateCoachUseCase(deps).execute({
      coachId: created.id,
      displayName: 'Carlos Ruiz Mena',
    });
    expect(updated.displayName).toBe('Carlos Ruiz Mena');
    expect(updated.organization).toBeNull();
  });

  it('refuses a duplicate name among active coaches, but allows reusing an archived one', () => {
    const create = new CreateCoachUseCase(deps);
    const first = create.execute({ displayName: 'Carlos Ruiz' });
    expect(() => create.execute({ displayName: 'carlos ruiz' })).toThrow();

    new SetCoachStatusUseCase(deps).execute({ coachId: first.id, status: 'archived' });
    expect(() => create.execute({ displayName: 'Carlos Ruiz' })).not.toThrow();
  });

  it('hides archived coaches from the list unless asked for', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    new SetCoachStatusUseCase(deps).execute({ coachId: coach.id, status: 'archived' });
    const list = new ListCoachesUseCase({ coaches: coachRepo });
    expect(list.execute({})).toHaveLength(0);
    expect(list.execute({ includeArchived: true })).toHaveLength(1);
  });

  it('searches by name and by organization', () => {
    const create = new CreateCoachUseCase(deps);
    create.execute({ displayName: 'Carlos Ruiz', organization: 'Gimnasio Norte' });
    create.execute({ displayName: 'Ana Pérez', organization: 'Studio Sur' });
    const list = new ListCoachesUseCase({ coaches: coachRepo });
    expect(list.execute({ search: 'carlos' })).toHaveLength(1);
    expect(list.execute({ search: 'norte' })).toHaveLength(1);
    expect(list.execute({ search: 'zzz' })).toHaveLength(0);
  });
});

describe('patient–coach links', () => {
  it('links a patient, counts them, and lists them as trainees', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Elena', 'Márquez');

    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: patient.id,
      coachId: coach.id,
    });
    expect(link.coachDisplayName).toBe('Carlos');
    expect(link.revokedAt).toBeNull();

    const detail = new GetCoachUseCase({ coaches: coachRepo, patients: patientRepo }).execute({
      coachId: coach.id,
    });
    expect(detail.coach.activeTraineeCount).toBe(1);
    expect(detail.trainees).toHaveLength(1);
    expect(detail.trainees[0]?.patient.firstName).toBe('Elena');
  });

  it('the trainee list carries identity only — no clinical data', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    new LinkPatientToCoachUseCase(deps).execute({ patientId: patient.id, coachId: coach.id });

    const detail = new GetCoachUseCase({ coaches: coachRepo, patients: patientRepo }).execute({
      coachId: coach.id,
    });
    // Knowing who someone's trainer is never implies permission to show that
    // trainer anything. Nothing measured, planned or diagnosed may appear here.
    const serialized = JSON.stringify(detail);
    for (const forbidden of ['measurement', 'weight', 'plan', 'consultation', 'diagnos', 'lab']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('refuses a second active trainer for the same patient', () => {
    const create = new CreateCoachUseCase(deps);
    const first = create.execute({ displayName: 'Carlos' });
    const second = create.execute({ displayName: 'Ana' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    const link = new LinkPatientToCoachUseCase(deps);

    link.execute({ patientId: patient.id, coachId: first.id });
    try {
      link.execute({ patientId: patient.id, coachId: second.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('allows a new trainer once the previous link is revoked, keeping the old row', () => {
    const create = new CreateCoachUseCase(deps);
    const first = create.execute({ displayName: 'Carlos' });
    const second = create.execute({ displayName: 'Ana' });
    const patient = addPatient(1, 'Elena', 'Márquez');

    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: patient.id,
      coachId: first.id,
    });
    new RevokeCoachLinkUseCase(deps).execute({ linkId: link.id, reason: 'cambió de gimnasio' });
    new LinkPatientToCoachUseCase(deps).execute({ patientId: patient.id, coachId: second.id });

    // Both rows survive: the referral history stays answerable.
    expect(coachRepo.listLinksForPatient(patient.id)).toHaveLength(2);
    const current = new GetPatientCoachUseCase({ coaches: coachRepo }).execute({
      patientId: patient.id,
    });
    expect(current?.coachDisplayName).toBe('Ana');
  });

  it('refuses to revoke the same link twice', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: patient.id,
      coachId: coach.id,
    });
    const revoke = new RevokeCoachLinkUseCase(deps);
    revoke.execute({ linkId: link.id });
    expect(() => revoke.execute({ linkId: link.id })).toThrow();
  });

  it('refuses to link to an archived coach', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    new SetCoachStatusUseCase(deps).execute({ coachId: coach.id, status: 'archived' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    expect(() =>
      new LinkPatientToCoachUseCase(deps).execute({ patientId: patient.id, coachId: coach.id }),
    ).toThrow();
  });

  it('archiving a coach leaves existing links exactly as they were', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    new LinkPatientToCoachUseCase(deps).execute({ patientId: patient.id, coachId: coach.id });

    new SetCoachStatusUseCase(deps).execute({ coachId: coach.id, status: 'archived' });

    const still = new GetPatientCoachUseCase({ coaches: coachRepo }).execute({
      patientId: patient.id,
    });
    expect(still?.coachId).toBe(coach.id);
    expect(still?.coachStatus).toBe('archived');
    expect(still?.revokedAt).toBeNull();
  });

  it('reports no trainer for an unlinked patient', () => {
    const patient = addPatient(1, 'Elena', 'Márquez');
    expect(
      new GetPatientCoachUseCase({ coaches: coachRepo }).execute({ patientId: patient.id }),
    ).toBeNull();
  });

  it('refuses to link a patient or coach that does not exist', () => {
    const coach = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const patient = addPatient(1, 'Elena', 'Márquez');
    const link = new LinkPatientToCoachUseCase(deps);
    const missing = '00000000-0000-4000-8000-0000000000ff';
    expect(() => link.execute({ patientId: missing, coachId: coach.id })).toThrow();
    expect(() => link.execute({ patientId: patient.id, coachId: missing })).toThrow();
  });
});

describe('filtering patients by coach', () => {
  it('returns only the coach’s current trainees', () => {
    const create = new CreateCoachUseCase(deps);
    const carlos = create.execute({ displayName: 'Carlos' });
    const ana = create.execute({ displayName: 'Ana' });
    const elena = addPatient(1, 'Elena', 'Márquez');
    const bruno = addPatient(2, 'Bruno', 'Salas');
    addPatient(3, 'Direct', 'Patient');

    const link = new LinkPatientToCoachUseCase(deps);
    link.execute({ patientId: elena.id, coachId: carlos.id });
    link.execute({ patientId: bruno.id, coachId: ana.id });

    const listPatients = new ListPatientsUseCase(patientRepo);
    expect(listPatients.execute({}).length).toBe(3);
    const carlosTrainees = listPatients.execute({ coachId: carlos.id });
    expect(carlosTrainees).toHaveLength(1);
    expect(carlosTrainees[0]?.firstName).toBe('Elena');
  });

  it('drops a patient from the old coach’s filter after a revoke', () => {
    const carlos = new CreateCoachUseCase(deps).execute({ displayName: 'Carlos' });
    const elena = addPatient(1, 'Elena', 'Márquez');
    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: elena.id,
      coachId: carlos.id,
    });

    const listPatients = new ListPatientsUseCase(patientRepo);
    expect(listPatients.execute({ coachId: carlos.id })).toHaveLength(1);
    new RevokeCoachLinkUseCase(deps).execute({ linkId: link.id });
    expect(listPatients.execute({ coachId: carlos.id })).toHaveLength(0);
  });
});

describe('audit', () => {
  it('records ids and counts, never the coach’s free text', () => {
    const coach = new CreateCoachUseCase(deps).execute({
      displayName: 'Carlos',
      notes: 'comisión acordada por sesión',
    });
    const patient = addPatient(1, 'Elena', 'Márquez');
    const link = new LinkPatientToCoachUseCase(deps).execute({
      patientId: patient.id,
      coachId: coach.id,
    });
    new RevokeCoachLinkUseCase(deps).execute({ linkId: link.id, reason: 'dejó el gimnasio' });

    const rows = db
      .prepare('SELECT action, entity_type, metadata_json FROM audit_events ORDER BY occurred_at')
      .all() as Array<{ action: string; entity_type: string; metadata_json: string | null }>;
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('coach.create');
    expect(actions).toContain('coach.link');
    expect(actions).toContain('coach.unlink');

    const metadata = rows.map((r) => r.metadata_json ?? '').join(' ');
    // Notes and revoke reasons are free text she typed. They live on the row;
    // the audit log must never become a place free text accumulates.
    expect(metadata).not.toContain('comisión');
    expect(metadata).not.toContain('gimnasio');
    expect(metadata).not.toContain('Elena');
    expect(metadata).not.toContain('Carlos');
  });
});
