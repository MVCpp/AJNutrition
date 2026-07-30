import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@ajnutrition/shared';
import { CHANNEL_ACCESS, isGatedWrite } from './license-gate';

describe('licence write-gate', () => {
  it('classifies every registered channel', () => {
    // The Record type already enforces this at compile time; asserting it at
    // runtime too catches a channel added with a cast or a stale build.
    const unclassified = Object.values(IPC_CHANNELS).filter((c) => !(c in CHANNEL_ACCESS));
    expect(unclassified).toEqual([]);
  });

  it.each([
    ['unlock', IPC_CHANNELS.authUnlock],
    ['create a backup', IPC_CHANNELS.backupCreate],
    ['restore a backup', IPC_CHANNELS.backupRestore],
    ['export a patient record', IPC_CHANNELS.patientExport],
    ['export the progress report', IPC_CHANNELS.measurementExportProgress],
    ['print a plan', IPC_CHANNELS.planExportPdf],
    ['open a patient', IPC_CHANNELS.patientGet],
    ['list consultations', IPC_CHANNELS.consultationList],
    ['view a photo', IPC_CHANNELS.photoGet],
    ['change the auto-lock timeout', IPC_CHANNELS.appSettingsSave],
  ])('never blocks %s, whatever the subscription says', (_label, channel) => {
    // docs/product/subscription.md §1: the product being sold is the right to
    // use the software, never access to her patients' records.
    expect(isGatedWrite(channel)).toBe(false);
  });

  it.each([
    ['create a patient', IPC_CHANNELS.patientCreate],
    ['write a consultation', IPC_CHANNELS.consultationCreate],
    ['sign a consultation', IPC_CHANNELS.consultationSign],
    ['record a measurement', IPC_CHANNELS.measurementCreate],
    ['create a plan', IPC_CHANNELS.planCreate],
    ['add a plan item', IPC_CHANNELS.planItemAdd],
    ['import a food CSV', IPC_CHANNELS.foodImportCsv],
    ['book an appointment', IPC_CHANNELS.appointmentCreate],
  ])('blocks %s once the subscription has lapsed', (_label, channel) => {
    expect(isGatedWrite(channel)).toBe(true);
  });

  it('treats an unknown channel as not gated', () => {
    expect(isGatedWrite('ajn:does-not-exist')).toBe(false);
  });
});
