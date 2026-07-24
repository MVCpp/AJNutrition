import {
  createAppointment,
  rescheduleAppointment,
  resolveAppointment,
  type Appointment,
  type DomainContext,
} from '@ajnutrition/domain';
import {
  AppError,
  type AppointmentDto,
  type CreateAppointmentCommand,
  type ListAgendaQuery,
  type RescheduleAppointmentCommand,
  type ResolveAppointmentCommand,
} from '@ajnutrition/shared';
import type { AppointmentRepository } from '../ports/appointment-repository';
import type { AuditLog } from '../ports/audit-log';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface AppointmentDeps {
  uow: UnitOfWork;
  appointments: AppointmentRepository;
  patients: PatientRepository;
  consultations: ConsultationRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(appointment: Appointment, patientName: string): AppointmentDto {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName,
    scheduledAt: appointment.scheduledAt,
    durationMinutes: appointment.durationMinutes,
    reason: appointment.reason,
    status: appointment.status,
    consultationId: appointment.consultationId,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

function requireAppointment(repo: AppointmentRepository, id: string): Appointment {
  const appointment = repo.findById(id);
  if (appointment === null) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Cita no encontrada.' });
  }
  return appointment;
}

export class CreateAppointmentUseCase {
  constructor(private readonly deps: AppointmentDeps) {}

  execute(command: CreateAppointmentCommand): AppointmentDto {
    const { uow, appointments, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      const patient = patients.findById(command.patientId);
      if (patient === null || patient.status !== 'active') {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const appointment = createAppointment(command, ctx);
      appointments.insert(appointment);
      audit.record({
        action: 'appointment.create',
        entityType: 'appointment',
        entityId: appointment.id,
        result: 'success',
        metadata: { patientId: patient.id, scheduledAt: appointment.scheduledAt },
      });
      return toDto(appointment, `${patient.firstName} ${patient.lastName}`);
    });
  }
}

export class RescheduleAppointmentUseCase {
  constructor(private readonly deps: AppointmentDeps) {}

  execute(command: RescheduleAppointmentCommand): AppointmentDto {
    const { uow, appointments, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      const updated = rescheduleAppointment(
        requireAppointment(appointments, command.appointmentId),
        command,
        ctx,
      );
      appointments.update(updated);
      audit.record({
        action: 'appointment.reschedule',
        entityType: 'appointment',
        entityId: updated.id,
        result: 'success',
        metadata: { scheduledAt: updated.scheduledAt },
      });
      const patient = patients.findById(updated.patientId);
      return toDto(updated, patient ? `${patient.firstName} ${patient.lastName}` : '');
    });
  }
}

export class ResolveAppointmentUseCase {
  constructor(private readonly deps: AppointmentDeps) {}

  execute(command: ResolveAppointmentCommand): AppointmentDto {
    const { uow, appointments, patients, consultations, audit, ctx } = this.deps;
    return uow.run(() => {
      const appointment = requireAppointment(appointments, command.appointmentId);
      if (command.consultationId !== undefined) {
        const consultation = consultations.findById(command.consultationId);
        if (consultation === null || consultation.patientId !== appointment.patientId) {
          throw new AppError({
            code: 'VALIDATION',
            message: 'La consulta indicada no existe o pertenece a otro paciente.',
          });
        }
      }
      const resolved = resolveAppointment(
        appointment,
        command.status,
        command.consultationId ?? null,
        ctx,
      );
      appointments.update(resolved);
      audit.record({
        action: 'appointment.resolve',
        entityType: 'appointment',
        entityId: resolved.id,
        result: 'success',
        metadata: { status: resolved.status, linkedConsultation: resolved.consultationId !== null },
      });
      const patient = patients.findById(resolved.patientId);
      return toDto(resolved, patient ? `${patient.firstName} ${patient.lastName}` : '');
    });
  }
}

export class ListAgendaUseCase {
  constructor(private readonly deps: Pick<AppointmentDeps, 'appointments'>) {}

  execute(query: ListAgendaQuery): AppointmentDto[] {
    if (query.toDate < query.fromDate) {
      throw new AppError({ code: 'VALIDATION', message: 'El rango de fechas está invertido.' });
    }
    return this.deps.appointments
      .listBetween(query.fromDate, query.toDate)
      .map(({ appointment, patientName }) => toDto(appointment, patientName));
  }
}
