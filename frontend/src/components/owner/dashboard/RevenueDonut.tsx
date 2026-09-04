import React, { useMemo } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { cn } from '../../../lib/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface RevenueDonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  title?: string;
  className?: string;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Number(o.$numberDecimal ?? o.$numberDouble ?? o.$numberLong ?? o.$numberInt ?? 0) || 0;
  }
  return 0;
}

export const RevenueDonut: React.FC<RevenueDonutProps> = ({
  segments,
  className,
}) => {
  const data = useMemo(
    () =>
      segments.map((s, i) => ({
        // Keep the id clean (no index suffix) so tooltips and labels read
        // naturally as "Drink" / "Food" instead of "Drink-0" / "Food-1".
        // React `key` (see legend below) still uses the index for stability.
        id: s.label,
        label: s.label,
        value: Math.max(0, toNumber(s.value)),
        color: s.color,
      })),
    [segments],
  );

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (segments.length === 0 || total <= 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">No sales data for this period.</div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div style={{ height: 260 }}>
        <ResponsivePie
          data={data}
          margin={{ top: 36, right: 72, bottom: 36, left: 72 }}
          innerRadius={0.5}
          padAngle={0.6}
          cornerRadius={2}
          activeOuterRadiusOffset={8}
          colors={{ datum: 'data.color' }}
          valueFormat={(v) => `${Math.round((Number(v) / total) * 100)}%`}
          tooltip={({ datum }) => (
            <div
              style={{
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                fontSize: 12,
                borderRadius: 8,
                padding: '6px 10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              }}
            >
              <span className="font-semibold">{datum.label}</span>
              <span className="mx-1.5 opacity-60">·</span>
              <span className="tabular-nums">
                {Math.round((Number(datum.value) / total) * 100)}%
              </span>
            </div>
          )}
          arcLinkLabel={(d) => String(d.label)}
          arcLinkLabelsSkipAngle={0}
          arcLinkLabelsTextColor="hsl(var(--muted-foreground))"
          arcLinkLabelsThickness={2}
          arcLinkLabelsColor={{ from: 'color' }}
          arcLabelsSkipAngle={0}
          arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
          legends={[]}
          layers={[
            'arcs',
            'arcLinkLabels',
            'arcLabels',
          ]}
          theme={{
            tooltip: {
              container: {
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                fontSize: 12,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              },
            },
          }}
        />
      </div>
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {data.map((s, i) => (
          <li key={`${s.id}-${i}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="tabular-nums font-medium text-foreground">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
