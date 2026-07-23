import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { EncryptedPhotoStorage } from './encrypted-photo-storage';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const NAME = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';

function makeStorage() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ajn-photos-'));
  const key = randomBytes(32);
  return { dir, key, storage: new EncryptedPhotoStorage(dir, key) };
}

describe('EncryptedPhotoStorage', () => {
  it('round-trips bytes and stores only opaque ciphertext on disk', () => {
    const { dir, storage } = makeStorage();
    const photo = Buffer.concat([JPEG_MAGIC, randomBytes(2048)]);
    storage.save(NAME, photo);

    const [fileName] = readdirSync(dir);
    expect(fileName).toBe(`${NAME}.ajnenc`);
    const onDisk = readFileSync(path.join(dir, fileName ?? ''));
    // No recognizable image signature on disk — encrypted at rest (§33).
    expect(onDisk.subarray(0, 3).equals(JPEG_MAGIC)).toBe(false);
    expect(onDisk.includes(photo.subarray(3, 40))).toBe(false);

    expect(Buffer.from(storage.read(NAME)).equals(photo)).toBe(true);
  });

  it('a file swapped to another storage name fails its AAD binding', () => {
    const { dir, storage } = makeStorage();
    storage.save(NAME, Buffer.concat([JPEG_MAGIC, randomBytes(64)]));
    // Simulate an attacker copying one record's ciphertext over another name.
    const sealedBytes = readFileSync(path.join(dir, `${NAME}.ajnenc`));
    writeFileSync(path.join(dir, `${OTHER}.ajnenc`), sealedBytes);
    expect(() => storage.read(OTHER)).toThrowError(AppError);
  });

  it('rejects non-UUID storage names (path traversal guard)', () => {
    const { storage } = makeStorage();
    expect(() => storage.read('../../etc/passwd')).toThrowError(AppError);
    expect(() => storage.save('..\\..\\x', JPEG_MAGIC)).toThrowError(AppError);
  });

  it('remove deletes the file and read then fails cleanly', () => {
    const { storage } = makeStorage();
    storage.save(NAME, JPEG_MAGIC);
    storage.remove(NAME);
    expect(() => storage.read(NAME)).toThrowError();
  });
});
