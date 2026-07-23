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
    export: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientExport, command),
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
  food: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodCreate, command),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.foodSearch, query),
    addServing: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodServingAdd, command),
  },
  recipe: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.recipeCreate, command),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.recipeSearch, query),
  },
  plan: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.planCreate, command),
    addItem: (command) => ipcRenderer.invoke(IPC_CHANNELS.planItemAdd, command),
    removeItem: (command) => ipcRenderer.invoke(IPC_CHANNELS.planItemRemove, command),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.planGet, query),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.planList, query),
    exportPdf: (command) => ipcRenderer.invoke(IPC_CHANNELS.planExportPdf, command),
  },
  profile: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.profileGet, {}),
    save: (command) => ipcRenderer.invoke(IPC_CHANNELS.profileSave, command),
    setLogo: () => ipcRenderer.invoke(IPC_CHANNELS.profileSetLogo, {}),
  },
  measurement: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.measurementCreate, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.measurementList, query),
  },
  photo: {
    add: (command) => ipcRenderer.invoke(IPC_CHANNELS.photoAdd, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.photoList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.photoGet, query),
    delete: (command) => ipcRenderer.invoke(IPC_CHANNELS.photoDelete, command),
  },
};

contextBridge.exposeInMainWorld('ajnutrition', api);
