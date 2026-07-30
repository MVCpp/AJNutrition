import { IPC_CHANNELS, type IpcChannel } from '@ajnutrition/shared';

/**
 * Which IPC channels a lapsed subscription may refuse
 * (docs/product/subscription.md §1 and §3).
 *
 * The classification is a `Record<IpcChannel, ...>`, not a list of write
 * channels, on purpose: adding a channel to IPC_CHANNELS without classifying
 * it fails `tsc`. A guard you can forget to extend is a guard that eventually
 * lets a write through — the doc's "single choke point" only works if the
 * compiler enforces the enumeration.
 *
 *  - `always`  never gated. Unlocking, backing up and restoring must work no
 *              matter what: her records are clinical documents, not a hostage.
 *  - `read`    reading, searching, exporting, printing. Never gated either;
 *              separated from `always` only to document intent.
 *  - `write`   creates or changes clinical or catalogue data. Refused with
 *              LICENSE once the subscription is past its grace period.
 */
export type ChannelAccess = 'always' | 'read' | 'write';

export const CHANNEL_ACCESS: Record<IpcChannel, ChannelAccess> = {
  // Authentication and the licence itself: gating these would make the app
  // impossible to fix from inside.
  [IPC_CHANNELS.authGetStatus]: 'always',
  [IPC_CHANNELS.authSetup]: 'always',
  [IPC_CHANNELS.authUnlock]: 'always',
  [IPC_CHANNELS.authRecoveryUnlock]: 'always',
  [IPC_CHANNELS.authLock]: 'always',
  [IPC_CHANNELS.licenseGetStatus]: 'always',
  [IPC_CHANNELS.licenseActivate]: 'always',
  [IPC_CHANNELS.licenseLoadFile]: 'always',

  // Getting the data out, and app-level preferences (which include the
  // auto-lock timeout — a security control, never a subscription feature).
  [IPC_CHANNELS.backupCreate]: 'always',
  [IPC_CHANNELS.backupPreview]: 'always',
  [IPC_CHANNELS.backupRestore]: 'always',
  [IPC_CHANNELS.appSettingsGet]: 'always',
  [IPC_CHANNELS.appSettingsSave]: 'always',
  [IPC_CHANNELS.appSettingsChooseBackupFolder]: 'always',

  // Reading, searching, exporting, printing.
  [IPC_CHANNELS.patientList]: 'read',
  [IPC_CHANNELS.patientGet]: 'read',
  [IPC_CHANNELS.patientExport]: 'read',
  [IPC_CHANNELS.noteTemplateList]: 'read',
  [IPC_CHANNELS.consultationList]: 'read',
  [IPC_CHANNELS.historyList]: 'read',
  [IPC_CHANNELS.consentList]: 'read',
  [IPC_CHANNELS.photoList]: 'read',
  [IPC_CHANNELS.photoGet]: 'read',
  [IPC_CHANNELS.measurementList]: 'read',
  [IPC_CHANNELS.measurementFormulaDrift]: 'read',
  [IPC_CHANNELS.measurementExportProgress]: 'read',
  [IPC_CHANNELS.foodSearch]: 'read',
  [IPC_CHANNELS.recipeSearch]: 'read',
  [IPC_CHANNELS.planGet]: 'read',
  [IPC_CHANNELS.planList]: 'read',
  [IPC_CHANNELS.planVersions]: 'read',
  [IPC_CHANNELS.planShoppingList]: 'read',
  [IPC_CHANNELS.planSubstitutes]: 'read',
  [IPC_CHANNELS.planExportPdf]: 'read',
  [IPC_CHANNELS.appointmentAgenda]: 'read',
  [IPC_CHANNELS.labList]: 'read',
  [IPC_CHANNELS.adherenceList]: 'read',
  [IPC_CHANNELS.aiSettingsGet]: 'read',
  [IPC_CHANNELS.profileGet]: 'read',

  // Everything that creates or changes data.
  [IPC_CHANNELS.patientCreate]: 'write',
  [IPC_CHANNELS.patientUpdate]: 'write',
  [IPC_CHANNELS.patientSetStatus]: 'write',
  [IPC_CHANNELS.noteTemplateSave]: 'write',
  [IPC_CHANNELS.noteTemplateDelete]: 'write',
  [IPC_CHANNELS.consultationCreate]: 'write',
  [IPC_CHANNELS.consultationUpdate]: 'write',
  [IPC_CHANNELS.consultationSign]: 'write',
  [IPC_CHANNELS.consultationAmend]: 'write',
  [IPC_CHANNELS.historyAdd]: 'write',
  [IPC_CHANNELS.consentRecord]: 'write',
  [IPC_CHANNELS.consentWithdraw]: 'write',
  [IPC_CHANNELS.photoAdd]: 'write',
  [IPC_CHANNELS.photoDelete]: 'write',
  [IPC_CHANNELS.measurementCreate]: 'write',
  [IPC_CHANNELS.foodCreate]: 'write',
  [IPC_CHANNELS.foodUpdate]: 'write',
  [IPC_CHANNELS.foodSetStatus]: 'write',
  [IPC_CHANNELS.foodSetAllergens]: 'write',
  [IPC_CHANNELS.foodSetEquivalence]: 'write',
  [IPC_CHANNELS.foodDeleteEquivalence]: 'write',
  [IPC_CHANNELS.foodServingAdd]: 'write',
  [IPC_CHANNELS.foodServingDelete]: 'write',
  [IPC_CHANNELS.foodImportCsv]: 'write',
  [IPC_CHANNELS.foodImportEquivalences]: 'write',
  [IPC_CHANNELS.recipeCreate]: 'write',
  [IPC_CHANNELS.recipeUpdate]: 'write',
  [IPC_CHANNELS.recipeSetStatus]: 'write',
  [IPC_CHANNELS.planCreate]: 'write',
  [IPC_CHANNELS.planItemAdd]: 'write',
  [IPC_CHANNELS.planItemRemove]: 'write',
  [IPC_CHANNELS.planReplaceItem]: 'write',
  [IPC_CHANNELS.planSetStatus]: 'write',
  [IPC_CHANNELS.planSetEquivalentTargets]: 'write',
  [IPC_CHANNELS.planSetMealDistribution]: 'write',
  [IPC_CHANNELS.planDuplicate]: 'write',
  [IPC_CHANNELS.planCopyDay]: 'write',
  [IPC_CHANNELS.appointmentCreate]: 'write',
  [IPC_CHANNELS.appointmentReschedule]: 'write',
  [IPC_CHANNELS.appointmentResolve]: 'write',
  [IPC_CHANNELS.labRecord]: 'write',
  [IPC_CHANNELS.adherenceRecord]: 'write',
  [IPC_CHANNELS.aiSettingsSave]: 'write',
  [IPC_CHANNELS.aiProgressSummary]: 'write',
  [IPC_CHANNELS.profileSave]: 'write',
  [IPC_CHANNELS.profileSetLogo]: 'write',
};

/**
 * True when a lapsed subscription must refuse this channel.
 *
 * An unclassified channel falls through as NOT gated. That is the deliberate
 * direction to fail in: the map is exhaustive at compile time, so the only way
 * to reach this case is a channel that bypassed the type system entirely, and
 * between "an unpaid month lets one command through" and "a paid-up
 * practitioner cannot open a record", the first is the cheaper mistake.
 */
export function isGatedWrite(channel: string): boolean {
  return CHANNEL_ACCESS[channel as IpcChannel] === 'write';
}
