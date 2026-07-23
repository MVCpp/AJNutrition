import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScryptParams } from '@ajnutrition/security';
import { AppError, type AuthStatusDto } from '@ajnutrition/shared';
import { AuthManager } from './auth-manager';

const TEST_KDF: ScryptParams = { algorithm: 'scrypt', N: 16384, r: 8, p: 1 };
const PASSPHRASE = 'frase-de-acceso-larga';

function makeManager(overrides?: { userDataPath?: string; nowRef?: { value: Date } }) {
  const userDataPath = overrides?.userDataPath ?? mkdtempSync(path.join(tmpdir(), 'ajn-auth-'));
  const nowRef = overrides?.nowRef ?? { value: new Date('2026-07-22T10:00:00.000Z') };
  const statuses: AuthStatusDto[] = [];
  const manager = new AuthManager({
    userDataPath,
    appVersion: '0.1.0-test',
    now: () => nowRef.value,
    kdfParams: TEST_KDF,
    onStatusChanged: (s) => statuses.push(s),
  });
  return { manager, userDataPath, nowRef, statuses };
}

describe('AuthManager lifecycle', () => {
  it('rolls back to pristine setup-required when setup fails mid-way (atomicity)', () => {
    const { manager, userDataPath } = makeManager();
    // A corrupt pre-existing database file makes the container fail to open
    // AFTER the keyfile was created — the exact half-setup trap seen in the
    // field (lock screen for an account whose recovery key was never shown).
    mkdirSync(path.join(userDataPath, 'data'), { recursive: true });
    writeFileSync(path.join(userDataPath, 'data', 'ajnutrition.db3'), 'no-es-una-base-de-datos');

    expect(() => manager.setup(PASSPHRASE)).toThrowError(AppError);
    expect(manager.getStatus().state).toBe('setup-required');
    expect(existsSync(path.join(userDataPath, 'security', 'keyfile.json'))).toBe(false);

    // The rollback also cleared the unusable database file, so a retry
    // succeeds cleanly.
    manager.setup(PASSPHRASE);
    expect(manager.getStatus().state).toBe('unlocked');
  });

  it('starts in setup-required, unlocks after setup, and audits the setup', () => {
    const { manager } = makeManager();
    expect(manager.getStatus().state).toBe('setup-required');

    const { recoveryKey } = manager.setup(PASSPHRASE);
    expect(recoveryKey).toMatch(/^([0-9A-F]{8}-){7}[0-9A-F]{8}$/);
    expect(manager.getStatus().state).toBe('unlocked');

    const audits = manager
      .getContainer()
      .db.prepare('SELECT action, result FROM audit_events')
      .all();
    expect(audits).toEqual([{ action: 'auth.setup', result: 'success' }]);
  });

  it('locks (closing the DB) and unlocks again with the passphrase', () => {
    const { manager } = makeManager();
    manager.setup(PASSPHRASE);
    manager.getContainer().useCases.createPatient.execute({
      firstName: 'Ana',
      lastName: 'López',
      dateOfBirth: '1990-01-01',
      sexAtBirth: 'female',
    });

    manager.lock('manual');
    expect(manager.getStatus().state).toBe('locked');
    expect(() => manager.getContainer()).toThrowError(AppError);

    manager.unlock(PASSPHRASE);
    expect(manager.getStatus().state).toBe('unlocked');
    const patients = manager.getContainer().useCases.listPatients.execute({});
    expect(patients).toHaveLength(1);

    const actions = manager
      .getContainer()
      .db.prepare('SELECT action FROM audit_events ORDER BY occurred_at, action')
      .all() as Array<{ action: string }>;
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['auth.setup', 'patient.create', 'auth.lock', 'auth.unlock']),
    );
  });

  it('rejects a wrong passphrase, then throttles after repeated failures', () => {
    const { manager, nowRef } = makeManager();
    manager.setup(PASSPHRASE);
    manager.lock('manual');

    for (let i = 0; i < 5; i += 1) {
      expect(() => manager.unlock('incorrecta-pero-larga')).toThrowError(AppError);
    }
    const status = manager.getStatus();
    expect(status.failedAttempts).toBe(5);
    expect(status.retryDelaySeconds).toBeGreaterThan(0);

    // Even the CORRECT passphrase is refused while the delay runs...
    expect(() => manager.unlock(PASSPHRASE)).toThrowError(AppError);
    expect(manager.getStatus().state).toBe('locked');

    // ...and works once the delay elapses; the unlock audit records the failures.
    nowRef.value = new Date('2026-07-22T10:30:00.000Z');
    manager.unlock(PASSPHRASE);
    expect(manager.getStatus()).toMatchObject({ state: 'unlocked', failedAttempts: 0 });
    const unlockAudit = manager
      .getContainer()
      .db.prepare(`SELECT metadata_json FROM audit_events WHERE action = 'auth.unlock'`)
      .get() as { metadata_json: string };
    expect(JSON.parse(unlockAudit.metadata_json)).toMatchObject({
      method: 'passphrase',
      failedAttemptsSinceLastUnlock: 5,
    });
  });

  it('recovers with the recovery key: resets passphrase and rotates the recovery key', () => {
    const { manager } = makeManager();
    const { recoveryKey } = manager.setup(PASSPHRASE);
    manager.lock('manual');

    const result = manager.unlockWithRecovery(recoveryKey, 'nueva-frase-larga');
    expect(manager.getStatus().state).toBe('unlocked');
    expect(result.recoveryKey).not.toBe(recoveryKey);

    manager.lock('manual');
    // Old passphrase and old recovery key are dead; new ones work.
    expect(() => manager.unlock(PASSPHRASE)).toThrowError(AppError);
    expect(() => manager.unlockWithRecovery(recoveryKey, 'otra-frase-larga-x')).toThrowError(
      AppError,
    );
    manager.unlock('nueva-frase-larga');
    expect(manager.getStatus().state).toBe('unlocked');
  });

  it('refuses double setup and unlock-while-unlocked', () => {
    const { manager } = makeManager();
    manager.setup(PASSPHRASE);
    expect(() => manager.setup('otra-frase-de-acceso')).toThrowError(AppError);
    expect(() => manager.unlock(PASSPHRASE)).toThrowError(AppError);
  });

  it('never persists the passphrase or key material anywhere on disk', () => {
    const { manager, userDataPath } = makeManager();
    const { recoveryKey } = manager.setup(PASSPHRASE);
    manager.lock('manual');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(userDataPath);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = readFileSync(file);
      expect(raw.includes(Buffer.from(PASSPHRASE)), `${file} leaks passphrase`).toBe(false);
      expect(raw.includes(Buffer.from(recoveryKey)), `${file} leaks recovery key`).toBe(false);
    }
  });

  it('a second manager on the same data dir (fresh process) unlocks with the passphrase', () => {
    const { manager, userDataPath } = makeManager();
    manager.setup(PASSPHRASE);
    manager.lock('quit');

    const second = makeManager({ userDataPath });
    expect(second.manager.getStatus().state).toBe('locked');
    second.manager.unlock(PASSPHRASE);
    expect(second.manager.getStatus().state).toBe('unlocked');
  });
});
