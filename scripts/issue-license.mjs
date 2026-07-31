#!/usr/bin/env node
/**
 * Licence issuer for phase S-1 (docs/product/subscription.md §6).
 *
 * S-1 has no server: licences are issued by hand, one per customer, and sent
 * by email. This is the whole "billing system" until S-2, and it is enough to
 * sell to the first handful of customers.
 *
 *   node scripts/issue-license.mjs keygen --out ../nutriplan-issuer.key
 *   node scripts/issue-license.mjs issue --key-file ../nutriplan-issuer.key \
 *     --holder "Nutrióloga Ana Jiménez" --plan annual --days 400
 *
 * The private key must live OUTSIDE this repository and outside CI. If it
 * leaks, every licence ever issued becomes forgeable and the only remedy is
 * shipping a new public key in a new build.
 */
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'NPL1';
const PLANS = ['monthly', 'annual', 'perpetual'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function keygen(args) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

  if (typeof args.out === 'string') {
    // 0600: this file is the crown jewel.
    writeFileSync(path.resolve(args.out), `${priv}\n`, { mode: 0o600 });
    process.stdout.write(`Private key written to ${path.resolve(args.out)} (mode 0600).\n`);
  } else {
    process.stdout.write(`PRIVATE KEY (store outside this repo):\n${priv}\n\n`);
  }

  process.stdout.write(
    `Public key — paste into apps/desktop/src/main/license-key.ts:\n\n` +
      `export const LICENSE_PUBLIC_KEY = '${pub}';\n\n` +
      `Until you do, the subscription layer stays inert and nothing is gated.\n`,
  );
}

function issue(args) {
  if (typeof args['key-file'] !== 'string') fail('--key-file <path> is required.');
  if (typeof args.holder !== 'string') fail('--holder "<name>" is required.');
  const plan = typeof args.plan === 'string' ? args.plan : 'annual';
  if (!PLANS.includes(plan)) fail(`--plan must be one of: ${PLANS.join(', ')}`);

  // Always longer than the billing period, so a late renewal never interrupts
  // a consultation (docs/product/subscription.md §2).
  const defaultDays = plan === 'monthly' ? 35 : plan === 'annual' ? 400 : 36500;
  const days = args.days === undefined ? defaultDays : Number(args.days);
  if (!Number.isInteger(days) || days <= 0) fail('--days must be a positive whole number.');

  const privateKeyBase64 = readFileSync(path.resolve(args['key-file']), 'utf8').trim();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);

  // --suspend mints a licence that verifies but refuses writes. Reuse the SAME
  // --id as the licence being switched off, and note that the app only honours
  // a licence newer than the one it holds, so this must be issued now.
  const payload = {
    v: 1,
    id: typeof args.id === 'string' ? args.id : `lic_${randomUUID().slice(0, 8)}`,
    holder: args.holder,
    plan,
    ...(args.suspend === true ? { state: 'suspended' } : {}),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  if (args.suspend === true && typeof args.id !== 'string') {
    fail('--suspend needs --id <licence id> — it must replace a specific licence.');
  }

  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const key = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(segment, 'utf8'), key).toString('base64url');
  const token = `${PREFIX}.${segment}.${signature}`;

  process.stdout.write(
    `Licence ${payload.id} for ${payload.holder}\n` +
      `Plan: ${plan}   Expires: ${payload.expiresAt.slice(0, 10)}` +
      (args.suspend === true ? '   STATE: SUSPENDED (read-only)' : '') +
      `\n\n${token}\n`,
  );

  if (typeof args.out === 'string') {
    writeFileSync(path.resolve(args.out), `${token}\n`);
    process.stdout.write(`\nWritten to ${path.resolve(args.out)}\n`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (command === 'keygen') {
  keygen(args);
} else if (command === 'issue') {
  issue(args);
} else {
  process.stdout.write(
    'Usage:\n' +
      '  node scripts/issue-license.mjs keygen [--out <path>]\n' +
      '  node scripts/issue-license.mjs issue --key-file <path> --holder "<name>"\n' +
      '                                       [--plan monthly|annual|perpetual]\n' +
      '                                       [--days <n>] [--id <id>] [--out <path>]\n' +
      '                                       [--suspend]   (read-only; needs --id)\n',
  );
  process.exit(command === undefined ? 0 : 1);
}
