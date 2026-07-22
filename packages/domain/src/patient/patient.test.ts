import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';
import { ageInYears, createPatient, parseIsoDate } from './patient';

const FIXED_NOW = new Date('2026-07-21T12:00:00.000Z');

const ctx: DomainContext = {
  now: () => FIXED_NOW,
  newId: () => '00000000-0000-4000-8000-000000000001',
};

const validInput = {
  fileNumber: 1,
  firstName: 'María José',
  lastName: 'García Núñez',
  dateOfBirth: '1990-05-14',
  sexAtBirth: 'female' as const,
};

describe('createPatient', () => {
  it('creates an active patient with deterministic id and timestamps', () => {
    const patient = createPatient(validInput, ctx);
    expect(patient).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      fileNumber: 1,
      firstName: 'María José',
      lastName: 'García Núñez',
      dateOfBirth: '1990-05-14',
      sexAtBirth: 'female',
      email: null,
      phone: null,
      status: 'active',
      version: 1,
    });
    expect(patient.createdAt).toBe(FIXED_NOW.toISOString());
    expect(patient.updatedAt).toBe(patient.createdAt);
  });

  it('trims whitespace and normalizes empty optional contact fields to null', () => {
    const patient = createPatient(
      { ...validInput, email: '  ana@example.com ', phone: '   ' },
      ctx,
    );
    expect(patient.email).toBe('ana@example.com');
    expect(patient.phone).toBeNull();
  });

  it('rejects a birth date in the future', () => {
    expect(() => createPatient({ ...validInput, dateOfBirth: '2027-01-01' }, ctx)).toThrowError(
      AppError,
    );
    try {
      createPatient({ ...validInput, dateOfBirth: '2027-01-01' }, ctx);
    } catch (err) {
      const appError = err as AppError;
      expect(appError.code).toBe('VALIDATION');
      expect(appError.fieldErrors).toEqual({ dateOfBirth: ['date_in_future'] });
    }
  });

  it('rejects an impossible calendar date', () => {
    expect(() => createPatient({ ...validInput, dateOfBirth: '2023-02-30' }, ctx)).toThrowError(
      AppError,
    );
  });

  it('rejects implausible birth years (before 1900 or age above 130)', () => {
    expect(() => createPatient({ ...validInput, dateOfBirth: '1899-12-31' }, ctx)).toThrowError(
      AppError,
    );
  });

  it('accepts a patient born today (age zero)', () => {
    const patient = createPatient({ ...validInput, dateOfBirth: '2026-07-21' }, ctx);
    expect(patient.dateOfBirth).toBe('2026-07-21');
  });

  it('rejects a non-positive file number', () => {
    expect(() => createPatient({ ...validInput, fileNumber: 0 }, ctx)).toThrowError(AppError);
  });

  it('collects multiple field errors in a single validation error', () => {
    try {
      createPatient({ ...validInput, firstName: '  ', dateOfBirth: '2050-01-01' }, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      const appError = err as AppError;
      expect(Object.keys(appError.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(['firstName', 'dateOfBirth']),
      );
    }
  });
});

describe('parseIsoDate', () => {
  it('parses a valid date as UTC midnight', () => {
    expect(parseIsoDate('1990-05-14')?.toISOString()).toBe('1990-05-14T00:00:00.000Z');
  });

  it.each(['1990-13-01', '1990-00-10', '1990-02-30', '14-05-1990', '1990/05/14', ''])(
    'rejects %s',
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );
});

describe('ageInYears', () => {
  it('is exact on the birthday boundary', () => {
    const birth = new Date('1990-07-21T00:00:00.000Z');
    expect(ageInYears(birth, new Date('2026-07-20T00:00:00.000Z'))).toBe(35);
    expect(ageInYears(birth, new Date('2026-07-21T00:00:00.000Z'))).toBe(36);
  });
});
