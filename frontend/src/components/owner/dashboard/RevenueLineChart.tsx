import React, { useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  color: string;
  /** fill the area under the curve */
  fill?: boolean;
}

export interface RevenueLineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  /** Formats the value inside the hover tooltip (defaults to yFormat) */
  tooltipFormat?: (v: number) => string;
  className?: string;
}

/**
 * Smooth-curve multi-series line chart styled after the reference design:
 * floating y-axis labels (no gridlines), thick rounded curves, a soft
 * gradient under filled series, and a hover indicator made of a vertical
 * accent line dropping from the point to the baseline with a floating
 * tooltip card above it.
 */
export const RevenueLineChart: React.FC<RevenueLineChartProps> = ({
  labels,
  series,
  height = 280,
  yFormat = (v) => v.toLocaleString(),
  tooltipFormat,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const fmtTooltip = tooltipFormat ?? yFormat;

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues);
  const yMax = niceMax(max);
  const ticks = 5;

  const W = 100;
  const H = 100;
  const padTop = 6;
  const padBottom = 2;
  const innerH = H - padTop - padBottom;

  const xAt = (i: number) => (i / Math.max(1, labels.length - 1)) * W;
  const yAt = (v: number) => padTop + innerH - (v / yMax) * innerH;

  const smoothPath = (vals: number[]): string => {
    if (vals.length === 0) return '';
    const pts = vals.map((v, i) => [xAt(i), yAt(v)] as const);
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const clampY = (y: number) => Math.max(padTop, Math.min(padTop + innerH, y));
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = clampY(p1[1] + (p2[1] - p0[1]) / 6);
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = clampY(p2[1] - (p3[1] - p1[1]) / 6);
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  };

  const areaPath = (vals: number[]): string => {
    const line = smoothPath(vals);
    if (!line) return '';
    return `${line} L ${W} ${padTop + innerH} L 0 ${padTop + innerH} Z`;
  };

  const tickValues = useMemo(
    () => Array.from({ length: ticks + 1 }, (_, i) => Math.round((yMax * i) / ticks)),
    [yMax, ticks],
  );

  const onMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || labels.length === 0) return;
    const plotLeft = 48;
    const plotWidth = rect.width - plotLeft;
    const x = e.clientX - rect.left - plotLeft;
    const ratio = x / Math.max(1, plotWidth);
    const idx = Math.round(ratio * (labels.length - 1));
    setHoverIdx(Math.max(0, Math.min(labels.length - 1, idx)));
  };

  const hoverPct = hoverIdx != null ? (hoverIdx / Math.max(1, labels.length - 1)) * 100 : 0;
  const hoverValuePct =
    hoverIdx != null ? (yAt(series[0]?.values[hoverIdx] ?? 0) / H) * 100 : 0;
  const tooltipPct = Math.max(10, Math.min(90, hoverPct));
  const accentColor = series[0]?.color ?? '#f97316';

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={containerRef}
        className="relative w-full select-none"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y-axis tick labels — floating, no gridlines */}
        <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between pointer-events-none">
          {tickValues
            .slice()
            .reverse()
            .map((v, i) => (
              <span
                key={i}
                className="text-[11px] font-medium text-muted-foreground tabular-nums text-right leading-none"
              >
                {yFormat(v)}
              </span>
            ))}
        </div>

        {/* Plot area */}
        <div className="absolute left-12 right-0 top-0 bottom-0">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full overflow-visible"
          >
            <defs>
              {series.map((s) =>
                s.fill !== false ? (
                  <linearGradient
                    key={s.key}
                    id={`area-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                    <stop offset="70%" stopColor={s.color} stopOpacity="0.05" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                  </linearGradient>
                ) : null,
              )}
            </defs>

            {series.map((s) => (
              <g key={s.key}>
                {s.fill !== false && (
                  <path d={areaPath(s.values)} fill={`url(#area-${s.key})`} />
                )}
                <path
                  d={smoothPath(s.values)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>

          {/* Hover indicator: accent line from point to baseline + dot */}
          {hoverIdx != null && (
            <>
              <div
                className="pointer-events-none absolute w-[2px] rounded-full transition-[top] duration-75"
                style={{
                  left: `${hoverPct}%`,
                  top: `${hoverValuePct}%`,
                  bottom: `${padBottom}%`,
                  transform: 'translateX(-50%)',
                  backgroundColor: accentColor,
                  opacity: 0.85,
                }}
              />
              <div
                className="pointer-events-none absolute h-3.5 w-3.5 rounded-full shadow-md ring-[3px] ring-card transition-[left,top] duration-75"
                style={{
                  left: `${hoverPct}%`,
                  top: `${hoverValuePct}%`,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: accentColor,
                }}
              />
            </>
          )}

          {/* Tooltip floating above the active point */}
          {hoverIdx != null && (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                left: `${tooltipPct}%`,
                top: `${hoverValuePct}%`,
                transform: 'translate(-50%, calc(-100% - 16px))',
              }}
            >
              <div className="whitespace-nowrap rounded-xl border border-border/60 bg-popover px-4 py-2 text-center text-popover-foreground shadow-[0_10px_30px_-8px_rgba(15,23,42,0.18)]">
                <p className="text-[15px] font-bold leading-none tabular-nums">
                  {fmtTooltip(series[0]?.values[hoverIdx] ?? 0)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{labels[hoverIdx]}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex mt-3 pl-12 text-xs font-medium text-muted-foreground">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center truncate" style={{ minWidth: 0 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Round up to the next "nice" axis maximum (1, 2, 5, 10 * 10^n). */
function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const norm = raw / base;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return Math.ceil(nice) * base;
}
