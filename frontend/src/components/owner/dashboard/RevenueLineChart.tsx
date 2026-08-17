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
  className?: string;
}

/**
 * Smooth-curve multi-series line chart.
 *
 * Renders a cubic-Bezier path for each series (Catmull-Rom → Bezier
 * conversion) with an optional area fill for the first series. The chart
 * owns its own hover state and surfaces a tooltip with the closest data
 * point to the cursor's X position.
 */
export const RevenueLineChart: React.FC<RevenueLineChartProps> = ({
  labels,
  series,
  height = 280,
  yFormat = (v) => v.toLocaleString(),
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues);
  // Round the y-max up to a clean number for tick labels
  const yMax = niceMax(max);
  const ticks = 5;

  const W = 100;
  const H = 100;
  const padTop = 4;
  const padBottom = 8;
  const innerH = H - padTop - padBottom;

  // Build a smooth cubic-Bezier path between points (x in [0..100])
  const smoothPath = (vals: number[]): string => {
    if (vals.length === 0) return '';
    const pts = vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * W;
      const y = padTop + innerH - (v / yMax) * innerH;
      return [x, y] as const;
    });
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
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
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const idx = Math.round(ratio * (labels.length - 1));
    setHoverIdx(Math.max(0, Math.min(labels.length - 1, idx)));
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y-axis tick labels (gridlines) */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {tickValues
            .slice()
            .reverse()
            .map((v, i) => (
              <div key={i} className="flex items-center w-full">
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums pr-2 w-12 text-right">
                  {yFormat(v)}
                </span>
                <div className="flex-1 border-t border-dashed border-border/60" />
              </div>
            ))}
        </div>

        {/* Chart svg */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pl-12"
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
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ) : null,
            )}
          </defs>

          {series.map((s) => (
            <g key={s.key}>
              {s.fill !== false && (
                <path
                  d={areaPath(s.values)}
                  fill={`url(#area-${s.key})`}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={smoothPath(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}

          {/* Hover indicator: vertical dotted line + point */}
          {hoverIdx != null && (
            <g>
              <line
                x1={(hoverIdx / Math.max(1, labels.length - 1)) * W}
                x2={(hoverIdx / Math.max(1, labels.length - 1)) * W}
                y1={padTop}
                y2={padTop + innerH}
                stroke="hsl(var(--orange-500))"
                strokeWidth="0.25"
                strokeDasharray="0.8 0.8"
                vectorEffect="non-scaling-stroke"
              />
              {series.map((s) => {
                const v = s.values[hoverIdx] ?? 0;
                const x = (hoverIdx / Math.max(1, labels.length - 1)) * W;
                const y = padTop + innerH - (v / yMax) * innerH;
                return (
                  <circle
                    key={`pt-${s.key}`}
                    cx={x}
                    cy={y}
                    r="0.9"
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hoverIdx != null && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `calc(48px + ${(hoverIdx / Math.max(1, labels.length - 1)) * 100}% - 36px)`,
              top: '8px',
            }}
          >
            <div className="bg-card border border-border rounded-xl shadow-xl px-3 py-2 text-xs min-w-[80px]">
              <p className="font-bold tabular-nums text-foreground">
                {yFormat(series[0]?.values[hoverIdx] ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">{labels[hoverIdx]}</p>
            </div>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex mt-2 pl-12 text-[10px] font-mono text-muted-foreground">
        {labels.map((l, i) => (
          <div
            key={i}
            className="flex-1 text-center tabular-nums truncate"
            style={{ minWidth: 0 }}
          >
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
