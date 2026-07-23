import { AppError } from '@ajnutrition/shared';
import type { DomainContext } from '../common/context';

export type ConsentType =
  'data_processing' | 'photo' | 'ai_processing' | 'communications' | 'third_party_transfer';

export type ConsentMethod = 'verbal' | 'written' | 'digital';
export type ConsentStatus = 'accepted' | 'declined' | 'withdrawn';

/**
 * Consent record (Privacy and Consent bounded context).
 *
 * Legal-fact semantics: records are append-only. Granting a new consent of
 * the same type supersedes older ones implicitly (latest decision wins);
 * nothing is edited or deleted. Withdrawal is the single permitted state
 * transition: accepted → withdrawn, stamped with withdrawnAt.
 */
export interface ConsentRecord {
  readonly id: string;
  readonly patientId: string;
  readonly consentType: ConsentType;
  readonly noticeVersion: string;
  readonly status: ConsentStatus;
  readonly method: ConsentMethod;
  readonly decidedAt: string;
  readonly withdrawnAt: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}

export function createConsentRecord(
  input: {
    patientId: string;
    consentType: ConsentType;
    noticeVersion: string;
    decision: 'accepted' | 'declined';
    method: ConsentMethod;
    notes?: string | undefined;
  },
  ctx: DomainContext,
): ConsentRecord {
  const noticeVersion = input.noticeVersion.trim();
  if (noticeVersion.length === 0) {
    throw new AppError({
      code: 'VALIDATION',
      message: 'La versión del aviso de privacidad es obligatoria.',
      fieldErrors: { noticeVersion: ['required'] },
    });
  }
  const nowIso = ctx.now().toISOString();
  return {
    id: ctx.newId(),
    patientId: input.patientId,
    consentType: input.consentType,
    noticeVersion,
    status: input.decision,
    method: input.method,
    decidedAt: nowIso,
    withdrawnAt: null,
    notes: input.notes?.trim() || null,
    createdAt: nowIso,
  };
}

/** accepted → withdrawn. Any other starting state is a conflict, never a no-op. */
export function withdrawConsent(record: ConsentRecord, ctx: DomainContext): ConsentRecord {
  if (record.status !== 'accepted') {
    throw new AppError({
      code: 'CONFLICT',
      message:
        record.status === 'withdrawn'
          ? 'Este consentimiento ya fue retirado.'
          : 'Solo un consentimiento otorgado puede retirarse.',
    });
  }
  return {
    ...record,
    status: 'withdrawn',
    withdrawnAt: ctx.now().toISOString(),
  };
}

/** Latest decision per type: the current legal position for that purpose. */
export function currentConsentByType(
  records: readonly ConsentRecord[],
): Map<ConsentType, ConsentRecord> {
  const byType = new Map<ConsentType, ConsentRecord>();
  for (const record of records) {
    const existing = byType.get(record.consentType);
    if (!existing || record.decidedAt > existing.decidedAt) {
      byType.set(record.consentType, record);
    }
  }
  return byType;
}
