export type AuditResult = 'success' | 'failure' | 'denied';

export interface AuditEventInput {
  /** Verb.noun action identifier, e.g. 'patient.create'. */
  action: string;
  entityType: string;
  entityId: string | null;
  result: AuditResult;
  /**
   * Sanitized context only. NEVER pass clinical note content, passwords,
   * keys, or full patient exports — the audit log is lower-sensitivity
   * than the data it describes.
   */
  metadata?: Record<string, string | number | boolean> | undefined;
}

export interface AuditLog {
  record(event: AuditEventInput): void;
}
