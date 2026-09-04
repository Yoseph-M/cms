import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { useHeaderStore } from '../../store/headerStore';
import { cn } from '../../lib/utils';

// New dashboard module
import { KpiCards } from '../../components/owner/dashboard/KpiCards';
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
import { formatCurrency } from '../../utils/currency';
import { Users } from 'lucide-react';

/* ─── API response shapes ─── */
interface DailySales {
  totalRevenue: number;
  mtdRevenue: number;
  orderCount: number;
  avgTicket: number;
  activeOrdersCount: number;
  deltas: {
    revenueVsPriorDay: number | null;
    mtdVsPriorMonth: number | null;
    ordersVsPriorDay: number | null;
    aovVsPriorDay: number | null;
  };
}
interface MonthlyRow { month: string; revenue: number; orderCount: number; }
interface TopItem { name: string; totalQty: number; totalRevenue: number; imageUrl?: string; }
interface CategoryRow { category: string; revenue: number; count: number; }
interface RecentOrderRow {
  id: string;
  clientOrderId: string;
  tableNumber?: string | null;
  status: string;
  totalAmount: number;
  createdAt: string;
  items?: Array<{ name: string; quantity: number; unitPrice: number }>;
  cashier?: { name: string } | null;
  waiter?: { name: string } | null;
}
interface ProfitLossRow {
  revenue: number;
  payrollCost: number;
  otherExpenses: number;
  netProfit: number;
}

interface WaiterPerfRow {
  waiterId: string;
  name: string;
  role: string;
  orderCount: number;
  totalSales: number;
}

/* ─── Helpers ─── */
const CATEGORY_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DRINK: 'Drink',
  DESSERT: 'Dessert',
};
const CATEGORY_COLOR: Record<string, string> = {
  FOOD: 'hsl(20 95% 53%)',
  DRINK: 'hsl(24 60% 35%)',
  DESSERT: 'hsl(30 80% 75%)',
};

function pickIconForName(name: string): LucideIcon {
  const k = name.toLowerCase();
  if (k.includes('juice') || k.includes('lemonade') || k.includes('water')) return GlassWater;
  if (k.includes('soda') || k.includes('cola') || k.includes('fizz')) return CupSoda;
  if (k.includes('tea') || k.includes('coffee') || k.includes('espresso')) return Coffee;
  return Coffee;
}

// Semantic icon palette that adapts to dark mode
const ICON_BG: Array<string> = [
  'bg-orange-500/15',
  'bg-amber-500/15',
  'bg-sky-500/15',
  'bg-pink-500/15',
  'bg-stone-500/15',
];
const ICON_COLOR: Array<string> = [
  'text-orange-600 dark:text-orange-400',
  'text-amber-600 dark:text-amber-400',
  'text-sky-600 dark:text-sky-400',
  'text-pink-600 dark:text-pink-400',
  'text-stone-600 dark:text-stone-400',
];

type TrendRange = '7d' | '30d' | '90d' | '12m';

const TREND_OPTIONS: Array<{ key: TrendRange; label: string; months: number }> = [
  { key: '7d',   label: 'Last 7 days',  months: 0 },   // handled as days in the loader
  { key: '30d',  label: 'Last 30 days', months: 0 },
  { key: '90d',  label: 'Last 90 days', months: 0 },
  { key: '12m',  label: 'Last 12 months', months: 12 },
];

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
    <span className="text-xs text-muted-foreground font-medium">{label}</span>
  </div>
);

export const OwnerDashboard: React.FC = () => {
  const { t } = useTranslation('owner');
  const { user } = useAuthStore();
  const {
    dateRange: headerDateRange,
    setDateRange: setHeaderDateRange,
    setShowDateRange,
    setPageTitle,
  } = useHeaderStore();

  // Set the page title in the global header
  useEffect(() => {
    setPageTitle({ title: 'Analytics Overview', subtitle: 'How the business is doing right now' });
    return () => setPageTitle({ title: 'Overview', subtitle: '' });
  }, [setPageTitle]);

  // Date range — defaults to last 30 days.
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
  const setDateRange = setHeaderDateRange;

  useEffect(() => {
    setShowDateRange(true);
    return () => setShowDateRange(false);
  }, [setShowDateRange]);

  // Trend range filter for the line chart
  const [trendRange, setTrendRange] = useState<TrendRange>('12m');

  /* ── Data ── */
  const [daily, setDaily] = useState<DailySales | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [totalSales, setTotalSales] = useState<{ totalRevenue: number, orderCount: number } | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossRow | null>(null);
  const [waiterPerf, setWaiterPerf] = useState<WaiterPerfRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const fromIso = new Date(dateRange.from).toISOString();
        const toIso = new Date(`${dateRange.to}T23:59:59.999`).toISOString();
        const [d, m, ti, cat, ord, comp, pl, wp] = await Promise.all([
          axiosClient.get('/analytics/sales/daily'),
          axiosClient.get('/analytics/sales/monthly'),
          axiosClient.get('/analytics/top-items', { params: { from: fromIso, to: toIso, limit: 5 } }),
          axiosClient.get('/analytics/category-split', { params: { from: fromIso, to: toIso } }),
          axiosClient.get('/orders', { params: { limit: 8, sort: 'createdAt:desc' } }),
          axiosClient.get('/analytics/sales/total'),
          axiosClient.get('/analytics/profit-loss'),
          axiosClient.get('/analytics/staff-performance', { params: { from: fromIso, to: toIso, role: 'WAITER' } }),
        ]);
        if (!alive) return;
        setDaily(d.data);
        setMonthly(m.data || []);
        setTopItems(ti.data || []);
        setCategories(cat.data || []);
        const orderList = ord.data?.data || ord.data || [];
        setRecentOrders(Array.isArray(orderList) ? orderList : []);
        setTotalSales(comp.data || null);
        setProfitLoss(pl.data || null);
        setWaiterPerf(Array.isArray(wp.data) ? wp.data : []);
      } catch (err) {
        console.error('owner dashboard load error', err);
      } finally {
        if (alive) setIsLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [dateRange.from, dateRange.to]);

  /* ── Derived KPIs ── */
  const kpis = useMemo(() => {
    return {
      totalOrders: daily?.orderCount ?? 0,
      inProgress: daily?.activeOrdersCount ?? 0,
      completed: totalSales?.orderCount ?? 0,
      todayRevenue: daily?.totalRevenue ?? 0,
      totalRevenue: totalSales?.totalRevenue ?? 0,
      revenueDelta: daily?.deltas.revenueVsPriorDay ?? null,
    };
  }, [daily, totalSales]);

  /* ── Line chart data, sliced by the active trend range ── */
  const lineData = useMemo(() => {
    const slicedMonthly = trendRange === '12m'
      ? monthly.slice(-12)
      : monthly; // smaller windows keep the data the analytics API returned
    const labels = slicedMonthly.map((m) => m.month);
    const income = slicedMonthly.map((m) => Math.round(m.revenue / 100));
    const totalExpenses = profitLoss
      ? profitLoss.payrollCost + profitLoss.otherExpenses
      : 0;
    const expenseRatio =
      profitLoss && profitLoss.revenue > 0 ? totalExpenses / profitLoss.revenue : 0;
    const expenses = income.map((v) => Math.round(v * expenseRatio));
    return { labels, income, expenses };
  }, [monthly, profitLoss, trendRange]);

  const trendLabel = TREND_OPTIONS.find((o) => o.key === trendRange)?.label ?? 'This year';

  /* ── Donut: category split ── */
  const donutSegments = useMemo(() => {
    const FALLBACK_COLORS = ['#fb923c', '#fdba74', '#fed7aa'];
    return categories.map((c, i) => ({
      label: CATEGORY_LABEL[c.category] ?? c.category,
      value: c.revenue,
      color: CATEGORY_COLOR[c.category] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));
  }, [categories]);

  const totalCategoryRevenue = useMemo(
    () => categories.reduce((s, c) => s + c.revenue, 0),
    [categories],
  );

  /* ── Order type bars: top 5 items by share ── */
  const orderTypeEntries = useMemo<OrderTypeEntry[]>(() => {
    const total = topItems.reduce((s, x) => s + x.totalRevenue, 0) || 1;
    return topItems.slice(0, 5).map((it, i) => ({
      id: it.name,
      name: it.name,
      percent: Math.round((it.totalRevenue / total) * 100),
      total: it.totalRevenue,
      imageUrl: it.imageUrl,
      icon: pickIconForName(it.name),
      iconBg: ICON_BG[i % ICON_BG.length],
      iconColor: ICON_COLOR[i % ICON_COLOR.length],
    }));
  }, [topItems]);

  /* ── Recent orders (table) ── */
  const recentRows = useMemo<RecentOrder[]>(() => {
    const STATUS_MAP: Record<string, OrderStatusKey> = {
      PAID: 'paid',
      CANCELLED: 'cancelled',
      SERVED: 'pending',
      SUBMITTED: 'pending',
      IN_KITCHEN: 'pending',
    };
    return recentOrders.slice(0, 7).map((o) => {
      const attendant =
        o.waiter?.name ??
        o.cashier?.name ??
        user?.name ??
        '—';
      const orderType = o.tableNumber ? `Dine-in · T${o.tableNumber}` : 'Takeaway';
      return {
        id: o.id,
        shortId: (o.clientOrderId ?? o.id).slice(0, 4).padStart(4, '0'),
        type: orderType,
        attendant,
        time: o.createdAt,
        status: STATUS_MAP[o.status] ?? 'pending',
        price: o.totalAmount,
      };
    });
  }, [recentOrders, user?.name]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-5 sm:space-y-6">
        {/* KPI cards — 4 floating islands */}
        <KpiCards
          totalOrders={kpis.totalOrders}
          inProgress={kpis.inProgress}
          completed={kpis.completed}
          todayRevenue={kpis.todayRevenue}
          totalRevenue={kpis.totalRevenue}
        />

        {/* Chart row — line chart 2/3 + donut 1/3, side by side */}
        <div className="grid grid-cols-3 gap-5 max-[767px]:gap-3 max-[1023px]:gap-4">
          <SectionCard
            className="col-span-2 max-[767px]:col-span-3"
            title="Revenue trend"
            description="Income vs. operating expenses"
            filterAlign="right"
            filter={{
              label: trendLabel,
              options: TREND_OPTIONS.map((o) => o.label),
              value: trendLabel,
              onChange: (v) => {
                const found = TREND_OPTIONS.find((o) => o.label === v);
                if (found) setTrendRange(found.key);
              },
            }}
            rightAccessory={
              <div className="flex items-center gap-4 shrink-0">
                <LegendDot color="hsl(20 95% 53%)" label="Income" />
                <LegendDot color="hsl(24 60% 35%)" label="Expenses" />
              </div>
            }
          >
            <RevenueLineChart
              labels={lineData.labels}
              series={[
                {
                  key: 'income',
                  label: 'Income',
                  values: lineData.income,
                  color: '#f97316',
                  fill: true,
                },
                {
                  key: 'expenses',
                  label: 'Expenses',
                  values: lineData.expenses,
                  color: '#5d1a12',
                  fill: false,
                },
              ]}
              yFormat={(v) => v.toLocaleString('en-US')}
              tooltipFormat={(v) => formatCurrency(v * 100)}
            />
          </SectionCard>

          <SectionCard
            className="col-span-1 max-[767px]:col-span-3"
            title="Category mix"
            description="Where the revenue is coming from"
            filterAlign="right"
            filter={{ label: 'This month', options: ['This month', 'Last month', 'This year'] }}
          >
            {donutSegments.length > 0 ? (
              <RevenueDonut
                segments={donutSegments}
              />
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No sales data for this period.
              </div>
            )}
          </SectionCard>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            title="Recent orders"
            description="The latest activity across all stations"
            filterAlign="right"
            filter={{ label: 'Last 7 days', options: ['Today', 'Last 7 days', 'Last 30 days', 'Last year'] }}
            className="lg:col-span-2"
            flush
          >
            <div className="px-5 sm:px-6 pb-5">
              <RecentOrdersTable orders={recentRows} />
            </div>
          </SectionCard>

          <SectionCard
            title="Top items"
            description="Best sellers in the selected window"
            filter={{ label: 'Top 5', options: ['Top 5', 'Top 10', 'Top 20'] }}
          >
            {orderTypeEntries.length > 0 ? (
              <OrderTypeBars entries={orderTypeEntries} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No top items in this window.
              </div>
            )}
          </SectionCard>
        </div>

        {/* Waiter Performance */}
        <SectionCard
          title="Waiter performance"
          description="Orders and revenue attributed per waiter in the selected period"
        >
          {waiterPerf.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No waiter data for this period.
            </div>
          ) : (
            <ul className="space-y-4" aria-label="Waiter performance by sales">
              {waiterPerf.map((w) => {
                const maxRevenue = waiterPerf[0]?.totalSales || 1;
                const revenueWidth = Math.min(100, Math.max(2, Math.round((w.totalSales / maxRevenue) * 100)));
                return (
                  <li key={w.waiterId} className="group">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-foreground">{w.name}</span>
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

/* ─────────────────────────────────────────────────────────────────────────
 *  Greeting hero — sits at the top of the dashboard and surfaces the
 *  headline numbers the owner actually cares about.
 * ──────────────────────────────────────────────────────────────────────── */
export default OwnerDashboard;
