import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PlanPdfPhoto, PractitionerHeader } from './meal-plan-pdf';
import type { ProgressMetric } from './progress-report-pdf';

/**
 * The document a coach receives (docs/product/coach-sharing.md, C-3).
 *
 * It is the progress report with one difference that matters: it says on its
 * face who it was prepared for and under whose consent. That block is not
 * decoration. A PDF sent to a trainer will eventually be forwarded to someone
 * it was never meant for, and when it is, the document has to answer "who is
 * this about, who was allowed to have it, and on what authority" without
 * anyone going back to the app.
 *
 * Everything in here has already been filtered by scope in the application
 * layer. This module renders what it is given and never reaches for more —
 * it has no access to a database and cannot widen its own inputs.
 */

export interface CoachReportAuthorisation {
  coachName: string;
  /** Version of the privacy notice the patient consented under. */
  consentNoticeVersion: string;
  /** Calendar date of the consent decision (YYYY-MM-DD). */
  consentDecidedAt: string;
  /** Human-readable list of what was authorised, in the patient's language. */
  scopeLabels: string[];
}

export interface CoachReportInput {
  practitioner: PractitionerHeader | null;
  patientName: string;
  patientFileNumber: number;
  authorisation: CoachReportAuthorisation;
  metrics: ProgressMetric[];
  planTargets: { energyKcal: number; proteinG: number } | null;
  adherence: Array<{ recordedAt: string; score: number }>;
  photos: PlanPdfPhoto[];
  sessionCount: number;
  generatedAt: string;
  appVersion: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.12, 0.16, 0.2);
const GRAY = rgb(0.45, 0.5, 0.55);
const ACCENT = rgb(0.02, 0.47, 0.34);
const GRID = rgb(0.87, 0.9, 0.92);
const NOTICE_BG = rgb(0.98, 0.96, 0.89);
const NOTICE_EDGE = rgb(0.85, 0.72, 0.4);

/** What this document never contains, stated on the document itself. */
export const COACH_REPORT_EXCLUSIONS =
  'No incluye notas de consulta, antecedentes clínicos, padecimientos, ' +
  'medicamentos, alergias, laboratorios ni diagnósticos.';

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/** Naive width-based wrap; the fonts here are metric-stable enough for it. */
function wrap(value: string, maxChars: number): string[] {
  const words = value.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateCoachReportPdf(input: CoachReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Reporte para entrenador - ${input.patientName}`);
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
    if (y - height < MARGIN + 28) newPage();
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
    if (p.license) text(`Cédula profesional: ${p.license}`, { size: 9, color: GRAY, gap: 8 });
  }

  text('Reporte de progreso para entrenador', { size: 16, bold: true, gap: 6 });
  text(`Paciente: ${input.patientName}   ·   Expediente: ${input.patientFileNumber}`, { gap: 10 });

  // --- The authorisation block: the point of this document existing ---
  const noticeLines = [
    `Preparado para: ${input.authorisation.coachName}`,
    `Compartido con el consentimiento de transferencia a terceros otorgado por el paciente el ` +
      `${input.authorisation.consentDecidedAt} (aviso ${input.authorisation.consentNoticeVersion}).`,
    `Contiene únicamente: ${input.authorisation.scopeLabels.join(', ')}.`,
    COACH_REPORT_EXCLUSIONS,
    'El paciente puede retirar este consentimiento en cualquier momento.',
  ].flatMap((line) => wrap(line, 92));

  const noticeHeight = noticeLines.length * 11 + 14;
  ensure(noticeHeight + 8);
  page.drawRectangle({
    x: MARGIN - 6,
    y: y - noticeHeight,
    width: A4.width - MARGIN * 2 + 12,
    height: noticeHeight,
    color: NOTICE_BG,
    borderColor: NOTICE_EDGE,
    borderWidth: 0.8,
  });
  let noticeY = y - 14;
  for (const [index, line] of noticeLines.entries()) {
    page.drawText(line, {
      x: MARGIN,
      y: noticeY,
      size: 8,
      font: index === 0 ? bold : font,
      color: INK,
    });
    noticeY -= 11;
  }
  y -= noticeHeight + 12;

  // --- Measured values ---
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

    if (metric.points.length >= 2) {
      const chartHeight = 60;
      const chartWidth = A4.width - MARGIN * 2;
      ensure(chartHeight + 16);
      const bottom = y - chartHeight;
      const values = metric.points.map((point) => point.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
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
      y = bottom - 14;
    }
  }

  if (input.planTargets) {
    ensure(40);
    text('Metas del plan', { size: 12, bold: true, gap: 4 });
    text(
      `Energía ${fmt(input.planTargets.energyKcal, 0)} kcal   ·   ` +
        `Proteína ${fmt(input.planTargets.proteinG, 0)} g`,
      { size: 9, color: GRAY, gap: 10 },
    );
  }

  if (input.adherence.length > 0) {
    ensure(40);
    text('Adherencia', { size: 12, bold: true, gap: 4 });
    const recent = input.adherence.slice(-8);
    for (const entry of recent) {
      text(`${entry.recordedAt}: ${entry.score}/10`, { size: 9, color: GRAY, gap: 2 });
    }
    y -= 8;
  }

  for (const photo of input.photos) {
    const image =
      photo.mime === 'image/png'
        ? await doc.embedPng(photo.bytes)
        : await doc.embedJpg(photo.bytes);
    const maxWidth = A4.width - MARGIN * 2;
    const scale = Math.min(1, maxWidth / image.width, 320 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ensure(height + 26);
    text(`${photo.kindLabel} — ${photo.capturedAt}`, { size: 9, bold: true, gap: 4 });
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
    y -= height + 12;
  }

  ensure(30);
  text(`Mediciones incluidas: ${input.sessionCount}`, { size: 8, color: GRAY, gap: 2 });

  // Every page carries the provenance, because pages get separated.
  for (const each of doc.getPages()) {
    each.drawText(
      `${input.patientName} · Exp. ${input.patientFileNumber} · para ${input.authorisation.coachName} · ` +
        `${input.generatedAt} · NutriPlan ${input.appVersion}`,
      { x: MARGIN, y: MARGIN - 18, size: 7, font, color: GRAY },
    );
  }

  return doc.save();
}
