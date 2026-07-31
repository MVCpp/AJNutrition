import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Store } from './db.ts';
import { LoginThrottle, parseCookies, signSession, verifyPassword, verifySession } from './auth.ts';
import { handleRefresh, issueLicence, setLicenceSuspended, type Signer } from './licences.ts';
import { customerPage, customersPage, eventsPage, loginPage } from './views.ts';

/**
 * HTTP layer. `node:http` directly — a framework would add a dependency tree
 * to the one machine that holds the signing key, to route about a dozen paths.
 */

export interface ServerConfig {
  store: Store;
  signer: Signer;
  adminPasswordHash: string;
  sessionSecret: string;
  now?: () => Date;
  /** Behind a TLS-terminating proxy in production; false only for local runs. */
  secureCookies?: boolean;
}

const SESSION_COOKIE = 'ajn_admin';
const SESSION_HOURS = 12;
const MAX_BODY_BYTES = 16 * 1024;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // An unauthenticated caller must not be able to make us buffer memory.
    if (total > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    // The console renders no third-party anything and runs no client script.
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  });
  res.end(body);
}

const html = (res: ServerResponse, body: string, status = 200) =>
  send(res, status, body, 'text/html; charset=utf-8');
const json = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

export function createLicenseServer(config: ServerConfig): Server {
  const now = config.now ?? (() => new Date());
  const throttle = new LoginThrottle();

  const authed = (req: IncomingMessage): boolean =>
    verifySession(
      config.sessionSecret,
      parseCookies(req.headers.cookie)[SESSION_COOKIE],
      now().getTime(),
    );

  return createServer((req, res) => {
    void handle(req, res).catch(() => {
      // Never leak a stack trace to an unauthenticated caller.
      if (!res.headersSent) send(res, 500, 'error', 'text/plain');
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // --- public: the only endpoint the desktop app talks to ---
    if (path === '/refresh' && method === 'POST') {
      let input: unknown;
      try {
        input = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'bad request' });
      }
      const result = handleRefresh(
        config.store,
        config.signer,
        (input ?? {}) as { token: unknown; deviceId: unknown; appVersion: unknown },
        now(),
      );
      // A refusal says nothing about WHY. Distinguishing "unknown licence"
      // from "revoked" would turn this into an oracle for probing licence ids.
      if (result.kind === 'refused') return json(res, 200, {});
      return json(res, 200, { token: result.token });
    }

    if (path === '/healthz') return send(res, 200, 'ok', 'text/plain');

    // --- console ---
    if (path === '/admin/login' && method === 'POST') {
      const delay = throttle.delayMs(now().getTime());
      if (delay > 0) {
        return html(
          res,
          loginPage(`Demasiados intentos. Espere ${Math.ceil(delay / 1000)} s.`),
          429,
        );
      }
      const form = new URLSearchParams(await readBody(req));
      if (!verifyPassword(form.get('password') ?? '', config.adminPasswordHash)) {
        throttle.fail(now().getTime());
        return html(res, loginPage('Contraseña incorrecta.'), 401);
      }
      throttle.succeed();
      const cookie = signSession(
        config.sessionSecret,
        now().getTime() + SESSION_HOURS * 60 * 60 * 1000,
      );
      res.writeHead(303, {
        location: '/admin',
        'set-cookie': `${SESSION_COOKIE}=${cookie}; HttpOnly; SameSite=Strict; Path=/${
          config.secureCookies === false ? '' : '; Secure'
        }`,
      });
      res.end();
      return;
    }

    if (path === '/admin/logout' && method === 'POST') {
      res.writeHead(303, {
        location: '/admin',
        'set-cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      });
      res.end();
      return;
    }

    if (path.startsWith('/admin')) {
      if (!authed(req)) return html(res, loginPage(), 401);
      return adminRoutes(req, res, path, method, url);
    }

    if (path === '/') return redirect(res, '/admin');
    return send(res, 404, 'not found', 'text/plain');
  }

  async function adminRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string,
    url: URL,
  ): Promise<void> {
    const { store, signer } = config;
    const at = now();

    if (path === '/admin' && method === 'GET') {
      return html(res, customersPage(store, at.getTime()));
    }

    if (path === '/admin/events' && method === 'GET') {
      return html(res, eventsPage(store.recentEvents()));
    }

    if (path === '/admin/customer' && method === 'GET') {
      const customer = store.getCustomer(url.searchParams.get('id') ?? '');
      if (customer === null) return send(res, 404, 'not found', 'text/plain');
      const licences = store.licencesForCustomer(customer.id);
      const devices = new Map(licences.map((l) => [l.id, store.devicesFor(l.id)]));
      const issuedId = url.searchParams.get('issued');
      const issued = issuedId ? (store.getLicence(issuedId) ?? undefined) : undefined;
      return html(res, customerPage(customer, licences, devices, at.getTime(), issued));
    }

    if (method !== 'POST') return send(res, 404, 'not found', 'text/plain');
    const form = new URLSearchParams(await readBody(req));

    if (path === '/admin/customer/create') {
      const id = `cus_${randomUUID().slice(0, 8)}`;
      store.createCustomer({
        id,
        name: (form.get('name') ?? '').trim() || 'Sin nombre',
        email: (form.get('email') ?? '').trim(),
        rfc: (form.get('rfc') ?? '').trim() || null,
        notes: (form.get('notes') ?? '').trim() || null,
        createdAt: at.toISOString(),
      });
      store.record(at.toISOString(), null, 'customer.create', id);
      return redirect(res, `/admin/customer?id=${encodeURIComponent(id)}`);
    }

    const licenceId = form.get('licenceId') ?? '';
    const licence = licenceId ? store.getLicence(licenceId) : null;

    if (path === '/admin/licence/issue') {
      const customerId = form.get('customerId') ?? '';
      const customer = store.getCustomer(customerId);
      if (customer === null) return send(res, 404, 'not found', 'text/plain');
      const daysRaw = Number((form.get('days') ?? '').trim());
      const issued = issueLicence(store, signer, {
        customerId,
        holder: (form.get('holder') ?? '').trim() || customer.name,
        plan: (form.get('plan') ?? 'annual') as 'monthly' | 'annual' | 'perpetual',
        ...(Number.isInteger(daysRaw) && daysRaw > 0 ? { days: daysRaw } : {}),
        now: at,
      });
      store.record(
        at.toISOString(),
        issued.id,
        'licence.issue',
        `${issued.plan} → ${issued.expiresAt.slice(0, 10)}`,
      );
      return redirect(
        res,
        `/admin/customer?id=${encodeURIComponent(customerId)}&issued=${encodeURIComponent(issued.id)}`,
      );
    }

    if (licence === null) return send(res, 404, 'not found', 'text/plain');
    const customer = store.getCustomer(licence.customerId);
    const holder = customer?.name ?? 'Cliente';
    const back = `/admin/customer?id=${encodeURIComponent(licence.customerId)}`;

    if (path === '/admin/licence/suspend' || path === '/admin/licence/reinstate') {
      const suspend = path.endsWith('suspend');
      setLicenceSuspended(store, signer, licence, suspend, holder, at);
      store.record(
        at.toISOString(),
        licence.id,
        suspend ? 'licence.suspend' : 'licence.reinstate',
        // Suspension pauses writes; it never shortens what she paid for.
        `expiry unchanged (${licence.expiresAt.slice(0, 10)})`,
      );
      return redirect(res, back);
    }

    if (path === '/admin/licence/renew') {
      const renewed = issueLicence(store, signer, {
        customerId: licence.customerId,
        holder,
        plan: licence.plan,
        licenceId: licence.id,
        now: at,
      });
      store.record(
        at.toISOString(),
        licence.id,
        'licence.renew',
        `→ ${renewed.expiresAt.slice(0, 10)}`,
      );
      return redirect(res, `${back}&issued=${encodeURIComponent(licence.id)}`);
    }

    if (path === '/admin/licence/revoke') {
      store.upsertLicence({ ...licence, status: 'revoked', updatedAt: at.toISOString() });
      store.record(
        at.toISOString(),
        licence.id,
        'licence.revoke',
        'no further tokens issued; the app keeps what it holds until it expires',
      );
      return redirect(res, back);
    }

    if (path === '/admin/device/forget') {
      store.forgetDevice(licence.id, form.get('deviceId') ?? '');
      store.record(at.toISOString(), licence.id, 'device.forget', form.get('deviceId') ?? '');
      return redirect(res, back);
    }

    return send(res, 404, 'not found', 'text/plain');
  }
}
