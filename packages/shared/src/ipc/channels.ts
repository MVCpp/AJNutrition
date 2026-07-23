/**
 * Constant IPC channel registry. The preload bridge and main-process handlers
 * must both use these constants — never string literals — so the surface stays
 * auditable in one place.
 */
export const IPC_CHANNELS = {
  authGetStatus: 'ajn:auth:get-status',
  authSetup: 'ajn:auth:setup',
  authUnlock: 'ajn:auth:unlock',
  authRecoveryUnlock: 'ajn:auth:recovery-unlock',
  authLock: 'ajn:auth:lock',
  backupCreate: 'ajn:backup:create',
  backupPreview: 'ajn:backup:preview',
  backupRestore: 'ajn:backup:restore',
  patientCreate: 'ajn:patient:create',
  patientList: 'ajn:patient:list',
  patientGet: 'ajn:patient:get',
  consultationCreate: 'ajn:consultation:create',
  consultationList: 'ajn:consultation:list',
  consultationSign: 'ajn:consultation:sign',
  consultationAmend: 'ajn:consultation:amend',
  historyAdd: 'ajn:history:add',
  historyList: 'ajn:history:list',
} as const;

/** Main → renderer push events (webContents.send). */
export const IPC_EVENTS = {
  authStatusChanged: 'ajn:auth:status-changed',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
