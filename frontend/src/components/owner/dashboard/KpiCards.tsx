import React from 'react';
import { Package, ShoppingCart, TrendingUp, type LucideIcon } from 'lucide-react';
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
  trendDots?: { active: number; total?: number; tone?: 'orange' | 'green' | 'gray' };
}

/* Soft tinted card backgrounds — use Tailwind opacity utilities so the
   surface picks up the right base color in both light and dark mode. */
const TONE_BG: Record<KpiTone, string> = {
  cream: 'bg-amber-100 dark:bg-amber-500/10',
  mint:  'bg-emerald-100 dark:bg-emerald-500/10',
  blush: 'bg-pink-100 dark:bg-pink-500/10',
  rose:  'bg-orange-100 dark:bg-orange-500/10',
};

/* Solid color for the icon circle. In light mode we use a vibrant solid;
   in dark mode we use a brighter tinted solid so the icon stays legible. */
const TONE_CIRCLE: Record<KpiTone, string> = {
  cream: 'bg-amber-400 dark:bg-amber-400/80',
  mint:  'bg-emerald-400 dark:bg-emerald-400/80',
  blush: 'bg-pink-400 dark:bg-pink-400/80',
  rose:  'bg-orange-400 dark:bg-orange-400/80',
};

/* Icon stroke colour inside the circle. Dark mode uses a dark ink so the
   icon stays high-contrast against the bright tint. */
const TONE_ICON: Record<KpiTone, string> = {
  cream: 'text-white dark:text-amber-950',
  mint:  'text-white dark:text-emerald-950',
  blush: 'text-white dark:text-pink-950',
  rose:  'text-white dark:text-orange-950',
};

const TREND_DOT_ACTIVE: Record<string, string> = {
  orange: 'bg-orange-500',
  green: 'bg-emerald-500',
  gray: 'bg-slate-400',
};

/**
 * Single KPI card.
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
        'relative flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/40 px-3 py-3.5 sm:gap-3.5 sm:px-4 sm:py-4 lg:gap-4 lg:px-5 lg:py-5',
        // Subtle shadow + lift matching the rest of the dashboard
        'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-14px_rgba(15,23,42,0.10)]',
        'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5',
        TONE_BG[tone],
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 lg:h-12 lg:w-12',
          TONE_CIRCLE[tone],
        )}
      >
        {Icon && (
          <Icon
            className={cn('h-4 w-4 sm:h-5 sm:w-5', TONE_ICON[tone])}
            strokeWidth={2.25}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-[11px] font-medium leading-tight text-foreground/80 sm:text-[12px] lg:text-[13px]">
          {label}
        </p>

        {trendDots && (
          <div className="mt-1 flex items-center gap-1.5 sm:mt-1.5">
            {Array.from({ length: trendDots.total ?? 3 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  i < trendDots.active
                    ? TREND_DOT_ACTIVE[trendDots.tone ?? 'gray']
                    : 'bg-foreground/20',
                )}
              />
            ))}
          </div>
        )}
        {!trendDots && <div className="h-2 sm:h-2.5" />}

        <p className="font-display text-[16px] font-semibold leading-none text-foreground tabular-nums sm:text-[20px] lg:text-[24px]">
          {kind === 'currency' ? (
            <AnimatedCurrency value={value} />
          ) : (
            <AnimatedNumber value={value} />
          )}
        </p>
      </div>
    </div>
  );
};

export interface KpiCardsProps {
  totalOrders: number;
  inProgress: number;
  completed: number;
  todayRevenue: number;
  totalRevenue: number;
}

/** The 4-card row from the design reference. */
export const KpiCards: React.FC<KpiCardsProps> = ({
  totalOrders,
  inProgress,
  completed,
  todayRevenue,
  totalRevenue,
}) => {
  return (
    <div className="grid grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      <KpiCard
        label="Today's orders"
        value={totalOrders}
        kind="number"
        icon={Package}
        tone="cream"
      />
      <KpiCard
        label="Today's revenue"
        value={todayRevenue}
        kind="currency"
        icon={DollarGlyph as unknown as LucideIcon}
        tone="mint"
      />
      <KpiCard
        label="Total orders"
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
