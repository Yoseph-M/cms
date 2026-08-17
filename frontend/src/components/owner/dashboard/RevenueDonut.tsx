import React from 'react';
import { cn } from '../../../lib/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string; // CSS color
}

export interface RevenueDonutProps {
  segments: DonutSegment[];
  /** Percentage in the centre (e.g. 73 for 73%). Auto-computed if omitted. */
  centerPercent?: number;
  /** Label above the percentage */
  centerLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

/**
 * SVG donut chart with a centre label and a legend.
 *
 * Uses two stacked circles (one base + one progress) per segment so that
 * each segment can be rendered with a custom colour without overlapping
 * math bugs that the stroke-dasharray approach tends to produce.
 */
export const RevenueDonut: React.FC<RevenueDonutProps> = ({
  segments,
  centerPercent,
  centerLabel = 'Total',
  size = 220,
  thickness = 28,
  className,
}) => {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const computedCenter =
    centerPercent ?? Math.round((segments[0]?.value / total) * 100) ?? 0;

  // Build segments with cumulative offsets
  let offset = 0;
  const arcs = segments.map((s) => {
    const length = (s.value / total) * circumference;
    const arc = { ...s, length, dashOffset: -offset };
    offset += length;
    return arc;
  });

  return (
    <div className={cn('flex flex-col items-center gap-5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* base ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={thickness}
          />
          {/* segments */}
          {arcs.map((s, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.length} ${circumference - s.length}`}
              strokeDashoffset={s.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>

        {/* center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-display text-[36px] font-bold text-foreground leading-none tabular-nums">
            {computedCenter}%
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {centerLabel}
          </p>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        {segments.map((s, i) => (
          <li key={i} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
