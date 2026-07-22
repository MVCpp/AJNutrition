import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { createKeyfile } from './keyfile';
import { KeyfileStore } from './keyfile-store';
import type { ScryptParams } from './kdf';

const TEST_KDF: ScryptParams = { algorithm: 'scrypt', N: 16384, r: 8, p: 1 };
const NOW = () => new Date('2026-07-22T10:00:00.000Z');

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ajn-keyfile-'));
  const filePath = path.join(dir, 'keyfile.json');
  return { store: new KeyfileStore(filePath), filePath };
}

describe('KeyfileStore', () => {
  it('round-trips a keyfile and never persists the master key or passphrase', () => {
    const { store, filePath } = makeStore();
    const created = createKeyfile('frase-de-acceso-larga', NOW, TEST_KDF);
    expect(store.exists()).toBe(false);
    store.save(created.keyfile);
    expect(store.exists()).toBe(true);
    expect(store.load()).toEqual(created.keyfile);

    const raw = readFileSync(filePath, 'utf8');
    expect(raw).not.toContain(created.masterKey.toString('hex'));
    expect(raw).not.toContain(created.masterKey.toString('base64'));
    expect(raw).not.toContain('frase-de-acceso-larga');
    expect(raw).not.toContain(created.recoveryKey);
  });

  it('rejects corrupt or tampered keyfiles as INTEGRITY errors', () => {
    const { store, filePath } = makeStore();
    store.save(createKeyfile('frase-de-acceso-larga', NOW, TEST_KDF).keyfile);
    writeFileSync(filePath, '{"version":1,"unexpected":true}');
    try {
      store.load();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AppError).code).toBe('INTEGRITY');
    }
  });

  it('reports a missing file as FILE error on load', () => {
    const { store } = makeStore();
    expect(() => store.load()).toThrowError(AppError);
  });
});
