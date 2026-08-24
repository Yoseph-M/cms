import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../lib/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string; // CSS color
}

export interface RevenueDonutProps {
  segments: DonutSegment[];
  /**
   * Static percentage in the centre. When omitted (default) the centre
   * auto-cycles through every segment, animating between each category's
   * name + share.
   */
  centerPercent?: number;
  /** Label above the percentage — only used with a static `centerPercent` */
  centerLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

/** How long each category stays in the centre before switching (ms) */
const CYCLE_MS = 2600;

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

  // Share of revenue per segment, used by both the cycle and static modes
  const shares = segments.map((s) => Math.round((s.value / total) * 100));

  /* ── Auto-cycling centre ── */
  const isCycling = centerPercent === undefined && segments.length > 1;
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!isCycling) return;
    setActiveIdx(0);
    const timer = setInterval(
      () => setActiveIdx((i) => (i + 1) % segments.length),
      CYCLE_MS,
    );
    return () => clearInterval(timer);
  }, [isCycling, segments.length]);

  // Keep the index valid if segments shrink while mounted
  const safeIdx = activeIdx < segments.length ? activeIdx : 0;

  const displayLabel = isCycling ? segments[safeIdx].label : centerLabel;
  const displayPercent =
    centerPercent ?? (segments.length > 0 ? shares[safeIdx] : 0);

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

        {/* center label — animated, cycles through categories */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={displayLabel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex flex-col items-center"
            >
              <p className="font-display text-[36px] font-bold text-foreground leading-none tabular-nums">
                {displayPercent}%
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {displayLabel}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Legend — active entry is highlighted, others dim; click to jump */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        {segments.map((s, i) => (
          <li
            key={i}
            onClick={() => isCycling && setActiveIdx(i)}
            className={cn(
              'inline-flex items-center gap-1.5 text-muted-foreground transition-opacity duration-300',
              isCycling && 'cursor-pointer',
              isCycling && i !== safeIdx && 'opacity-40 hover:opacity-70',
            )}
          >
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
