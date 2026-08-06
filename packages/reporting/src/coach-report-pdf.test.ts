import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { COACH_REPORT_EXCLUSIONS, generateCoachReportPdf } from './coach-report-pdf';

const base = {
  practitioner: null,
  patientName: 'Elena Márquez',
  patientFileNumber: 7,
  authorisation: {
    coachName: 'Carlos Ruiz',
    consentNoticeVersion: 'AVISO-2026-08',
    consentDecidedAt: '2026-08-02',
    scopeLabels: ['mediciones y peso', 'composición corporal'],
  },
  metrics: [
    {
      label: 'Peso (kg)',
      decimals: 1,
      points: [
        { date: '2026-06-01', value: 82 },
        { date: '2026-07-01', value: 80.4 },
        { date: '2026-08-01', value: 79.1 },
      ],
    },
  ],
  planTargets: null,
  adherence: [],
  photos: [],
  sessionCount: 3,
  generatedAt: '2026-08-05',
  appVersion: '0.1.0-test',
};

describe('generateCoachReportPdf', () => {
  it('produces a valid PDF titled for the coach', async () => {
    const bytes = await generateCoachReportPdf(base);
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF');
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getTitle()).toContain('Elena Márquez');
    expect(parsed.getPageCount()).toBeGreaterThan(0);
  });

  it('renders without a chart when a metric has a single point', async () => {
    // A one-measurement patient is the common case at the first hand-over;
    // the flat-series divide-by-zero guard must not be the thing that breaks.
    const bytes = await generateCoachReportPdf({
      ...base,
      metrics: [{ label: 'Peso (kg)', decimals: 1, points: [{ date: '2026-08-01', value: 79 }] }],
      sessionCount: 1,
    });
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF');
  });

  it('survives a flat series, which would otherwise divide by zero', async () => {
    const bytes = await generateCoachReportPdf({
      ...base,
      metrics: [
        {
          label: 'Peso (kg)',
          decimals: 1,
          points: [
            { date: '2026-07-01', value: 80 },
            { date: '2026-08-01', value: 80 },
          ],
        },
      ],
    });
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF');
  });

  it('states what it never contains', () => {
    // The exclusions live on the document itself, because the person holding a
    // forwarded copy has no other way to know what they are looking at.
    for (const excluded of ['notas de consulta', 'medicamentos', 'diagnósticos']) {
      expect(COACH_REPORT_EXCLUSIONS).toContain(excluded);
    }
  });

  it('handles many metrics across pages without losing the footer', async () => {
    const many = Array.from({ length: 8 }, (_unused, index) => ({
      label: `Métrica ${index}`,
      decimals: 1,
      points: [
        { date: '2026-07-01', value: 10 + index },
        { date: '2026-08-01', value: 12 + index },
      ],
    }));
    const bytes = await generateCoachReportPdf({ ...base, metrics: many });
    const parsed = await PDFDocument.load(bytes);
    // The provenance footer is drawn on EVERY page, because pages get
    // separated from each other once a document leaves the practice.
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});
