import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Lightweight SVG-based chart primitives. No external chart dependency —
 * keeps the bundle small and the styling on-theme. Each component receives
 * data and renders with the dark-theme palette.
 */

/* ── Bar chart ─────────────────────────────────────────────────────── */
export interface BarSeries {
  label: string;
  values: number[];
  color?: string; // CSS color (defaults to theme primary)
}

export const BarChart: React.FC<{
  labels: string[];
  series: BarSeries[];
  height?: number;
  yTickFormat?: (v: number) => string;
  className?: string;
}> = ({ labels, series, height = 220, yTickFormat = (v) => v.toString(), className }) => {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues);
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  const groupCount = labels.length;
  const groupWidth = 100 / groupCount;
  const barCount = series.length;
  const barWidth = (groupWidth * 0.7) / barCount;
  const innerOffset = (groupWidth * 0.15) / Math.max(1, barCount - 1);

  return (
    <div className={cn('w-full', className)}>
      <div className="relative" style={{ height }}>
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <div
            key={p}
            className="absolute inset-x-0 border-t border-border/50"
            style={{ top: `${(1 - p) * 100}%` }}
          >
            <span className="absolute -top-2 right-full pr-1 text-[9px] font-mono text-muted-foreground tabular-nums">
              {yTickFormat(max * p)}
            </span>
          </div>
        ))}

        {series.map((s, sIdx) => (
          <React.Fragment key={sIdx}>
            {s.values.map((v, i) => {
              const heightPct = (v / max) * 100;
              const left = i * groupWidth + groupWidth * 0.15 + sIdx * (barWidth + innerOffset);
              return (
                <div
                  key={i}
                  className="absolute bottom-0 transition-all group/bar"
                  style={{
                    left: `${left}%`,
                    width: `${barWidth}%`,
                    height: `${heightPct}%`,
                    minHeight: v > 0 ? '2px' : '0',
                  }}
                  title={`${s.label}: ${yTickFormat(v)}`}
                >
                  <div
                    className="absolute inset-0 rounded-t-sm transition-all hover:opacity-100"
                    style={{
                      background: s.color || (sIdx === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))'),
                      opacity: 0.85,
                    }}
                  />
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="flex mt-2 text-[10px] font-mono text-muted-foreground">
        {labels.map((l, i) => (
          <div
            key={i}
            style={{ width: `${groupWidth}%` }}
            className={cn('text-center tabular-nums truncate', i % labelStep !== 0 && 'opacity-0')}
          >
            {l}
          </div>
        ))}
      </div>
      {series.length > 0 && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          {series.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: s.color || (i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))') }}
              />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Donut chart ──────────────────────────────────────────────────── */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export const Donut: React.FC<{
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: React.ReactNode;
  className?: string;
}> = ({ slices, size = 180, thickness = 22, centerLabel, className }) => {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex items-center gap-6', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={thickness}
          />
          {slices.map((s, i) => {
            const length = (s.value / total) * circumference;
            const dashArray = `${length} ${circumference - length}`;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                className="transition-all"
              />
            );
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerLabel}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1.5 text-sm min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-muted-foreground truncate">{s.label}</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums shrink-0">
              <span className="text-foreground font-medium">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Line chart (simple sparkline-style) ──────────────────────────── */
export const LineChart: React.FC<{
  values: number[];
  height?: number;
  color?: string;
  yTickFormat?: (v: number) => string;
  labels?: string[];
  className?: string;
}> = ({ values, height = 200, color = 'hsl(var(--primary))', yTickFormat = (v) => v.toString(), labels, className }) => {
  const max = Math.max(1, ...values);
  const min = 0;
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min || 1)) * 100;
    return [x, y] as const;
  });
  const pathLine = points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
  const pathArea = `${pathLine} L 100 100 L 0 100 Z`;

  const step = Math.max(1, Math.ceil(values.length / 6));

  return (
    <div className={cn('w-full', className)}>
      <div className="relative" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={pathArea} fill="url(#lineFill)" vectorEffect="non-scaling-stroke" />
          <path
            d={pathLine}
            fill="none"
            stroke={color}
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r="0.6"
              fill={color}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* y axis labels */}
        <div className="absolute top-0 left-0 text-[9px] font-mono text-muted-foreground tabular-nums">
          {yTickFormat(max)}
        </div>
        <div className="absolute bottom-0 left-0 text-[9px] font-mono text-muted-foreground tabular-nums">
          {yTickFormat(0)}
        </div>
      </div>
      {labels && labels.length > 0 && (
        <div className="flex justify-between mt-1.5 text-[9px] font-mono text-muted-foreground">
          {labels.map((l, i) => (
            <span key={i} className={i % step !== 0 ? 'opacity-0' : ''}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
