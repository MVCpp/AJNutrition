import { describe, expect, it } from 'vitest';
import type { Patient, DomainContext } from '@ajnutrition/domain';
import type { AppError } from '@ajnutrition/shared';
import type { AuditEventInput } from '../ports/audit-log';
import type { PatientRepository, PatientSearchCriteria } from '../ports/patient-repository';
import { CreatePatientUseCase } from './create-patient';
import { ListPatientsUseCase } from './list-patients';
import { GetPatientUseCase } from './get-patient';

class InMemoryPatientRepository implements PatientRepository {
  readonly rows: Patient[] = [];

  insert(patient: Patient): void {
    this.rows.push(patient);
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
  existsDuplicate(firstName: string, lastName: string, dateOfBirth: string): boolean {
    return this.rows.some(
      (p) =>
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
  const useCase = new CreatePatientUseCase({
    uow: { run: (work) => work() },
    patients,
    audit: { record: (e) => auditEvents.push(e) },
    ctx,
  });
  return { patients, auditEvents, useCase };
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
