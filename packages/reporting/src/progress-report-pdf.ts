import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { MeasurementSessionDto } from '@ajnutrition/shared';
import type { PractitionerHeader } from './meal-plan-pdf';

/**
 * Patient-facing progress report: the same measured values the app already
 * holds, laid out to be handed over or emailed.
 *
 * Deliberately NOT a clinical summary — no notes, no diagnosis, no
 * interpretation. It shows what was measured, when, and how it moved. Every
 * number comes from a stored measurement or a frozen calculated value; this
 * module never computes clinical figures of its own, so a formula change can
 * never silently rewrite a report the patient already has.
 */

export interface ProgressMetric {
  /** Label as shown in the app, e.g. "Peso (kg)". */
  label: string;
  /** Chronological (oldest first) points; sessions missing the metric are absent. */
  points: Array<{ date: string; value: number }>;
  /** Fewer decimals than the raw value would print, e.g. 1 for kg. */
  decimals: number;
}

export interface ProgressReportInput {
  practitioner: PractitionerHeader | null;
  patientName: string;
  patientFileNumber: number;
  metrics: ProgressMetric[];
  sessions: MeasurementSessionDto[];
  generatedAt: string;
  appVersion: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.12, 0.16, 0.2);
const GRAY = rgb(0.45, 0.5, 0.55);
const ACCENT = rgb(0.02, 0.47, 0.34);
const GRID = rgb(0.87, 0.9, 0.92);

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export async function generateProgressReportPdf(input: ProgressReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Reporte de progreso - ${input.patientName}`);
  doc.setProducer(`NutriPlan ${input.appVersion}`);
  doc.setCreator(`NutriPlan ${input.appVersion}`);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([A4.width, A4.height]);
  let y = A4.height - MARGIN;

  const newPage = () => {
    page = doc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN + 20) newPage();
  };
  const text = (
    value: string,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const size = options.size ?? 10;
    ensure(size + 4);
    page.drawText(value, {
      x: MARGIN,
      y: y - size,
      size,
      font: options.bold ? bold : font,
      color: options.color ?? INK,
    });
    y -= size + (options.gap ?? 4);
  };

  if (input.practitioner) {
    const p = input.practitioner;
    text(p.fullName, { size: 15, bold: true, color: ACCENT, gap: 3 });
    if (p.title) text(p.title, { size: 10, color: GRAY, gap: 2 });
    if (p.license) text(`Cédula profesional: ${p.license}`, { size: 9, color: GRAY, gap: 2 });
    const contact = [p.phone, p.email].filter(Boolean).join(' · ');
    if (contact) text(contact, { size: 9, color: GRAY, gap: 8 });
  }

  text('Reporte de progreso', { size: 17, bold: true, gap: 6 });
  text(`Paciente: ${input.patientName}   ·   Expediente: ${input.patientFileNumber}`, { gap: 10 });

  for (const metric of input.metrics) {
    if (metric.points.length === 0) continue;
    ensure(120);
    const first = metric.points[0];
    const last = metric.points.at(-1);
    if (first === undefined || last === undefined) continue;

    text(metric.label, { size: 12, bold: true, gap: 4 });
    const change = last.value - first.value;
    const sign = change > 0 ? '+' : '';
    text(
      `Inicio ${fmt(first.value, metric.decimals)} (${first.date})   ·   ` +
        `Actual ${fmt(last.value, metric.decimals)} (${last.date})   ·   ` +
        `Cambio ${sign}${fmt(change, metric.decimals)}`,
      { size: 9, color: GRAY, gap: 8 },
    );

    // A plain line chart: with two or more points the shape is the message.
    if (metric.points.length >= 2) {
      const chartHeight = 70;
      const chartWidth = A4.width - MARGIN * 2;
      ensure(chartHeight + 16);
      const top = y;
      const bottom = y - chartHeight;
      const values = metric.points.map((point) => point.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      // A flat series must not divide by zero — draw it down the middle.
      const span = max - min || 1;
      const xAt = (index: number) =>
        MARGIN + (chartWidth * index) / Math.max(1, metric.points.length - 1);
      const yAt = (value: number) => bottom + ((value - min) / span) * chartHeight;

      page.drawLine({
        start: { x: MARGIN, y: bottom },
        end: { x: MARGIN + chartWidth, y: bottom },
        thickness: 0.7,
        color: GRID,
      });
      page.drawLine({
        start: { x: MARGIN, y: top },
        end: { x: MARGIN + chartWidth, y: top },
        thickness: 0.7,
        color: GRID,
      });
      for (let i = 1; i < metric.points.length; i += 1) {
        const previous = metric.points[i - 1];
        const current = metric.points[i];
        if (previous === undefined || current === undefined) continue;
        page.drawLine({
          start: { x: xAt(i - 1), y: yAt(previous.value) },
          end: { x: xAt(i), y: yAt(current.value) },
          thickness: 1.4,
          color: ACCENT,
        });
      }
      page.drawText(fmt(max, metric.decimals), {
        x: MARGIN + chartWidth + 2,
        y: top - 4,
        size: 7,
        font,
        color: GRAY,
      });
      page.drawText(fmt(min, metric.decimals), {
        x: MARGIN + chartWidth + 2,
        y: bottom - 2,
        size: 7,
        font,
        color: GRAY,
      });
      y = bottom - 14;
    }
  }

  ensure(40);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: A4.width - MARGIN, y },
    thickness: 0.7,
    color: GRID,
  });
  y -= 12;
  text(`Mediciones incluidas: ${input.sessions.length}`, { size: 8, color: GRAY, gap: 2 });
  text(`Generado el ${input.generatedAt} · NutriPlan ${input.appVersion}`, {
    size: 8,
    color: GRAY,
  });

  return doc.save();
}
