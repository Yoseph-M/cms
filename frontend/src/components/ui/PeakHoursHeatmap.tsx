import React, { useMemo } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export interface PeakHoursHeatmapProps {
  /** dayOfWeek (1=Sun … 7=Sat) → hour (0–23) → order count */
  grid: Record<number, Record<number, number>>;
  dayLabels?: string[];
  className?: string;
  height?: number;
}

const DEFAULT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Order density → colour, in the brand warm ramp.
 *
 * Zero orders is a flat canvas tile — the pale grid of the empty state — so a
 * quiet week reads as an empty grid rather than a wall of ink. Any sales at all
 * switch the cell to orange, and the busiest hour of the visible window is the
 * deepest orange (hue stays put; lightness drops and saturation climbs as the
 * count rises).
 */
export function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  // Zero orders is the flat tile the empty grid is drawn from.
  if (t === 0) return 'hsl(var(--secondary))';
  return `hsl(24 ${Math.round(84 + t * 14)}% ${Math.round(74 - t * 36)}%)`;
}

/**
 * Peak-hours heatmap powered by Nivo — complex grid visualization for order density.
 */
export const PeakHoursHeatmap: React.FC<PeakHoursHeatmapProps> = ({
  grid,
  dayLabels = DEFAULT_DAYS,
  className,
  height = 220,
}) => {
  const { t } = useTranslation();
  const resolvedDayLabels = useMemo(
    () =>
      dayLabels !== DEFAULT_DAYS
        ? dayLabels
        : [
            t('days.sun'),
            t('days.mon'),
            t('days.tue'),
            t('days.wed'),
            t('days.thu'),
            t('days.fri'),
            t('days.sat'),
          ],
    [dayLabels, t],
  );

  const { data, maxValue } = useMemo(() => {
    let max = 0;
    const rows = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const cells = Array.from({ length: 24 }, (_, hour) => {
        const v = grid[dow]?.[hour] ?? 0;
        if (v > max) max = v;
        return { x: String(hour), y: v };
      });
      return { id: resolvedDayLabels[dow - 1] ?? t('days.dayN', { n: dow }), data: cells };
    });
    return { data: rows, maxValue: max };
  }, [grid, resolvedDayLabels, t]);

  // Relative ramp: the busiest cell of the visible window is the deepest orange.
  const colorFor = useMemo(() => {
    const max = maxValue || 1;
    return (value: number) => heatColor(value / max);
  }, [maxValue]);

  return (
    <div className={cn('w-full', className)}>
      <div style={{ height }}>
        <ResponsiveHeatMap
          data={data}
          margin={{ top: 8, right: 8, bottom: 28, left: 48 }}
          valueFormat=">-.0f"
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 6,
            tickRotation: 0,
            legend: '',
            legendOffset: 36,
            legendPosition: 'middle',
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            tickRotation: 0,
            legend: '',
            legendPosition: 'middle',
            legendOffset: -40,
          }}
          colors={(cell) => colorFor(Number(cell.value) || 0)}
          emptyColor="hsl(var(--secondary))"
          borderColor="hsl(var(--background))"
          borderWidth={2}
          borderRadius={3}
          enableLabels={false}
          hoverTarget="cell"
          tooltip={({ cell }) => (
            <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
              <span className="font-medium text-popover-foreground">{cell.serieId}</span>
              <span className="mx-1 text-muted-foreground">·</span>
              <span className="text-muted-foreground">{cell.data.x}:00</span>
              <span className="ml-2 font-bold tabular-nums text-foreground">{cell.formattedValue} orders</span>
            </div>
          )}
          theme={{
            axis: {
              ticks: {
                text: { fill: 'hsl(var(--muted-foreground))', fontSize: 10 },
              },
            },
            legends: { text: { fill: 'hsl(var(--muted-foreground))' } },
          }}
        />
      </div>
      <div className="flex items-center justify-end gap-2 mt-2 text-[10px] text-muted-foreground">
        <span>0</span>
        <div className="flex gap-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <span
              key={step}
              className="h-3 w-4 rounded-sm ring-1 ring-inset ring-foreground/10"
              style={{ background: heatColor(step) }}
            />
          ))}
        </div>
        <span>{maxValue > 0 ? `${maxValue}+` : 'orders'}</span>
        {maxValue > 0 && <span className="ml-2 font-mono">peak: {maxValue}</span>}
      </div>
    </div>
  );
};
