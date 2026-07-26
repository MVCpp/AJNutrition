import { useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeasurementSessionDto } from '@ajnutrition/shared';

/**
 * Progress overview: one mini line chart per metric (units differ, so metrics
 * never share an axis). Values remain reachable without hover in each
 * consultation's mediciones ledger; the tooltip only enhances. Clicking a
 * mini chart opens an expanded view with the full history, time-range
 * filters and summary stats.
 */

const LINE_COLOR = '#059669'; // emerald-600, 3.77:1 on white
const GRID_COLOR = '#e2e8f0'; // slate-200 hairline

const PAD = { top: 14, right: 48, bottom: 20, left: 38 };

interface MetricDef {
  key: string;
  labelKey: string;
  unit: string;
  read: (s: MeasurementSessionDto) => number | null;
}

const METRICS: MetricDef[] = [
  { key: 'weight', labelKey: 'measurements.shortWeight', unit: 'kg', read: (s) => s.weightKg },
  {
    key: 'bmi',
    labelKey: 'progress.bmi',
    unit: 'kg/m²',
    read: (s) =>
      s.weightKg !== null && s.heightCm !== null
        ? Math.round((s.weightKg / (s.heightCm / 100) ** 2) * 10) / 10
        : null,
  },
  { key: 'waist', labelKey: 'measurements.shortWaist', unit: 'cm', read: (s) => s.waistCm },
  { key: 'hip', labelKey: 'measurements.shortHip', unit: 'cm', read: (s) => s.hipCm },
  {
    key: 'bodyFat',
    labelKey: 'measurements.shortBodyFat',
    unit: '%',
    read: (s) => s.bodyFatPercent,
  },
  // BIA body composition (present only when captured from the device).
  {
    key: 'smm',
    labelKey: 'measurements.shortSmm',
    unit: 'kg',
    read: (s) => s.skeletalMuscleMassKg,
  },
  { key: 'fatMass', labelKey: 'measurements.shortFatMass', unit: 'kg', read: (s) => s.fatMassKg },
  { key: 'ffm', labelKey: 'measurements.shortFfm', unit: 'kg', read: (s) => s.fatFreeMassKg },
  { key: 'tbw', labelKey: 'measurements.shortTbw', unit: 'L', read: (s) => s.totalBodyWaterL },
  {
    key: 'proteinKg',
    labelKey: 'measurements.shortProteinKg',
    unit: 'kg',
    read: (s) => s.proteinKg,
  },
  {
    key: 'minerals',
    labelKey: 'measurements.shortMinerals',
    unit: 'kg',
    read: (s) => s.mineralsKg,
  },
  {
    key: 'visceral',
    labelKey: 'measurements.shortVisceral',
    unit: 'nivel',
    read: (s) => s.visceralFatLevel,
  },
  {
    key: 'deviceBmr',
    labelKey: 'measurements.shortDeviceBmr',
    unit: 'kcal',
    read: (s) => s.deviceBmrKcal,
  },
  { key: 'smi', labelKey: 'measurements.shortSmi', unit: 'kg/m²', read: (s) => s.smiKgM2 },
  { key: 'biaScore', labelKey: 'measurements.shortBiaScore', unit: 'pts', read: (s) => s.biaScore },
];

interface Point {
  date: string;
  time: number;
  value: number;
}

const RANGES = [
  { key: '3m', labelKey: 'progress.range3m', days: 92 },
  { key: '6m', labelKey: 'progress.range6m', days: 183 },
  { key: '1y', labelKey: 'progress.range1y', days: 366 },
  { key: 'all', labelKey: 'progress.rangeAll', days: null },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

function niceTicks(min: number, max: number): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep((max - min) / 3);
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= max + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

const dateFormat = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const longDateFormat = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const formatDay = (iso: string) => dateFormat.format(new Date(`${iso}T12:00:00`));
const formatLongDay = (iso: string) => longDateFormat.format(new Date(`${iso}T12:00:00`));
const formatValue = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 });

function MetricChart({
  label,
  unit,
  points,
  viewW = 320,
  viewH = 130,
}: {
  label: string;
  unit: string;
  points: Point[];
  viewW?: number;
  viewH?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const times = points.map((p) => p.time);
    let tMin = Math.min(...times);
    let tMax = Math.max(...times);
    if (tMin === tMax) {
      tMin -= 86_400_000;
      tMax += 86_400_000;
    }
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const vMin = ticks[0]!;
    const vMax = ticks[ticks.length - 1]!;
    const x = (t: number) =>
      PAD.left + ((t - tMin) / (tMax - tMin)) * (viewW - PAD.left - PAD.right);
    const y = (v: number) =>
      viewH - PAD.bottom - ((v - vMin) / (vMax - vMin)) * (viewH - PAD.top - PAD.bottom);
    return { ticks, x, y, coords: points.map((p) => ({ px: x(p.time), py: y(p.value) })) };
  }, [points, viewW, viewH]);

  const { ticks, y, coords } = geometry;
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px},${c.py}`).join(' ');
  const baseline = viewH - PAD.bottom;
  const areaPath = `${linePath} L${coords[coords.length - 1]!.px},${baseline} L${coords[0]!.px},${baseline} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = Math.round((last.value - first.value) * 10) / 10;

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * viewW;
    let nearest = 0;
    for (let i = 1; i < coords.length; i += 1) {
      if (Math.abs(coords[i]!.px - px) < Math.abs(coords[nearest]!.px - px)) nearest = i;
    }
    setHover(nearest);
  };

  const hovered = hover !== null ? points[hover] : null;
  const hoveredCoord = hover !== null ? coords[hover] : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-medium text-slate-700">{label}</h4>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {formatValue(last.value)} {unit}
        </span>
        {delta !== 0 && (
          <span className="text-xs tabular-nums text-slate-500">
            {delta > 0 ? '+' : '−'}
            {formatValue(Math.abs(delta))} {unit}
          </span>
        )}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label={`${label}: ${formatValue(last.value)} ${unit} (${formatDay(last.date)})`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={viewW - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={GRID_COLOR}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 6}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9px] tabular-nums"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={viewH - 6} className="fill-slate-400 text-[9px]">
            {formatDay(first.date)}
          </text>
          <text
            x={viewW - PAD.right}
            y={viewH - 6}
            textAnchor="end"
            className="fill-slate-400 text-[9px]"
          >
            {formatDay(last.date)}
          </text>

          <path d={areaPath} fill={LINE_COLOR} opacity={0.1} />
          <path
            d={linePath}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {hoveredCoord && (
            <line
              x1={hoveredCoord.px}
              x2={hoveredCoord.px}
              y1={PAD.top}
              y2={baseline}
              stroke="#94a3b8"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {coords.map((c, i) => (
            <circle
              key={points[i]!.date + i}
              cx={c.px}
              cy={c.py}
              r={4}
              fill={LINE_COLOR}
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}
          <text
            x={coords[coords.length - 1]!.px + 8}
            y={coords[coords.length - 1]!.py + 3}
            className="fill-slate-700 text-[10px] font-semibold tabular-nums"
          >
            {formatValue(last.value)}
          </text>
        </svg>
        {hovered && hoveredCoord && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-center shadow-lg"
            style={{
              left: `${(hoveredCoord.px / viewW) * 100}%`,
              top: `${(Math.max(hoveredCoord.py - 14, 0) / viewH) * 100}%`,
            }}
          >
            <p className="text-xs font-semibold tabular-nums text-white">
              {formatValue(hovered.value)} {unit}
            </p>
            <p className="text-[10px] text-slate-300">{formatDay(hovered.date)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricDetail({
  metric,
  points,
  onClose,
}: {
  metric: MetricDef;
  points: Point[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeKey>('all');

  const rangeDef = RANGES.find((r) => r.key === range)!;
  const cutoff =
    rangeDef.days === null ? null : points[points.length - 1]!.time - rangeDef.days * 86_400_000;
  const filtered = cutoff === null ? points : points.filter((p) => p.time >= cutoff);

  const values = filtered.map((p) => p.value);
  const stats =
    filtered.length > 0
      ? {
          first: filtered[0]!,
          last: filtered[filtered.length - 1]!,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
        }
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t(metric.labelKey)}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            📈 {t(metric.labelKey)}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {t('progress.detailPoints', { count: filtered.length })}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1" role="group" aria-label={t('progress.rangeLabel')}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={
                    range === r.key
                      ? 'rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100'
                  }
                >
                  {t(r.labelKey)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('progress.close')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        {filtered.length >= 2 ? (
          <MetricChart
            label={t(metric.labelKey)}
            unit={metric.unit}
            points={filtered}
            viewW={640}
            viewH={240}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            {t('progress.rangeEmpty')}
          </p>
        )}

        {stats && (
          <dl className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {(
              [
                ['statStart', `${formatValue(stats.first.value)}`, formatLongDay(stats.first.date)],
                ['statCurrent', `${formatValue(stats.last.value)}`, formatLongDay(stats.last.date)],
                [
                  'statChange',
                  `${stats.last.value - stats.first.value > 0 ? '+' : ''}${formatValue(
                    Math.round((stats.last.value - stats.first.value) * 10) / 10,
                  )}`,
                  metric.unit,
                ],
                ['statMin', formatValue(stats.min), metric.unit],
                ['statMax', formatValue(stats.max), metric.unit],
                ['statAvg', formatValue(Math.round(stats.avg * 10) / 10), metric.unit],
              ] as const
            ).map(([labelKey, value, hint]) => (
              <div key={labelKey} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                  {t(`progress.${labelKey}`)}
                </dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
                <dd className="text-[11px] text-slate-400">{hint}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

export function ProgressCharts({ sessions }: { sessions: MeasurementSessionDto[] }) {
  const { t } = useTranslation();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const panels = useMemo(() => {
    const ordered = [...sessions].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return METRICS.map((metric) => {
      const points: Point[] = [];
      for (const session of ordered) {
        const value = metric.read(session);
        if (value !== null) {
          points.push({ date: session.measuredAt, time: Date.parse(session.measuredAt), value });
        }
      }
      return { metric, points };
    }).filter((panel) => panel.points.length >= 2);
  }, [sessions]);

  if (panels.length === 0) return null;

  const expanded = panels.find((p) => p.metric.key === expandedKey) ?? null;

  return (
    <details open className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/40">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-emerald-900">
        📈 {t('progress.title')}
        <span className="ml-2 font-normal text-emerald-700/70">
          {t('progress.sessionsCount', { count: sessions.length })}
        </span>
        <span className="ml-2 font-normal text-emerald-700/50">{t('progress.clickHint')}</span>
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2">
        {panels.map(({ metric, points }) => (
          <button
            key={metric.key}
            type="button"
            onClick={() => setExpandedKey(metric.key)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-300"
          >
            <MetricChart label={t(metric.labelKey)} unit={metric.unit} points={points} />
          </button>
        ))}
      </div>
      {expanded && (
        <MetricDetail
          metric={expanded.metric}
          points={expanded.points}
          onClose={() => setExpandedKey(null)}
        />
      )}
    </details>
  );
}
