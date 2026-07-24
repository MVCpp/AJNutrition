import { AppError } from '@ajnutrition/shared';

/**
 * Backup payload bundle (container format v2): the plaintext payload holds the
 * database snapshot PLUS the sealed attachment files, so progress photos
 * survive a restore. Attachments travel exactly as stored on disk (already
 * AES-GCM sealed with the attachments key, which re-derives from the master
 * key inside the container's keyfile) — the bundle adds no crypto of its own.
 *
 * Layout: MAGIC(8) ┃ count(4, LE) ┃ entries…
 * Entry:  nameLen(4, LE) ┃ name utf8 ┃ dataLen(4, LE) ┃ data
 *
 * A v1 payload (a bare database snapshot) never starts with the magic:
 * SQLCipher output is indistinguishable from random bytes, so restore code
 * can branch on `isBackupBundle`.
 */

export const BUNDLE_MAGIC = Buffer.from('AJNBNDL1', 'ascii');
export const BUNDLE_DB_ENTRY = 'db';
const MAX_ENTRIES = 100_000;

/** Entry names are fixed by the writer: 'db' or 'attachments/<uuid>.ajnenc'. */
const ATTACHMENT_NAME = /^attachments\/[0-9a-f-]{36}\.ajnenc$/i;

export interface BundleEntry {
  name: string;
  data: Buffer;
}

export function isBackupBundle(payload: Buffer): boolean {
  return payload.length >= BUNDLE_MAGIC.length && payload.subarray(0, 8).equals(BUNDLE_MAGIC);
}

export function packBackupBundle(entries: BundleEntry[]): Buffer {
  const parts: Buffer[] = [BUNDLE_MAGIC];
  const count = Buffer.alloc(4);
  count.writeUInt32LE(entries.length);
  parts.push(count);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const sizes = Buffer.alloc(4);
    sizes.writeUInt32LE(name.length);
    const dataLen = Buffer.alloc(4);
    dataLen.writeUInt32LE(entry.data.length);
    parts.push(sizes, name, dataLen, entry.data);
  }
  return Buffer.concat(parts);
}

export function unpackBackupBundle(payload: Buffer): BundleEntry[] {
  const corrupt = (detail: string): AppError =>
    new AppError({
      code: 'INTEGRITY',
      message: 'El contenido del respaldo está dañado.',
      internalDetail: `bundle: ${detail}`,
    });

  if (!isBackupBundle(payload)) throw corrupt('bad magic');
  let offset = BUNDLE_MAGIC.length;
  const readU32 = (): number => {
    if (offset + 4 > payload.length) throw corrupt('truncated length field');
    const value = payload.readUInt32LE(offset);
    offset += 4;
    return value;
  };

  const count = readU32();
  if (count > MAX_ENTRIES) throw corrupt('entry count out of range');
  const entries: BundleEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const nameLen = readU32();
    if (nameLen === 0 || nameLen > 1024 || offset + nameLen > payload.length) {
      throw corrupt('bad name length');
    }
    const name = payload.subarray(offset, offset + nameLen).toString('utf8');
    offset += nameLen;
    if (name !== BUNDLE_DB_ENTRY && !ATTACHMENT_NAME.test(name)) {
      // A name outside the fixed vocabulary could otherwise traverse paths.
      throw corrupt('unexpected entry name');
    }
    const dataLen = readU32();
    if (offset + dataLen > payload.length) throw corrupt('truncated entry data');
    entries.push({ name, data: Buffer.from(payload.subarray(offset, offset + dataLen)) });
    offset += dataLen;
  }
  if (offset !== payload.length) throw corrupt('trailing bytes');
  if (entries.filter((e) => e.name === BUNDLE_DB_ENTRY).length !== 1) {
    throw corrupt('missing db entry');
  }
  return entries;
}
