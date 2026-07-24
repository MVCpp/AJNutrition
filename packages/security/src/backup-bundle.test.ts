import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import {
  BUNDLE_DB_ENTRY,
  isBackupBundle,
  packBackupBundle,
  unpackBackupBundle,
} from './backup-bundle';

const uuid = '11111111-2222-4333-8444-555555555555';

describe('backup payload bundle (format v2)', () => {
  it('round-trips a db snapshot with attachments', () => {
    const entries = [
      { name: BUNDLE_DB_ENTRY, data: randomBytes(1024) },
      { name: `attachments/${uuid}.ajnenc`, data: randomBytes(256) },
      { name: 'attachments/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.ajnenc', data: Buffer.alloc(0) },
    ];
    const packed = packBackupBundle(entries);
    expect(isBackupBundle(packed)).toBe(true);
    expect(unpackBackupBundle(packed)).toEqual(entries);
  });

  it('does not mistake a bare (v1) snapshot for a bundle', () => {
    // SQLCipher output is indistinguishable from random bytes.
    expect(isBackupBundle(randomBytes(4096))).toBe(false);
  });

  it('rejects truncation, trailing bytes, and traversal-shaped names', () => {
    const packed = packBackupBundle([{ name: BUNDLE_DB_ENTRY, data: randomBytes(64) }]);
    expect(() => unpackBackupBundle(packed.subarray(0, packed.length - 5))).toThrowError(AppError);
    expect(() => unpackBackupBundle(Buffer.concat([packed, Buffer.from('extra')]))).toThrowError(
      AppError,
    );
    expect(() =>
      unpackBackupBundle(
        packBackupBundle([
          { name: BUNDLE_DB_ENTRY, data: Buffer.alloc(1) },
          { name: '../../etc/passwd', data: Buffer.alloc(1) },
        ]),
      ),
    ).toThrowError(AppError);
  });

  it('requires exactly one db entry', () => {
    expect(() =>
      unpackBackupBundle(
        packBackupBundle([{ name: `attachments/${uuid}.ajnenc`, data: Buffer.alloc(1) }]),
      ),
    ).toThrowError(AppError);
  });
});
