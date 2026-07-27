import { describe, expect, it } from 'vitest';
import type { Patient, DomainContext } from '@ajnutrition/domain';
import type { AppError } from '@ajnutrition/shared';
import type { AuditEventInput } from '../ports/audit-log';
import type { PatientRepository, PatientSearchCriteria } from '../ports/patient-repository';
import { CreatePatientUseCase } from './create-patient';
import { SetPatientStatusUseCase, UpdatePatientUseCase } from './update-patient';
import { ListPatientsUseCase } from './list-patients';
import { GetPatientUseCase } from './get-patient';

class InMemoryPatientRepository implements PatientRepository {
  readonly rows: Patient[] = [];

  insert(patient: Patient): void {
    this.rows.push(patient);
  }
  update(patient: Patient): void {
    const index = this.rows.findIndex(
      (p) => p.id === patient.id && p.version === patient.version - 1,
    );
    if (index === -1) throw new Error('CONFLICT');
    this.rows[index] = patient;
  }
  findById(id: string): Patient | null {
    return this.rows.find((p) => p.id === id) ?? null;
  }
  search(criteria: PatientSearchCriteria): Patient[] {
    const term = criteria.search?.toLowerCase() ?? '';
    return this.rows.filter(
      (p) =>
        (criteria.includeArchived || p.status !== 'archived') &&
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(term),
    );
  }
  nextFileNumber(): number {
    return this.rows.length + 1;
  }
  existsDuplicate(
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    excludeId?: string,
  ): boolean {
    return this.rows.some(
      (p) =>
        p.id !== excludeId &&
        p.status !== 'archived' &&
        p.firstName === firstName &&
        p.lastName === lastName &&
        p.dateOfBirth === dateOfBirth,
    );
  }
}

function makeHarness() {
  const patients = new InMemoryPatientRepository();
  const auditEvents: AuditEventInput[] = [];
  let idCounter = 0;
  const ctx: DomainContext = {
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    newId: () => `00000000-0000-4000-8000-00000000000${(idCounter += 1)}`,
  };
  const deps = {
    uow: { run: <T>(work: () => T) => work() },
    patients,
    audit: { record: (e: AuditEventInput) => auditEvents.push(e) },
    ctx,
  };
  const useCase = new CreatePatientUseCase(deps);
  return {
    patients,
    auditEvents,
    useCase,
    updateUseCase: new UpdatePatientUseCase(deps),
    statusUseCase: new SetPatientStatusUseCase(deps),
  };
}

const command = {
  firstName: 'Juan',
  lastName: 'Pérez',
  dateOfBirth: '1985-03-02',
  sexAtBirth: 'male' as const,
};

describe('CreatePatientUseCase', () => {
  it('persists the patient, assigns file number 1, and records a success audit event', () => {
    const { patients, auditEvents, useCase } = makeHarness();
    const dto = useCase.execute(command);
    expect(dto.fileNumber).toBe(1);
    expect(patients.rows).toHaveLength(1);
    expect(auditEvents).toEqual([
      {
        action: 'patient.create',
        entityType: 'patient',
        entityId: dto.id,
        result: 'success',
        metadata: { fileNumber: 1 },
      },
    ]);
  });

  it('rejects a duplicate (same names and birth date) with CONFLICT and stores nothing', () => {
    const { patients, useCase } = makeHarness();
    useCase.execute(command);
    try {
      useCase.execute(command);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
    expect(patients.rows).toHaveLength(1);
  });

  it('assigns sequential file numbers', () => {
    const { useCase } = makeHarness();
    const first = useCase.execute(command);
    const second = useCase.execute({ ...command, firstName: 'Ana' });
    expect([first.fileNumber, second.fileNumber]).toEqual([1, 2]);
  });
});

describe('ListPatientsUseCase', () => {
  it('filters by search term, case-insensitive', () => {
    const { patients, useCase } = makeHarness();
    useCase.execute(command);
    useCase.execute({ ...command, firstName: 'Ana', lastName: 'López' });
    const list = new ListPatientsUseCase(patients).execute({ search: 'lóp' });
    expect(list.map((p) => p.firstName)).toEqual(['Ana']);
  });
});

describe('GetPatientUseCase', () => {
  it('throws NOT_FOUND for an unknown id', () => {
    const { patients } = makeHarness();
    const getUseCase = new GetPatientUseCase(patients);
    try {
      getUseCase.execute({ patientId: '00000000-0000-4000-8000-0000000000ff' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
  });
});

describe('UpdatePatientUseCase', () => {
  it('corrects demographic data and bumps the version', () => {
    const { useCase, updateUseCase, patients } = makeHarness();
    const created = useCase.execute(command);

    const updated = updateUseCase.execute({
      patientId: created.id,
      firstName: 'Juan Carlos',
      lastName: 'Pérez',
      dateOfBirth: '1990-05-14',
      sexAtBirth: 'male',
      phone: '+52 55 1234 5678',
    });

    expect(updated.firstName).toBe('Juan Carlos');
    expect(updated.phone).toBe('+52 55 1234 5678');
    // The file number is the record's identity in the practice: never reassigned.
    expect(updated.fileNumber).toBe(created.fileNumber);
    expect(patients.rows[0]?.version).toBe(2);
  });

  it('does not treat the patient being renamed as its own duplicate', () => {
    const { useCase, updateUseCase } = makeHarness();
    const created = useCase.execute(command);
    // Same name and birth date it already has: a no-op edit of the phone.
    expect(() =>
      updateUseCase.execute({
        patientId: created.id,
        firstName: command.firstName,
        lastName: command.lastName,
        dateOfBirth: command.dateOfBirth,
        sexAtBirth: command.sexAtBirth,
        phone: '+52 55 0000 0000',
      }),
    ).not.toThrow();
  });

  it('still refuses to collide with a DIFFERENT patient', () => {
    const { useCase, updateUseCase } = makeHarness();
    useCase.execute(command);
    const second = useCase.execute({ ...command, firstName: 'Ana' });
    try {
      updateUseCase.execute({ ...command, patientId: second.id });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('audits without leaking names or contact data', () => {
    const { useCase, updateUseCase, auditEvents } = makeHarness();
    const created = useCase.execute(command);
    updateUseCase.execute({ ...command, patientId: created.id, dateOfBirth: '1991-01-01' });

    const event = auditEvents.find((e) => e.action === 'patient.update');
    expect(event?.metadata).toEqual({ fileNumber: 1, version: 2, changedDateOfBirth: true });
    expect(JSON.stringify(event)).not.toContain(command.lastName);
  });
});

describe('SetPatientStatusUseCase', () => {
  it('archives, hides from the default list, and restores intact', () => {
    const { useCase, statusUseCase, patients } = makeHarness();
    const created = useCase.execute(command);

    statusUseCase.execute({ patientId: created.id, status: 'archived' });
    expect(new ListPatientsUseCase(patients).execute({})).toHaveLength(0);
    expect(new ListPatientsUseCase(patients).execute({ includeArchived: true })).toHaveLength(1);
    // Archiving is not deletion: the row is still there, untouched but flagged.
    expect(patients.rows[0]).toMatchObject({ status: 'archived', fileNumber: 1 });

    statusUseCase.execute({ patientId: created.id, status: 'active' });
    expect(new ListPatientsUseCase(patients).execute({})).toHaveLength(1);
  });

  it('rejects archiving an already archived patient', () => {
    const { useCase, statusUseCase } = makeHarness();
    const created = useCase.execute(command);
    statusUseCase.execute({ patientId: created.id, status: 'archived' });
    try {
      statusUseCase.execute({ patientId: created.id, status: 'archived' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('VALIDATION');
    }
  });

  it('frees the duplicate guard: an archived patient no longer blocks the name', () => {
    const { useCase, statusUseCase } = makeHarness();
    const created = useCase.execute(command);
    statusUseCase.execute({ patientId: created.id, status: 'archived' });
    expect(() => useCase.execute(command)).not.toThrow();
  });
});
