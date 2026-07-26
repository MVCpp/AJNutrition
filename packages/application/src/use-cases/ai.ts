import {
  ageInYears,
  currentConsentByType,
  parseIsoDate,
  type DomainContext,
} from '@ajnutrition/domain';
import {
  AppError,
  type AiProgressSummaryDto,
  type AiSettingsDto,
  type GenerateProgressSummaryCommand,
  type SaveAiSettingsCommand,
} from '@ajnutrition/shared';
import {
  dayOffset,
  generateProgressSummary,
  type AiProvider,
  type DeidentifiedContext,
  type DeidentifiedSeries,
} from '@ajnutrition/ai';
import type { AiSettingsRepository } from '../ports/ai-settings-repository';
import type { AuditLog } from '../ports/audit-log';
import type { AdherenceRepository } from '../ports/adherence-repository';
import type { ConsentRepository } from '../ports/consent-repository';
import type { LabRepository } from '../ports/lab-repository';
import type { MealPlanRepository } from '../ports/meal-plan-repository';
import type { MeasurementRepository } from '../ports/measurement-repository';
import type { PatientRepository } from '../ports/patient-repository';
import type { UnitOfWork } from '../ports/unit-of-work';

export interface AiDeps {
  uow: UnitOfWork;
  settings: AiSettingsRepository;
  patients: PatientRepository;
  consents: ConsentRepository;
  measurements: MeasurementRepository;
  adherence: AdherenceRepository;
  labs: LabRepository;
  plans: MealPlanRepository;
  audit: AuditLog;
  ctx: DomainContext;
  /** Seals/opens the API key with the AI subkey; never exposed to callers. */
  secrets: { seal(plaintext: string): string; open(envelope: string): string };
  /** Built per request from the stored settings; injected for testability. */
  createProvider(apiKey: string, model: string): AiProvider;
}

const DEFAULT_MODEL = 'claude-sonnet-5';

function toDto(
  record: {
    enabled: boolean;
    provider: 'anthropic';
    model: string;
    apiKeyEnvelope: string | null;
    updatedAt: string;
  } | null,
): AiSettingsDto {
  if (record === null) {
    return {
      enabled: false,
      provider: 'anthropic',
      model: DEFAULT_MODEL,
      hasApiKey: false,
      updatedAt: null,
    };
  }
  return {
    enabled: record.enabled,
    provider: record.provider,
    model: record.model as AiSettingsDto['model'],
    hasApiKey: record.apiKeyEnvelope !== null,
    updatedAt: record.updatedAt,
  };
}

export class GetAiSettingsUseCase {
  constructor(private readonly deps: Pick<AiDeps, 'settings'>) {}

  execute(): AiSettingsDto {
    return toDto(this.deps.settings.get());
  }
}

export class SaveAiSettingsUseCase {
  constructor(
    private readonly deps: Pick<AiDeps, 'uow' | 'settings' | 'audit' | 'ctx' | 'secrets'>,
  ) {}

  execute(command: SaveAiSettingsCommand): AiSettingsDto {
    const { uow, settings, audit, ctx, secrets } = this.deps;
    return uow.run(() => {
      const existing = settings.get();
      // undefined = keep the stored key · '' = delete it · value = replace it
      const apiKeyEnvelope =
        command.apiKey === undefined
          ? (existing?.apiKeyEnvelope ?? null)
          : command.apiKey === ''
            ? null
            : secrets.seal(command.apiKey);

      if (command.enabled && apiKeyEnvelope === null) {
        throw new AppError({
          code: 'VALIDATION',
          message: 'Para activar la IA debe capturar una clave de API.',
          fieldErrors: { apiKey: ['required'] },
        });
      }

      const record = {
        enabled: command.enabled,
        provider: 'anthropic' as const,
        model: command.model,
        apiKeyEnvelope,
        updatedAt: ctx.now().toISOString(),
      };
      settings.save(record);
      audit.record({
        action: 'ai.settings.save',
        entityType: 'ai-settings',
        entityId: null,
        result: 'success',
        // Configuration only — the key itself is never recorded.
        metadata: {
          enabled: record.enabled,
          model: record.model,
          hasApiKey: apiKeyEnvelope !== null,
        },
      });
      return toDto(record);
    });
  }
}

/**
 * Progress summary. Order matters and is deliberate:
 * consent → settings → build de-identified context → egress guard (inside
 * generateProgressSummary) → provider call → schema validation → audit.
 *
 * The result is never persisted: it is a draft for the practitioner to read,
 * edit and decide upon (human approval workflow, Epic 7).
 */
export class GenerateAiProgressSummaryUseCase {
  constructor(private readonly deps: AiDeps) {}

  async execute(command: GenerateProgressSummaryCommand): Promise<AiProgressSummaryDto> {
    const { settings, patients, consents, measurements, adherence, labs, plans, audit, ctx } =
      this.deps;

    const patient = patients.findById(command.patientId);
    if (patient === null) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Paciente no encontrado.' });
    }

    // Gate 1: the practitioner enabled AI and stored a key.
    const config = settings.get();
    if (!config || !config.enabled || config.apiKeyEnvelope === null) {
      throw new AppError({
        code: 'AUTHORIZATION',
        message: 'El asistente de IA está desactivado. Actívelo en Perfil → Asistente de IA.',
      });
    }

    // Gate 2: this patient consented to AI processing, and has not withdrawn.
    const consent = currentConsentByType(consents.listByPatient(command.patientId)).get(
      'ai_processing',
    );
    if (!consent || consent.status !== 'accepted') {
      throw new AppError({
        code: 'AUTHORIZATION',
        message:
          'Se requiere un consentimiento vigente de procesamiento con IA para este paciente. Regístrelo en la pestaña Consentimientos.',
      });
    }

    const sessions = [...measurements.listByPatient(command.patientId)].sort((a, b) =>
      a.measuredAt.localeCompare(b.measuredAt),
    );
    if (sessions.length === 0) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'No hay mediciones registradas para resumir.',
      });
    }
    const firstDate = sessions[0]!.measuredAt;
    const lastDate = sessions[sessions.length - 1]!.measuredAt;

    const METRICS: Array<[keyof (typeof sessions)[number]['values'], string, string]> = [
      ['weight_kg', 'Peso', 'kg'],
      ['waist_cm', 'Cintura', 'cm'],
      ['hip_cm', 'Cadera', 'cm'],
      ['body_fat_percent', 'Grasa corporal', '%'],
      ['skeletal_muscle_mass_kg', 'Masa musculoesquelética', 'kg'],
      ['fat_mass_kg', 'Masa grasa', 'kg'],
      ['visceral_fat_level', 'Grasa visceral', 'nivel'],
    ];
    const series: DeidentifiedSeries[] = [];
    for (const [key, label, unit] of METRICS) {
      const points = sessions
        .filter((session) => session.values[key] !== undefined)
        .map((session) => ({
          dayOffset: dayOffset(firstDate, session.measuredAt),
          value: session.values[key] as number,
        }));
      if (points.length > 0) series.push({ metric: label, unit, points });
    }

    const birthDate = parseIsoDate(patient.dateOfBirth);
    const measuredDate = parseIsoDate(lastDate);
    if (birthDate === null || measuredDate === null) {
      throw new AppError({ code: 'INTEGRITY', message: 'Fechas inválidas en el expediente.' });
    }

    const activePlan = plans
      .listByPatient(command.patientId)
      .find((plan) => plan.status === 'active');

    const context: DeidentifiedContext = {
      ageYears: ageInYears(birthDate, measuredDate),
      sexAtBirth: patient.sexAtBirth,
      series,
      adherence: adherence
        .listByPatient(command.patientId)
        .map((entry) => ({
          dayOffset: dayOffset(firstDate, entry.recordedAt.slice(0, 10)),
          value: entry.score,
        }))
        .sort((a, b) => a.dayOffset - b.dayOffset),
      labFlags: labs
        .listByPatient(command.patientId)
        .filter(
          (lab) =>
            lab.referenceLow !== null &&
            lab.referenceHigh !== null &&
            (lab.value < lab.referenceLow || lab.value > lab.referenceHigh),
        )
        .map((lab) => ({
          analyte: lab.analyte,
          value: lab.value,
          unit: lab.unit,
          low: lab.referenceLow as number,
          high: lab.referenceHigh as number,
        })),
      targetKcal: activePlan?.energyTargetKcal ?? null,
      spanDays: dayOffset(firstDate, lastDate),
    };

    // Names are the identifiers most likely to slip through; the egress guard
    // rejects the payload if any of them appear.
    const forbidden = [patient.firstName, patient.lastName, String(patient.fileNumber)];

    const provider = this.deps.createProvider(
      this.deps.secrets.open(config.apiKeyEnvelope),
      config.model,
    );

    try {
      const { summary, usage } = await generateProgressSummary(provider, context, forbidden);
      audit.record({
        action: 'ai.summary.generate',
        entityType: 'patient',
        entityId: patient.id,
        result: 'success',
        // Counts and cost only: never the prompt, never the response.
        metadata: {
          model: config.model,
          provider: config.provider,
          metrics: series.length,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
      return {
        ...summary,
        model: config.model as AiProgressSummaryDto['model'],
        generatedAt: ctx.now().toISOString(),
        usage,
      };
    } catch (error) {
      audit.record({
        action: 'ai.summary.generate',
        entityType: 'patient',
        entityId: patient.id,
        result: 'failure',
        metadata: {
          model: config.model,
          provider: config.provider,
          code: error instanceof AppError ? error.code : 'UNEXPECTED',
        },
      });
      throw error;
    }
  }
}
