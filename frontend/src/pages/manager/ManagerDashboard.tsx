import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Activity, DollarSign, Receipt, ShoppingCart } from 'lucide-react';
import { useHeaderStore } from '../../store/headerStore';
import {
  useAnalyticsQuery,
  useDailySalesQuery,
  useStaffPerformanceQuery,
  useApiQuery,
} from '../../hooks/useCachedQueries';
import { formatCurrency } from '../../utils/currency';

// Shared island-UI dashboard building blocks (same kit as the owner dashboard)
import { KpiCard } from '../../components/owner/dashboard/KpiCards';
import { SectionCard } from '../../components/owner/dashboard/SectionCard';
import { RevenueLineChart } from '../../components/owner/dashboard/RevenueLineChart';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';
import {
  RecentOrdersTable,
  type RecentOrder,
  type OrderStatusKey,
} from '../../components/owner/dashboard/RecentOrdersTable';
import {
  OrderTypeBars,
  type OrderTypeEntry,
} from '../../components/owner/dashboard/OrderTypeBars';

/* ─── API response shapes ─── */
interface TrendRow {
  date: string; // YYYY-MM-DD
  revenue: number; // minor units
  orderCount: number;
}
interface MethodRow {
  method: 'CASH' | 'CARD' | 'MOBILE';
  revenue: number; // minor units
  count: number;
}
interface TopItemRow {
  name: string;
  totalQty: number;
  totalRevenue: number; // minor units
  imageUrl?: string;
}
interface RecentOrderRow {
  id: string;
  clientOrderId: string;
  tableNumber?: string | null;
  status: string;
  totalAmount: number;
  createdAt: string;
  cashier?: { name: string } | null;
  waiter?: { name: string } | null;
}
interface WaiterPerfRow {
  waiterId: string;
  name: string;
  role: string;
  orderCount: number;
  totalSales: number;
}

const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', MOBILE: 'Mobile' };
const METHOD_COLOR: Record<string, string> = {
  CASH: 'hsl(152 63% 40%)',
  CARD: 'hsl(221 83% 53%)',
  MOBILE: 'hsl(262 83% 58%)',
};

export const ManagerDashboard: React.FC = () => {
  const { t } = useTranslation('manager');
  const {
    dateRange: headerDateRange,
    setDateRange: setHeaderDateRange,
    setShowDateRange,
    setPageTitle,
  } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Dashboard', subtitle: 'Operations and revenue overview' });
    return () => setPageTitle({ title: 'Overview', subtitle: '' });
  }, [setPageTitle]);

  // Date range — defaults to the last 30 days, driven by the global header chip.
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const defaultRange = React.useMemo(
    () => ({
      from: monthAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!headerDateRange.from || !headerDateRange.to) {
      setHeaderDateRange(defaultRange);
    }
  }, [headerDateRange.from, headerDateRange.to, defaultRange, setHeaderDateRange]);

  const dateRange = {
    from: headerDateRange.from || defaultRange.from,
    to: headerDateRange.to || defaultRange.to,
  };

  useEffect(() => {
    setShowDateRange(true);
    return () => setShowDateRange(false);
  }, [setShowDateRange]);

  /* ── Data (React Query — cached across navigations) ── */
  const fromIso = useMemo(() => new Date(dateRange.from).toISOString(), [dateRange.from]);
  const toIso = useMemo(() => new Date(`${dateRange.to}T23:59:59.999`).toISOString(), [dateRange.to]);

  const trendQuery = useAnalyticsQuery<TrendRow[]>('/analytics/sales/trend', {
    startDate: fromIso,
    endDate: toIso,
  });
  const methodsQuery = useAnalyticsQuery<MethodRow[]>('/analytics/payment-methods', {
    from: fromIso,
    to: toIso,
  });
  const topItemsQuery = useAnalyticsQuery<TopItemRow[]>('/analytics/top-items', {
    from: fromIso,
    to: toIso,
    limit: '5',
  });
  const dailyQuery = useDailySalesQuery();
  const waiterPerfQuery = useStaffPerformanceQuery({ from: fromIso, to: toIso, role: 'WAITER' });
  const recentOrdersQuery = useApiQuery<{ data: RecentOrderRow[] }>(
    ['orders', 'recent', 'manager-dashboard'],
    '/orders',
    { limit: 8 },
  );

  const trend: TrendRow[] = Array.isArray(trendQuery.data) ? trendQuery.data : [];
  const methods: MethodRow[] = Array.isArray(methodsQuery.data) ? methodsQuery.data : [];
  const topItems: TopItemRow[] = Array.isArray(topItemsQuery.data) ? topItemsQuery.data : [];
  const daily = dailyQuery.data ?? null;
  const waiterPerf: WaiterPerfRow[] = Array.isArray(waiterPerfQuery.data) ? waiterPerfQuery.data : [];
  const recentOrders: RecentOrderRow[] = (() => {
    const raw = recentOrdersQuery.data;
    if (!raw) return [];
    const list = raw?.data ?? raw;
    return Array.isArray(list) ? list : [];
  })();

  const isLoading =
    trendQuery.isLoading ||
    methodsQuery.isLoading ||
    topItemsQuery.isLoading ||
    dailyQuery.isLoading ||
    waiterPerfQuery.isLoading ||
    recentOrdersQuery.isLoading;

  /* ── Derived KPIs (all money kept in minor units until display) ── */
  const rangeStats = useMemo(() => {
    const revenueMinor = trend.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
    const orderCount = trend.reduce((sum, row) => sum + (Number(row.orderCount) || 0), 0);
    return {
      revenueMinor,
      orderCount,
      avgMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
    };
  }, [trend]);

  const rangeLabel = `${dateRange.from} → ${dateRange.to}`;

  /* ── Line chart: daily paid revenue across the range ── */
  const lineData = useMemo(() => {
    const labels = trend.map((row) => formatShortDate(row.date));
    const income = trend.map((row) => Number(row.revenue) || 0);
    return { labels, income };
  }, [trend]);

  /* ── Donut: revenue by payment method ── */
  const donutSegments = useMemo(
    () =>
      methods
        .filter((m) => METHOD_COLOR[m.method])
        .map((m) => ({
          label: METHOD_LABEL[m.method] ?? m.method,
          value: m.revenue,
          color: METHOD_COLOR[m.method],
        })),
    [methods],
  );

  /* ── Top items: best sellers by revenue share ── */
  const orderTypeEntries = useMemo<OrderTypeEntry[]>(() => {
    const total = topItems.reduce((sum, item) => sum + (Number(item.totalRevenue) || 0), 0) || 1;
    return topItems.map((item, i) => ({
      id: `${item.name}-${i}`,
      name: item.name,
      percent: Math.round(((Number(item.totalRevenue) || 0) / total) * 100),
      total: Number(item.totalRevenue) || 0,
    }));
  }, [topItems]);

  /* ── Recent orders table rows ── */
  const recentRows = useMemo<RecentOrder[]>(() => {
    const STATUS_MAP: Record<string, OrderStatusKey> = {
      PAID: 'paid',
      CANCELLED: 'cancelled',
      SERVED: 'pending',
      SUBMITTED: 'pending',
      IN_KITCHEN: 'pending',
    };
    return recentOrders.map((o) => ({
      id: o.id,
      shortId: (o.clientOrderId ?? o.id).slice(0, 4).padStart(4, '0'),
      type: o.tableNumber ? `Dine-in · T${o.tableNumber}` : 'Takeaway',
      attendant: o.waiter?.name ?? o.cashier?.name ?? '—',
      time: o.createdAt,
      status: STATUS_MAP[o.status] ?? 'pending',
      price: o.totalAmount,
    }));
  }, [recentOrders]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-5 sm:space-y-6">
        {/* KPI islands */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          <KpiCard
            label="Revenue"
            value={rangeStats.revenueMinor}
            kind="currency"
            icon={DollarSign}
            tone="mint"
          />
          <KpiCard
            label="Orders"
            value={rangeStats.orderCount}
            kind="number"
            icon={ShoppingCart}
            tone="cream"
          />
          <KpiCard
            label="Avg. order value"
            value={rangeStats.avgMinor}
            kind="currency"
            icon={Receipt}
            tone="blush"
          />
          <KpiCard
            label="Open orders"
            value={daily?.activeOrdersCount ?? 0}
            kind="number"
            icon={Activity}
            tone="rose"
          />
        </div>

        {/* Revenue trend + payment method mix */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            className="lg:col-span-2"
            title="Revenue trend"
            description="Daily paid revenue in the selected range"
          >
            {lineData.labels.length > 0 ? (
              <RevenueLineChart
                labels={lineData.labels}
                series={[
                  {
                    key: 'income',
                    label: 'Revenue',
                    values: lineData.income,
                    color: '#f97316',
                    fill: false,
                  },
                ]}
                yFormat={(v) => v.toLocaleString('en-US')}
                tooltipFormat={(v) => formatCurrency(v)}
              />
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No paid orders in this period.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Payment methods"
            description={`How revenue was collected · ${rangeLabel}`}
          >
            {donutSegments.length > 0 ? (
              <RevenueDonut segments={donutSegments} />
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No settlements in this period.
              </div>
            )}
          </SectionCard>
        </div>

        {/* Recent orders + top items */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            title="Recent orders"
            description="Latest activity across the floor"
            className="lg:col-span-2"
            flush
          >
            <div className="px-5 sm:px-6 py-5">
              <RecentOrdersTable orders={recentRows} />
            </div>
          </SectionCard>

          <SectionCard
            title="Top items"
            description="Best sellers in the selected range"
          >
            {orderTypeEntries.length > 0 ? (
              <OrderTypeBars entries={orderTypeEntries} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No sales in this period.
              </div>
            )}
          </SectionCard>
        </div>

        {/* Waiter performance */}
        <SectionCard
          title="Waiter performance"
          description="Orders and revenue per waiter in the selected period"
        >
          {waiterPerf.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No waiter data for this period.
            </div>
          ) : (
            <ul className="space-y-4" aria-label="Waiter performance by sales">
              {waiterPerf.map((w) => {
                const maxRevenue = waiterPerf[0]?.totalSales || 1;
                const revenueWidth = Math.min(
                  100,
                  Math.max(2, Math.round((w.totalSales / maxRevenue) * 100)),
                );
                return (
                  <li key={w.waiterId} className="group">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-foreground">
                            {w.name}
                          </span>
                          <span className="text-[12px] font-medium text-muted-foreground tabular-nums">
                            {w.role}
                          </span>
                        </div>
                        <span className="shrink-0 text-[14px] font-semibold text-foreground tabular-nums">
                          {formatCurrency(w.totalSales)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-[width] duration-700"
                            style={{ width: `${revenueWidth}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[12px] font-medium text-muted-foreground tabular-nums">
                          {w.orderCount} orders
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        {isLoading && (
          <p className="text-center text-[11px] text-muted-foreground">Refreshing…</p>
        )}
      </div>
    </motion.div>
  );
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default ManagerDashboard;
