import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChefHat,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ShoppingCart,
  Ticket,
} from 'lucide-react';
import type { Order } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { axiosClient } from '../../api/axiosClient';
import { useHeaderStore } from '../../store/headerStore';
import { useSocketStore } from '../../store/socketStore';
import { useElapsedTime } from '../../components/cashier/dashboard/hooks/useElapsedTime';
import { cn } from '../../lib/utils';

// Shared island-UI dashboard building blocks
import { KpiCard } from '../../components/owner/dashboard/KpiCards';
import { SectionCard } from '../../components/owner/dashboard/SectionCard';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';
import {
  RecentOrdersTable,
  type RecentOrder,
  type OrderStatusKey,
} from '../../components/owner/dashboard/RecentOrdersTable';

interface SettlementRow {
  id: string;
  amountMinor: number;
  method: 'CASH' | 'CARD' | 'MOBILE';
  createdAt: string;
}

const METHOD_COLOR: Record<string, string> = {
  CASH: 'hsl(152 63% 40%)',
  CARD: 'hsl(221 83% 53%)',
  MOBILE: 'hsl(262 83% 58%)',
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', MOBILE: 'Mobile' };

/** A calm, glanceable dashboard for an open cashier shift. */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const queryClient = useQueryClient();
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Cashier dashboard', subtitle: 'Live shift overview' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  /* ── Live orders (mirrors the tickets queue window) ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res = await axiosClient.get('/orders');
      setOrders(res.data.data || res.data);
    } catch {
      // The ShiftManager already surfaced auth/network errors; stay quiet here.
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNew = (o: Order) => setOrders((prev) => [o, ...prev.filter((x) => x.id !== o.id)]);
    const onUpdate = (o: Order) => {
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
      // A freshly settled ticket means new money hit today's collection totals.
      if (o.status === 'PAID') {
        queryClient.invalidateQueries({ queryKey: ['settlements', 'today-dashboard'] });
      }
    };
    const onCancel = (o: Order) =>
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
    socket.on('order:new', onNew);
    socket.on('order:updated', onUpdate);
    socket.on('order:cancelled', onCancel);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:updated', onUpdate);
      socket.off('order:cancelled', onCancel);
    };
  }, [socket, queryClient]);

  /* ── Today's collections (from the settlement ledger) ── */
  const todayWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: start.toISOString(), to: now.toISOString() };
  }, []);

  const settlementsQuery = useQuery<{ data: SettlementRow[] }>({
    queryKey: ['settlements', 'today-dashboard', todayWindow.from],
    queryFn: async () => {
      const res = await axiosClient.get('/settlements', {
        params: { from: todayWindow.from, to: todayWindow.to, page: 1, limit: 100 },
      });
      return res.data;
    },
    staleTime: 15_000,
  });

  const settlements = settlementsQuery.data?.data ?? [];

  /* ── Derived stats ── */
  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
    const ready = active.filter((o) => o.status === 'SERVED');
    const cooking = active.filter((o) => o.status === 'SUBMITTED' || o.status === 'IN_KITCHEN');
    const collectedMinor = settlements.reduce((sum, s) => sum + (s.amountMinor || 0), 0);
    const byMethod = settlements.reduce<Record<string, number>>((acc, s) => {
      acc[s.method] = (acc[s.method] || 0) + (s.amountMinor || 0);
      return acc;
    }, {});
    const readySorted = [...ready].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return {
      ready: ready.length,
      cooking: cooking.length,
      readyOrders: readySorted.slice(0, 5),
      collectedMinor,
      settledCount: settlements.length,
      byMethod,
      avgMinor: settlements.length > 0 ? Math.round(collectedMinor / settlements.length) : 0,
    };
  }, [orders, settlements]);

  const donutSegments = useMemo(
    () =>
      (['CASH', 'CARD', 'MOBILE'] as const)
        .filter((m) => (stats.byMethod[m] ?? 0) > 0)
        .map((m) => ({
          label: METHOD_LABEL[m],
          value: stats.byMethod[m] ?? 0,
          color: METHOD_COLOR[m],
        })),
    [stats.byMethod],
  );

  const recentRows = useMemo<RecentOrder[]>(() => {
    const STATUS_MAP: Record<string, OrderStatusKey> = {
      PAID: 'paid',
      CANCELLED: 'cancelled',
      SERVED: 'pending',
      SUBMITTED: 'pending',
      IN_KITCHEN: 'pending',
    };
    return orders.slice(0, 10).map((o) => ({
      id: o.id,
      shortId: (o.clientOrderId ?? o.id).slice(0, 4).padStart(4, '0'),
      type: o.tableNumber ? `Dine-in · T${o.tableNumber}` : 'Takeaway',
      attendant: o.waiter?.name ?? o.cashier?.name ?? '—',
      time: o.createdAt,
      status: STATUS_MAP[o.status] ?? 'pending',
      price: o.totalAmount,
    }));
  }, [orders]);

  return (
    <div className="h-full overflow-y-auto px-5 sm:px-6 py-6 space-y-5 sm:space-y-6 animate-fade-in">
      {/* KPI islands */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        <KpiCard
          label="Ready to collect"
          value={stats.ready}
          kind="number"
          icon={CheckCircle2}
          tone="mint"
        />
        <KpiCard
          label="In progress"
          value={stats.cooking}
          kind="number"
          icon={ChefHat}
          tone="blush"
        />
        <KpiCard
          label="Collected today"
          value={stats.collectedMinor}
          kind="currency"
          icon={CircleDollarSign}
          tone="cream"
        />
        <KpiCard
          label="Avg. ticket today"
          value={stats.avgMinor}
          kind="currency"
          icon={Banknote}
          tone="rose"
        />
      </div>

      {/* Ready-to-pay queue + payment method mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        <SectionCard
          className="lg:col-span-2"
          title="Ready to collect"
          description="Payments waiting at the counter"
          rightAccessory={
            <Link
              to="/cashier/tickets"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60"
            >
              <Ticket className="w-4 h-4 text-muted-foreground" />
              Open tickets
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Link>
          }
        >
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading tickets…</p>
          ) : stats.readyOrders.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">Queue is clear</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Orders that are ready for payment will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {stats.readyOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    to="/cashier/tickets"
                    className="group flex items-center justify-between gap-4 py-3 transition-colors rounded-lg"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 font-display text-sm font-bold text-emerald-700">
                        {order.tableNumber ? order.tableNumber : <ShoppingCart className="w-4 h-4 text-emerald-600" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          #{order.clientOrderId.slice(0, 6).toUpperCase()} ·{' '}
                          {(order.items || []).reduce((n, i) => n + i.quantity, 0)} items
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <WaitChip createdAt={order.createdAt} />
                      <p className="font-display text-base font-bold tabular-nums text-foreground">
                        {formatCurrency(order.totalAmount)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Payments today"
          description={`${stats.settledCount} ${stats.settledCount === 1 ? 'payment' : 'payments'} recorded`}
        >
          {donutSegments.length > 0 ? (
            <>
              <RevenueDonut segments={donutSegments} />
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/40 pt-4">
                {(['CASH', 'CARD', 'MOBILE'] as const).map((m) => {
                  const total = stats.byMethod[m] ?? 0;
                  return (
                    <div key={m} className="min-w-0 text-center">
                      <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: METHOD_COLOR[m] }}
                        />
                        {METHOD_LABEL[m]}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold tabular-nums text-foreground">
                        {formatCurrency(total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-14 text-center text-sm text-muted-foreground">
              <CreditCard className="mx-auto h-8 w-8 opacity-40" />
              <p className="mt-3 font-medium text-foreground">No payments yet today</p>
              <p className="mt-1 text-xs">Collections will appear here as you settle tickets.</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent tickets */}
      <SectionCard
        title="Recent tickets"
        description="Latest activity across the floor"
        flush
      >
        <div className="px-5 sm:px-6 py-5">
          <RecentOrdersTable orders={recentRows} />
        </div>
      </SectionCard>

      {(isLoading || settlementsQuery.isLoading) && (
        <p className="text-center text-[11px] text-muted-foreground">Refreshing…</p>
      )}
    </div>
  );
};

const WaitChip: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const elapsed = useElapsedTime(createdAt);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono font-semibold tabular-nums',
        elapsed.tone === 'danger'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : elapsed.tone === 'warning'
            ? 'border-warning/30 bg-warning/10 text-[hsl(var(--warning))]'
            : 'border-transparent bg-secondary/60 text-muted-foreground',
      )}
    >
      <Clock3 className="w-3 h-3" />
      {elapsed.display}
    </span>
  );
};

export default CashierDashboard;
