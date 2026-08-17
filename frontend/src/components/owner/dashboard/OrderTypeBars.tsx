import React from 'react';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export interface OrderTypeEntry {
  id: string;
  name: string;
  /** 0-100 percentage */
  percent: number;
  /** Total value, displayed on the right */
  total: number;
  icon?: LucideIcon;
  iconBg?: string; // tailwind classes for the icon disc
  iconColor?: string; // tailwind classes for the icon colour
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
            {/* Icon disc */}
            <div
              className={cn(
                'w-[42px] h-[42px] rounded-[14px] flex items-center justify-center shrink-0',
                e.iconBg ?? 'bg-orange-100',
                e.iconColor ?? 'text-orange-500',
              )}
            >
              {e.icon ? <e.icon className="w-5 h-5" /> : <Coffee className="w-5 h-5" />}
            </div>

            {/* Name + percent */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800 text-[15px] truncate">{e.name}</span>
                  <span className="text-[13px] font-medium text-slate-500 tabular-nums">{e.percent}%</span>
                </div>
                <span className="text-[15px] font-semibold text-slate-800 tabular-nums shrink-0">
                  {e.total}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div
                  className="h-full bg-[#fb923c] rounded-full transition-[width] duration-700"
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
