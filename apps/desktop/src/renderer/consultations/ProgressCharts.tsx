import { useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeasurementSessionDto } from '@ajnutrition/shared';

/**
 * Progress overview: one mini line chart per metric (units differ, so metrics
 * never share an axis). Values remain reachable without hover in each
 * consultation's mediciones ledger; the tooltip only enhances.
 */

const LINE_COLOR = '#059669'; // emerald-600, 3.77:1 on white
const GRID_COLOR = '#e2e8f0'; // slate-200 hairline

const VIEW_W = 320;
const VIEW_H = 130;
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
];

interface Point {
  date: string;
  time: number;
  value: number;
}

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
const formatDay = (iso: string) => dateFormat.format(new Date(`${iso}T12:00:00`));
const formatValue = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 });

function MetricChart({ label, unit, points }: { label: string; unit: string; points: Point[] }) {
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
      PAD.left + ((t - tMin) / (tMax - tMin)) * (VIEW_W - PAD.left - PAD.right);
    const y = (v: number) =>
      VIEW_H - PAD.bottom - ((v - vMin) / (vMax - vMin)) * (VIEW_H - PAD.top - PAD.bottom);
    return { ticks, x, y, coords: points.map((p) => ({ px: x(p.time), py: y(p.value) })) };
  }, [points]);

  const { ticks, y, coords } = geometry;
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px},${c.py}`).join(' ');
  const baseline = VIEW_H - PAD.bottom;
  const areaPath = `${linePath} L${coords[coords.length - 1]!.px},${baseline} L${coords[0]!.px},${baseline} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = Math.round((last.value - first.value) * 10) / 10;

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    for (let i = 1; i < coords.length; i += 1) {
      if (Math.abs(coords[i]!.px - px) < Math.abs(coords[nearest]!.px - px)) nearest = i;
    }
    setHover(nearest);
  };

  const hovered = hover !== null ? points[hover] : null;
  const hoveredCoord = hover !== null ? coords[hover] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
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
                x2={VIEW_W - PAD.right}
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
          <text x={PAD.left} y={VIEW_H - 6} className="fill-slate-400 text-[9px]">
            {formatDay(first.date)}
          </text>
          <text
            x={VIEW_W - PAD.right}
            y={VIEW_H - 6}
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
              left: `${(hoveredCoord.px / VIEW_W) * 100}%`,
              top: `${(Math.max(hoveredCoord.py - 14, 0) / VIEW_H) * 100}%`,
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

export function ProgressCharts({ sessions }: { sessions: MeasurementSessionDto[] }) {
  const { t } = useTranslation();

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

  return (
    <details open className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/40">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-emerald-900">
        📈 {t('progress.title')}
        <span className="ml-2 font-normal text-emerald-700/70">
          {t('progress.sessionsCount', { count: sessions.length })}
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2">
        {panels.map(({ metric, points }) => (
          <MetricChart
            key={metric.key}
            label={t(metric.labelKey)}
            unit={metric.unit}
            points={points}
          />
        ))}
      </div>
    </details>
  );
}
