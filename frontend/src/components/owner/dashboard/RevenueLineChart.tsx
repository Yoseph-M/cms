import React, { useMemo } from 'react';
import { LineChart } from '@tremor/react';
import { cn } from '../../../lib/utils';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  color: string;
  /** @deprecated Line charts no longer fill areas — kept for API compatibility */
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

const CHART_CLASS =
  '[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid-horizontal_line]:stroke-border/40 [&_.recharts-cartesian-grid-vertical_line]:stroke-border/20 [&_.recharts-tooltip-cursor]:stroke-border/60';

const TREMOR_COLORS = ['orange', 'rose', 'blue', 'violet', 'cyan', 'emerald'] as const;

function resolveColor(color: string, index: number): string {
  if (color.startsWith('hsl(') || color.startsWith('#')) {
    return TREMOR_COLORS[index % TREMOR_COLORS.length];
  }
  return color;
}

/**
 * Multi-series line chart using the Tremor Blocks portfolio-performance pattern.
 */
export const RevenueLineChart: React.FC<RevenueLineChartProps> = ({
  labels,
  series,
  height = 280,
  yFormat = (v) => v.toLocaleString(),
  tooltipFormat,
  className,
}) => {
  const fmtTooltip = tooltipFormat ?? yFormat;

  const { chartData, categories, colors } = useMemo(() => {
    const cats = series.map((s) => s.label);
    const cols = series.map((s, i) => resolveColor(s.color, i));
    const data = labels.map((label, i) => {
      const row: Record<string, string | number> = { date: label };
      series.forEach((s) => {
        row[s.label] = s.values[i] ?? 0;
      });
      return row;
    });
    return { chartData: data, categories: cats, colors: cols };
  }, [labels, series]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltip = (props: any) => {
    const payload = props?.payload as Array<{
      name?: string | number;
      value?: number;
      color?: string;
      payload?: Record<string, string | number>;
    }> | undefined;
    if (!payload?.length) return null;
    const date = payload[0]?.payload?.date ?? '';
    return (
      <div className="rounded-xl border border-border/60 bg-popover px-4 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground mb-1">{date}</p>
        {payload.map((entry) => (
          <div key={String(entry.name)} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-bold tabular-nums text-popover-foreground">
              {fmtTooltip(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn('w-full', className)}>
      <LineChart
        data={chartData}
        index="date"
        categories={categories}
        colors={colors}
        valueFormatter={yFormat}
        customTooltip={tooltip}
        yAxisWidth={60}
        onValueChange={() => {}}
        showLegend={categories.length > 1}
        className={cn(CHART_CLASS, 'mt-2 hidden sm:block')}
        style={{ height }}
      />
      <LineChart
        data={chartData}
        index="date"
        categories={categories}
        colors={colors}
        valueFormatter={yFormat}
        customTooltip={tooltip}
        showYAxis={false}
        showLegend={false}
        startEndOnly
        onValueChange={() => {}}
        className={cn(CHART_CLASS, 'mt-2 sm:hidden')}
        style={{ height: Math.max(220, height - 40) }}
      />
    </div>
  );
};
