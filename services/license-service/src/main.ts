import { Store } from './db.ts';
import { assertPublicKey } from './tokens.ts';
import { createLicenseServer } from './server.ts';

/**
 * Entry point. Everything secret arrives through the environment; nothing
 * secret is ever written to this repository.
 *
 *   LICENSE_SIGNING_KEY   base64 PKCS8 Ed25519 private key — the crown jewel
 *   LICENSE_PUBLIC_KEY    base64 SPKI  Ed25519 public key  (must be its pair)
 *   ADMIN_PASSWORD_HASH   output of `pnpm --filter @ajnutrition/license-service hash-password`
 *   SESSION_SECRET        any long random string
 *   DB_PATH               defaults to ./license.db
 *   PORT                  defaults to 8080
 *   INSECURE_COOKIES=1    local runs over plain http only
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    process.stderr.write(`Missing required environment variable ${name}\n`);
    process.exit(1);
  }
  return value;
}

const signer = {
  privateKey: required('LICENSE_SIGNING_KEY'),
  publicKey: required('LICENSE_PUBLIC_KEY'),
};

// Fail at boot rather than on the first customer request.
try {
  assertPublicKey(signer.publicKey);
} catch {
  process.stderr.write('LICENSE_PUBLIC_KEY is not a valid base64 SPKI Ed25519 key\n');
  process.exit(1);
}

const store = new Store(process.env.DB_PATH ?? './license.db');
const server = createLicenseServer({
  store,
  signer,
  adminPasswordHash: required('ADMIN_PASSWORD_HASH'),
  sessionSecret: required('SESSION_SECRET'),
  secureCookies: process.env.INSECURE_COOKIES !== '1',
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => process.stdout.write(`license service listening on :${port}\n`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
