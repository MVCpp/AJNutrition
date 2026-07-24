import { beforeEach, describe, expect, it } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  CreateAppointmentUseCase,
  CreateConsultationUseCase,
  ListAgendaUseCase,
  RescheduleAppointmentUseCase,
  ResolveAppointmentUseCase,
  type AppointmentDeps,
} from '@ajnutrition/application';
import type { AppError } from '@ajnutrition/shared';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteAppointmentRepository } from './sqlite-appointment-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: AppointmentDeps;
let patientId: string;
let idCounter = 0;

const ctx: DomainContext = {
  now: () => new Date('2026-07-24T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-a000-${String(idCounter).padStart(12, '0')}`;
  },
};

beforeEach(() => {
  idCounter = 0;
  db = openInMemoryDatabase();
  runMigrations(db);
  const patients = new SqlitePatientRepository(db);
  deps = {
    uow: new SqliteUnitOfWork(db),
    appointments: new SqliteAppointmentRepository(db),
    patients,
    consultations: new SqliteConsultationRepository(db),
    audit: new SqliteAuditLog(db, { appVersion: '0.1.0-test', now: ctx.now, newId: ctx.newId }),
    ctx,
  };
  const patient = createPatient(
    {
      fileNumber: 1,
      firstName: 'Lucía',
      lastName: 'Ávila',
      dateOfBirth: '1990-05-05',
      sexAtBirth: 'female',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

describe('agenda lifecycle against real SQLite', () => {
  it('creates, lists by week, reschedules, and resolves with consultation link', () => {
    const created = new CreateAppointmentUseCase(deps).execute({
      patientId,
      scheduledAt: '2026-07-27T10:30',
      durationMinutes: 45,
      reason: 'Seguimiento mensual',
    });
    expect(created).toMatchObject({
      status: 'scheduled',
      patientName: 'Lucía Ávila',
      scheduledAt: '2026-07-27T10:30',
    });

    // The agenda range is inclusive by civil date.
    const week = new ListAgendaUseCase({ appointments: deps.appointments }).execute({
      fromDate: '2026-07-27',
      toDate: '2026-08-02',
    });
    expect(week).toHaveLength(1);
    expect(
      new ListAgendaUseCase({ appointments: deps.appointments }).execute({
        fromDate: '2026-07-20',
        toDate: '2026-07-26',
      }),
    ).toHaveLength(0);

    const moved = new RescheduleAppointmentUseCase(deps).execute({
      appointmentId: created.id,
      scheduledAt: '2026-07-28T09:00',
      durationMinutes: 30,
    });
    expect(moved).toMatchObject({ scheduledAt: '2026-07-28T09:00', reason: null });

    const consultation = new CreateConsultationUseCase({
      uow: deps.uow,
      consultations: deps.consultations,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId,
      consultationDate: '2026-07-24',
      consultationType: 'follow_up',
      subjective: 'Acudió a su cita.',
    });
    const resolved = new ResolveAppointmentUseCase(deps).execute({
      appointmentId: created.id,
      status: 'completed',
      consultationId: consultation.id,
    });
    expect(resolved).toMatchObject({ status: 'completed', consultationId: consultation.id });

    // Terminal states freeze the appointment.
    expect(() =>
      new ResolveAppointmentUseCase(deps).execute({
        appointmentId: created.id,
        status: 'cancelled',
      }),
    ).toThrowError('ya fue resuelta');
    try {
      new RescheduleAppointmentUseCase(deps).execute({
        appointmentId: created.id,
        scheduledAt: '2026-07-29T09:00',
        durationMinutes: 30,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('CONFLICT');
    }
  });

  it('rejects linking a consultation of another patient', () => {
    const other = createPatient(
      {
        fileNumber: 2,
        firstName: 'Mario',
        lastName: 'Beltrán',
        dateOfBirth: '1985-01-01',
        sexAtBirth: 'male',
      },
      ctx,
    );
    deps.patients.insert(other);
    const consultation = new CreateConsultationUseCase({
      uow: deps.uow,
      consultations: deps.consultations,
      patients: deps.patients,
      audit: deps.audit,
      ctx,
    }).execute({
      patientId: other.id,
      consultationDate: '2026-07-24',
      consultationType: 'initial',
      subjective: 'Nota de otro paciente.',
    });
    const appointment = new CreateAppointmentUseCase(deps).execute({
      patientId,
      scheduledAt: '2026-07-27T10:30',
      durationMinutes: 30,
    });
    expect(() =>
      new ResolveAppointmentUseCase(deps).execute({
        appointmentId: appointment.id,
        status: 'completed',
        consultationId: consultation.id,
      }),
    ).toThrowError('otro paciente');
  });
});
