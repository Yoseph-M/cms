import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export interface OrderTypeEntry {
  id: string;
  name: string;
  /** 0-100 percentage of whichever metric the caller ranked by. */
  percent: number;
  /** Total revenue in minor units (e.g. cents), shown as context in units mode. */
  total: number;
  /** Units sold — shown under the bar exactly like the manager's card. */
  qty?: number;
  /** Which metric `percent` and the right-hand figure describe. Defaults to
   *  revenue so existing callers keep their behaviour. */
  metric?: 'revenue' | 'units';
}

export interface OrderTypeBarsProps {
  entries: OrderTypeEntry[];
  className?: string;
}

/**
 * Ranked best sellers: one row per item with its share of revenue and, when the
 * caller supplies it, how many units it sold. This is the same read the manager
 * dashboard shows, so both consoles describe best sellers identically.
 */
export const OrderTypeBars: React.FC<OrderTypeBarsProps> = ({ entries, className }) => {
  const { t } = useTranslation('owner');
  return (
    <ul className={cn('space-y-4', className)} aria-label={t('dashboard.sections.bestSellersAria')}>
      {entries.map((e) => {
        // Units mode leads with the count and keeps revenue as context; revenue
        // mode does the opposite, so one list answers both questions.
        const byUnits = e.metric === 'units';
        return (
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
                {byUnits
                  ? t('dashboard.topItems.sold', { count: e.qty ?? 0 })
                  : formatCurrency(e.total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-[width] duration-700"
                style={{ width: `${Math.max(2, e.percent)}%` }}
              />
            </div>
            {typeof e.qty === 'number' && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {byUnits ? formatCurrency(e.total) : t('dashboard.topItems.sold', { count: e.qty })}
              </p>
            )}
          </div>
        </li>
        );
      })}
    </ul>
  );
};
