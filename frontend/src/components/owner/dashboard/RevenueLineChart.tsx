import React, { useMemo } from 'react';
import { AreaChart } from '@tremor/react';
import { cn } from '../../../lib/utils';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Tremor colour name ('blue', 'cyan', …) — hex/hsl values fall back to the palette. */
  color: string;
  /** @deprecated Area charts always fill — kept for API compatibility */
  fill?: boolean;
}

/** One tile of the strip above the chart. `color: null` renders without a swatch bar. */
export interface ChartSummaryItem {
  label: string;
  value: string;
  color?: string | null;
}

export interface RevenueLineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  /** Formats the value inside the hover tooltip (defaults to yFormat) */
  tooltipFormat?: (v: number) => string;
  /** Totals strip. Defaults to one tile per series (name + summed value). */
  summary?: ChartSummaryItem[];
  className?: string;
}

/**
 * Chart styling is layered on top of Tremor's own classes: axis ticks pick up
 * our muted foreground, and the grid/cursor lines pick up the border token so
 * the chart sits inside a card instead of announcing itself in grey.
 */
const CHART_CLASS =
  '[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid-horizontal_line]:stroke-border/40 [&_.recharts-cartesian-grid-vertical_line]:stroke-border/20 [&_.recharts-tooltip-cursor]:stroke-border/60';

const TREMOR_COLORS = ['blue', 'cyan', 'violet', 'emerald', 'amber', 'rose'] as const;

/** Swatch colours for the totals strip — matches Tremor's -500 chart colours. */
const TREMOR_HEX: Record<string, string> = {
  blue: '#3b82f6',
  cyan: '#06b6d4',
  violet: '#8b5cf6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
};

function resolveColor(color: string, index: number): string {
  if (color.startsWith('hsl(') || color.startsWith('#')) {
    return TREMOR_COLORS[index % TREMOR_COLORS.length];
  }
  return color;
}

/**
 * Multi-series area chart using the Tremor Blocks "actual vs. potential costs"
 * pattern: a totals strip, two colour-coded areas, and a custom tooltip that
 * names each series next to its value.
 */
export const RevenueLineChart: React.FC<RevenueLineChartProps> = ({
  labels,
  series,
  height = 280,
  yFormat = (v) => v.toLocaleString(),
  tooltipFormat,
  summary,
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

  const totals = useMemo<ChartSummaryItem[]>(() => {
    if (summary) return summary;
    return series.map((s, i) => ({
      label: s.label,
      value: fmtTooltip(s.values.reduce((sum, v) => sum + (Number(v) || 0), 0)),
      color: TREMOR_HEX[resolveColor(s.color, i)] ?? null,
    }));
  }, [summary, series, fmtTooltip]);

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
      <div className="rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-lg">
        <div className="border-b border-border/60 px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">{date}</p>
        </div>
        <div className="px-4 py-2 space-y-1">
          {payload.map((entry, idx) => (
            <div
              key={`${String(entry.name)}-${idx}`}
              className="flex items-center justify-between gap-8 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-1 w-3 shrink-0 rounded-sm"
                  style={{ background: entry.color }}
                  aria-hidden
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold tabular-nums text-popover-foreground">
                {fmtTooltip(Number(entry.value ?? 0))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={cn('w-full', className)}>
      {totals.length > 0 && (
        <ul role="list" className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          {totals.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <div className="flex items-center gap-3">
                {item.color && (
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: item.color }}
                    aria-hidden
                  />
                )}
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  {item.value}
                </p>
              </div>
              <p
                className={cn(
                  'mt-1 text-xs text-muted-foreground',
                  item.color && 'pl-4',
                )}
              >
                {item.label}
              </p>
            </li>
          ))}
        </ul>
      )}

      <AreaChart
        data={chartData}
        index="date"
        categories={categories}
        colors={colors}
        showLegend={false}
        showGradient={false}
        yAxisWidth={55}
        valueFormatter={yFormat}
        customTooltip={tooltip}
        className={cn(CHART_CLASS, 'mt-2 hidden sm:block')}
        style={{ height }}
      />
      <AreaChart
        data={chartData}
        index="date"
        categories={categories}
        colors={colors}
        showLegend={false}
        showGradient={false}
        showYAxis={false}
        startEndOnly
        valueFormatter={yFormat}
        customTooltip={tooltip}
        className={cn(CHART_CLASS, 'mt-2 sm:hidden')}
        style={{ height: Math.max(220, height - 40) }}
      />
    </div>
  );
};
