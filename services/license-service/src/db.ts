import { DatabaseSync } from 'node:sqlite';

/**
 * Storage for the licence service.
 *
 * SQLite, in one file, deliberately. At the scale this serves — a solo
 * practice-software business selling to tens of customers — a managed Postgres
 * is more operational surface than the problem deserves, and a single file is
 * something you can actually back up and restore under pressure.
 *
 * What lives here: who paid, what they were sold, which machines their licence
 * has been seen on. **Never anything about their patients** — there is nothing
 * about patients to store, because that data never leaves their machine.
 */

export interface Customer {
  id: string;
  name: string;
  email: string;
  /** For CFDI. Optional: not every customer will want a factura. */
  rfc: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Licence {
  id: string;
  customerId: string;
  plan: 'monthly' | 'annual' | 'perpetual';
  issuedAt: string;
  expiresAt: string;
  /** `revoked` is terminal; `suspended` can be lifted. */
  status: 'active' | 'suspended' | 'revoked';
  /** The most recent signed token handed out for this licence. */
  token: string;
  updatedAt: string;
}

export interface Device {
  licenceId: string;
  deviceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  appVersion: string;
}

export interface Event {
  id: number;
  at: string;
  licenceId: string | null;
  action: string;
  detail: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  rfc TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS licences (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL,
  token TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS licences_customer ON licences(customer_id);
CREATE TABLE IF NOT EXISTS devices (
  licence_id TEXT NOT NULL REFERENCES licences(id),
  device_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  app_version TEXT NOT NULL,
  PRIMARY KEY (licence_id, device_id)
);
-- Append-only. Every admin action and every refusal lands here, so "why is
-- this customer read-only" always has an answer.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  licence_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_licence ON events(licence_id);
`;

type Row = Record<string, unknown>;

const asString = (value: unknown): string => (typeof value === 'string' ? value : String(value));
const asNullable = (value: unknown): string | null =>
  value === null || value === undefined ? null : asString(value);

export class Store {
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- customers ---

  createCustomer(customer: Customer): void {
    this.db
      .prepare(
        `INSERT INTO customers (id, name, email, rfc, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customer.id,
        customer.name,
        customer.email,
        customer.rfc,
        customer.notes,
        customer.createdAt,
      );
  }

  listCustomers(): Customer[] {
    return (this.db.prepare(`SELECT * FROM customers ORDER BY name`).all() as Row[]).map(
      toCustomer,
    );
  }

  getCustomer(id: string): Customer | null {
    const row = this.db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Row | undefined;
    return row ? toCustomer(row) : null;
  }

  // --- licences ---

  upsertLicence(licence: Licence): void {
    this.db
      .prepare(
        `INSERT INTO licences (id, customer_id, plan, issued_at, expires_at, status, token, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           plan = excluded.plan,
           issued_at = excluded.issued_at,
           expires_at = excluded.expires_at,
           status = excluded.status,
           token = excluded.token,
           updated_at = excluded.updated_at`,
      )
      .run(
        licence.id,
        licence.customerId,
        licence.plan,
        licence.issuedAt,
        licence.expiresAt,
        licence.status,
        licence.token,
        licence.updatedAt,
      );
  }

  getLicence(id: string): Licence | null {
    const row = this.db.prepare(`SELECT * FROM licences WHERE id = ?`).get(id) as Row | undefined;
    return row ? toLicence(row) : null;
  }

  listLicences(): Licence[] {
    return (this.db.prepare(`SELECT * FROM licences ORDER BY updated_at DESC`).all() as Row[]).map(
      toLicence,
    );
  }

  licencesForCustomer(customerId: string): Licence[] {
    return (
      this.db
        .prepare(`SELECT * FROM licences WHERE customer_id = ? ORDER BY updated_at DESC`)
        .all(customerId) as Row[]
    ).map(toLicence);
  }

  // --- devices ---

  /**
   * Records that a licence was seen on a machine. The device id is a random
   * UUID the app generates on first run — not a hardware fingerprint, and it
   * says nothing about the machine or the practice.
   */
  touchDevice(licenceId: string, deviceId: string, appVersion: string, at: string): void {
    this.db
      .prepare(
        `INSERT INTO devices (licence_id, device_id, first_seen_at, last_seen_at, app_version)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(licence_id, device_id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           app_version = excluded.app_version`,
      )
      .run(licenceId, deviceId, at, at, appVersion);
  }

  devicesFor(licenceId: string): Device[] {
    return (
      this.db
        .prepare(`SELECT * FROM devices WHERE licence_id = ? ORDER BY last_seen_at DESC`)
        .all(licenceId) as Row[]
    ).map((row) => ({
      licenceId: asString(row.licence_id),
      deviceId: asString(row.device_id),
      firstSeenAt: asString(row.first_seen_at),
      lastSeenAt: asString(row.last_seen_at),
      appVersion: asString(row.app_version),
    }));
  }

  forgetDevice(licenceId: string, deviceId: string): void {
    this.db
      .prepare(`DELETE FROM devices WHERE licence_id = ? AND device_id = ?`)
      .run(licenceId, deviceId);
  }

  deviceCount(licenceId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM devices WHERE licence_id = ?`)
      .get(licenceId) as Row | undefined;
    return Number(row?.n ?? 0);
  }

  // --- events ---

  record(at: string, licenceId: string | null, action: string, detail: string): void {
    this.db
      .prepare(`INSERT INTO events (at, licence_id, action, detail) VALUES (?, ?, ?, ?)`)
      .run(at, licenceId, action, detail);
  }

  recentEvents(limit = 200): Event[] {
    return (
      this.db.prepare(`SELECT * FROM events ORDER BY id DESC LIMIT ?`).all(limit) as Row[]
    ).map((row) => ({
      id: Number(row.id),
      at: asString(row.at),
      licenceId: asNullable(row.licence_id),
      action: asString(row.action),
      detail: asString(row.detail),
    }));
  }
}

function toCustomer(row: Row): Customer {
  return {
    id: asString(row.id),
    name: asString(row.name),
    email: asString(row.email),
    rfc: asNullable(row.rfc),
    notes: asNullable(row.notes),
    createdAt: asString(row.created_at),
  };
}

function toLicence(row: Row): Licence {
  return {
    id: asString(row.id),
    customerId: asString(row.customer_id),
    plan: asString(row.plan) as Licence['plan'],
    issuedAt: asString(row.issued_at),
    expiresAt: asString(row.expires_at),
    status: asString(row.status) as Licence['status'],
    token: asString(row.token),
    updatedAt: asString(row.updated_at),
  };
}
