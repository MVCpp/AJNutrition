import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type AjnApi, type AuthStatusDto } from '@ajnutrition/shared';

/**
 * The ONLY bridge between renderer and main. Exposes narrow business
 * capabilities; never ipcRenderer itself, never Node.js APIs.
 * Inputs are passed through opaquely — the main process re-validates
 * everything, so a compromised renderer gains nothing here.
 */
const api: AjnApi = {
  auth: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.authGetStatus, {}),
    setup: (command) => ipcRenderer.invoke(IPC_CHANNELS.authSetup, command),
    unlock: (command) => ipcRenderer.invoke(IPC_CHANNELS.authUnlock, command),
    unlockWithRecovery: (command) => ipcRenderer.invoke(IPC_CHANNELS.authRecoveryUnlock, command),
    lock: () => ipcRenderer.invoke(IPC_CHANNELS.authLock, {}),
    onStatusChanged: (listener) => {
      // The Electron event object never crosses the bridge — data only.
      const wrapped = (_event: unknown, status: AuthStatusDto) => listener(status);
      ipcRenderer.on(IPC_EVENTS.authStatusChanged, wrapped);
      return () => ipcRenderer.removeListener(IPC_EVENTS.authStatusChanged, wrapped);
    },
  },
  backup: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.backupCreate, command),
    preview: () => ipcRenderer.invoke(IPC_CHANNELS.backupPreview, {}),
    restore: (command) => ipcRenderer.invoke(IPC_CHANNELS.backupRestore, command),
  },
  patient: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientCreate, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientGet, query),
  },
  consultation: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationCreate, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.consultationList, query),
    sign: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationSign, command),
    amend: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationAmend, command),
  },
  history: {
    add: (command) => ipcRenderer.invoke(IPC_CHANNELS.historyAdd, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.historyList, query),
  },
  consent: {
    record: (command) => ipcRenderer.invoke(IPC_CHANNELS.consentRecord, command),
    withdraw: (command) => ipcRenderer.invoke(IPC_CHANNELS.consentWithdraw, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.consentList, query),
  },
};

contextBridge.exposeInMainWorld('ajnutrition', api);
