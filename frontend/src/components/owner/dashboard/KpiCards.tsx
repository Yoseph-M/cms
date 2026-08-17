import React from 'react';
import { Truck, Package, ShoppingCart, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { AnimatedCurrency, AnimatedNumber } from '../../ui/AnimatedNumber';

/**
 * Tiny "icon" component that renders a bold dollar sign. We treat it like a
 * LucideIcon so KpiCard can accept it through the same `icon` prop.
 */
const DollarGlyph: React.FC<{ className?: string; strokeWidth?: number }> = ({
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center justify-center font-bold leading-none select-none',
      className,
    )}
    aria-hidden
  >
    $
  </span>
);

export type KpiTone = 'cream' | 'mint' | 'blush' | 'rose';

export interface KpiCardProps {
  label: string;
  value: number;
  kind: 'currency' | 'number';
  icon?: LucideIcon;
  tone: KpiTone;
  /**
   * Three small dots shown between the label and the value (e.g. progress).
   * `active` is how many of the three are filled; the rest are muted.
   */
  trendDots?: { active: number; total?: number; tone?: 'orange' | 'green' | 'gray' };
}

/* Card backgrounds — soft pastels from the reference image */
const TONE_BG: Record<KpiTone, string> = {
  cream: 'bg-[#fff5d1]', // warm yellow
  mint:  'bg-[#e3f6e9]', // soft green
  blush: 'bg-[#fce4f1]', // soft pink
  rose:  'bg-[#fde3d7]', // soft peach
};

/* Solid colour for the icon circle */
const TONE_CIRCLE: Record<KpiTone, string> = {
  cream: 'bg-[#f9b400]', // solid amber/yellow
  mint:  'bg-[#b9e8c5]', // solid light green
  blush: 'bg-[#f5b6dc]', // solid light pink
  rose:  'bg-[#f6b29f]', // solid coral
};

/* Icon stroke colour inside the circle */
const TONE_ICON: Record<KpiTone, string> = {
  cream: 'text-white',
  mint:  'text-emerald-800',
  blush: 'text-pink-800',
  rose:  'text-white',
};

const TREND_DOT_ACTIVE: Record<string, string> = {
  orange: 'bg-orange-400',
  green: 'bg-emerald-400',
  gray: 'bg-slate-400',
};

/**
 * Single KPI card. Layout, taken from the design reference:
 *  ┌────────────────────────────────────────────┐
 *  │  ┌───┐   Label                              │
 *  │  │ ⓘ │   • • •   (trend dots, optional)     │
 *  │  └───┘   240                                 │
 *  └────────────────────────────────────────────┘
 */
export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  kind,
  icon: Icon,
  tone,
  trendDots,
}) => {
  return (
    <div
      className={cn(
        'relative rounded-2xl px-3 py-3.5 sm:px-4 sm:py-4 lg:px-5 lg:py-5',
        'flex items-center gap-2.5 sm:gap-3.5 lg:gap-4',
        // Floating-card look matching SectionCard so KPIs read as islands too
        'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-14px_rgba(15,23,42,0.10),0_4px_10px_-8px_rgba(249,115,22,0.08)]',
        'transition-all duration-200 hover:-translate-y-0.5',
        'min-w-0',
        TONE_BG[tone],
      )}
    >
      {/* Solid circle — first card has no icon (per image) */}
      <div
        className={cn(
          'w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-full flex items-center justify-center shrink-0',
          TONE_CIRCLE[tone],
        )}
      >
        {Icon && <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5 lg:w-5 lg:h-5', TONE_ICON[tone])} strokeWidth={2.25} />}
      </div>

      {/* Label + (optional) trend dots + value, stacked vertically */}
      <div className="flex-1 min-w-0 flex flex-col">
        <p className="text-[11px] sm:text-[12px] lg:text-[13px] font-medium text-slate-700 leading-tight truncate">
          {label}
        </p>

        {trendDots && (
          <div className="flex items-center gap-1.5 mt-1 sm:mt-1.5">
            {Array.from({ length: trendDots.total ?? 3 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  i < trendDots.active
                    ? TREND_DOT_ACTIVE[trendDots.tone ?? 'gray']
                    : 'bg-slate-300',
                )}
              />
            ))}
          </div>
        )}
        {!trendDots && <div className="h-2 sm:h-2.5" />}

        <p className="font-display text-[16px] sm:text-[20px] lg:text-[24px] font-semibold leading-none text-slate-900 tabular-nums">
          {kind === 'currency'
            ? <AnimatedCurrency value={value} />
            : <AnimatedNumber value={value} />}
        </p>
      </div>
    </div>
  );
};

export interface KpiCardsProps {
  totalOrders: number;
  inProgress: number;
  completed: number;
  totalRevenue: number;
}

/** The 4-card row from the design reference. */
export const KpiCards: React.FC<KpiCardsProps> = ({
  totalOrders,
  inProgress,
  completed,
  totalRevenue,
}) => {
  return (
    <div className="grid grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      <KpiCard
        label="Today's order"
        value={totalOrders}
        kind="number"
        icon={Package}
        tone="cream"
      />
      <KpiCard
        label="Today's revenue"
        value={totalRevenue}
        kind="currency"
        icon={DollarGlyph as unknown as LucideIcon}
        tone="mint"
      />
      <KpiCard
        label="Total order"
        value={completed}
        kind="number"
        icon={ShoppingCart}
        tone="blush"
      />
      <KpiCard
        label="Total revenue"
        value={totalRevenue}
        kind="currency"
        icon={TrendingUp as unknown as LucideIcon}
        tone="rose"
      />
    </div>
  );
};
