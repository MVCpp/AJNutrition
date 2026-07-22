import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScryptParams } from '@ajnutrition/security';
import { AppError } from '@ajnutrition/shared';
import { AuthManager } from './auth-manager';

const TEST_KDF: ScryptParams = { algorithm: 'scrypt', N: 16384, r: 8, p: 1 };
const PASSPHRASE = 'frase-de-acceso-larga';

function makeManager(userDataPath?: string) {
  const dir = userDataPath ?? mkdtempSync(path.join(tmpdir(), 'ajn-bkp-'));
  const nowRef = { value: new Date('2026-07-22T12:00:00.000Z') };
  const manager = new AuthManager({
    userDataPath: dir,
    appVersion: '0.1.0-test',
    now: () => nowRef.value,
    kdfParams: TEST_KDF,
  });
  return { manager, userDataPath: dir, nowRef };
}

function setupWithPatient(manager: AuthManager) {
  manager.setup(PASSPHRASE);
  return manager.getContainer().useCases.createPatient.execute({
    firstName: 'Carmen',
    lastName: 'Iñárritu',
    dateOfBirth: '1980-11-30',
    sexAtBirth: 'female',
  });
}

function backupPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'ajn-dest-')), 'respaldo.ajnbackup');
}

describe('encrypted backup (S-109)', () => {
  it('creates a container with the magic prefix and no patient plaintext', () => {
    const { manager } = makeManager();
    setupWithPatient(manager);
    const dest = backupPath();

    const result = manager.createBackup(dest, 'Antes de la migración');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(dest)).toBe(true);

    const raw = readFileSync(dest);
    expect(raw.subarray(0, 8).toString('ascii')).toBe('AJNBCKP1');
    expect(raw.includes(Buffer.from('Carmen'))).toBe(false);
    expect(raw.includes(Buffer.from('Iñárritu'))).toBe(false);
    expect(raw.includes(Buffer.from(PASSPHRASE))).toBe(false);

    const audit = manager
      .getContainer()
      .db.prepare(`SELECT result FROM audit_events WHERE action = 'backup.create'`)
      .get();
    expect(audit).toEqual({ result: 'success' });
  });

  it('previews metadata without any passphrase', () => {
    const { manager } = makeManager();
    setupWithPatient(manager);
    const dest = backupPath();
    manager.createBackup(dest, 'Vista previa');

    const preview = manager.previewBackup(dest);
    expect(preview).toMatchObject({
      appVersion: '0.1.0-test',
      schemaVersion: 1,
      description: 'Vista previa',
    });
  });

  it('restores onto a BRAND-NEW machine with only the file and the passphrase', () => {
    const { manager: source } = makeManager();
    const patient = setupWithPatient(source);
    const dest = backupPath();
    source.createBackup(dest, null);

    // Fresh userData dir: no keyfile, no database — factory state.
    const { manager: fresh } = makeManager();
    expect(fresh.getStatus().state).toBe('setup-required');

    const restored = fresh.restoreBackup(dest, PASSPHRASE);
    expect(restored.backupCreatedAt).toBe('2026-07-22T12:00:00.000Z');
    expect(fresh.getStatus().state).toBe('unlocked');

    const patients = fresh.getContainer().useCases.listPatients.execute({});
    expect(patients).toHaveLength(1);
    expect(patients[0]).toMatchObject({ id: patient.id, firstName: 'Carmen' });

    // The restored install locks and unlocks with the same passphrase.
    fresh.lock('manual');
    fresh.unlock(PASSPHRASE);
    expect(fresh.getStatus().state).toBe('unlocked');
  });

  it('rejects a wrong passphrase, feeds the unlock throttle, and touches nothing', () => {
    const { manager: source } = makeManager();
    setupWithPatient(source);
    const dest = backupPath();
    source.createBackup(dest, null);

    const { manager: fresh, userDataPath } = makeManager();
    try {
      fresh.restoreBackup(dest, 'passphrase-equivocada');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('AUTHORIZATION');
    }
    expect(fresh.getStatus().failedAttempts).toBe(1);
    expect(existsSync(path.join(userDataPath, 'data', 'ajnutrition.db3'))).toBe(false);
    expect(fresh.getStatus().state).toBe('setup-required');
  });

  it('rejects a tampered backup with INTEGRITY and replaces nothing (Gherkin: reject modified backup)', () => {
    const { manager } = makeManager();
    const patient = setupWithPatient(manager);
    const dest = backupPath();
    manager.createBackup(dest, null);

    const tampered = Buffer.from(readFileSync(dest));
    const mid = tampered.length - 10;
    tampered[mid] = (tampered[mid] ?? 0) ^ 0xff;
    writeFileSync(dest, tampered);

    try {
      manager.restoreBackup(dest, PASSPHRASE);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('INTEGRITY');
    }
    // Live data untouched — but the failed attempt locked the app first, so unlock and verify.
    manager.unlock(PASSPHRASE);
    expect(manager.getContainer().useCases.listPatients.execute({})).toHaveLength(1);
    expect(manager.getContainer().useCases.getPatient.execute({ patientId: patient.id }).id).toBe(
      patient.id,
    );
  });

  it('restoring over existing data keeps a rollback copy and activates the backup state (Gherkin: restore backup)', () => {
    const { manager, userDataPath } = makeManager();
    setupWithPatient(manager);
    const dest = backupPath();
    manager.createBackup(dest, null);

    // Diverge after the backup: add a second patient that the backup lacks.
    manager.getContainer().useCases.createPatient.execute({
      firstName: 'Pedro',
      lastName: 'Solís',
      dateOfBirth: '1995-02-17',
      sexAtBirth: 'male',
    });
    expect(manager.getContainer().useCases.listPatients.execute({})).toHaveLength(2);

    manager.restoreBackup(dest, PASSPHRASE);
    expect(manager.getStatus().state).toBe('unlocked');
    expect(manager.getContainer().useCases.listPatients.execute({})).toHaveLength(1);
    expect(existsSync(path.join(userDataPath, 'data', 'ajnutrition.db3.pre-restore'))).toBe(true);

    const restoreAudit = manager
      .getContainer()
      .db.prepare(`SELECT result FROM audit_events WHERE action = 'backup.restore'`)
      .get();
    expect(restoreAudit).toEqual({ result: 'success' });
  });

  it('refuses to restore while the unlock throttle is active', () => {
    const { manager: source } = makeManager();
    setupWithPatient(source);
    const dest = backupPath();
    source.createBackup(dest, null);

    const { manager: fresh } = makeManager();
    for (let i = 0; i < 5; i += 1) {
      expect(() => fresh.restoreBackup(dest, 'passphrase-equivocada')).toThrowError(AppError);
    }
    // Correct passphrase also refused during the delay window.
    expect(() => fresh.restoreBackup(dest, PASSPHRASE)).toThrowError(AppError);
    expect(fresh.getStatus().retryDelaySeconds).toBeGreaterThan(0);
  });
});
