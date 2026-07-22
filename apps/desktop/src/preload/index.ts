import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AjnApi } from '@ajnutrition/shared';

/**
 * The ONLY bridge between renderer and main. Exposes narrow business
 * capabilities; never ipcRenderer itself, never Node.js APIs.
 * Inputs are passed through opaquely — the main process re-validates
 * everything, so a compromised renderer gains nothing here.
 */
const api: AjnApi = {
  patient: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientCreate, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientGet, query),
  },
};

contextBridge.exposeInMainWorld('ajnutrition', api);
