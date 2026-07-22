import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ZodError, type ZodType } from 'zod';
import {
  AppError,
  IPC_CHANNELS,
  CreatePatientCommandSchema,
  GetPatientQuerySchema,
  ListPatientsQuerySchema,
  type IpcResult,
  type SerializedAppError,
} from '@ajnutrition/shared';
import type { AppContainer } from './container';

/**
 * IPC boundary rules (docs/architecture/overview.md §IPC):
 *  - every payload re-validated with Zod (the renderer is untrusted)
 *  - only frames we created may invoke handlers
 *  - handlers resolve to IpcResult envelopes; raw rejections never cross
 *  - failures produce an audit event with sanitized metadata only
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
  container: AppContainer,
  devServerUrl: string | undefined,
): void {
  function handle<TInput, TOutput>(
    channel: string,
    schema: ZodType<TInput>,
    action: string,
    run: (input: TInput) => TOutput,
  ): void {
    ipcMain.handle(channel, (event, rawInput): IpcResult<TOutput> => {
      if (!isTrustedSender(event, devServerUrl)) {
        container.audit.record({
          action,
          entityType: 'ipc',
          entityId: null,
          result: 'denied',
          metadata: { channel },
        });
        return {
          ok: false,
          error: new AppError({ code: 'AUTHORIZATION', message: 'Acceso denegado.' }).serialize(),
        };
      }
      try {
        const input = schema.parse(rawInput);
        return { ok: true, data: run(input) };
      } catch (err) {
        const serialized = serializeError(err);
        try {
          container.audit.record({
            action,
            entityType: 'ipc',
            entityId: null,
            result: 'failure',
            metadata: { channel, code: serialized.code, supportCode: serialized.supportCode },
          });
        } catch {
          // Audit writing must never mask the original failure.
        }
        return { ok: false, error: serialized };
      }
    });
  }

  handle(IPC_CHANNELS.patientCreate, CreatePatientCommandSchema, 'patient.create', (command) =>
    container.useCases.createPatient.execute(command),
  );
  handle(IPC_CHANNELS.patientList, ListPatientsQuerySchema, 'patient.list', (query) =>
    container.useCases.listPatients.execute(query),
  );
  handle(IPC_CHANNELS.patientGet, GetPatientQuerySchema, 'patient.get', (query) =>
    container.useCases.getPatient.execute(query),
  );
}
