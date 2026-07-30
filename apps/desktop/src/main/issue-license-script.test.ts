import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyLicenseToken } from '@ajnutrition/security';
import { LicenseManager } from './license-manager';

/**
 * The issuer script and the in-app verifier are the two halves of the
 * subscription, and they live in different languages (plain .mjs vs the
 * typed security package). If they ever disagree about which bytes are signed,
 * every licence sold stops working — and nothing else in the suite would
 * notice. This test runs the real script and feeds its output to the real
 * verifier.
 */

const SCRIPT = path.join(process.cwd(), 'scripts', 'issue-license.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'ajn-issuer-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('issue-license.mjs', () => {
  const keyPath = path.join(dir, 'issuer.key');
  const keygenOutput = run(['keygen', '--out', keyPath]);
  const publicKey = /LICENSE_PUBLIC_KEY = '([^']+)'/.exec(keygenOutput)?.[1] ?? '';

  it('prints a public key in the exact form license-key.ts expects', () => {
    expect(publicKey).not.toBe('');
    expect(keygenOutput).toContain('export const LICENSE_PUBLIC_KEY =');
  });

  it('issues a licence the app verifies', () => {
    const tokenPath = path.join(dir, 'ana.nplic');
    run([
      'issue',
      '--key-file',
      keyPath,
      '--holder',
      'Nutrióloga Ana Jiménez',
      '--plan',
      'annual',
      '--out',
      tokenPath,
    ]);
    const token = readFileSync(tokenPath, 'utf8');

    const payload = verifyLicenseToken(token, publicKey);
    expect(payload.holder).toBe('Nutrióloga Ana Jiménez');
    expect(payload.plan).toBe('annual');
    // Longer than the billing period on purpose: a late renewal must never
    // interrupt a consultation.
    expect(Date.parse(payload.expiresAt) - Date.parse(payload.issuedAt)).toBeGreaterThan(
      365 * 24 * 60 * 60 * 1000,
    );
  });

  it('produces a file the practitioner can load straight into the app', () => {
    const tokenPath = path.join(dir, 'monthly.nplic');
    run([
      'issue',
      '--key-file',
      keyPath,
      '--holder',
      'Ana',
      '--plan',
      'monthly',
      '--out',
      tokenPath,
    ]);

    const userDataPath = mkdtempSync(path.join(dir, 'userdata-'));
    const manager = new LicenseManager({ userDataPath, publicKey });
    const status = manager.activate(readFileSync(tokenPath, 'utf8'));

    expect(status.state).toBe('active');
    expect(status.plan).toBe('monthly');
    expect(manager.canWrite()).toBe(true);
  });

  it('refuses a plan it does not know', () => {
    expect(() =>
      run(['issue', '--key-file', keyPath, '--holder', 'Ana', '--plan', 'lifetime']),
    ).toThrow();
  });
});
