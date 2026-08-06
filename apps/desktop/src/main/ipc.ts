import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import {
  generateCoachReportPdf,
  generateMealPlanPdf,
  generateProgressReportPdf,
  type CoachReportInput,
  type PlanPdfPhoto,
} from '@ajnutrition/reporting';
import path from 'node:path';
import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ZodError, type ZodType } from 'zod';
import {
  AppError,
  IPC_CHANNELS,
  AddHistoryEntryCommandSchema,
  AddPhotoCommandSchema,
  ActivateLicenseCommandSchema,
  AmendConsultationCommandSchema,
  SaveNoteTemplateCommandSchema,
  DeleteNoteTemplateCommandSchema,
  CreateBackupCommandSchema,
  CreateConsultationCommandSchema,
  UpdateConsultationCommandSchema,
  CreateAppointmentCommandSchema,
  RescheduleAppointmentCommandSchema,
  ResolveAppointmentCommandSchema,
  ListAgendaQuerySchema,
  RecordLabResultsCommandSchema,
  ListLabResultsQuerySchema,
  RecordAdherenceCommandSchema,
  ListAdherenceQuerySchema,
  SaveAiSettingsCommandSchema,
  SaveAppSettingsCommandSchema,
  GenerateProgressSummaryCommandSchema,
  AddFoodServingCommandSchema,
  DeleteFoodServingCommandSchema,
  AddPlanItemCommandSchema,
  CreateFoodCommandSchema,
  UpdateFoodCommandSchema,
  SetFoodAllergensCommandSchema,
  SetFoodStatusCommandSchema,
  SetFoodEquivalenceCommandSchema,
  DeleteFoodEquivalenceCommandSchema,
  SetRecipeStatusCommandSchema,
  CreateMealPlanCommandSchema,
  CreateRecipeCommandSchema,
  UpdateRecipeCommandSchema,
  CreateMeasurementCommandSchema,
  CreatePatientCommandSchema,
  UpdatePatientCommandSchema,
  SetPatientStatusCommandSchema,
  DeletePhotoCommandSchema,
  EmptyCommandSchema,
  ExportPatientCommandSchema,
  ExportProgressReportCommandSchema,
  ExportPlanPdfCommandSchema,
  SetPlanStatusCommandSchema,
  CopyPlanDayCommandSchema,
  DuplicateMealPlanCommandSchema,
  SetMealDistributionCommandSchema,
  SetEquivalentTargetsCommandSchema,
  ListPlanVersionsQuerySchema,
  ShoppingListQuerySchema,
  SuggestSubstitutesQuerySchema,
  ReplacePlanItemCommandSchema,
  GetMealPlanQuerySchema,
  GetPatientQuerySchema,
  GetPhotoQuerySchema,
  ListConsentsQuerySchema,
  ListConsultationsQuerySchema,
  ListHistoryQuerySchema,
  ListMealPlansQuerySchema,
  ListMeasurementsQuerySchema,
  ListPatientsQuerySchema,
  ListPhotosQuerySchema,
  MAX_PHOTO_BYTES,
  SearchFoodsQuerySchema,
  SearchRecipesQuerySchema,
  SaveProfileCommandSchema,
  CreateCoachCommandSchema,
  UpdateCoachCommandSchema,
  SetCoachStatusCommandSchema,
  ListCoachesQuerySchema,
  GetCoachQuerySchema,
  LinkPatientToCoachCommandSchema,
  RevokeCoachLinkCommandSchema,
  GetPatientCoachQuerySchema,
  ExportCoachReportCommandSchema,
  ExportCoachPackCommandSchema,
  GrantCoachShareCommandSchema,
  RevokeCoachShareCommandSchema,
  ListCoachSharesQuerySchema,
  RecordConsentCommandSchema,
  RemovePlanItemCommandSchema,
  RecoveryUnlockCommandSchema,
  RestoreBackupCommandSchema,
  SetupCommandSchema,
  SignConsultationCommandSchema,
  UnlockCommandSchema,
  WithdrawConsentCommandSchema,
  type CoachReportDataDto,
  type IpcResult,
  type MeasurementSessionDto,
  type PreviewBackupResultDto,
  type SerializedAppError,
} from '@ajnutrition/shared';
import type { AppContainer } from './container';
import type { AuthManager } from './auth-manager';
import { toLicenseStatusDto, type LicenseManager } from './license-manager';
import { isGatedWrite } from './license-gate';
import type { Logger } from './logging/logger';

/**
 * IPC boundary rules (docs/architecture/overview.md §IPC):
 *  - every payload re-validated with Zod (the renderer is untrusted)
 *  - only frames we created may invoke handlers
 *  - handlers resolve to IpcResult envelopes; raw rejections never cross
 *  - privileged (patient) handlers require the unlocked state — the
 *    AuthManager throws AUTHORIZATION while locked
 *  - failures are audited when the DB is available (unlocked); auth failures
 *    while locked are throttled+counted instead (ADR-0010)
 */

/**
 * Renders a coach report from data the application layer has already filtered
 * by scope. Photo BYTES are fetched here (they never cross IPC), but only for
 * the ids the grant allowed — this function cannot widen the set.
 */
async function renderCoachReport(
  container: AppContainer,
  data: CoachReportDataDto,
  today: string,
): Promise<Uint8Array> {
  const profileRecord = container.profileRepo.get();
  const photos = data.photos.map((meta) => {
    const file = container.useCases.getPhotoData.execute({ photoId: meta.id });
    return {
      kindLabel: meta.kind,
      capturedAt: meta.capturedAt,
      bytes: file.bytes,
      mime: file.mimeType === 'image/png' ? ('image/png' as const) : ('image/jpeg' as const),
    };
  });
  const input: CoachReportInput = {
    practitioner: profileRecord
      ? {
          fullName: profileRecord.fullName,
          title: profileRecord.title,
          license: profileRecord.license,
          phone: profileRecord.phone,
          email: profileRecord.email,
          address: profileRecord.address,
          logo: null,
        }
      : null,
    patientName: data.patientName,
    patientFileNumber: data.patientFileNumber,
    authorisation: {
      coachName: data.coachName,
      consentNoticeVersion: data.consentNoticeVersion,
      consentDecidedAt: data.consentDecidedAt,
      scopeLabels: data.scopeLabels,
    },
    metrics: data.metrics,
    planTargets: data.planTargets,
    adherence: data.adherence,
    photos,
    sessionCount: data.sessionCount,
    generatedAt: today,
    appVersion: app.getVersion(),
  };
  return generateCoachReportPdf(input);
}

function isTrustedSender(event: IpcMainInvokeEvent, devServerUrl: string | undefined): boolean {
  const frameUrl = event.senderFrame?.url ?? '';
  if (devServerUrl !== undefined && frameUrl.startsWith(devServerUrl)) return true;
  return frameUrl.startsWith('file://');
}

function serializeError(err: unknown): SerializedAppError {
  if (err instanceof AppError) return err.serialize();
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return new AppError({
      code: 'VALIDATION',
      message: 'Los datos enviados no son válidos.',
      fieldErrors,
    }).serialize();
  }
  // Unknown failure: never leak internals to the renderer.
  return new AppError({
    code: 'UNEXPECTED',
    message: 'Ocurrió un error inesperado. Consulte el registro local con el código de soporte.',
    internalDetail: err instanceof Error ? err.message : String(err),
  }).serialize();
}

/**
 * What the patient report shows, in this order. Only measured values and
 * device readings — nothing derived here, so a formula change can never
 * rewrite a report already handed over.
 */
const PROGRESS_METRICS: ReadonlyArray<{
  label: string;
  decimals: number;
  read: (session: MeasurementSessionDto) => number | null;
}> = [
  { label: 'Peso (kg)', decimals: 1, read: (s) => s.weightKg },
  { label: 'Cintura (cm)', decimals: 1, read: (s) => s.waistCm },
  { label: 'Cadera (cm)', decimals: 1, read: (s) => s.hipCm },
  { label: 'Grasa corporal (%)', decimals: 1, read: (s) => s.bodyFatPercent },
  { label: 'Masa muscular esquelética (kg)', decimals: 1, read: (s) => s.skeletalMuscleMassKg },
  { label: 'Masa grasa (kg)', decimals: 1, read: (s) => s.fatMassKg },
];

export function registerIpcHandlers(
  auth: AuthManager,
  devServerUrl: string | undefined,
  logger: Logger,
  license: LicenseManager,
): void {
  function handle<TInput, TOutput>(
    channel: string,
    schema: ZodType<TInput>,
    action: string,
    run: (input: TInput) => TOutput | Promise<TOutput>,
  ): void {
    ipcMain.handle(channel, async (event, rawInput): Promise<IpcResult<TOutput>> => {
      if (!isTrustedSender(event, devServerUrl)) {
        if (auth.isUnlocked()) {
          auth.getContainer().audit.record({
            action,
            entityType: 'ipc',
            entityId: null,
            result: 'denied',
            metadata: { channel },
          });
        }
        logger.warn('ipc', 'sender.denied', { channel });
        return {
          ok: false,
          error: new AppError({ code: 'AUTHORIZATION', message: 'Acceso denegado.' }).serialize(),
        };
      }
      // Subscription write-gate (docs/product/subscription.md §3). ONE choke
      // point, before validation and before any use case runs. Reads, exports,
      // backups and unlocking are never routed through here — see
      // license-gate.ts, where the classification is exhaustive by type.
      if (isGatedWrite(channel) && !license.canWrite()) {
        try {
          if (auth.isUnlocked()) {
            auth.getContainer().audit.record({
              action,
              entityType: 'ipc',
              entityId: null,
              result: 'denied',
              metadata: { channel, reason: 'license' },
            });
          }
        } catch {
          // Auditing must never be the reason a refusal turns into a crash.
        }
        logger.warn('license', 'write.blocked', { channel });
        return {
          ok: false,
          error: new AppError({
            code: 'LICENSE',
            message:
              'Su suscripción venció. Puede consultar, exportar e imprimir todo, pero no guardar cambios nuevos. Active una licencia en Ajustes.',
          }).serialize(),
        };
      }
      try {
        const input = schema.parse(rawInput);
        return { ok: true, data: await run(input) };
      } catch (err) {
        const serialized = serializeError(err);
        try {
          if (auth.isUnlocked()) {
            auth.getContainer().audit.record({
              action,
              entityType: 'ipc',
              entityId: null,
              result: 'failure',
              metadata: { channel, code: serialized.code, supportCode: serialized.supportCode },
            });
          }
        } catch {
          // Audit writing must never mask the original failure.
        }
        // Redacted technical detail lands in the local log, correlated to the
        // user-facing message by supportCode.
        logger.error('ipc', `${action}.failed`, err, { channel });
        return { ok: false, error: serialized };
      }
    });
  }

  // --- Authentication ---
  handle(IPC_CHANNELS.authGetStatus, EmptyCommandSchema, 'auth.status', () => auth.getStatus());
  handle(IPC_CHANNELS.authSetup, SetupCommandSchema, 'auth.setup', (command) =>
    auth.setup(command.passphrase),
  );
  handle(IPC_CHANNELS.authUnlock, UnlockCommandSchema, 'auth.unlock', (command) => {
    auth.unlock(command.passphrase);
    return auth.getStatus();
  });
  handle(
    IPC_CHANNELS.authRecoveryUnlock,
    RecoveryUnlockCommandSchema,
    'auth.recovery-unlock',
    (command) => auth.unlockWithRecovery(command.recoveryKey, command.newPassphrase),
  );
  handle(IPC_CHANNELS.authLock, EmptyCommandSchema, 'auth.lock', () => {
    auth.lock('manual');
    return auth.getStatus();
  });

  // --- Licence (S-1) ---
  // Readable while locked, deliberately: the status belongs on the lock screen
  // so "read-only" is never a surprise discovered after typing a passphrase.
  // `status()` stamps the device id on first run, so read it afterwards.
  const licenseDto = (status = license.status()) =>
    toLicenseStatusDto(status, license.enforced, license.ensureDeviceId());

  handle(IPC_CHANNELS.licenseGetStatus, EmptyCommandSchema, 'license.status', () => licenseDto());
  handle(
    IPC_CHANNELS.licenseActivate,
    ActivateLicenseCommandSchema,
    'license.activate',
    (command) => licenseDto(license.activate(command.token)),
  );
  handle(IPC_CHANNELS.licenseLoadFile, EmptyCommandSchema, 'license.load-file', async () => {
    // The renderer never names a path: it asks for the dialog, main owns the
    // filesystem. Same rule as backups and the practitioner's logo.
    const chosen = await dialog.showOpenDialog({
      title: 'Abrir archivo de licencia',
      properties: ['openFile'],
      filters: [{ name: 'Licencia NutriPlan', extensions: ['nplic', 'txt'] }],
    });
    const filePath = chosen.filePaths[0];
    if (chosen.canceled || filePath === undefined) {
      return { canceled: true, status: licenseDto() };
    }
    // Bounded read: a licence is ~300 bytes, so anything above 64 KB is not
    // one and must not be pulled into memory to find that out.
    const stat = statSync(filePath);
    if (stat.size > 64 * 1024) {
      throw new AppError({
        code: 'LICENSE',
        message: 'Ese archivo no es una licencia de NutriPlan.',
        internalDetail: `licence file too large: ${stat.size} bytes`,
      });
    }
    return {
      canceled: false,
      status: licenseDto(license.activate(readFileSync(filePath, 'utf8'))),
    };
  });

  // --- Backups ---
  // The renderer never sees file paths. Preview stores the chosen path against
  // a single-use token; restore consumes the token. The map is bounded and
  // per-process — a stale token simply fails with NOT_FOUND.
  const previewedBackups = new Map<string, string>();

  handle(IPC_CHANNELS.backupCreate, CreateBackupCommandSchema, 'backup.create', async (command) => {
    // Requires unlocked before showing any dialog.
    auth.getContainer();
    const chosen = await dialog.showSaveDialog({
      title: 'Guardar respaldo cifrado',
      defaultPath: auth.suggestedBackupFileName(),
      filters: [{ name: 'Respaldo NutriPlan', extensions: ['ajnbackup'] }],
    });
    if (chosen.canceled || !chosen.filePath) {
      return { canceled: true, fileName: null, sizeBytes: null, createdAt: null };
    }
    const result = auth.createBackup(chosen.filePath, command.description?.trim() || null);
    return {
      canceled: false,
      fileName: result.fileName,
      sizeBytes: result.sizeBytes,
      createdAt: result.createdAt,
    };
  });

  handle(
    IPC_CHANNELS.backupPreview,
    EmptyCommandSchema,
    'backup.preview',
    async (): Promise<PreviewBackupResultDto> => {
      const chosen = await dialog.showOpenDialog({
        title: 'Seleccionar respaldo para restaurar',
        properties: ['openFile'],
        filters: [{ name: 'Respaldo NutriPlan', extensions: ['ajnbackup'] }],
      });
      const filePath = chosen.filePaths[0];
      if (chosen.canceled || filePath === undefined) {
        return {
          canceled: true,
          token: null,
          fileName: null,
          createdAt: null,
          appVersion: null,
          schemaVersion: null,
          description: null,
          sizeBytes: null,
        };
      }
      const preview = auth.previewBackup(filePath);
      const token = randomUUID();
      if (previewedBackups.size >= 5) previewedBackups.clear();
      previewedBackups.set(token, filePath);
      return {
        canceled: false,
        token,
        fileName: filePath.split(/[\\/]/).at(-1) ?? 'respaldo.ajnbackup',
        createdAt: preview.createdAt,
        appVersion: preview.appVersion,
        schemaVersion: preview.schemaVersion,
        description: preview.description,
        sizeBytes: preview.sizeBytes,
      };
    },
  );

  handle(IPC_CHANNELS.backupRestore, RestoreBackupCommandSchema, 'backup.restore', (command) => {
    const filePath = previewedBackups.get(command.token);
    if (filePath === undefined) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La vista previa del respaldo expiró. Seleccione el archivo nuevamente.',
      });
    }
    previewedBackups.delete(command.token);
    return auth.restoreBackup(filePath, command.passphrase);
  });

  // --- Patients (require unlocked state via getContainer) ---
  handle(IPC_CHANNELS.patientCreate, CreatePatientCommandSchema, 'patient.create', (command) =>
    auth.getContainer().useCases.createPatient.execute(command),
  );
  handle(IPC_CHANNELS.patientUpdate, UpdatePatientCommandSchema, 'patient.update', (command) =>
    auth.getContainer().useCases.updatePatient.execute(command),
  );
  handle(
    IPC_CHANNELS.patientSetStatus,
    SetPatientStatusCommandSchema,
    'patient.set-status',
    (command) => auth.getContainer().useCases.setPatientStatus.execute(command),
  );
  handle(IPC_CHANNELS.patientList, ListPatientsQuerySchema, 'patient.list', (query) =>
    auth.getContainer().useCases.listPatients.execute(query),
  );
  handle(IPC_CHANNELS.patientGet, GetPatientQuerySchema, 'patient.get', (query) =>
    auth.getContainer().useCases.getPatient.execute(query),
  );

  handle(
    IPC_CHANNELS.patientExport,
    ExportPatientCommandSchema,
    'patient.export',
    async (command) => {
      // Build the document first: NOT_FOUND surfaces before any dialog opens,
      // and the audit event only exists once the export truly happened — so the
      // document is built again after the user confirms a destination.
      const container = auth.getContainer();
      const patient = container.useCases.getPatient.execute({ patientId: command.patientId });
      const today = new Date().toISOString().slice(0, 10);
      const chosen = await dialog.showSaveDialog({
        title: 'Exportar expediente del paciente',
        defaultPath: `NutriPlan_Paciente_${patient.fileNumber}_${today}.json`,
        filters: [{ name: 'Expediente NutriPlan (JSON)', extensions: ['json'] }],
      });
      if (chosen.canceled || !chosen.filePath) {
        return { canceled: true, fileName: null, sizeBytes: null };
      }
      const documentJson = `${JSON.stringify(
        container.useCases.exportPatient.execute(command),
        null,
        2,
      )}\n`;
      writeFileSync(chosen.filePath, documentJson, { encoding: 'utf8', mode: 0o600 });
      return {
        canceled: false,
        fileName: path.basename(chosen.filePath),
        sizeBytes: Buffer.byteLength(documentJson, 'utf8'),
      };
    },
  );

  // --- Consultations (require unlocked state) ---
  handle(
    IPC_CHANNELS.consultationCreate,
    CreateConsultationCommandSchema,
    'consultation.create',
    (command) => auth.getContainer().useCases.createConsultation.execute(command),
  );
  handle(
    IPC_CHANNELS.consultationList,
    ListConsultationsQuerySchema,
    'consultation.list',
    (query) => auth.getContainer().useCases.listConsultations.execute(query),
  );
  handle(
    IPC_CHANNELS.consultationUpdate,
    UpdateConsultationCommandSchema,
    'consultation.update',
    (command) => auth.getContainer().useCases.updateConsultation.execute(command),
  );
  handle(
    IPC_CHANNELS.appointmentCreate,
    CreateAppointmentCommandSchema,
    'appointment.create',
    (command) => auth.getContainer().useCases.createAppointment.execute(command),
  );
  handle(
    IPC_CHANNELS.appointmentReschedule,
    RescheduleAppointmentCommandSchema,
    'appointment.reschedule',
    (command) => auth.getContainer().useCases.rescheduleAppointment.execute(command),
  );
  handle(
    IPC_CHANNELS.appointmentResolve,
    ResolveAppointmentCommandSchema,
    'appointment.resolve',
    (command) => auth.getContainer().useCases.resolveAppointment.execute(command),
  );
  handle(IPC_CHANNELS.appointmentAgenda, ListAgendaQuerySchema, 'appointment.agenda', (query) =>
    auth.getContainer().useCases.listAgenda.execute(query),
  );
  handle(IPC_CHANNELS.labRecord, RecordLabResultsCommandSchema, 'lab.record', (command) =>
    auth.getContainer().useCases.recordLabResults.execute(command),
  );
  handle(IPC_CHANNELS.labList, ListLabResultsQuerySchema, 'lab.list', (query) =>
    auth.getContainer().useCases.listLabResults.execute(query),
  );
  handle(
    IPC_CHANNELS.adherenceRecord,
    RecordAdherenceCommandSchema,
    'adherence.record',
    (command) => auth.getContainer().useCases.recordAdherence.execute(command),
  );
  handle(IPC_CHANNELS.adherenceList, ListAdherenceQuerySchema, 'adherence.list', (query) =>
    auth.getContainer().useCases.listAdherence.execute(query),
  );

  // --- AI assistance (requires unlocked state; each use case enforces its own
  // gates: AI enabled + API key stored, and ai_processing consent per patient)
  handle(IPC_CHANNELS.appSettingsGet, EmptyCommandSchema, 'settings.get', () =>
    auth.getContainer().useCases.getAppSettings.execute(),
  );
  handle(IPC_CHANNELS.appSettingsSave, SaveAppSettingsCommandSchema, 'settings.save', (command) =>
    auth.getContainer().useCases.saveAppSettings.execute(command),
  );
  // The renderer proposes no path: it only asks main to open the dialog. The
  // practitioner's own selection is the only value that ever reaches the DB.
  handle(
    IPC_CHANNELS.appSettingsChooseBackupFolder,
    EmptyCommandSchema,
    'settings.backup-folder',
    async () => {
      const useCases = auth.getContainer().useCases;
      const chosen = await dialog.showOpenDialog({
        title: 'Carpeta para respaldos automáticos',
        properties: ['openDirectory', 'createDirectory'],
      });
      const folder = chosen.canceled ? undefined : chosen.filePaths[0];
      if (folder === undefined) {
        return { canceled: true, settings: useCases.getAppSettings.execute() };
      }
      return { canceled: false, settings: useCases.setAutoBackupFolder.execute(folder) };
    },
  );
  handle(IPC_CHANNELS.aiSettingsGet, EmptyCommandSchema, 'ai.settings.get', () =>
    auth.getContainer().useCases.getAiSettings.execute(),
  );
  handle(IPC_CHANNELS.aiSettingsSave, SaveAiSettingsCommandSchema, 'ai.settings.save', (command) =>
    auth.getContainer().useCases.saveAiSettings.execute(command),
  );
  handle(
    IPC_CHANNELS.aiProgressSummary,
    GenerateProgressSummaryCommandSchema,
    'ai.progress-summary',
    (command) => auth.getContainer().useCases.generateAiProgressSummary.execute(command),
  );
  handle(
    IPC_CHANNELS.consultationSign,
    SignConsultationCommandSchema,
    'consultation.sign',
    (command) => auth.getContainer().useCases.signConsultation.execute(command),
  );
  handle(
    IPC_CHANNELS.consultationAmend,
    AmendConsultationCommandSchema,
    'consultation.amend',
    (command) => auth.getContainer().useCases.amendConsultation.execute(command),
  );

  handle(IPC_CHANNELS.noteTemplateList, EmptyCommandSchema, 'note-template.list', () =>
    auth.getContainer().useCases.listNoteTemplates.execute(),
  );
  handle(
    IPC_CHANNELS.noteTemplateSave,
    SaveNoteTemplateCommandSchema,
    'note-template.save',
    (command) => auth.getContainer().useCases.saveNoteTemplate.execute(command),
  );
  handle(
    IPC_CHANNELS.noteTemplateDelete,
    DeleteNoteTemplateCommandSchema,
    'note-template.delete',
    (command) => auth.getContainer().useCases.deleteNoteTemplate.execute(command),
  );

  // --- Clinical history (requires unlocked state) ---
  handle(IPC_CHANNELS.historyAdd, AddHistoryEntryCommandSchema, 'clinical-history.add', (command) =>
    auth.getContainer().useCases.addHistoryEntry.execute(command),
  );
  handle(IPC_CHANNELS.historyList, ListHistoryQuerySchema, 'clinical-history.list', (query) =>
    auth.getContainer().useCases.listHistory.execute(query),
  );

  // --- Consents (requires unlocked state) ---
  handle(IPC_CHANNELS.consentRecord, RecordConsentCommandSchema, 'consent.record', (command) =>
    auth.getContainer().useCases.recordConsent.execute(command),
  );
  handle(
    IPC_CHANNELS.consentWithdraw,
    WithdrawConsentCommandSchema,
    'consent.withdraw',
    (command) => auth.getContainer().useCases.withdrawConsent.execute(command),
  );
  handle(IPC_CHANNELS.consentList, ListConsentsQuerySchema, 'consent.list', (query) =>
    auth.getContainer().useCases.listConsents.execute(query),
  );

  // --- Coaches and referrals (requires unlocked state) ---
  // Record-keeping only: no handler here sends anything anywhere, and none
  // returns a measurement, plan or note. Sharing with a trainer needs an
  // express third_party_transfer consent (docs/product/coach-sharing.md, C-2).
  handle(IPC_CHANNELS.coachCreate, CreateCoachCommandSchema, 'coach.create', (command) =>
    auth.getContainer().useCases.createCoach.execute(command),
  );
  handle(IPC_CHANNELS.coachUpdate, UpdateCoachCommandSchema, 'coach.update', (command) =>
    auth.getContainer().useCases.updateCoach.execute(command),
  );
  handle(IPC_CHANNELS.coachSetStatus, SetCoachStatusCommandSchema, 'coach.set-status', (command) =>
    auth.getContainer().useCases.setCoachStatus.execute(command),
  );
  handle(IPC_CHANNELS.coachList, ListCoachesQuerySchema, 'coach.list', (query) =>
    auth.getContainer().useCases.listCoaches.execute(query),
  );
  handle(IPC_CHANNELS.coachGet, GetCoachQuerySchema, 'coach.get', (query) =>
    auth.getContainer().useCases.getCoach.execute(query),
  );
  handle(IPC_CHANNELS.coachLink, LinkPatientToCoachCommandSchema, 'coach.link', (command) =>
    auth.getContainer().useCases.linkPatientToCoach.execute(command),
  );
  handle(IPC_CHANNELS.coachUnlink, RevokeCoachLinkCommandSchema, 'coach.unlink', (command) =>
    auth.getContainer().useCases.revokeCoachLink.execute(command),
  );
  handle(IPC_CHANNELS.coachForPatient, GetPatientCoachQuerySchema, 'coach.for-patient', (query) =>
    auth.getContainer().useCases.getPatientCoach.execute(query),
  );

  // Sharing with a coach. The consent checks live in the use case, not here:
  // a validated payload proves the shape, never the authority.
  handle(
    IPC_CHANNELS.coachShareGrant,
    GrantCoachShareCommandSchema,
    'coach.share.grant',
    (command) => auth.getContainer().useCases.grantCoachShare.execute(command),
  );
  handle(
    IPC_CHANNELS.coachShareRevoke,
    RevokeCoachShareCommandSchema,
    'coach.share.revoke',
    (command) => auth.getContainer().useCases.revokeCoachShare.execute(command),
  );
  handle(IPC_CHANNELS.coachSharing, ListCoachSharesQuerySchema, 'coach.sharing', (query) =>
    auth.getContainer().useCases.getPatientSharing.execute(query),
  );

  // The coach's copy. The use case refuses with AUTHORIZATION unless a grant
  // is effective AT THIS INSTANT, so a consent withdrawn a minute ago stops
  // the document being produced at all — there is no cached permission here.
  handle(
    IPC_CHANNELS.coachReport,
    ExportCoachReportCommandSchema,
    'coach.report',
    async (command) => {
      const container = auth.getContainer();
      const data = container.useCases.buildCoachReport.execute(command);
      const today = new Date().toISOString().slice(0, 10);
      const chosen = await dialog.showSaveDialog({
        title: 'Exportar reporte para el entrenador',
        defaultPath: `Entrenador_${data.patientFileNumber}_${today}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (chosen.canceled || !chosen.filePath) {
        return { canceled: true, fileName: null, sizeBytes: null };
      }
      const bytes = await renderCoachReport(container, data, today);
      writeFileSync(chosen.filePath, bytes);
      container.audit.record({
        action: 'coach.report.export',
        entityType: 'patient',
        entityId: data.patientId,
        result: 'success',
        // Who received it, and which categories it covered. Without the coach
        // id this entry cannot answer "who has seen my data?" — an ARCO right,
        // and the reason this trail exists at all. Categories, never values.
        metadata: {
          coachId: data.coachId,
          measurements: data.scope.measurements,
          bodyComposition: data.scope.bodyComposition,
          planTargets: data.scope.planTargets,
          adherence: data.scope.adherence,
          photos: data.scope.photos,
          metricCount: data.metrics.length,
          photoCount: data.photos.length,
        },
      });
      return {
        canceled: false,
        fileName: path.basename(chosen.filePath),
        sizeBytes: bytes.byteLength,
      };
    },
  );

  handle(IPC_CHANNELS.coachPack, ExportCoachPackCommandSchema, 'coach.pack', async (command) => {
    const container = auth.getContainer();
    const pack = container.useCases.buildCoachPack.execute(command);
    const today = new Date().toISOString().slice(0, 10);
    const chosen = await dialog.showOpenDialog({
      title: 'Elegir carpeta para los reportes',
      properties: ['openDirectory', 'createDirectory'],
    });
    const folder = chosen.filePaths[0];
    if (chosen.canceled || folder === undefined) {
      return { canceled: true, folderName: null, written: [], skipped: pack.skipped };
    }
    const written: string[] = [];
    for (const data of pack.reports) {
      const bytes = await renderCoachReport(container, data, today);
      // Names come from the app, never from the renderer: the only path that
      // crosses the boundary is the folder the practitioner picked herself.
      const fileName = `Entrenador_${data.patientFileNumber}_${today}.pdf`;
      writeFileSync(path.join(folder, fileName), bytes);
      written.push(fileName);
      // One entry PER PATIENT, not just the batch summary below. "Who has seen
      // my data?" is asked about a patient, and a batch that logged only its
      // own total would leave her record silent about the day her measurements
      // went to her trainer.
      container.audit.record({
        action: 'coach.report.export',
        entityType: 'patient',
        entityId: data.patientId,
        result: 'success',
        metadata: {
          coachId: data.coachId,
          viaPack: true,
          measurements: data.scope.measurements,
          bodyComposition: data.scope.bodyComposition,
          planTargets: data.scope.planTargets,
          adherence: data.scope.adherence,
          photos: data.scope.photos,
          metricCount: data.metrics.length,
          photoCount: data.photos.length,
        },
      });
    }
    container.audit.record({
      action: 'coach.pack.export',
      entityType: 'coach',
      entityId: command.coachId,
      result: 'success',
      // Counts only; who was skipped is shown to her, not stored in the log.
      metadata: { written: written.length, skipped: pack.skipped.length },
    });
    return {
      canceled: false,
      folderName: path.basename(folder),
      written,
      skipped: pack.skipped,
    };
  });

  // --- Patient photos (requires unlocked state + active photo consent) ---
  handle(IPC_CHANNELS.photoAdd, AddPhotoCommandSchema, 'photo.add', async (command) => {
    const container = auth.getContainer();
    const chosen = await dialog.showOpenDialog({
      title: 'Seleccionar fotografía',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes (JPEG/PNG)', extensions: ['jpg', 'jpeg', 'png'] }],
    });
    const filePath = chosen.filePaths[0];
    if (chosen.canceled || filePath === undefined) {
      return { canceled: true, photo: null };
    }
    // Cheap size gate BEFORE reading the file into memory; the domain layer
    // re-validates size and content (magic bytes) afterwards.
    if (statSync(filePath).size > MAX_PHOTO_BYTES) {
      throw new AppError({
        code: 'VALIDATION',
        message: 'La imagen supera el límite de 10 MB.',
      });
    }
    const bytes = readFileSync(filePath);
    const photo = container.useCases.addPhoto.execute({
      patientId: command.patientId,
      kind: command.kind,
      capturedAt: command.capturedAt,
      originalFileName: filePath.split(/[\\/]/).at(-1) ?? 'imagen',
      bytes,
      consultationId: command.consultationId,
    });
    return { canceled: false, photo };
  });

  handle(IPC_CHANNELS.photoList, ListPhotosQuerySchema, 'photo.list', (query) =>
    auth.getContainer().useCases.listPhotos.execute(query),
  );

  handle(IPC_CHANNELS.photoGet, GetPhotoQuerySchema, 'photo.get', (query) => {
    const { mimeType, bytes } = auth.getContainer().useCases.getPhotoData.execute(query);
    return { dataUrl: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}` };
  });

  handle(IPC_CHANNELS.photoDelete, DeletePhotoCommandSchema, 'photo.delete', (command) => {
    auth.getContainer().useCases.deletePhoto.execute(command);
    return { deleted: true };
  });

  // --- Anthropometric measurements (requires unlocked state) ---
  handle(
    IPC_CHANNELS.measurementCreate,
    CreateMeasurementCommandSchema,
    'measurement.create',
    (command) => auth.getContainer().useCases.createMeasurement.execute(command),
  );
  handle(IPC_CHANNELS.measurementList, ListMeasurementsQuerySchema, 'measurement.list', (query) =>
    auth.getContainer().useCases.listMeasurements.execute(query),
  );

  // --- Foods (requires unlocked state) ---
  handle(IPC_CHANNELS.foodCreate, CreateFoodCommandSchema, 'food.create', (command) =>
    auth.getContainer().useCases.createFood.execute(command),
  );
  handle(IPC_CHANNELS.foodUpdate, UpdateFoodCommandSchema, 'food.update', (command) =>
    auth.getContainer().useCases.updateFood.execute(command),
  );
  handle(
    IPC_CHANNELS.foodSetAllergens,
    SetFoodAllergensCommandSchema,
    'food.set-allergens',
    (command) => auth.getContainer().useCases.setFoodAllergens.execute(command),
  );
  handle(IPC_CHANNELS.foodSetStatus, SetFoodStatusCommandSchema, 'food.set-status', (command) =>
    auth.getContainer().useCases.setFoodStatus.execute(command),
  );
  handle(
    IPC_CHANNELS.foodSetEquivalence,
    SetFoodEquivalenceCommandSchema,
    'food.set-equivalence',
    (command) => auth.getContainer().useCases.setFoodEquivalence.execute(command),
  );
  handle(
    IPC_CHANNELS.foodDeleteEquivalence,
    DeleteFoodEquivalenceCommandSchema,
    'food.delete-equivalence',
    (command) => auth.getContainer().useCases.deleteFoodEquivalence.execute(command),
  );
  handle(
    IPC_CHANNELS.recipeSetStatus,
    SetRecipeStatusCommandSchema,
    'recipe.set-status',
    (command) => auth.getContainer().useCases.setRecipeStatus.execute(command),
  );
  handle(IPC_CHANNELS.foodImportCsv, EmptyCommandSchema, 'food.import-csv', async () => {
    const container = auth.getContainer();
    const chosen = await dialog.showOpenDialog({
      title: 'Importar alimentos desde CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    const filePath = chosen.filePaths[0];
    if (chosen.canceled || filePath === undefined) {
      return { canceled: true, imported: 0, skipped: [], skippedTotal: 0 };
    }
    if (statSync(filePath).size > 5 * 1024 * 1024) {
      throw new AppError({ code: 'VALIDATION', message: 'El CSV supera el límite de 5 MB.' });
    }
    const content = readFileSync(filePath, 'utf8');
    const result = container.useCases.importFoodsCsv.execute({ content });
    return { canceled: false, ...result };
  });
  handle(
    IPC_CHANNELS.foodImportEquivalences,
    EmptyCommandSchema,
    'food.import-equivalences',
    async () => {
      const container = auth.getContainer();
      const chosen = await dialog.showOpenDialog({
        title: 'Importar equivalentes (SMAE) desde CSV',
        properties: ['openFile'],
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      const filePath = chosen.filePaths[0];
      if (chosen.canceled || filePath === undefined) {
        return { canceled: true, imported: 0, skipped: [], skippedTotal: 0 };
      }
      if (statSync(filePath).size > 5 * 1024 * 1024) {
        throw new AppError({ code: 'VALIDATION', message: 'El CSV supera el límite de 5 MB.' });
      }
      const result = container.useCases.importEquivalencesCsv.execute({
        content: readFileSync(filePath, 'utf8'),
      });
      return { canceled: false, ...result };
    },
  );
  handle(IPC_CHANNELS.foodSearch, SearchFoodsQuerySchema, 'food.search', (query) =>
    auth.getContainer().useCases.searchFoods.execute(query),
  );
  handle(IPC_CHANNELS.foodServingAdd, AddFoodServingCommandSchema, 'food.serving-add', (command) =>
    auth.getContainer().useCases.addFoodServing.execute(command),
  );
  handle(
    IPC_CHANNELS.foodServingDelete,
    DeleteFoodServingCommandSchema,
    'food.serving-delete',
    (command) => auth.getContainer().useCases.deleteFoodServing.execute(command),
  );

  // --- Recipes (requires unlocked state) ---
  handle(IPC_CHANNELS.recipeCreate, CreateRecipeCommandSchema, 'recipe.create', (command) =>
    auth.getContainer().useCases.createRecipe.execute(command),
  );
  handle(IPC_CHANNELS.recipeUpdate, UpdateRecipeCommandSchema, 'recipe.update', (command) =>
    auth.getContainer().useCases.updateRecipe.execute(command),
  );
  handle(IPC_CHANNELS.recipeSearch, SearchRecipesQuerySchema, 'recipe.search', (query) =>
    auth.getContainer().useCases.searchRecipes.execute(query),
  );

  // --- Meal plans (requires unlocked state) ---
  handle(IPC_CHANNELS.planCreate, CreateMealPlanCommandSchema, 'meal-plan.create', (command) =>
    auth.getContainer().useCases.createMealPlan.execute(command),
  );
  handle(IPC_CHANNELS.planItemAdd, AddPlanItemCommandSchema, 'meal-plan.item-add', (command) =>
    auth.getContainer().useCases.addPlanItem.execute(command),
  );
  handle(
    IPC_CHANNELS.planItemRemove,
    RemovePlanItemCommandSchema,
    'meal-plan.item-remove',
    (command) => auth.getContainer().useCases.removePlanItem.execute(command),
  );
  handle(IPC_CHANNELS.planGet, GetMealPlanQuerySchema, 'meal-plan.get', (query) =>
    auth.getContainer().useCases.getMealPlan.execute(query),
  );
  handle(IPC_CHANNELS.planList, ListMealPlansQuerySchema, 'meal-plan.list', (query) =>
    auth.getContainer().useCases.listMealPlans.execute(query),
  );
  handle(
    IPC_CHANNELS.planSetStatus,
    SetPlanStatusCommandSchema,
    'meal-plan.set-status',
    (command) => auth.getContainer().useCases.setPlanStatus.execute(command),
  );
  handle(IPC_CHANNELS.planCopyDay, CopyPlanDayCommandSchema, 'meal-plan.day-copy', (command) =>
    auth.getContainer().useCases.copyPlanDay.execute(command),
  );
  handle(
    IPC_CHANNELS.planDuplicate,
    DuplicateMealPlanCommandSchema,
    'meal-plan.duplicate',
    (command) => auth.getContainer().useCases.duplicateMealPlan.execute(command),
  );
  handle(
    IPC_CHANNELS.planSetMealDistribution,
    SetMealDistributionCommandSchema,
    'meal-plan.meal-distribution',
    (command) => auth.getContainer().useCases.setMealDistribution.execute(command),
  );
  handle(
    IPC_CHANNELS.planSetEquivalentTargets,
    SetEquivalentTargetsCommandSchema,
    'meal-plan.equivalent-targets',
    (command) => auth.getContainer().useCases.setEquivalentTargets.execute(command),
  );
  handle(IPC_CHANNELS.planVersions, ListPlanVersionsQuerySchema, 'meal-plan.versions', (query) =>
    auth.getContainer().useCases.listPlanVersions.execute(query),
  );
  handle(
    IPC_CHANNELS.planShoppingList,
    ShoppingListQuerySchema,
    'meal-plan.shopping-list',
    (query) => auth.getContainer().useCases.shoppingList.execute(query),
  );
  handle(
    IPC_CHANNELS.planSubstitutes,
    SuggestSubstitutesQuerySchema,
    'meal-plan.substitutes',
    (query) => auth.getContainer().useCases.suggestSubstitutes.execute(query),
  );
  handle(
    IPC_CHANNELS.planReplaceItem,
    ReplacePlanItemCommandSchema,
    'meal-plan.item-replace',
    (command) => auth.getContainer().useCases.replacePlanItem.execute(command),
  );

  const SLOT_LABELS: Record<string, string> = {
    breakfast: 'Desayuno',
    snack1: 'Colación matutina',
    lunch: 'Comida',
    snack2: 'Colación vespertina',
    dinner: 'Cena',
  };
  const KIND_LABELS: Record<string, string> = {
    front: 'Frente',
    side_left: 'Lateral izquierdo',
    side_right: 'Lateral derecho',
    back: 'Espalda',
  };

  handle(
    IPC_CHANNELS.planExportPdf,
    ExportPlanPdfCommandSchema,
    'meal-plan.export-pdf',
    async (command) => {
      const container = auth.getContainer();
      const plan = container.useCases.getMealPlan.execute({ planId: command.planId });
      const patient = container.useCases.getPatient.execute({ patientId: plan.patientId });

      const photos: PlanPdfPhoto[] = [];
      if (command.includePhotosDate !== null) {
        const patientPhotos = container.useCases.listPhotos
          .execute({ patientId: plan.patientId })
          .filter((photo) => photo.capturedAt === command.includePhotosDate);
        for (const photo of patientPhotos) {
          const data = container.useCases.getPhotoData.execute({ photoId: photo.id });
          photos.push({
            kindLabel: KIND_LABELS[photo.kind] ?? photo.kind,
            capturedAt: photo.capturedAt,
            bytes: data.bytes,
            mime: data.mimeType,
          });
        }
      }

      const profileRecord = container.profileRepo.get();
      const today = new Date().toISOString().slice(0, 10);
      const chosen = await dialog.showSaveDialog({
        title: 'Exportar plan en PDF',
        defaultPath: `Plan_${patient.fileNumber}_${today}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (chosen.canceled || !chosen.filePath) {
        return { canceled: true, fileName: null, sizeBytes: null };
      }

      const bytes = await generateMealPlanPdf({
        practitioner: profileRecord
          ? {
              fullName: profileRecord.fullName,
              title: profileRecord.title,
              license: profileRecord.license,
              phone: profileRecord.phone,
              email: profileRecord.email,
              address: profileRecord.address,
              logo:
                profileRecord.logoBase64 !== null && profileRecord.logoMime !== null
                  ? {
                      bytes: Buffer.from(profileRecord.logoBase64, 'base64'),
                      mime: profileRecord.logoMime,
                    }
                  : null,
            }
          : null,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientFileNumber: patient.fileNumber,
        plan,
        slotLabels: SLOT_LABELS,
        photos,
        generatedAt: today,
        appVersion: app.getVersion(),
      });
      writeFileSync(chosen.filePath, bytes, { mode: 0o600 });
      container.audit.record({
        action: 'meal-plan.export-pdf',
        entityType: 'meal-plan',
        entityId: plan.id,
        result: 'success',
        metadata: { photos: photos.length, sizeBytes: bytes.length },
      });
      return {
        canceled: false,
        fileName: path.basename(chosen.filePath),
        sizeBytes: bytes.length,
      };
    },
  );

  // Patient-facing progress report: measured values and their trend, no
  // notes and no interpretation. Every figure comes from a stored measurement.
  handle(
    IPC_CHANNELS.measurementFormulaDrift,
    EmptyCommandSchema,
    'measurement.formula-drift',
    () => auth.getContainer().useCases.listFormulaDrift.execute(),
  );
  handle(
    IPC_CHANNELS.measurementExportProgress,
    ExportProgressReportCommandSchema,
    'measurement.export-progress',
    async (command) => {
      const container = auth.getContainer();
      const patient = container.useCases.getPatient.execute({ patientId: command.patientId });
      const sessions = container.useCases.listMeasurements
        .execute({ patientId: command.patientId })
        .slice()
        .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

      const metrics = PROGRESS_METRICS.map(({ label, decimals, read }) => ({
        label,
        decimals,
        points: sessions
          .map((session) => ({ date: session.measuredAt, value: read(session) }))
          .filter((point): point is { date: string; value: number } => point.value !== null),
      })).filter((metric) => metric.points.length > 0);

      const today = new Date().toISOString().slice(0, 10);
      const chosen = await dialog.showSaveDialog({
        title: 'Exportar reporte de progreso',
        defaultPath: `Progreso_${patient.fileNumber}_${today}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (chosen.canceled || !chosen.filePath) {
        return { canceled: true, fileName: null, sizeBytes: null };
      }

      const profileRecord = container.profileRepo.get();
      const bytes = await generateProgressReportPdf({
        practitioner: profileRecord
          ? {
              fullName: profileRecord.fullName,
              title: profileRecord.title,
              license: profileRecord.license,
              phone: profileRecord.phone,
              email: profileRecord.email,
              address: profileRecord.address,
              logo: null,
            }
          : null,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientFileNumber: patient.fileNumber,
        metrics,
        sessions,
        generatedAt: today,
        appVersion: app.getVersion(),
      });
      writeFileSync(chosen.filePath, bytes, { mode: 0o600 });
      container.audit.record({
        action: 'measurement.export-progress',
        entityType: 'patient',
        entityId: patient.id,
        result: 'success',
        // Counts only: never the values themselves.
        metadata: { sessions: sessions.length, metrics: metrics.length },
      });
      return {
        canceled: false,
        fileName: path.basename(chosen.filePath),
        sizeBytes: bytes.length,
      };
    },
  );

  // --- Practitioner profile (requires unlocked state) ---
  handle(IPC_CHANNELS.profileGet, EmptyCommandSchema, 'profile.get', () =>
    auth.getContainer().useCases.getProfile.execute(),
  );
  handle(IPC_CHANNELS.profileSave, SaveProfileCommandSchema, 'profile.save', (command) =>
    auth.getContainer().useCases.saveProfile.execute(command),
  );
  handle(IPC_CHANNELS.profileSetLogo, EmptyCommandSchema, 'profile.set-logo', async () => {
    const container = auth.getContainer();
    const chosen = await dialog.showOpenDialog({
      title: 'Seleccionar logotipo',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes (JPEG/PNG)', extensions: ['jpg', 'jpeg', 'png'] }],
    });
    const filePath = chosen.filePaths[0];
    if (chosen.canceled || filePath === undefined) {
      return { canceled: true, profile: null };
    }
    const profile = container.useCases.setProfileLogo.execute(readFileSync(filePath));
    return { canceled: false, profile };
  });
}
