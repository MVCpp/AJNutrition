/**
 * Constant IPC channel registry. The preload bridge and main-process handlers
 * must both use these constants — never string literals — so the surface stays
 * auditable in one place.
 */
export const IPC_CHANNELS = {
  patientCreate: 'ajn:patient:create',
  patientList: 'ajn:patient:list',
  patientGet: 'ajn:patient:get',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
