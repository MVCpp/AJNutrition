import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@ajnutrition/shared';
import { Logger } from './logger';
import { redactText } from './redact';

const NOW = () => new Date('2026-07-22T15:00:00.000Z');

function makeLogger(dir = mkdtempSync(path.join(tmpdir(), 'ajn-log-'))) {
  return { dir, logger: new Logger({ dir, appVersion: '0.1.0-test', now: NOW }) };
}

function readLines(dir: string): Array<Record<string, unknown>> {
  const file = path.join(dir, 'ajnutrition-2026-07-22.log');
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('redactText', () => {
  it('masks emails, hex keys, recovery-key groups, base64 runs, and phone-like digits', () => {
    expect(redactText('contacto: ana.lopez+x@example.com')).toBe('contacto: [REDACTED-EMAIL]');
    expect(redactText(`clave ${'ab'.repeat(32)}`)).toBe('clave [REDACTED-HEX]');
    expect(redactText('rk AAAA1111-BBBB2222-CCCC3333-DDDD4444')).toBe('rk [REDACTED-KEY]');
    expect(redactText(`blob ${'QUJD'.repeat(12)}==`)).toBe('blob [REDACTED-B64]');
    expect(redactText('tel +52 55 1234 5678')).toBe('tel [REDACTED-PHONE]');
  });

  it('truncates very long strings', () => {
    expect(redactText('x'.repeat(2000)).length).toBeLessThanOrEqual(500);
  });
});

describe('Logger', () => {
  it('writes parseable JSONL with timestamp, level, and app version', () => {
    const { dir, logger } = makeLogger();
    logger.info('auth', 'unlock.success', { method: 'passphrase' });
    const [line] = readLines(dir);
    expect(line).toMatchObject({
      ts: '2026-07-22T15:00:00.000Z',
      level: 'info',
      component: 'auth',
      event: 'unlock.success',
      appVersion: '0.1.0-test',
      meta: { method: 'passphrase' },
    });
  });

  it('logs AppError code + supportCode and redacts the internal detail', () => {
    const { dir, logger } = makeLogger();
    const err = new AppError({
      code: 'DATABASE',
      message: 'user-facing',
      internalDetail: `query failed for maria@example.com key ${'a'.repeat(64)}`,
    });
    logger.error('ipc', 'patient.create.failed', err);
    const [line] = readLines(dir);
    const meta = (line?.['meta'] ?? {}) as Record<string, unknown>;
    expect(meta['code']).toBe('DATABASE');
    expect(meta['supportCode']).toMatch(/^AJN-/);
    expect(String(meta['detail'])).toContain('[REDACTED-EMAIL]');
    expect(String(meta['detail'])).toContain('[REDACTED-HEX]');
    expect(readFileSync(path.join(dir, 'ajnutrition-2026-07-22.log'), 'utf8')).not.toContain(
      'maria@example.com',
    );
  });

  it('redacts sensitive strings inside metadata values', () => {
    const { dir, logger } = makeLogger();
    logger.warn('backup', 'restore.failed', { file: 'respaldo de paciente@dominio.mx' });
    const raw = readFileSync(path.join(dir, 'ajnutrition-2026-07-22.log'), 'utf8');
    expect(raw).not.toContain('paciente@dominio.mx');
  });

  it('deletes log files older than the 30-day retention window on startup', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ajn-log-'));
    writeFileSync(path.join(dir, 'ajnutrition-2026-05-01.log'), 'viejo\n');
    writeFileSync(path.join(dir, 'ajnutrition-2026-07-20.log'), 'reciente\n');
    writeFileSync(path.join(dir, 'no-es-log.txt'), 'ignorado\n');
    makeLogger(dir);
    const remaining = readdirSync(dir).sort();
    expect(remaining).toEqual(['ajnutrition-2026-07-20.log', 'no-es-log.txt']);
  });

  it('never throws when the directory cannot be created', () => {
    // A path "under" a regular file fails immediately on every OS.
    const parent = mkdtempSync(path.join(tmpdir(), 'ajn-log-'));
    const blocker = path.join(parent, 'archivo');
    writeFileSync(blocker, 'no soy un directorio');
    const logger = new Logger({
      dir: path.join(blocker, 'logs'),
      appVersion: '0.1.0-test',
      now: NOW,
    });
    expect(() => logger.info('app', 'start')).not.toThrow();
  });
});
