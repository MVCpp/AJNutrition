import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { isAppError } from '@ajnutrition/shared';
import { redactMeta, redactText, type LogMeta } from './redact';

/**
 * Structured local logger (S-110). One JSON object per line, daily files,
 * 30-day retention. Never contains passphrases, keys, patient names, or
 * clinical content — see redact.ts. `supportCode` correlates a user-facing
 * error with its redacted technical detail here.
 *
 * Logging must never break the application: every write is best-effort.
 */

export type LogLevel = 'info' | 'warn' | 'error';

const RETENTION_DAYS = 30;
const FILE_PATTERN = /^ajnutrition-(\d{4}-\d{2}-\d{2})\.log$/;

export interface LoggerOptions {
  dir: string;
  appVersion: string;
  now?: () => Date;
}

export class Logger {
  private readonly now: () => Date;

  constructor(private readonly options: LoggerOptions) {
    this.now = options.now ?? (() => new Date());
    try {
      mkdirSync(options.dir, { recursive: true });
      this.applyRetention();
    } catch {
      // A failing log directory must not stop startup.
    }
  }

  info(component: string, event: string, meta?: LogMeta): void {
    this.write('info', component, event, meta);
  }

  warn(component: string, event: string, meta?: LogMeta): void {
    this.write('warn', component, event, meta);
  }

  error(component: string, event: string, err: unknown, meta?: LogMeta): void {
    const enriched: LogMeta = { ...(meta ?? {}) };
    if (isAppError(err)) {
      enriched['code'] = err.code;
      enriched['supportCode'] = err.supportCode;
      if (err.internalDetail !== undefined) enriched['detail'] = err.internalDetail;
    } else if (err instanceof Error) {
      enriched['detail'] = err.message;
    } else if (err !== undefined) {
      enriched['detail'] = String(err);
    }
    this.write('error', component, event, enriched);
  }

  private write(level: LogLevel, component: string, event: string, meta?: LogMeta): void {
    try {
      const timestamp = this.now();
      const line = JSON.stringify({
        ts: timestamp.toISOString(),
        level,
        component: redactText(component),
        event: redactText(event),
        appVersion: this.options.appVersion,
        ...(meta ? { meta: redactMeta(meta) } : {}),
      });
      appendFileSync(this.currentFilePath(timestamp), `${line}\n`, { mode: 0o600 });
    } catch {
      // Best-effort by design.
    }
  }

  private currentFilePath(timestamp: Date): string {
    const day = timestamp.toISOString().slice(0, 10);
    return path.join(this.options.dir, `ajnutrition-${day}.log`);
  }

  private applyRetention(): void {
    const cutoff = this.now().getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(this.options.dir)) {
      const match = FILE_PATTERN.exec(name);
      if (!match || match[1] === undefined) continue;
      if (new Date(`${match[1]}T00:00:00.000Z`).getTime() < cutoff) {
        rmSync(path.join(this.options.dir, name), { force: true });
      }
    }
  }
}
