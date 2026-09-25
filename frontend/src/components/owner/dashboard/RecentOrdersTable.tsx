import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export type OrderStatusKey = 'paid' | 'cancelled' | 'pending' | 'feedback';
export interface RecentOrder {
  id: string;
  attendant: string;
  time: string;
  status: OrderStatusKey;
  price: number;
}

/** Badge colours per status; the readable label is translated at render. */
const STATUS_STYLES: Record<OrderStatusKey, { labelKey: string; className: string }> = {
  paid:       { labelKey: 'recentOrders.status.paid',       className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  pending:    { labelKey: 'recentOrders.status.pending',    className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  cancelled:  { labelKey: 'recentOrders.status.cancelled',  className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  feedback:   { labelKey: 'recentOrders.status.feedback',   className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30' },
};

export interface RecentOrdersTableProps {
  orders: RecentOrder[];
  className?: string;
  emptyTitle?: string;
  emptyMessage?: string;
}

export const RecentOrdersTable: React.FC<RecentOrdersTableProps> = ({
  orders,
  className,
}) => {
  const { t, i18n } = useTranslation('owner');
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="py-2.5 pr-3 font-semibold">{t('recentOrders.col_attendant')}</th>
            <th className="py-2.5 px-3 font-semibold">{t('recentOrders.col_time')}</th>
            <th className="py-2.5 px-3 font-semibold">{t('recentOrders.col_status')}</th>
            <th className="py-2.5 pl-3 text-right font-semibold">{t('recentOrders.col_price')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const status = STATUS_STYLES[o.status];
            return (
              <tr
                key={o.id}
                className="border-t border-border/40 transition-colors hover:bg-secondary/40"
              >
                <td className="py-3 pr-3 text-muted-foreground">
                  {o.attendant}
                </td>
                <td className="py-3 px-3 text-muted-foreground tabular-nums">
                  {formatTime(o.time, i18n.language)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                      status.className,
                    )}
                  >
                    {t(STATUS_STYLES[o.status].labelKey)}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right font-mono font-semibold text-foreground tabular-nums">
                  {formatCurrency(o.price)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('recentOrders.empty')}
        </div>
      )}
    </div>
  );
};

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const month = d.toLocaleString(locale, { month: 'short' });
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${month} ${day}, ${year} · ${hh}:${mm}:${ss}`;
}
