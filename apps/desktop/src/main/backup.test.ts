import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScryptParams } from '@ajnutrition/security';
import { AppError } from '@ajnutrition/shared';
import { MIGRATIONS } from '@ajnutrition/database';
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
      // Tracks the migration registry rather than a literal, so adding a
      // migration does not break backup previews.
      schemaVersion: Math.max(...MIGRATIONS.map((m) => m.id)),
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

  it('bundles progress photos and restores them on a brand-new machine', () => {
    const { manager: source } = makeManager();
    const patient = setupWithPatient(source);
    const useCases = source.getContainer().useCases;
    useCases.recordConsent.execute({
      patientId: patient.id,
      consentType: 'photo',
      noticeVersion: 'v1',
      decision: 'accepted',
      method: 'written',
    });
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('cuerpo-de-imagen-de-progreso'),
    ]);
    const photo = useCases.addPhoto.execute({
      patientId: patient.id,
      kind: 'front',
      capturedAt: '2026-07-22',
      originalFileName: 'frente.png',
      bytes: pngBytes,
    });

    const dest = backupPath();
    source.createBackup(dest, null);
    // The sealed bytes travel, never the plaintext image.
    expect(readFileSync(dest).includes(Buffer.from('cuerpo-de-imagen-de-progreso'))).toBe(false);

    const { manager: fresh } = makeManager();
    fresh.restoreBackup(dest, PASSPHRASE);
    const photos = fresh.getContainer().useCases.listPhotos.execute({ patientId: patient.id });
    expect(photos).toHaveLength(1);
    const data = fresh.getContainer().useCases.getPhotoData.execute({ photoId: photo.id });
    expect(data.mimeType).toBe('image/png');
    expect(Buffer.from(data.bytes)).toEqual(pngBytes);
  });

  it('restore replaces the photo set and keeps the previous one as rollback', () => {
    const { manager, userDataPath } = makeManager();
    const patient = setupWithPatient(manager);
    const useCases = manager.getContainer().useCases;
    useCases.recordConsent.execute({
      patientId: patient.id,
      consentType: 'photo',
      noticeVersion: 'v1',
      decision: 'accepted',
      method: 'written',
    });
    const png = (marker: string) =>
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from(marker),
      ]);
    useCases.addPhoto.execute({
      patientId: patient.id,
      kind: 'front',
      capturedAt: '2026-07-22',
      originalFileName: 'a.png',
      bytes: png('foto-antes-del-respaldo'),
    });
    const dest = backupPath();
    manager.createBackup(dest, null);

    // Diverge: a photo added after the backup must not survive the restore.
    useCases.addPhoto.execute({
      patientId: patient.id,
      kind: 'back',
      capturedAt: '2026-07-23',
      originalFileName: 'b.png',
      bytes: png('foto-posterior'),
    });

    manager.restoreBackup(dest, PASSPHRASE);
    const photos = manager.getContainer().useCases.listPhotos.execute({ patientId: patient.id });
    expect(photos).toHaveLength(1);
    expect(photos[0]?.kind).toBe('front');
    expect(existsSync(path.join(userDataPath, 'attachments.pre-restore'))).toBe(true);
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
