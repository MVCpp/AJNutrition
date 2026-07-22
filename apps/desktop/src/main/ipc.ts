import { randomUUID } from 'node:crypto';
import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ZodError, type ZodType } from 'zod';
import {
  AppError,
  IPC_CHANNELS,
  CreateBackupCommandSchema,
  CreatePatientCommandSchema,
  EmptyCommandSchema,
  GetPatientQuerySchema,
  ListPatientsQuerySchema,
  RecoveryUnlockCommandSchema,
  RestoreBackupCommandSchema,
  SetupCommandSchema,
  UnlockCommandSchema,
  type IpcResult,
  type PreviewBackupResultDto,
  type SerializedAppError,
} from '@ajnutrition/shared';
import type { AuthManager } from './auth-manager';

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
}
