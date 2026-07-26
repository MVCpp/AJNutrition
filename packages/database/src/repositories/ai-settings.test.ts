import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPatient, type DomainContext } from '@ajnutrition/domain';
import {
  CreateMeasurementSessionUseCase,
  GenerateAiProgressSummaryUseCase,
  GetAiSettingsUseCase,
  RecordConsentUseCase,
  SaveAiSettingsUseCase,
  WithdrawConsentUseCase,
  type AiDeps,
} from '@ajnutrition/application';
import type { AiProvider } from '@ajnutrition/ai';
import { runMigrations } from '../migrations';
import { openInMemoryDatabase, type SqliteDatabase } from '../connection';
import { SqliteAiSettingsRepository } from './sqlite-ai-settings-repository';
import { SqliteAdherenceRepository } from './sqlite-adherence-repository';
import { SqliteConsentRepository } from './sqlite-consent-repository';
import { SqliteConsultationRepository } from './sqlite-consultation-repository';
import { SqliteLabRepository } from './sqlite-lab-repository';
import { SqliteMealPlanRepository } from './sqlite-meal-plan-repository';
import { SqliteMeasurementRepository } from './sqlite-measurement-repository';
import { SqlitePatientRepository } from './sqlite-patient-repository';
import { SqliteAuditLog } from './sqlite-audit-log';
import { SqliteUnitOfWork } from '../unit-of-work';

let db: SqliteDatabase;
let deps: AiDeps;
let patientId: string;
let idCounter = 0;
let providerCalls: Array<{ system: string; userMessage: string }>;

const ctx: DomainContext = {
  now: () => new Date('2026-07-26T12:00:00.000Z'),
  newId: () => {
    idCounter += 1;
    return `00000000-0000-4000-b000-${String(idCounter).padStart(12, '0')}`;
  },
};

const VALID_JSON = JSON.stringify({
  summary: 'Evolución favorable.',
  observations: ['Peso a la baja'],
  questions: ['¿Cómo va el apego?'],
});

/** Records what would have been transmitted so tests can assert on it. */
const recordingProvider: AiProvider = {
  id: 'test',
  complete: async (request) => {
    providerCalls.push({ system: request.system, userMessage: request.userMessage });
    return { text: VALID_JSON, usage: { inputTokens: 11, outputTokens: 22 } };
  },
};

beforeEach(() => {
  idCounter = 0;
  providerCalls = [];
  db = openInMemoryDatabase();
  runMigrations(db);
  const patients = new SqlitePatientRepository(db);
  const audit = new SqliteAuditLog(db, {
    appVersion: '0.1.0-test',
    now: ctx.now,
    newId: ctx.newId,
  });
  deps = {
    uow: new SqliteUnitOfWork(db),
    settings: new SqliteAiSettingsRepository(db),
    patients,
    consents: new SqliteConsentRepository(db),
    measurements: new SqliteMeasurementRepository(db),
    adherence: new SqliteAdherenceRepository(db),
    labs: new SqliteLabRepository(db),
    plans: new SqliteMealPlanRepository(db),
    audit,
    ctx,
    // Reversible stand-in for the real AES-GCM envelope (exercised separately
    // in the security package); the point here is that ciphertext is stored.
    secrets: {
      seal: (plaintext) => `sealed:${Buffer.from(plaintext, 'utf8').toString('base64')}`,
      open: (envelope) => Buffer.from(envelope.replace('sealed:', ''), 'base64').toString('utf8'),
    },
    createProvider: () => recordingProvider,
  };
  const patient = createPatient(
    {
      fileNumber: 7,
      firstName: 'Fernanda',
      lastName: 'Ruiz',
      dateOfBirth: '1985-03-14',
      sexAtBirth: 'female',
      email: 'fernanda@example.com',
      phone: '5512345678',
    },
    ctx,
  );
  patients.insert(patient);
  patientId = patient.id;
});

const enableAi = () =>
  new SaveAiSettingsUseCase(deps).execute({
    enabled: true,
    model: 'claude-sonnet-5',
    apiKey: 'sk-test-key',
  });

const grantAiConsent = () =>
  new RecordConsentUseCase({ ...deps, consents: deps.consents } as never).execute({
    patientId,
    consentType: 'ai_processing',
    noticeVersion: '2026-01',
    decision: 'accepted',
    method: 'written',
  });

const addMeasurements = () => {
  const measurementDeps = {
    uow: deps.uow,
    measurements: deps.measurements,
    patients: deps.patients,
    consultations: new SqliteConsultationRepository(db),
    audit: deps.audit,
    ctx,
  };
  new CreateMeasurementSessionUseCase(measurementDeps).execute({
    patientId,
    measuredAt: '2026-06-01',
    weightKg: 78.4,
    heightCm: 162,
  });
  new CreateMeasurementSessionUseCase(measurementDeps).execute({
    patientId,
    measuredAt: '2026-07-01',
    weightKg: 76.1,
    heightCm: 162,
  });
};

describe('AI settings', () => {
  it('defaults to disabled with no key stored', () => {
    expect(new GetAiSettingsUseCase({ settings: deps.settings }).execute()).toMatchObject({
      enabled: false,
      hasApiKey: false,
      model: 'claude-sonnet-5',
    });
  });

  it('stores the API key sealed and never returns it', () => {
    const dto = enableAi();
    expect(dto).toMatchObject({ enabled: true, hasApiKey: true });
    expect(JSON.stringify(dto)).not.toContain('sk-test-key');

    const row = db.prepare('SELECT api_key_envelope FROM ai_settings WHERE id = 1').get() as {
      api_key_envelope: string;
    };
    expect(row.api_key_envelope).not.toContain('sk-test-key');
    expect(row.api_key_envelope.startsWith('sealed:')).toBe(true);
  });

  it('keeps the stored key when the command omits it, and clears it on empty string', () => {
    enableAi();
    const kept = new SaveAiSettingsUseCase(deps).execute({ enabled: true, model: 'claude-opus-5' });
    expect(kept).toMatchObject({ hasApiKey: true, model: 'claude-opus-5' });

    const cleared = new SaveAiSettingsUseCase(deps).execute({
      enabled: false,
      model: 'claude-opus-5',
      apiKey: '',
    });
    expect(cleared.hasApiKey).toBe(false);
  });

  it('refuses to enable AI without a key', () => {
    expect(() =>
      new SaveAiSettingsUseCase(deps).execute({ enabled: true, model: 'claude-sonnet-5' }),
    ).toThrowError(/clave de API/);
  });

  it('audits the configuration without recording the key', () => {
    enableAi();
    const row = db
      .prepare(`SELECT metadata_json FROM audit_events WHERE action = 'ai.settings.save'`)
      .get() as { metadata_json: string };
    expect(row.metadata_json).not.toContain('sk-test-key');
    expect(JSON.parse(row.metadata_json)).toMatchObject({ enabled: true, hasApiKey: true });
  });
});

describe('AI progress summary gates', () => {
  it('refuses when the assistant is disabled', async () => {
    grantAiConsent();
    addMeasurements();
    await expect(new GenerateAiProgressSummaryUseCase(deps).execute({ patientId })).rejects.toThrow(
      /desactivado/,
    );
  });

  it('refuses without an accepted ai_processing consent', async () => {
    enableAi();
    addMeasurements();
    await expect(new GenerateAiProgressSummaryUseCase(deps).execute({ patientId })).rejects.toThrow(
      /consentimiento vigente/,
    );
  });

  it('refuses again once the consent is withdrawn', async () => {
    enableAi();
    addMeasurements();
    const consent = grantAiConsent();
    await expect(
      new GenerateAiProgressSummaryUseCase(deps).execute({ patientId }),
    ).resolves.toBeDefined();

    new WithdrawConsentUseCase({ ...deps, consents: deps.consents } as never).execute({
      consentId: consent.id,
    });
    await expect(new GenerateAiProgressSummaryUseCase(deps).execute({ patientId })).rejects.toThrow(
      /consentimiento vigente/,
    );
  });

  it('transmits de-identified data only: no name, file number, contact or dates', async () => {
    enableAi();
    grantAiConsent();
    addMeasurements();
    const result = await new GenerateAiProgressSummaryUseCase(deps).execute({ patientId });

    expect(result.summary).toBe('Evolución favorable.');
    expect(providerCalls).toHaveLength(1);
    const sent = providerCalls[0]!.userMessage;
    for (const identifier of [
      'Fernanda',
      'Ruiz',
      'fernanda@example.com',
      '5512345678',
      '2026-06-01',
    ]) {
      expect(sent).not.toContain(identifier);
    }
    // Values still reach the model, positioned by day offset.
    expect(sent).toContain('78.4');
    expect(sent).toContain('d30=76.1');
    expect(sent).toContain('41 años');
  });

  it('audits the call with cost metadata but no prompt or response content', async () => {
    enableAi();
    grantAiConsent();
    addMeasurements();
    await new GenerateAiProgressSummaryUseCase(deps).execute({ patientId });

    const row = db
      .prepare(
        `SELECT metadata_json, result FROM audit_events WHERE action = 'ai.summary.generate'`,
      )
      .get() as { metadata_json: string; result: string };
    expect(row.result).toBe('success');
    expect(JSON.parse(row.metadata_json)).toMatchObject({
      model: 'claude-sonnet-5',
      inputTokens: 11,
      outputTokens: 22,
    });
    expect(row.metadata_json).not.toContain('Evolución favorable');
    expect(row.metadata_json).not.toContain('78.4');
  });

  it('audits a provider failure without losing the error', async () => {
    enableAi();
    grantAiConsent();
    addMeasurements();
    deps.createProvider = () => ({
      id: 'boom',
      complete: vi.fn().mockRejectedValue(new Error('network down')),
    });
    await expect(
      new GenerateAiProgressSummaryUseCase(deps).execute({ patientId }),
    ).rejects.toThrow();

    const row = db
      .prepare(
        `SELECT result FROM audit_events WHERE action = 'ai.summary.generate' ORDER BY occurred_at DESC`,
      )
      .get() as { result: string };
    expect(row.result).toBe('failure');
  });

  it('refuses when the patient has no measurements to summarize', async () => {
    enableAi();
    grantAiConsent();
    await expect(new GenerateAiProgressSummaryUseCase(deps).execute({ patientId })).rejects.toThrow(
      /No hay mediciones/,
    );
  });
});
