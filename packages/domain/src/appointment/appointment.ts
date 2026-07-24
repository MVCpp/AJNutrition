import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

/**
 * Appointment aggregate (Agenda bounded context, Phase 6). An appointment is
 * operational data — unlike clinical notes it may be edited while scheduled;
 * terminal states (completed/cancelled/no_show) freeze it.
 */
export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  /** Local civil time of the visit, ISO 'YYYY-MM-DDTHH:mm' (no timezone). */
  readonly scheduledAt: string;
  readonly durationMinutes: number;
  readonly reason: string | null;
  readonly status: AppointmentStatus;
  /** Set when a completed appointment is linked to its consultation note. */
  readonly consultationId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const SCHEDULED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export interface NewAppointmentInput {
  patientId: string;
  scheduledAt: string;
  durationMinutes: number;
  reason?: string | undefined;
}

function assertSchedulable(input: Omit<NewAppointmentInput, 'patientId'>): void {
  const fieldErrors: Record<string, string[]> = {};
  if (!SCHEDULED_AT.test(input.scheduledAt) || Number.isNaN(Date.parse(input.scheduledAt))) {
    fieldErrors['scheduledAt'] = ['invalid_datetime'];
  }
  if (
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 5 ||
    input.durationMinutes > 480
  ) {
    fieldErrors['durationMinutes'] = ['out_of_range'];
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La cita no es válida.',
      fieldErrors,
    });
  }
}

export function createAppointment(input: NewAppointmentInput, ctx: DomainContext): Appointment {
  assertSchedulable(input);
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    reason: input.reason?.trim() || null,
    status: 'scheduled',
    consultationId: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Edits date/duration/reason — only while still scheduled. */
export function rescheduleAppointment(
  appointment: Appointment,
  input: Omit<NewAppointmentInput, 'patientId'>,
  ctx: DomainContext,
): Appointment {
  if (appointment.status !== 'scheduled') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Solo las citas programadas pueden modificarse.',
    });
  }
  assertSchedulable(input);
  return {
    ...appointment,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    reason: input.reason?.trim() || null,
    updatedAt: ctx.now().toISOString(),
  };
}

/** scheduled → completed | cancelled | no_show. Terminal states never change. */
export function resolveAppointment(
  appointment: Appointment,
  status: Exclude<AppointmentStatus, 'scheduled'>,
  consultationId: string | null,
  ctx: DomainContext,
): Appointment {
  if (appointment.status !== 'scheduled') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'La cita ya fue resuelta.',
    });
  }
  if (consultationId !== null && status !== 'completed') {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Solo una cita completada puede vincular una consulta.',
    });
  }
  return {
    ...appointment,
    status,
    consultationId,
    updatedAt: ctx.now().toISOString(),
  };
}
