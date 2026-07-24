import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { generateMealPlanPdf, type PlanPdfPhoto } from '@ajnutrition/reporting';
import path from 'node:path';
import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ZodError, type ZodType } from 'zod';
import {
  AppError,
  IPC_CHANNELS,
  AddHistoryEntryCommandSchema,
  AddPhotoCommandSchema,
  AmendConsultationCommandSchema,
  CreateBackupCommandSchema,
  CreateConsultationCommandSchema,
  AddFoodServingCommandSchema,
  AddPlanItemCommandSchema,
  CreateFoodCommandSchema,
  CreateMealPlanCommandSchema,
  CreateRecipeCommandSchema,
  CreateMeasurementCommandSchema,
  CreatePatientCommandSchema,
  DeletePhotoCommandSchema,
  EmptyCommandSchema,
  ExportPatientCommandSchema,
  ExportPlanPdfCommandSchema,
  SetPlanStatusCommandSchema,
  CopyPlanDayCommandSchema,
  ShoppingListQuerySchema,
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
  RecordConsentCommandSchema,
  RemovePlanItemCommandSchema,
  RecoveryUnlockCommandSchema,
  RestoreBackupCommandSchema,
  SetupCommandSchema,
  SignConsultationCommandSchema,
  UnlockCommandSchema,
  WithdrawConsentCommandSchema,
  type IpcResult,
  type PreviewBackupResultDto,
  type SerializedAppError,
} from '@ajnutrition/shared';
import type { AuthManager } from './auth-manager';
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

export function registerIpcHandlers(
  auth: AuthManager,
  devServerUrl: string | undefined,
  logger: Logger,
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
      filters: [{ name: 'Respaldo AJNutrition', extensions: ['ajnbackup'] }],
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
        filters: [{ name: 'Respaldo AJNutrition', extensions: ['ajnbackup'] }],
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
        defaultPath: `AJNutrition_Paciente_${patient.fileNumber}_${today}.json`,
        filters: [{ name: 'Expediente AJNutrition (JSON)', extensions: ['json'] }],
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
  handle(IPC_CHANNELS.foodSearch, SearchFoodsQuerySchema, 'food.search', (query) =>
    auth.getContainer().useCases.searchFoods.execute(query),
  );
  handle(IPC_CHANNELS.foodServingAdd, AddFoodServingCommandSchema, 'food.serving-add', (command) =>
    auth.getContainer().useCases.addFoodServing.execute(command),
  );

  // --- Recipes (requires unlocked state) ---
  handle(IPC_CHANNELS.recipeCreate, CreateRecipeCommandSchema, 'recipe.create', (command) =>
    auth.getContainer().useCases.createRecipe.execute(command),
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
    IPC_CHANNELS.planShoppingList,
    ShoppingListQuerySchema,
    'meal-plan.shopping-list',
    (query) => auth.getContainer().useCases.shoppingList.execute(query),
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
