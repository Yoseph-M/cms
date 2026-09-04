import React, { useMemo } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
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
 * Peak-hours heatmap powered by Nivo — complex grid visualization for order density.
 */
export const PeakHoursHeatmap: React.FC<PeakHoursHeatmapProps> = ({
  grid,
  dayLabels = DEFAULT_DAYS,
  className,
  height = 220,
}) => {
  const { data, maxValue } = useMemo(() => {
    let max = 0;
    const rows = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const cells = Array.from({ length: 24 }, (_, hour) => {
        const v = grid[dow]?.[hour] ?? 0;
        if (v > max) max = v;
        return { x: String(hour), y: v };
      });
      return { id: dayLabels[dow - 1] ?? `Day ${dow}`, data: cells };
    });
    return { data: rows, maxValue: max };
  }, [grid, dayLabels]);

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
          colors={{
            type: 'sequential',
            scheme: 'oranges',
            minValue: 0,
            maxValue: maxValue || 1,
          }}
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
        <span>Less</span>
        <div className="flex gap-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <span
              key={step}
              className="h-3 w-4 rounded-sm ring-1 ring-inset ring-black/[0.04]"
              style={{ background: `hsla(24,80%,55%,${0.12 + step * 0.88})` }}
            />
          ))}
        </div>
        <span>More</span>
        {maxValue > 0 && <span className="ml-2 font-mono">peak: {maxValue}</span>}
      </div>
    </div>
  );
};
