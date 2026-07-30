import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  DEFAULT_LICENSE_POLICY,
  evaluateLicense,
  verifyLicenseToken,
  type LicensePolicy,
  type LicenseRecord,
  type LicenseStatus,
} from '@ajnutrition/security';
import { AppError, type LicenseStatusDto } from '@ajnutrition/shared';

/**
 * Owns the licence file and the state machine (docs/product/subscription.md
 * §3, phase S-1).
 *
 * The record lives in `userData/license.json`, deliberately OUTSIDE the
 * encrypted database: status has to be readable before unlock, so the lock
 * screen can say "read-only" instead of surprising her after she types her
 * passphrase.
 *
 * This module imports nothing from `electron`. CI runs the suite under plain
 * node, where importing electron fails outright, so the userData path is
 * injected by the caller (docs/product/e2e.md).
 */

const LicenseFileSchema = z
  .object({
    token: z.string().nullable(),
    trialStartedAt: z.string().nullable(),
    lastSeenAt: z.string().nullable(),
  })
  .strict();

const EMPTY: LicenseRecord = { token: null, trialStartedAt: null, lastSeenAt: null };

/**
 * Highest of the two instants. Compared as numbers, not strings: the file is
 * plain JSON on disk and a hand-edited timestamp in another format would make
 * lexicographic comparison quietly wrong in the attacker's favour.
 */
function laterIso(stored: string | null, nowIso: string): string {
  if (!stored) return nowIso;
  const storedMs = Date.parse(stored);
  if (Number.isNaN(storedMs)) return nowIso;
  return storedMs > Date.parse(nowIso) ? stored : nowIso;
}

export interface LicenseManagerOptions {
  userDataPath: string;
  /** Base64 SPKI DER of the issuer's Ed25519 public key. */
  publicKey: string;
  now?: () => Date;
  policy?: LicensePolicy;
}

/**
 * What the app reports when no issuer key is compiled in: permanently usable,
 * and flagged so the UI knows to stay out of the way.
 */
const INERT: LicenseStatus = {
  state: 'active',
  canWrite: true,
  holder: null,
  plan: null,
  licenseId: null,
  endsAt: null,
  daysRemaining: 0,
  invalidToken: false,
  clockTampered: false,
};

export class LicenseManager {
  private readonly filePath: string;
  private readonly now: () => Date;
  private readonly policy: LicensePolicy;

  /** False while `license-key.ts` carries no key: the layer is switched off. */
  get enforced(): boolean {
    return this.options.publicKey.length > 0;
  }

  constructor(private readonly options: LicenseManagerOptions) {
    this.filePath = path.join(options.userDataPath, 'license.json');
    this.now = options.now ?? (() => new Date());
    this.policy = options.policy ?? DEFAULT_LICENSE_POLICY;
  }

  private read(): LicenseRecord {
    if (!existsSync(this.filePath)) return EMPTY;
    try {
      const parsed = LicenseFileSchema.safeParse(JSON.parse(readFileSync(this.filePath, 'utf8')));
      return parsed.success ? parsed.data : EMPTY;
    } catch {
      // A corrupt file must not be a lockout. Falling back to EMPTY puts her
      // on the trial rules, which is the generous direction to fail in.
      return EMPTY;
    }
  }

  private write(record: LicenseRecord): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }

  /**
   * Reads the current status, stamping the trial start on first run and
   * advancing the high-water clock mark.
   *
   * `lastSeenAt` only ever moves forwards: that is what stops winding the
   * machine clock back from buying free months, and it costs an honest user
   * nothing (docs/product/subscription.md §3).
   */
  status(): LicenseStatus {
    if (!this.enforced) return INERT;
    const stored = this.read();
    const nowIso = this.now().toISOString();
    const record: LicenseRecord = {
      token: stored.token,
      trialStartedAt: stored.trialStartedAt ?? nowIso,
      lastSeenAt: laterIso(stored.lastSeenAt, nowIso),
    };
    if (
      record.trialStartedAt !== stored.trialStartedAt ||
      record.lastSeenAt !== stored.lastSeenAt
    ) {
      try {
        this.write(record);
      } catch {
        // A read-only or full disk must not stop the app from starting. The
        // in-memory status below is still correct for this session.
      }
    }
    return evaluateLicense(record, this.options.publicKey, this.now(), this.policy);
  }

  /** The single question the IPC guard asks before running a write command. */
  canWrite(): boolean {
    return this.status().canWrite;
  }

  /**
   * Stores a pasted licence. Verifies BEFORE writing, so a typo can never
   * replace a working licence with a broken one.
   */
  activate(token: string): LicenseStatus {
    if (!this.enforced) {
      throw new AppError({
        code: 'LICENSE',
        message: 'Esta versión no requiere licencia.',
        internalDetail: 'activate called with no issuer public key compiled in',
      });
    }
    const trimmed = token.trim();
    const payload = verifyLicenseToken(trimmed, this.options.publicKey);
    const expiresMs = Date.parse(payload.expiresAt);
    const graceEndsMs = expiresMs + this.policy.graceDays * 24 * 60 * 60 * 1000;
    const stored = this.read();
    const nowIso = this.now().toISOString();
    const effectiveMs = Math.max(
      this.now().getTime(),
      stored.lastSeenAt ? Date.parse(stored.lastSeenAt) : 0,
    );
    // Refusing a dead licence here — rather than storing it and going expired —
    // is the difference between "this licence ran out in March" and a silent
    // downgrade she has to work out for herself.
    if (effectiveMs >= graceEndsMs) {
      throw new AppError({
        code: 'LICENSE',
        message: `Esa licencia venció el ${payload.expiresAt.slice(0, 10)}. Solicite una licencia nueva.`,
        internalDetail: `licence ${payload.id} expired at ${payload.expiresAt}`,
      });
    }
    this.write({
      token: trimmed,
      trialStartedAt: stored.trialStartedAt ?? nowIso,
      lastSeenAt: laterIso(stored.lastSeenAt, nowIso),
    });
    return this.status();
  }

  /** Absolute path of the licence file, for the support runbook. */
  get storePath(): string {
    return this.filePath;
  }
}

/** Domain status → the shape the renderer sees. */
export function toLicenseStatusDto(status: LicenseStatus, enforced: boolean): LicenseStatusDto {
  return {
    enforced,
    state: status.state,
    canWrite: status.canWrite,
    holder: status.holder,
    plan: status.plan,
    licenseId: status.licenseId,
    endsAt: status.endsAt,
    daysRemaining: status.daysRemaining,
    invalidToken: status.invalidToken,
    clockTampered: status.clockTampered,
  };
}
