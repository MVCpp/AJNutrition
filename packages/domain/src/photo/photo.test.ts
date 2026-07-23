import { describe, expect, it } from 'vitest';
import type { DomainContext } from '../common/context';
import { createPatientPhoto, detectImageMime, MAX_PHOTO_BYTES } from './photo';

const ctx: DomainContext = {
  now: () => new Date('2026-07-23T12:00:00.000Z'),
  newId: () => '00000000-0000-4000-8000-0000000000aa',
};

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

const base = {
  patientId: '00000000-0000-4000-8000-000000000001',
  kind: 'front' as const,
  capturedAt: '2026-07-23',
  originalFileName: 'frente.jpg',
  sha256: 'a'.repeat(64),
};

describe('detectImageMime (magic bytes, never extensions)', () => {
  it('identifies JPEG and PNG', () => {
    expect(detectImageMime(JPEG)).toBe('image/jpeg');
    expect(detectImageMime(PNG)).toBe('image/png');
  });

  it.each([
    ['GIF', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00]],
    ['SVG/XML', Array.from(new TextEncoder().encode('<svg xmlns="ht"></svg>'))],
    ['Windows EXE', [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]],
    ['empty', []],
  ])('rejects %s', (_name, bytes) => {
    expect(detectImageMime(new Uint8Array(bytes))).toBeNull();
  });
});

describe('createPatientPhoto', () => {
  it('accepts a valid JPEG and assigns a random storage name distinct from the file name', () => {
    const photo = createPatientPhoto({ ...base, bytes: JPEG }, ctx);
    expect(photo).toMatchObject({ kind: 'front', mimeType: 'image/jpeg', sizeBytes: JPEG.length });
    expect(photo.storageName).not.toContain('frente');
  });

  it('rejects a renamed executable regardless of its .jpg name', () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(() =>
      createPatientPhoto({ ...base, originalFileName: 'foto.jpg', bytes: exe }, ctx),
    ).toThrowError();
  });

  it('rejects oversized and empty files', () => {
    expect(() =>
      createPatientPhoto({ ...base, bytes: new Uint8Array(MAX_PHOTO_BYTES + 1) }, ctx),
    ).toThrowError();
    expect(() => createPatientPhoto({ ...base, bytes: new Uint8Array(0) }, ctx)).toThrowError();
  });

  it('rejects a future capture date', () => {
    expect(() =>
      createPatientPhoto({ ...base, capturedAt: '2026-07-24', bytes: JPEG }, ctx),
    ).toThrowError();
  });
});
