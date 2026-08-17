import React from 'react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export type OrderStatusKey = 'paid' | 'cancelled' | 'pending' | 'feedback';

export interface RecentOrder {
  id: string;
  shortId: string;
  type: string;     // "Takeaways" / "Dine-in" / "Feedback" / etc.
  attendant: string; // "Laura Olivia-228"
  time: string;      // ISO
  status: OrderStatusKey;
  price: number;     // minor units
}

const STATUS_STYLES: Record<OrderStatusKey, { label: string; className: string }> = {
  paid:       { label: 'Paid',       className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  pending:    { label: 'Pending',    className: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  cancelled:  { label: 'Cancelled',  className: 'bg-rose-500/15 text-rose-700 border-rose-500/30' },
  feedback:   { label: 'Feedback',   className: 'bg-orange-500/15 text-orange-700 border-orange-500/30' },
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
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="py-2.5 pr-3 font-semibold">Order ID</th>
            <th className="py-2.5 px-3 font-semibold">Order Type</th>
            <th className="py-2.5 px-3 font-semibold">Attendant</th>
            <th className="py-2.5 px-3 font-semibold">Time</th>
            <th className="py-2.5 px-3 font-semibold">Status</th>
            <th className="py-2.5 pl-3 text-right font-semibold">Price</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const status = STATUS_STYLES[o.status];
            return (
              <tr
                key={o.id}
                className="border-t border-border/40 hover:bg-secondary/30 transition-colors"
              >
                <td className="py-3 pr-3 font-mono text-xs text-muted-foreground tabular-nums">
                  {o.shortId}
                </td>
                <td className="py-3 px-3 font-semibold text-foreground">
                  {o.type}
                </td>
                <td className="py-3 px-3 text-muted-foreground">
                  {o.attendant}
                </td>
                <td className="py-3 px-3 text-muted-foreground tabular-nums">
                  {formatTime(o.time)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                      status.className,
                    )}
                  >
                    {status.label}
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
          No recent orders.
        </div>
      )}
    </div>
  );
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate().toString().padStart(2, '0');
  const year = d.getFullYear();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${month} ${day}, ${year}. ${hh}:${mm}:${ss}`;
}
