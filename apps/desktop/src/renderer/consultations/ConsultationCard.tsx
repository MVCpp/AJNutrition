import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsultationDto, MealPlanSummaryDto, PhotoDto } from '@ajnutrition/shared';
import { unwrap } from '../api';
import { mutationErrorMessage, useConsultationMutation } from './ConsultationsPanel';

const TYPE_KEYS = {
  initial: 'consultations.typeInitial',
  follow_up: 'consultations.typeFollowUp',
  other: 'consultations.typeOther',
} as const;

export function ConsultationCard({
  consultation,
  plans,
  photos,
}: {
  consultation: ConsultationDto;
  plans: MealPlanSummaryDto[];
  photos: PhotoDto[];
}) {
  const { t } = useTranslation();
  const [showAmendForm, setShowAmendForm] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amendContent, setAmendContent] = useState('');

  const signMutation = useConsultationMutation(consultation.patientId, () =>
    unwrap(window.ajnutrition.consultation.sign({ consultationId: consultation.id })),
  );

  const amendMutation = useConsultationMutation(consultation.patientId, () =>
    unwrap(
      window.ajnutrition.consultation.amend({
        consultationId: consultation.id,
        reason: amendReason,
        content: amendContent,
      }),
    ),
  );

  const errorMessage =
    mutationErrorMessage(signMutation.error) ?? mutationErrorMessage(amendMutation.error);

  const sections = [
    ['subjective', consultation.subjective],
    ['objective', consultation.objective],
    ['assessment', consultation.assessment],
    ['plan', consultation.plan],
  ] as const;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">{consultation.consultationDate}</h3>
          <span className="text-sm text-slate-500">
            {t(TYPE_KEYS[consultation.consultationType])}
          </span>
          <span
            className={
              consultation.status === 'signed'
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
            }
          >
            {consultation.status === 'signed'
              ? t('consultations.signed')
              : t('consultations.draft')}
          </span>
        </div>
        {consultation.status === 'signed' && consultation.signedAt && (
          <p className="text-xs text-slate-400">
            {t('consultations.signedAt', {
              date: new Date(consultation.signedAt).toLocaleString(),
            })}
          </p>
        )}
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(
          ([key, value]) =>
            value && (
              <div key={key}>
                <dt className="text-xs font-medium uppercase text-slate-500">
                  {t(`consultations.${key}`)}
                </dt>
                <dd className="whitespace-pre-wrap text-sm text-slate-800">{value}</dd>
              </div>
            ),
        )}
      </dl>

      {(plans.length > 0 || photos.length > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase text-slate-500">
              {t('consultations.linkedPlans')}
            </h4>
            {plans.length === 0 ? (
              <p className="text-xs text-slate-400">{t('consultations.noLinkedPlans')}</p>
            ) : (
              <ul className="space-y-1">
                {plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50/60 px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium text-emerald-900">{plan.name}</span>
                    <span className="text-xs text-slate-500">{plan.energyTargetKcal} kcal</span>
                    <span
                      className={
                        plan.status === 'active'
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                          : plan.status === 'archived'
                            ? 'rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600'
                            : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800'
                      }
                    >
                      {t(`plans.status.${plan.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase text-slate-500">
              {t('consultations.linkedPhotos')}
            </h4>
            {photos.length === 0 ? (
              <p className="text-xs text-slate-400">{t('consultations.noLinkedPhotos')}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {photos.map((photo) => (
                  <li
                    key={photo.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {t(`photos.kinds.${photo.kind}`)} · {photo.capturedAt}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {consultation.amendments.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-slate-500">
            {t('consultations.amendments')}
          </h4>
          <ol className="space-y-2">
            {consultation.amendments.map((amendment) => (
              <li key={amendment.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="mb-1 text-xs text-slate-500">
                  {new Date(amendment.createdAt).toLocaleString()} — {amendment.reason}
                </p>
                <p className="whitespace-pre-wrap text-slate-800">{amendment.content}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="mt-4 border-t border-slate-100 pt-4">
        {consultation.status === 'draft' ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => signMutation.mutate(undefined)}
              disabled={signMutation.isPending}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {signMutation.isPending ? t('consultations.signing') : t('consultations.sign')}
            </button>
            <p className="text-xs text-slate-500">{t('consultations.signWarning')}</p>
          </div>
        ) : showAmendForm ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              amendMutation.mutate(undefined, {
                onSuccess: () => {
                  setShowAmendForm(false);
                  setAmendReason('');
                  setAmendContent('');
                },
              });
            }}
            noValidate
          >
            <div className="mb-3">
              <label
                htmlFor={`amend-reason-${consultation.id}`}
                className="mb-1 block text-sm font-medium"
              >
                {t('consultations.amendReason')}
              </label>
              <input
                id={`amend-reason-${consultation.id}`}
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mb-3">
              <label
                htmlFor={`amend-content-${consultation.id}`}
                className="mb-1 block text-sm font-medium"
              >
                {t('consultations.amendContent')}
              </label>
              <textarea
                id={`amend-content-${consultation.id}`}
                rows={3}
                value={amendContent}
                onChange={(e) => setAmendContent(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={amendMutation.isPending || !amendReason.trim() || !amendContent.trim()}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {amendMutation.isPending
                  ? t('consultations.amendSaving')
                  : t('consultations.amendSave')}
              </button>
              <button
                type="button"
                onClick={() => setShowAmendForm(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {t('consultations.amendCancel')}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAmendForm(true)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {t('consultations.amend')}
          </button>
        )}
      </footer>
    </article>
  );
}
