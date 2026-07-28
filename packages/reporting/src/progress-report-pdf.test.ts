import { describe, expect, it } from 'vitest';
import type { MeasurementSessionDto } from '@ajnutrition/shared';
import { generateProgressReportPdf, type ProgressMetric } from './progress-report-pdf';

const metrics: ProgressMetric[] = [
  {
    label: 'Peso (kg)',
    decimals: 1,
    points: [
      { date: '2026-01-10', value: 82.4 },
      { date: '2026-04-10', value: 79.1 },
      { date: '2026-07-10', value: 77.8 },
    ],
  },
];

const sessions = [
  { id: 's1', measuredAt: '2026-01-10' },
  { id: 's2', measuredAt: '2026-04-10' },
] as unknown as MeasurementSessionDto[];

const input = {
  practitioner: null,
  patientName: 'Carmen Iñárritu',
  patientFileNumber: 12,
  metrics,
  sessions,
  generatedAt: '2026-07-28',
  appVersion: '0.1.0-test',
};

describe('progress report PDF', () => {
  it('produces a real PDF document', async () => {
    const bytes = await generateProgressReportPdf(input);
    expect(bytes.subarray(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // %PDF-
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it('survives a single measurement and a flat series without dividing by zero', async () => {
    const flat = await generateProgressReportPdf({
      ...input,
      metrics: [
        { label: 'Peso (kg)', decimals: 1, points: [{ date: '2026-01-10', value: 80 }] },
        {
          label: 'Cintura (cm)',
          decimals: 1,
          points: [
            { date: '2026-01-10', value: 95 },
            { date: '2026-04-10', value: 95 },
          ],
        },
      ],
    });
    expect(flat.length).toBeGreaterThan(1000);
  });

  it('handles a patient with no measurements at all', async () => {
    const empty = await generateProgressReportPdf({ ...input, metrics: [], sessions: [] });
    expect(empty.length).toBeGreaterThan(500);
  });
});
