import { ageInYears, parseIsoDate, type DomainContext } from '@ajnutrition/domain';
import { assertMetric, computeSessionCalculations, FORMULAS } from '@ajnutrition/nutrition-engine';
import {
  AppError,
  type CreateMeasurementCommand,
  type ListMeasurementsQuery,
  type MeasurementSessionDto,
} from '@ajnutrition/shared';
import type { AuditLog } from '../ports/audit-log';
import type { ConsultationRepository } from '../ports/consultation-repository';
import type {
  MeasurementRepository,
  MeasurementSessionRecord,
} from '../ports/measurement-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface MeasurementDeps {
  uow: UnitOfWork;
  measurements: MeasurementRepository;
  patients: PatientRepository;
  consultations: ConsultationRepository;
  audit: AuditLog;
  ctx: DomainContext;
}

function toDto(record: MeasurementSessionRecord): MeasurementSessionDto {
  return {
    id: record.id,
    patientId: record.patientId,
    measuredAt: record.measuredAt,
    weightKg: record.values.weight_kg ?? null,
    heightCm: record.values.height_cm ?? null,
    waistCm: record.values.waist_cm ?? null,
    hipCm: record.values.hip_cm ?? null,
    bodyFatPercent: record.values.body_fat_percent ?? null,
    skinfoldBicepsMm: record.values.skinfold_biceps_mm ?? null,
    skinfoldTricepsMm: record.values.skinfold_triceps_mm ?? null,
    skinfoldSubscapularMm: record.values.skinfold_subscapular_mm ?? null,
    skinfoldSuprailiacMm: record.values.skinfold_suprailiac_mm ?? null,
    skinfoldChestMm: record.values.skinfold_chest_mm ?? null,
    skinfoldAbdomenMm: record.values.skinfold_abdomen_mm ?? null,
    skinfoldThighMm: record.values.skinfold_thigh_mm ?? null,
    skeletalMuscleMassKg: record.values.skeletal_muscle_mass_kg ?? null,
    fatMassKg: record.values.fat_mass_kg ?? null,
    fatFreeMassKg: record.values.fat_free_mass_kg ?? null,
    totalBodyWaterL: record.values.total_body_water_l ?? null,
    proteinKg: record.values.protein_kg ?? null,
    mineralsKg: record.values.minerals_kg ?? null,
    visceralFatLevel: record.values.visceral_fat_level ?? null,
    deviceBmrKcal: record.values.device_bmr_kcal ?? null,
    smiKgM2: record.values.smi_kg_m2 ?? null,
    biaScore: record.values.bia_score ?? null,
    consultationId: record.consultationId,
    calculated: record.calculated.map((c) => ({
      formulaId: c.formulaId,
      formulaName: FORMULAS[c.formulaId]?.name ?? c.formulaId,
      formulaVersion: c.formulaVersion,
      roundedResult: c.roundedResult,
      unit: c.unit,
      warnings: c.warnings,
    })),
    notes: record.notes,
    createdAt: record.createdAt,
  };
}

export class CreateMeasurementSessionUseCase {
  constructor(private readonly deps: MeasurementDeps) {}

  execute(command: CreateMeasurementCommand): MeasurementSessionDto {
    const { uow, measurements, patients, audit, ctx } = this.deps;
    return uow.run(() => {
      const patient = patients.findById(command.patientId);
      if (patient === null) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
      }
      const measuredAt = parseIsoDate(command.measuredAt);
      if (measuredAt === null || measuredAt.getTime() > ctx.now().getTime()) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'La fecha de medición no es válida.',
          fieldErrors: { measuredAt: ['invalid_date'] },
        });
      }
      if (command.consultationId !== undefined) {
        const consultation = this.deps.consultations.findById(command.consultationId);
        if (consultation === null || consultation.patientId !== patient.id) {
          throw new AppError({
            code: 'VALIDATION',
            message: 'La consulta indicada no existe o pertenece a otro paciente.',
          });
        }
      }
      const birthDate = parseIsoDate(patient.dateOfBirth);
      if (birthDate === null) {
        throw new AppError({ code: 'INTEGRITY', message: 'Fecha de nacimiento inválida.' });
      }

      // Validates plausibility of every provided value and runs exactly the
      // formulas whose inputs are present — deterministic, with provenance.
      const calculated = computeSessionCalculations({
        weightKg: command.weightKg,
        heightCm: command.heightCm,
        waistCm: command.waistCm,
        hipCm: command.hipCm,
        bodyFatPercent: command.bodyFatPercent,
        skinfoldBicepsMm: command.skinfoldBicepsMm,
        skinfoldTricepsMm: command.skinfoldTricepsMm,
        skinfoldSubscapularMm: command.skinfoldSubscapularMm,
        skinfoldSuprailiacMm: command.skinfoldSuprailiacMm,
        skinfoldChestMm: command.skinfoldChestMm,
        skinfoldAbdomenMm: command.skinfoldAbdomenMm,
        skinfoldThighMm: command.skinfoldThighMm,
        clinicalFlags: command.clinicalFlags,
        sex: patient.sexAtBirth,
        ageYears: ageInYears(birthDate, measuredAt),
      });

      const values: MeasurementSessionRecord['values'] = {};
      if (command.weightKg !== undefined) values.weight_kg = command.weightKg;
      if (command.heightCm !== undefined) values.height_cm = command.heightCm;
      if (command.waistCm !== undefined) values.waist_cm = command.waistCm;
      if (command.hipCm !== undefined) values.hip_cm = command.hipCm;
      if (command.bodyFatPercent !== undefined) values.body_fat_percent = command.bodyFatPercent;
      if (command.skinfoldBicepsMm !== undefined)
        values.skinfold_biceps_mm = command.skinfoldBicepsMm;
      if (command.skinfoldTricepsMm !== undefined)
        values.skinfold_triceps_mm = command.skinfoldTricepsMm;
      if (command.skinfoldSubscapularMm !== undefined)
        values.skinfold_subscapular_mm = command.skinfoldSubscapularMm;
      if (command.skinfoldSuprailiacMm !== undefined)
        values.skinfold_suprailiac_mm = command.skinfoldSuprailiacMm;
      if (command.skinfoldChestMm !== undefined) values.skinfold_chest_mm = command.skinfoldChestMm;
      if (command.skinfoldAbdomenMm !== undefined)
        values.skinfold_abdomen_mm = command.skinfoldAbdomenMm;
      if (command.skinfoldThighMm !== undefined) values.skinfold_thigh_mm = command.skinfoldThighMm;
      // BIA body-composition values: bounds-checked, stored verbatim, never
      // fed into formulas (they come from the device's own estimation).
      if (command.skeletalMuscleMassKg !== undefined) {
        assertMetric('skeletal_muscle_mass_kg', command.skeletalMuscleMassKg);
        values.skeletal_muscle_mass_kg = command.skeletalMuscleMassKg;
      }
      if (command.fatMassKg !== undefined) {
        assertMetric('fat_mass_kg', command.fatMassKg);
        values.fat_mass_kg = command.fatMassKg;
      }
      if (command.fatFreeMassKg !== undefined) {
        assertMetric('fat_free_mass_kg', command.fatFreeMassKg);
        values.fat_free_mass_kg = command.fatFreeMassKg;
      }
      if (command.totalBodyWaterL !== undefined) {
        assertMetric('total_body_water_l', command.totalBodyWaterL);
        values.total_body_water_l = command.totalBodyWaterL;
      }
      if (command.proteinKg !== undefined) {
        assertMetric('protein_kg', command.proteinKg);
        values.protein_kg = command.proteinKg;
      }
      if (command.mineralsKg !== undefined) {
        assertMetric('minerals_kg', command.mineralsKg);
        values.minerals_kg = command.mineralsKg;
      }
      if (command.visceralFatLevel !== undefined) {
        assertMetric('visceral_fat_level', command.visceralFatLevel);
        values.visceral_fat_level = command.visceralFatLevel;
      }
      if (command.deviceBmrKcal !== undefined) {
        assertMetric('device_bmr_kcal', command.deviceBmrKcal);
        values.device_bmr_kcal = command.deviceBmrKcal;
      }
      if (command.smiKgM2 !== undefined) {
        assertMetric('smi_kg_m2', command.smiKgM2);
        values.smi_kg_m2 = command.smiKgM2;
      }
      if (command.biaScore !== undefined) {
        assertMetric('bia_score', command.biaScore);
        values.bia_score = command.biaScore;
      }

      const record: MeasurementSessionRecord = {
        id: ctx.newId(),
        patientId: patient.id,
        measuredAt: command.measuredAt,
        values,
        consultationId: command.consultationId ?? null,
        calculated: calculated.map((c) => ({ ...c, id: ctx.newId() })),
        notes: command.notes?.trim() || null,
        createdAt: ctx.now().toISOString(),
      };
      measurements.insertSession(record);
      audit.record({
        action: 'measurement.create',
        entityType: 'measurement-session',
        entityId: record.id,
        result: 'success',
        // Which metrics were captured — never the clinical values themselves.
        metadata: {
          patientId: patient.id,
          metrics: Object.keys(values).join(','),
          calculations: record.calculated.length,
        },
      });
      return toDto(record);
    });
  }
}

export class ListMeasurementSessionsUseCase {
  constructor(private readonly deps: Pick<MeasurementDeps, 'measurements'>) {}

  execute(query: ListMeasurementsQuery): MeasurementSessionDto[] {
    return this.deps.measurements.listByPatient(query.patientId).map(toDto);
  }
}
