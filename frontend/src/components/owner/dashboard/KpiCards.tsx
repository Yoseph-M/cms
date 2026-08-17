import React from 'react';
import { Truck, DollarSign, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { AnimatedCurrency, AnimatedNumber } from '../../ui/AnimatedNumber';

export type KpiTone = 'cream' | 'mint' | 'blush' | 'rose';

export interface KpiCardProps {
  label: string;
  value: number;
  kind: 'currency' | 'number';
  icon?: LucideIcon;
  tone: KpiTone;
  trendDots?: { active: number; total?: number; tone?: 'orange' | 'green' | 'gray' };
}

const TONE_BG: Record<KpiTone, string> = {
  cream: 'bg-[#fffdf8]', // paler cream
  mint:  'bg-[#f4fdf6]', // paler mint
  blush: 'bg-[#fdf4f9]', // paler pink
  rose:  'bg-[#fdf6f4]', // paler peach
};

const TONE_RING: Record<KpiTone, string> = {
  cream: 'ring-[#fcefc7]',
  mint:  'ring-[#d2f4d6]',
  blush: 'ring-[#fcd3e8]',
  rose:  'ring-[#fcdbd3]',
};

const TONE_CIRCLE: Record<KpiTone, string> = {
  cream: 'bg-[#ffd361]',
  mint:  'bg-[#bcf2c2]',
  blush: 'bg-[#ffc1e3]',
  rose:  'bg-[#ffc6b5]',
};

const TONE_ICON: Record<KpiTone, string> = {
  cream: 'text-transparent', // No icon for the first one in the image
  mint:  'text-emerald-800',
  blush: 'text-pink-800',
  rose:  'text-rose-800',
};

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
        'relative rounded-[20px] p-5 flex items-center gap-5',
        'ring-1 ring-inset shadow-sm transition-transform duration-200',
        TONE_BG[tone],
        TONE_RING[tone],
      )}
    >
      {/* Icon disc */}
      <div
        className={cn(
          'w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0',
          TONE_CIRCLE[tone],
        )}
      >
        {Icon && <Icon className={cn("w-5 h-5", TONE_ICON[tone])} strokeWidth={2.25} />}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-[13px] font-medium text-slate-700 leading-tight">
          {label}
        </p>
        
        {trendDots && (
          <div className="flex items-center gap-1.5 mt-1.5 mb-1">
            {Array.from({ length: trendDots.total ?? 3 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  i < trendDots.active
                    ? trendDots.tone === 'orange' ? 'bg-orange-400' : 'bg-emerald-400'
                    : 'bg-slate-300'
                )}
              />
            ))}
          </div>
        )}
        {!trendDots && <div className="h-2" />}

        <p className="font-display text-[26px] font-medium leading-none text-slate-900 tabular-nums">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <KpiCard
        label="Total order"
        value={totalOrders}
        kind="number"
        tone="cream"
        /* No icon for the first card as per image */
      />
      <KpiCard
        label="Delivery in progress"
        value={inProgress}
        kind="number"
        icon={Truck}
        tone="mint"
      />
      <KpiCard
        label="Delivery completed"
        value={completed}
        kind="number"
        icon={Truck}
        tone="blush"
        trendDots={{ active: 2, total: 3, tone: 'orange' }}
      />
      <KpiCard
        label="Total Revenue"
        value={totalRevenue}
        kind="currency"
        icon={DollarSign}
        tone="rose"
        trendDots={{ active: 1, total: 3, tone: 'orange' }}
      />
    </div>
  );
};
