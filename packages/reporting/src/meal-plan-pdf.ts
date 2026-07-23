import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { MealPlanDto } from '@ajnutrition/shared';

/**
 * Meal-plan PDF (§22, §7.4.7). Deterministic layout from structured data —
 * no HTML rendering, no network, no fonts on disk. Standard Helvetica
 * (WinAnsi) covers Spanish. Sensitive content: the caller decides where the
 * file is written; nothing is cached here.
 */

export interface PractitionerHeader {
  fullName: string;
  title: string | null;
  license: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** PNG or JPEG bytes, already validated by the caller. */
  logo: { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } | null;
}

export interface PlanPdfPhoto {
  kindLabel: string;
  capturedAt: string;
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
}

export interface MealPlanPdfInput {
  practitioner: PractitionerHeader | null;
  patientName: string;
  patientFileNumber: number;
  plan: MealPlanDto;
  slotLabels: Record<string, string>;
  photos: PlanPdfPhoto[];
  generatedAt: string;
  appVersion: string;
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.12, 0.16, 0.2);
const GRAY = rgb(0.45, 0.5, 0.55);
const ACCENT = rgb(0.02, 0.47, 0.34);

class Writer {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.addPage();
  }

  addPage(): void {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(this.page);
    this.y = A4.height - MARGIN;
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN + 20) this.addPage();
  }

  text(
    value: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {},
  ): void {
    const size = options.size ?? 10;
    this.ensure(size + 4);
    this.page.drawText(value, {
      x: MARGIN + (options.indent ?? 0),
      y: this.y - size,
      size,
      font: options.bold ? this.bold : this.font,
      color: options.color ?? INK,
    });
    this.y -= size + (options.gap ?? 4);
  }

  rule(gap = 10): void {
    this.ensure(gap);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: A4.width - MARGIN, y: this.y - 4 },
      thickness: 0.7,
      color: rgb(0.85, 0.88, 0.9),
    });
    this.y -= gap;
  }

  space(height: number): void {
    this.ensure(height);
    this.y -= height;
  }
}

function macro(plan: MealPlanDto, totals: MealPlanDto['dayPlans'][number]['totals'], id: string) {
  return totals.find((t) => t.nutrientId === id);
}

export async function generateMealPlanPdf(input: MealPlanPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Plan alimentario - ${input.plan.name}`);
  doc.setProducer(`AJNutrition ${input.appVersion}`);
  doc.setCreator(`AJNutrition ${input.appVersion}`);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, font, bold);

  // --- Practitioner header ---
  if (input.practitioner) {
    const p = input.practitioner;
    if (p.logo) {
      const image =
        p.logo.mime === 'image/png'
          ? await doc.embedPng(p.logo.bytes)
          : await doc.embedJpg(p.logo.bytes);
      const logoHeight = 42;
      const scale = logoHeight / image.height;
      writer.page.drawImage(image, {
        x: A4.width - MARGIN - image.width * scale,
        y: writer.y - logoHeight,
        width: image.width * scale,
        height: logoHeight,
      });
    }
    writer.text(p.fullName, { size: 15, bold: true, color: ACCENT, gap: 3 });
    if (p.title) writer.text(p.title, { size: 10, color: GRAY, gap: 2 });
    if (p.license)
      writer.text(`Cédula profesional: ${p.license}`, { size: 9, color: GRAY, gap: 2 });
    const contact = [p.phone, p.email, p.address].filter(Boolean).join(' · ');
    if (contact) writer.text(contact, { size: 9, color: GRAY, gap: 2 });
    writer.rule(14);
  }

  // --- Plan + patient ---
  writer.text(input.plan.name, { size: 17, bold: true, gap: 6 });
  writer.text(`Paciente: ${input.patientName}   ·   Expediente: ${input.patientFileNumber}`, {
    size: 10,
    gap: 3,
  });

  const t = input.plan.targets;
  writer.text(
    `Metas diarias: ${t.energyKcal} kcal · Proteínas ${t.proteinG} g · Hidratos ${t.carbohydrateG} g · Grasas ${t.fatG} g`,
    { size: 10, bold: true, gap: 3 },
  );
  const source = input.plan.targetSource;
  if (source['type'] === 'measurement') {
    writer.text(
      `Base: GER ${source['reeKcal']} kcal (Mifflin-St Jeor v${source['reeFormulaVersion']}) × PAL ${source['pal']}` +
        `${Number(source['adjustmentKcal']) !== 0 ? ` ${Number(source['adjustmentKcal']) > 0 ? '+' : ''}${source['adjustmentKcal']} kcal` : ''}` +
        ` · Medición del ${source['measuredAt']}`,
      { size: 8, color: GRAY, gap: 3 },
    );
  }
  writer.rule(12);

  // --- Days ---
  for (const day of input.plan.dayPlans) {
    writer.ensure(60);
    writer.text(input.plan.days > 1 ? `Día ${day.dayIndex + 1}` : 'Plan del día', {
      size: 13,
      bold: true,
      color: ACCENT,
      gap: 6,
    });
    for (const meal of day.meals) {
      if (meal.items.length === 0) continue;
      writer.text(input.slotLabels[meal.slot] ?? meal.slot, { size: 11, bold: true, gap: 4 });
      for (const item of meal.items) {
        const kcal = item.totals.find((n) => n.nutrientId === 'energy_kcal');
        writer.text(`•  ${item.label} — ${item.quantityLabel} — ${kcal?.amount ?? 0} kcal`, {
          size: 10,
          indent: 10,
          gap: 3,
        });
      }
      writer.space(3);
    }
    const energy = macro(input.plan, day.totals, 'energy_kcal');
    const protein = macro(input.plan, day.totals, 'protein_g');
    const carbs = macro(input.plan, day.totals, 'carbohydrate_g');
    const fat = macro(input.plan, day.totals, 'fat_g');
    const mark = (x?: { amount: number; complete: boolean }) =>
      x ? `${x.amount}${x.complete ? '' : '*'}` : '0';
    writer.text(
      `Total del día: ${mark(energy)} kcal · P ${mark(protein)} g · H ${mark(carbs)} g · G ${mark(fat)} g   (meta: ${t.energyKcal} kcal)`,
      { size: 9, bold: true, gap: 4 },
    );
    writer.rule(10);
  }

  const anyIncomplete = input.plan.dayPlans.some((d) =>
    d.totals.some((n) => !n.complete && n.amount > 0),
  );
  if (anyIncomplete) {
    writer.text('* Valor mínimo: algún alimento no tiene dato completo para este nutriente.', {
      size: 8,
      color: GRAY,
      gap: 4,
    });
  }

  if (input.plan.notes) {
    writer.space(4);
    writer.text('Notas:', { size: 10, bold: true, gap: 3 });
    writer.text(input.plan.notes, { size: 9, gap: 3 });
  }

  // --- Progress photos (optional) ---
  if (input.photos.length > 0) {
    writer.addPage();
    writer.text(`Fotografías de progreso — ${input.photos[0]?.capturedAt ?? ''}`, {
      size: 13,
      bold: true,
      color: ACCENT,
      gap: 10,
    });
    const cell = (A4.width - MARGIN * 2 - 20) / 2;
    let x = MARGIN;
    let rowTop = writer.y;
    let rowMaxHeight = 0;
    for (const [index, photo] of input.photos.entries()) {
      const image =
        photo.mime === 'image/png'
          ? await doc.embedPng(photo.bytes)
          : await doc.embedJpg(photo.bytes);
      const scale = Math.min(cell / image.width, 260 / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      if (index % 2 === 0 && index > 0) {
        rowTop -= rowMaxHeight + 28;
        rowMaxHeight = 0;
        x = MARGIN;
        if (rowTop - h < MARGIN + 20) {
          writer.addPage();
          rowTop = writer.y;
        }
      }
      writer.page.drawImage(image, { x, y: rowTop - h, width: w, height: h });
      writer.page.drawText(photo.kindLabel, {
        x,
        y: rowTop - h - 12,
        size: 9,
        font: writer.bold,
        color: GRAY,
      });
      rowMaxHeight = Math.max(rowMaxHeight, h + 14);
      x += cell + 20;
    }
  }

  // --- Footer on every page ---
  const total = writer.pages.length;
  writer.pages.forEach((page, index) => {
    page.drawText(
      `Generado con AJNutrition ${input.appVersion} · ${input.generatedAt} · Página ${index + 1} de ${total}`,
      { x: MARGIN, y: 28, size: 8, font, color: GRAY },
    );
  });

  return doc.save();
}
