import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type PatientStatus = 'active' | 'archived';
export type SexAtBirth = 'female' | 'male' | 'unspecified';

/**
 * Patient aggregate (Patient Records bounded context).
 * Identity and demographic data only — clinical history, measurements,
 * consultations, and plans are separate aggregates that reference `id`.
 */
export interface Patient {
  readonly id: string;
  readonly fileNumber: number;
  readonly firstName: string;
  readonly lastName: string;
  /** ISO 8601 calendar date (YYYY-MM-DD). A calendar date, deliberately not a timestamp: birth dates have no time zone. */
  readonly dateOfBirth: string;
  readonly sexAtBirth: SexAtBirth;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: PatientStatus;
  /** ISO 8601 UTC timestamp. */
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Optimistic-concurrency version, incremented on every update. */
  readonly version: number;
}

export interface NewPatientInput {
  fileNumber: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sexAtBirth: SexAtBirth;
  email?: string | undefined;
  phone?: string | undefined;
}

const MAX_AGE_YEARS = 130;
const MIN_BIRTH_YEAR = 1900;

/**
 * Creates a valid Patient or throws AppError(VALIDATION).
 * IPC-level Zod validation has already checked shape/format; this layer
 * enforces the business invariants Zod cannot express.
 */
export function createPatient(input: NewPatientInput, ctx: DomainContext): Patient {
  const fieldErrors: Record<string, string[]> = {};

  const dob = parseIsoDate(input.dateOfBirth);
  const today = ctx.now();
  if (dob === null) {
    fieldErrors['dateOfBirth'] = ['invalid_date'];
  } else {
    if (dob.getTime() > today.getTime()) {
      fieldErrors['dateOfBirth'] = ['date_in_future'];
    } else if (dob.getUTCFullYear() < MIN_BIRTH_YEAR) {
      fieldErrors['dateOfBirth'] = ['date_implausible'];
    } else if (ageInYears(dob, today) > MAX_AGE_YEARS) {
      fieldErrors['dateOfBirth'] = ['age_implausible'];
    }
  }

  if (input.firstName.trim().length === 0) fieldErrors['firstName'] = ['required'];
  if (input.lastName.trim().length === 0) fieldErrors['lastName'] = ['required'];
  if (!Number.isInteger(input.fileNumber) || input.fileNumber < 1) {
    fieldErrors['fileNumber'] = ['invalid_file_number'];
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'Los datos del paciente no son válidos.',
      fieldErrors,
    });
  }

  const nowIso = today.toISOString();
  return {
    id: ctx.newId(),
    fileNumber: input.fileNumber,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    dateOfBirth: input.dateOfBirth,
    sexAtBirth: input.sexAtBirth,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
}

/** Parses YYYY-MM-DD as a UTC calendar date; rejects impossible dates like 2023-02-30. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : null;
}

export function ageInYears(birthDate: Date, reference: Date): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    reference.getUTCMonth() < birthDate.getUTCMonth() ||
    (reference.getUTCMonth() === birthDate.getUTCMonth() &&
      reference.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
