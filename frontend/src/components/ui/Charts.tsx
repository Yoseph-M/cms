import React, { useMemo } from 'react';
import {
  BarChart as TremorBarChart,
  LineChart as TremorLineChart,
} from '@tremor/react';
import { cn } from '../../lib/utils';

export const DONUT_COLORS = ['#0EA5E9', '#14B8A6', '#F59E0B', '#F43F5E', '#8B5CF6', '#EC4899'];

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Number(o.$numberDecimal ?? o.$numberDouble ?? o.$numberLong ?? o.$numberInt ?? 0) || 0;
  }
  return 0;
}

const CHART_CLASS =
  '[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-grid-horizontal_line]:stroke-border/40 [&_.recharts-cartesian-grid-vertical_line]:stroke-border/20 [&_.recharts-tooltip-cursor]:stroke-border/60';

export interface BarSeries {
  label: string;
  values: number[];
  color?: string;
}

export const BarChart: React.FC<{
  labels: string[];
  series: BarSeries[];
  height?: number;
  yTickFormat?: (v: number) => string;
  className?: string;
}> = ({ labels, series, height = 220, yTickFormat = (v) => v.toString(), className }) => {
  const data = useMemo(
    () =>
      labels.map((label, i) => {
        const row: Record<string, string | number> = { label };
        series.forEach((s) => {
          row[s.label] = s.values[i] ?? 0;
        });
        return row;
      }),
    [labels, series],
  );

  const categories = series.map((s) => s.label);
  const colors = series.map((s, i) => s.color ?? (i === 0 ? 'blue' : 'cyan'));

  return (
    <div className={cn('w-full', className)}>
      <TremorBarChart
        className={cn(CHART_CLASS, 'mt-2')}
        style={{ height }}
        data={data}
        index="label"
        categories={categories}
        colors={colors}
        valueFormatter={yTickFormat}
        showLegend={series.length > 1}
        showGridLines={false}
        showAnimation
        yAxisWidth={60}
      />
    </div>
  );
};

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
  title?: string;
  className?: string;
}> = ({ slices, size = 180, thickness = 22, centerLabel, className }) => {
  const values = slices.map((s) => Math.max(0, toNumber(s.value)));
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex items-center gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={thickness}
          />
          {slices.map((s, i) => {
            const length = (values[i] / total) * circumference;
            const dashArray = `${length} ${circumference - length}`;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color || DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth={thickness}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
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
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <div key={`${s.label}-${i}`} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: s.color || DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="truncate text-muted-foreground">{s.label}</span>
            </div>
            <span className="shrink-0 tabular-nums font-medium text-foreground">
              {((values[i] / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LineChart: React.FC<{
  values: number[];
  height?: number;
  color?: string;
  yTickFormat?: (v: number) => string;
  labels?: string[];
  className?: string;
}> = ({
  values,
  height = 200,
  color = 'blue',
  yTickFormat = (v) => v.toString(),
  labels,
  className,
}) => {
  const data = useMemo(
    () =>
      values.map((v, i) => ({
        date: labels?.[i] ?? String(i),
        Revenue: v,
      })),
    [values, labels],
  );

  return (
    <div className={cn('w-full', className)}>
      <TremorLineChart
        data={data}
        index="date"
        categories={['Revenue']}
        colors={[color]}
        valueFormatter={yTickFormat}
        yAxisWidth={60}
        onValueChange={() => {}}
        className={cn(CHART_CLASS, 'mt-2 hidden sm:block')}
        style={{ height }}
      />
      <TremorLineChart
        data={data}
        index="date"
        categories={['Revenue']}
        colors={[color]}
        valueFormatter={yTickFormat}
        showYAxis={false}
        showLegend={false}
        startEndOnly
        onValueChange={() => {}}
        className={cn(CHART_CLASS, 'mt-2 sm:hidden')}
        style={{ height: Math.max(180, height - 24) }}
      />
    </div>
  );
};
