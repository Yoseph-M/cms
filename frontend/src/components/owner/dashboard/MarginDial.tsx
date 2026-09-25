import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../../utils/currency';

/**
 * Margin Dial — a half-circle speedometer for the window's profit margin.
 *
 * This is deliberately a shape the rest of the app does not have. Every other
 * money card prints numbers (Revenue vs Costs), fills a bar (Break-even
 * Coverage), draws columns/lines/donuts (Trend, Busiest Days, Category,
 * Payment Split) or shades a grid (Peak Hours). None of them reads a *distance
 * from a line*: the needle sits on the line at break-even, swings right when
 * the window kept money and left when it spent more than it took — so the
 * answer is a position, not a number to compare against another number.
 *
 * The scale is the margin itself (net ÷ revenue), from −100% on the left to
 * +100% on the right with 0 (break-even) straight up, so the two halves of the
 * dial are the two possible outcomes: loss on the left, profit on the right.
 */

export interface MarginDialProps {
  /** Money collected in the window — paid tickets only. */
  revenue: number;
  /** Total costs for the window, payroll included. */
  costs: number;
  /** Collected minus costs. */
  net: number;
}

/** Geometry of the dial, in SVG user units. */
const WIDTH = 280;
const HEIGHT = 176;
const CX = WIDTH / 2;
const CY = 140;
const R = 104;
/** Degrees of needle travel per 1% of margin — 90° at ±100%. */
const DEGREES_PER_PERCENT = 0.9;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Point on the dial at `deg`: 180° = left end, 90° = straight up, 0° = right end. */
const polar = (deg: number, radius = R) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
};

/** Sweep from a larger angle to a smaller one — i.e. left end → right end. */
const arcPath = (fromDeg: number, toDeg: number, radius = R) => {
  const a = polar(fromDeg, radius);
  const b = polar(toDeg, radius);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

/** ±100, ±50 and 0 — the marks an operator can read a position against. */
const TICKS = [100, 50, 0, -50, -100];

export const MarginDial: React.FC<MarginDialProps> = ({ revenue, costs, net }) => {
  const { t } = useTranslation('owner');

  const margin = revenue > 0 ? (net / revenue) * 100 : null;
  const band = margin === null ? 'none' : margin < 0 ? 'loss' : margin < 20 ? 'thin' : 'healthy';
  const needleDeg = margin === null ? 0 : clamp(margin, -100, 100) * DEGREES_PER_PERCENT;

  const valueArc = useMemo(() => {
    if (margin === null || margin === 0) return null;
    const deg = clamp(margin, -100, 100) * DEGREES_PER_PERCENT;
    // The coloured arc always runs from break-even (straight up) to the needle,
    // so its length IS the margin, read against the two shaded zones.
    return margin > 0 ? arcPath(90, 90 - deg) : arcPath(90 + needleDeg, 90);
  }, [margin, needleDeg]);

  const netTone = net >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive';

  return (
    <div className="space-y-2">
      <div className="mx-auto w-full max-w-[280px]">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label={t('finance.marginDialAria', {
            defaultValue: 'Profit margin dial: {{percent}} percent of revenue kept as profit.',
            percent: margin === null ? '—' : Math.round(margin),
          })}
        >
          {/* The two zones: everything left of break-even is money lost, right is money kept. */}
          <path
            d={arcPath(180, 90)}
            fill="none"
            className="stroke-destructive/25"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <path
            d={arcPath(90, 0)}
            fill="none"
            className="stroke-[hsl(var(--success))]/25"
            strokeWidth={12}
            strokeLinecap="round"
          />

          {/* The margin itself, drawn from the break-even mark to the needle. */}
          {valueArc && (
            <path
              d={valueArc}
              fill="none"
              className={net >= 0 ? 'stroke-[hsl(var(--success))]' : 'stroke-destructive'}
              strokeWidth={12}
              strokeLinecap="round"
            />
          )}

          {/* Scale marks. */}
          {TICKS.map((tick) => {
            const deg = 90 - (tick / 100) * 90;
            const inner = polar(deg, R + 4);
            const outer = polar(deg, R + 11);
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={tick === 0 ? 'stroke-foreground/70' : 'stroke-border'}
                strokeWidth={tick === 0 ? 2.5 : 1.5}
                strokeLinecap="round"
              />
            );
          })}
          <text x={CX} y={22} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
            {t('finance.marginBreakEvenMark', { defaultValue: 'break-even' })}
          </text>
          <text x={6} y={CY + 18} textAnchor="start" className="fill-muted-foreground text-[10px]">
            −100%
          </text>
          <text x={WIDTH - 6} y={CY + 18} textAnchor="end" className="fill-muted-foreground text-[10px]">
            +100%
          </text>

          {/* Needle + hub. The rotation is a CSS transform so it eases into place
              when the date range changes instead of snapping. */}
          <g
            style={{
              transform: `rotate(${needleDeg}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <line
              x1={CX}
              y1={CY - 10}
              x2={CX}
              y2={CY - R + 20}
              className="stroke-foreground"
              strokeWidth={3}
              strokeLinecap="round"
            />
          </g>
          <circle cx={CX} cy={CY} r={7} className="fill-card stroke-foreground" strokeWidth={2.5} />
        </svg>
      </div>

      <div className="text-center">
        <p className={`font-mono text-3xl font-bold leading-none tabular-nums ${netTone}`}>
          {margin === null ? '—' : `${Math.round(margin)}%`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('finance.marginOfRevenue', { defaultValue: 'of revenue kept as profit' })}
        </p>
      </div>

      {/* Loss / profit legend, so the two halves of the dial are named. */}
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive/50" />
          {t('finance.marginLossZone', { defaultValue: 'Loss zone' })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))]/50" />
          {t('finance.marginProfitZone', { defaultValue: 'Profit zone' })}
        </span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {margin === null
          ? t('finance.marginNoRevenue', { defaultValue: 'No revenue in this date range.' })
          : net >= 0
            ? t('finance.marginKept', {
                amount: formatCurrency(net),
                revenue: formatCurrency(revenue),
                defaultValue: '{{amount}} kept out of {{revenue}} collected',
              })
            : t('finance.marginOverspend', {
                amount: formatCurrency(Math.abs(net)),
                defaultValue: '{{amount}} more spent than collected this window',
              })}
        {costs === 0 && margin !== null ? ` · ${t('finance.marginNoCosts', { defaultValue: 'no costs recorded yet' })}` : ''}
      </p>
    </div>
  );
};
