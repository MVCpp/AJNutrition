import { z } from 'zod';
import { PatientIdSchema } from './patient';

/** Agenda contracts (Phase 6). Times are local civil time, no timezone. */

const SCHEDULED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const AppointmentIdSchema = z.string().uuid();
export const AppointmentStatusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'no_show']);
export type AppointmentStatusDto = z.infer<typeof AppointmentStatusSchema>;

export const CreateAppointmentCommandSchema = z
  .object({
    patientId: PatientIdSchema,
    scheduledAt: z.string().regex(SCHEDULED_AT, 'invalid_datetime'),
    durationMinutes: z.number().int().min(5).max(480),
    reason: z.string().trim().max(500, 'too_long').optional(),
  })
  .strict();
export type CreateAppointmentCommand = z.infer<typeof CreateAppointmentCommandSchema>;

export const RescheduleAppointmentCommandSchema = z
  .object({
    appointmentId: AppointmentIdSchema,
    scheduledAt: z.string().regex(SCHEDULED_AT, 'invalid_datetime'),
    durationMinutes: z.number().int().min(5).max(480),
    reason: z.string().trim().max(500, 'too_long').optional(),
  })
  .strict();
export type RescheduleAppointmentCommand = z.infer<typeof RescheduleAppointmentCommandSchema>;

export const ResolveAppointmentCommandSchema = z
  .object({
    appointmentId: AppointmentIdSchema,
    status: z.enum(['completed', 'cancelled', 'no_show']),
    /** Completed appointments may link the consultation note they produced. */
    consultationId: z.string().uuid().optional(),
  })
  .strict();
export type ResolveAppointmentCommand = z.infer<typeof ResolveAppointmentCommandSchema>;

/** Inclusive calendar-date range for the agenda view. */
export const ListAgendaQuerySchema = z
  .object({
    fromDate: z.string().regex(ISO_DATE, 'invalid_date'),
    toDate: z.string().regex(ISO_DATE, 'invalid_date'),
  })
  .strict();
export type ListAgendaQuery = z.infer<typeof ListAgendaQuerySchema>;

export const AppointmentDtoSchema = z
  .object({
    id: AppointmentIdSchema,
    patientId: PatientIdSchema,
    patientName: z.string(),
    scheduledAt: z.string().regex(SCHEDULED_AT),
    durationMinutes: z.number().int(),
    reason: z.string().nullable(),
    status: AppointmentStatusSchema,
    consultationId: z.string().uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type AppointmentDto = z.infer<typeof AppointmentDtoSchema>;
