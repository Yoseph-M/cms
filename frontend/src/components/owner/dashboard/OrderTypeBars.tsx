import React from 'react';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export interface OrderTypeEntry {
  id: string;
  name: string;
  /** 0-100 percentage */
  percent: number;
  /** Total value in minor units (e.g. cents), displayed on the right. */
  total: number;
  /** Optional image URL to display instead of icon */
  imageUrl?: string;
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
}

export interface OrderTypeBarsProps {
  entries: OrderTypeEntry[];
  className?: string;
}

export const OrderTypeBars: React.FC<OrderTypeBarsProps> = ({ entries, className }) => {
  return (
    <ul className={cn('space-y-4', className)} aria-label="Top items by share">
      {entries.map((e) => (
        <li key={e.id} className="group">
          <div className="flex items-center gap-3">
            {e.imageUrl ? (
              <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl overflow-hidden bg-secondary/50 ring-1 ring-border/50">
                <img
                  src={e.imageUrl}
                  alt={e.name}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    // Fallback to icon if image fails to load
                    const target = event.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.className = cn(
                        'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl',
                        e.iconBg ?? 'bg-orange-500/15',
                        e.iconColor ?? 'text-orange-600 dark:text-orange-400',
                      );
                      const Icon = e.icon ?? Coffee;
                      const iconEl = document.createElement('div');
                      parent.appendChild(iconEl);
                    }
                  }}
                />
              </div>
            ) : (
              <div
                className={cn(
                  'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl',
                  e.iconBg ?? 'bg-orange-500/15',
                  e.iconColor ?? 'text-orange-600 dark:text-orange-400',
                )}
              >
                {e.icon ? <e.icon className="h-5 w-5" /> : <Coffee className="h-5 w-5" />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-foreground">{e.name}</span>
                  <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
                    {e.percent}%
                  </span>
                </div>
                <span className="shrink-0 text-[14px] font-semibold text-foreground tabular-nums">
                  {formatCurrency(e.total)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500 transition-[width] duration-700"
                  style={{ width: `${Math.max(2, e.percent)}%` }}
                />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

/* Convenience icon picks for common item names. The caller is free to
   pass its own LucideIcon; this is just a hint. */
export const DEFAULT_ICON: Record<string, LucideIcon> = {
  juice: GlassWater,
  soda: CupSoda,
  water: GlassWater,
  tea: Coffee,
  coffee: Coffee,
  lemonade: GlassWater,
};
