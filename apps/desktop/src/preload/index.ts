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
  license: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.licenseGetStatus, {}),
    activate: (command) => ipcRenderer.invoke(IPC_CHANNELS.licenseActivate, command),
    loadFromFile: () => ipcRenderer.invoke(IPC_CHANNELS.licenseLoadFile, {}),
  },
  backup: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.backupCreate, command),
    preview: () => ipcRenderer.invoke(IPC_CHANNELS.backupPreview, {}),
    restore: (command) => ipcRenderer.invoke(IPC_CHANNELS.backupRestore, command),
  },
  patient: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientCreate, command),
    update: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientUpdate, command),
    setStatus: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientSetStatus, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.patientGet, query),
    export: (command) => ipcRenderer.invoke(IPC_CHANNELS.patientExport, command),
  },
  adherence: {
    record: (command) => ipcRenderer.invoke(IPC_CHANNELS.adherenceRecord, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.adherenceList, query),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.appSettingsGet, {}),
    save: (command) => ipcRenderer.invoke(IPC_CHANNELS.appSettingsSave, command),
    chooseBackupFolder: () => ipcRenderer.invoke(IPC_CHANNELS.appSettingsChooseBackupFolder, {}),
  },
  ai: {
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.aiSettingsGet, {}),
    saveSettings: (command) => ipcRenderer.invoke(IPC_CHANNELS.aiSettingsSave, command),
    progressSummary: (command) => ipcRenderer.invoke(IPC_CHANNELS.aiProgressSummary, command),
  },
  lab: {
    record: (command) => ipcRenderer.invoke(IPC_CHANNELS.labRecord, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.labList, query),
  },
  appointment: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.appointmentCreate, command),
    reschedule: (command) => ipcRenderer.invoke(IPC_CHANNELS.appointmentReschedule, command),
    resolve: (command) => ipcRenderer.invoke(IPC_CHANNELS.appointmentResolve, command),
    agenda: (query) => ipcRenderer.invoke(IPC_CHANNELS.appointmentAgenda, query),
  },
  consultation: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationCreate, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.consultationList, query),
    update: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationUpdate, command),
    sign: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationSign, command),
    amend: (command) => ipcRenderer.invoke(IPC_CHANNELS.consultationAmend, command),
    listTemplates: () => ipcRenderer.invoke(IPC_CHANNELS.noteTemplateList, {}),
    saveTemplate: (command) => ipcRenderer.invoke(IPC_CHANNELS.noteTemplateSave, command),
    deleteTemplate: (command) => ipcRenderer.invoke(IPC_CHANNELS.noteTemplateDelete, command),
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
  coach: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.coachCreate, command),
    update: (command) => ipcRenderer.invoke(IPC_CHANNELS.coachUpdate, command),
    setStatus: (command) => ipcRenderer.invoke(IPC_CHANNELS.coachSetStatus, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.coachList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.coachGet, query),
    link: (command) => ipcRenderer.invoke(IPC_CHANNELS.coachLink, command),
    unlink: (command) => ipcRenderer.invoke(IPC_CHANNELS.coachUnlink, command),
    forPatient: (query) => ipcRenderer.invoke(IPC_CHANNELS.coachForPatient, query),
  },
  food: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodCreate, command),
    update: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodUpdate, command),
    setAllergens: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodSetAllergens, command),
    setStatus: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodSetStatus, command),
    setEquivalence: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodSetEquivalence, command),
    deleteEquivalence: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodDeleteEquivalence, command),
    importCsv: () => ipcRenderer.invoke(IPC_CHANNELS.foodImportCsv, {}),
    importEquivalences: () => ipcRenderer.invoke(IPC_CHANNELS.foodImportEquivalences, {}),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.foodSearch, query),
    addServing: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodServingAdd, command),
    deleteServing: (command) => ipcRenderer.invoke(IPC_CHANNELS.foodServingDelete, command),
  },
  recipe: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.recipeCreate, command),
    update: (command) => ipcRenderer.invoke(IPC_CHANNELS.recipeUpdate, command),
    setStatus: (command) => ipcRenderer.invoke(IPC_CHANNELS.recipeSetStatus, command),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS.recipeSearch, query),
  },
  plan: {
    create: (command) => ipcRenderer.invoke(IPC_CHANNELS.planCreate, command),
    addItem: (command) => ipcRenderer.invoke(IPC_CHANNELS.planItemAdd, command),
    removeItem: (command) => ipcRenderer.invoke(IPC_CHANNELS.planItemRemove, command),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.planGet, query),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.planList, query),
    setStatus: (command) => ipcRenderer.invoke(IPC_CHANNELS.planSetStatus, command),
    copyDay: (command) => ipcRenderer.invoke(IPC_CHANNELS.planCopyDay, command),
    duplicate: (command) => ipcRenderer.invoke(IPC_CHANNELS.planDuplicate, command),
    setMealDistribution: (command) =>
      ipcRenderer.invoke(IPC_CHANNELS.planSetMealDistribution, command),
    setEquivalentTargets: (command) =>
      ipcRenderer.invoke(IPC_CHANNELS.planSetEquivalentTargets, command),
    versions: (query) => ipcRenderer.invoke(IPC_CHANNELS.planVersions, query),
    shoppingList: (query) => ipcRenderer.invoke(IPC_CHANNELS.planShoppingList, query),
    substitutes: (query) => ipcRenderer.invoke(IPC_CHANNELS.planSubstitutes, query),
    replaceItem: (command) => ipcRenderer.invoke(IPC_CHANNELS.planReplaceItem, command),
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
    exportProgress: (command) =>
      ipcRenderer.invoke(IPC_CHANNELS.measurementExportProgress, command),
    formulaDrift: () => ipcRenderer.invoke(IPC_CHANNELS.measurementFormulaDrift, {}),
  },
  photo: {
    add: (command) => ipcRenderer.invoke(IPC_CHANNELS.photoAdd, command),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.photoList, query),
    get: (query) => ipcRenderer.invoke(IPC_CHANNELS.photoGet, query),
    delete: (command) => ipcRenderer.invoke(IPC_CHANNELS.photoDelete, command),
  },
};

contextBridge.exposeInMainWorld('ajnutrition', api);
