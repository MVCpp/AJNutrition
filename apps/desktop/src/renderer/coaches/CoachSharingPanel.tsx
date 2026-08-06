import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  PatientCoachLinkDto,
  PatientDto,
  ShareIneffectiveReason,
  ShareScopeDto,
} from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';

/**
 * Authorising a coach to see a patient's progress (C-2).
 *
 * Two things this screen must never let happen, and both are enforced in the
 * main process rather than here — a UI check is a suggestion:
 *
 *  * sharing without an express `third_party_transfer` consent from the
 *    patient; and
 *  * sharing anything outside the granted scope.
 *
 * What the UI is responsible for is being honest about the state. When a
 * consent is withdrawn the authorisation stops instantly, and this panel has
 * to SAY so — an authorisation that silently stopped working looks identical
 * to one that is quietly still running.
 */

const SCOPE_FIELDS = [
  'measurements',
  'bodyComposition',
  'planTargets',
  'adherence',
  'photos',
] as const;

const EMPTY_SCOPE: ShareScopeDto = {
  measurements: false,
  bodyComposition: false,
  planTargets: false,
  adherence: false,
  photos: false,
};

/** Sensible starting point: the outcomes a trainer actually programs against. */
const DEFAULT_SCOPE: ShareScopeDto = {
  ...EMPTY_SCOPE,
  measurements: true,
  bodyComposition: true,
};

export function CoachSharingPanel({
  patient,
  link,
}: {
  patient: PatientDto;
  link: PatientCoachLinkDto;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [consentId, setConsentId] = useState('');
  const [scope, setScope] = useState<ShareScopeDto>(DEFAULT_SCOPE);

  const sharingQuery = useQuery({
    queryKey: ['coach-sharing', patient.id],
    queryFn: () => unwrap(window.ajnutrition.coach.sharing({ patientId: patient.id })),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['coach-sharing', patient.id] });

  const grantMutation = useMutation({
    mutationFn: () =>
      unwrap(window.ajnutrition.coach.grantShare({ linkId: link.id, consentId, scope })),
    onSuccess: async () => {
      await invalidate();
      setConsentId('');
      setScope(DEFAULT_SCOPE);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.coach.exportReport({ linkId: link.id })),
  });

  const revokeMutation = useMutation({
    mutationFn: (grantId: string) => unwrap(window.ajnutrition.coach.revokeShare({ grantId })),
    onSuccess: invalidate,
  });

  const error =
    grantMutation.error instanceof ApiError
      ? grantMutation.error
      : revokeMutation.error instanceof ApiError
        ? revokeMutation.error
        : exportMutation.error instanceof ApiError
          ? exportMutation.error
          : null;

  const grants = sharingQuery.data?.grants ?? [];
  const eligible = sharingQuery.data?.eligibleConsents ?? [];
  const live = grants.find((grant) => grant.revokedAt === null) ?? null;
  const history = grants.filter((grant) => grant.revokedAt !== null);

  const reasonText = (reason: ShareIneffectiveReason | null): string =>
    reason === null ? '' : t(`sharing.reason.${reason}`);

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-700">{t('sharing.heading')}</h3>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </p>
      )}

      {sharingQuery.isLoading && <p className="text-sm text-slate-500">{t('coaches.loading')}</p>}

      {live !== null && (
        <div
          className={
            live.effective
              ? 'rounded-md border border-emerald-200 bg-emerald-50 p-3'
              : 'rounded-md border border-amber-300 bg-amber-50 p-3'
          }
        >
          <p className="text-sm font-medium text-slate-800">
            {live.effective ? t('sharing.active') : t('sharing.suspended')}
          </p>
          {!live.effective && (
            <p role="status" className="mt-1 text-xs text-amber-900">
              {reasonText(live.reason)}
            </p>
          )}
          {/* Granted, with anything no longer effective struck through. Showing
              the granted scope alone would promise the trainer data the report
              does not contain; showing only the effective scope would hide what
              she actually authorised. Both facts are true and she needs both. */}
          <ul className="mt-2 flex flex-wrap gap-2">
            {SCOPE_FIELDS.filter((field) => live.scope[field]).map((field) => (
              <li
                key={field}
                className={
                  live.effective && !live.effectiveScope[field]
                    ? 'rounded-full bg-white px-2 py-0.5 text-xs text-slate-400 line-through ring-1 ring-slate-200'
                    : 'rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200'
                }
              >
                {t(`sharing.scope.${field}`)}
              </li>
            ))}
          </ul>
          {/* The photo consent can lapse on its own, leaving the authorisation
              live but narrower. Silence here would read as "photos are going". */}
          {live.effective && live.scope.photos && !live.effectiveScope.photos && (
            <p role="status" className="mt-2 text-xs text-amber-900">
              {t('sharing.photosDropped')}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Only offered while the authorisation is effective. The main
                process refuses anyway — this just avoids offering a button
                whose only outcome is an error. */}
            {live.effective && (
              <button
                type="button"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {t('sharing.exportReport')}
              </button>
            )}
            <button
              type="button"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (!window.confirm(t('sharing.revokeConfirm'))) return;
                revokeMutation.mutate(live.id);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {t('sharing.revoke')}
            </button>
          </div>
          {exportMutation.data && !exportMutation.data.canceled && (
            <p role="status" className="mt-2 text-xs text-emerald-900">
              {t('sharing.exported', { fileName: exportMutation.data.fileName })}
            </p>
          )}
        </div>
      )}

      {live === null && !sharingQuery.isLoading && (
        <div className="space-y-3">
          {eligible.length === 0 ? (
            // Not an error state — it is the normal one until she has had the
            // conversation with the patient and recorded the answer.
            <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {t('sharing.needsConsent')}
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="share-consent"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  {t('sharing.consentLabel')}
                </label>
                <select
                  id="share-consent"
                  value={consentId}
                  onChange={(event) => setConsentId(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-emerald-700"
                >
                  <option value="">{t('sharing.consentPlaceholder')}</option>
                  {eligible.map((consent) => (
                    <option key={consent.consentId} value={consent.consentId}>
                      {consent.decidedAt.slice(0, 10)} · {consent.noticeVersion}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-medium text-slate-700">
                  {t('sharing.scopeLegend')}
                </legend>
                <div className="flex flex-wrap gap-4">
                  {SCOPE_FIELDS.map((field) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={scope[field]}
                        onChange={(event) =>
                          setScope((previous) => ({ ...previous, [field]: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                      />
                      {t(`sharing.scope.${field}`)}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">{t('sharing.scopeNote')}</p>
              </fieldset>

              <button
                type="button"
                disabled={consentId === '' || grantMutation.isPending}
                onClick={() => grantMutation.mutate()}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {t('sharing.grant')}
              </button>
            </>
          )}
        </div>
      )}

      {history.length > 0 && (
        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm text-slate-700">
            {t('sharing.historyHeading', { count: history.length })}
          </summary>
          {/* The answer to "who has been allowed to see my data?" — an ARCO
              access right, and a question she must be able to answer with the
              patient in front of her. */}
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {history.map((grant) => (
              <li key={grant.id}>
                {grant.coachDisplayName} ·{' '}
                {t('sharing.historyRow', {
                  from: grant.grantedAt.slice(0, 10),
                  to: grant.revokedAt?.slice(0, 10) ?? '',
                })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
