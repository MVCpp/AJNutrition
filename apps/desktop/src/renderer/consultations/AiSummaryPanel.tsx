import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiProgressSummaryDto, PatientDto } from '@ajnutrition/shared';
import { ApiError, unwrap } from '../api';
import { Modal } from '../components/Modal';

/**
 * AI progress summary — a DRAFT for the practitioner, never a record.
 * Nothing is persisted: the text is shown for review and can be copied into a
 * consultation note only by an explicit human action (Epic 7 approval rule).
 */
export function AiSummaryPanel({ patient }: { patient: PatientDto }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<AiProgressSummaryDto | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => unwrap(window.ajnutrition.ai.progressSummary({ patientId: patient.id })),
    onSuccess: (dto) => {
      setResult(dto);
      setCopied(false);
    },
  });

  const error = generateMutation.error instanceof ApiError ? generateMutation.error.message : null;

  const asPlainText = (dto: AiProgressSummaryDto) =>
    [
      dto.summary,
      '',
      ...dto.observations.map((line) => `• ${line}`),
      '',
      ...dto.questions.map((line) => `? ${line}`),
    ].join('\n');

  return (
    <>
      <button
        type="button"
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        title={t('ai.summaryTitle')}
        className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 transition-colors hover:bg-violet-100 disabled:opacity-50"
      >
        {generateMutation.isPending ? t('ai.summaryLoading') : `✨ ${t('ai.summaryAction')}`}
      </button>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {result && (
        <Modal
          icon="✨"
          wide
          title={t('ai.summaryAction')}
          subtitle={t('ai.summarySubtitle', { model: result.model })}
          onClose={() => setResult(null)}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {t('ai.usage', {
                  input: result.usage.inputTokens,
                  output: result.usage.outputTokens,
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(asPlainText(result));
                    setCopied(true);
                  }}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  {copied ? t('ai.copied') : t('ai.copy')}
                </button>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  {t('ai.close')}
                </button>
              </div>
            </div>
          }
        >
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {t('ai.reviewWarning')}
          </div>

          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-800">{result.summary}</p>

          {result.observations.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('ai.observations')}
              </h4>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                {result.observations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}

          {result.questions.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('ai.questions')}
              </h4>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
                {result.questions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
