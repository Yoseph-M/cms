import React from 'react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export interface OrderTypeEntry {
  id: string;
  name: string;
  /** 0-100 percentage */
  percent: number;
  /** Total value in minor units (e.g. cents), displayed on the right. */
  total: number;
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
          <div className="min-w-0">
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
        </li>
      ))}
    </ul>
  );
};
