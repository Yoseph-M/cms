import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useHeaderStore } from '../../store/headerStore';
import { cn } from '../../lib/utils';
import {
  useDailySalesQuery,
  useMonthlySalesQuery,
  useTotalSalesQuery,
  useProfitLossQuery,
  useStaffPerformanceQuery,
  useOrdersQuery,
  useAnalyticsQuery,
} from '../../hooks/useCachedQueries';

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
  /** Total spending — payroll is folded in, not a separate line. */
  expenses: number;
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
// Category ring uses the same warm family as every other pie chart.
const CATEGORY_COLOR: Record<string, string> = {
  FOOD: 'hsl(24 95% 53%)',
  DRINK: 'hsl(38 92% 50%)',
  DESSERT: 'hsl(0 72% 51%)',
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
  'bg-blue-500/15',
  'bg-sky-500/15',
  'bg-cyan-500/15',
  'bg-pink-500/15',
  'bg-stone-500/15',
];
const ICON_COLOR: Array<string> = [
  'text-blue-600 dark:text-blue-400',
  'text-sky-600 dark:text-sky-400',
  'text-cyan-600 dark:text-cyan-400',
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

  /* ── Working filters — previously these dropdowns were decorative; they now
        actually drive the data they label. ── */
  // Category mix window
  const [categoryWindow, setCategoryWindow] = useState<'This month' | 'Last month' | 'This year'>('This month');
  const categoryFromTo = useMemo(() => {
    const now = new Date();
    if (categoryWindow === 'This month') {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString(),
      };
    }
    if (categoryWindow === 'Last month') {
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).toISOString(),
      };
    }
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString(),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString(),
    };
  }, [categoryWindow]);

  // Recent orders window
  const [recentWindow, setRecentWindow] = useState<'Today' | 'Last 7 days' | 'Last 30 days' | 'Last year'>('Last 7 days');
  const recentFrom = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = recentWindow === 'Today' ? 0 : recentWindow === 'Last 7 days' ? 6 : recentWindow === 'Last 30 days' ? 29 : 364;
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }, [recentWindow]);

  // Top items depth
  const [topCount, setTopCount] = useState(5);

  /* ── Data (React Query — cached across navigations) ── */
  const fromIso = useMemo(() => new Date(dateRange.from).toISOString(), [dateRange.from]);
  const toIso = useMemo(() => new Date(`${dateRange.to}T23:59:59.999`).toISOString(), [dateRange.to]);

  const dailyQuery = useDailySalesQuery();
  const monthlyQuery = useMonthlySalesQuery();
  // Fetch enough depth for the "Top 20" filter option; slicing happens below.
  const topItemsQuery = useAnalyticsQuery<TopItem[]>(
    '/analytics/top-items',
    { from: fromIso, to: toIso, limit: '20' },
  );
  const categoriesQuery = useAnalyticsQuery<CategoryRow[]>(
    '/analytics/category-split',
    { from: categoryFromTo.from, to: categoryFromTo.to },
  );
  const ordersQuery = useOrdersQuery({ limit: 30, sort: 'createdAt:desc' });
  const totalSalesQuery = useTotalSalesQuery();
  const profitLossQuery = useProfitLossQuery();
  const waiterPerfQuery = useStaffPerformanceQuery({ from: fromIso, to: toIso, role: 'WAITER' });

  const daily: DailySales | null = dailyQuery.data ?? null;
  const monthly: MonthlyRow[] = monthlyQuery.data ?? [];
  const topItems: TopItem[] = Array.isArray(topItemsQuery.data) ? topItemsQuery.data : [];
  const categories: CategoryRow[] = Array.isArray(categoriesQuery.data) ? categoriesQuery.data : [];
  const recentOrders: RecentOrderRow[] = (() => {
    const raw = ordersQuery.data;
    if (!raw) return [];
    const list = raw?.data ?? raw;
    return Array.isArray(list) ? list : [];
  })();
  const totalSales = totalSalesQuery.data ?? null;
  const profitLoss: ProfitLossRow | null = profitLossQuery.data ?? null;
  const waiterPerf: WaiterPerfRow[] = Array.isArray(waiterPerfQuery.data) ? waiterPerfQuery.data : [];

  const isLoading =
    dailyQuery.isLoading ||
    monthlyQuery.isLoading ||
    topItemsQuery.isLoading ||
    categoriesQuery.isLoading ||
    ordersQuery.isLoading ||
    totalSalesQuery.isLoading ||
    profitLossQuery.isLoading ||
    waiterPerfQuery.isLoading;

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
    const income = slicedMonthly.map((m) => Math.round(m.revenue));
    const totalExpenses = profitLoss ? profitLoss.expenses : 0;
    const expenseRatio =
      profitLoss && profitLoss.revenue > 0 ? totalExpenses / profitLoss.revenue : 0;
    const expenses = income.map((v) => Math.round(v * expenseRatio));
    return { labels, income, expenses };
  }, [monthly, profitLoss, trendRange]);

  const trendLabel = TREND_OPTIONS.find((o) => o.key === trendRange)?.label ?? 'This year';

  /* Totals strip above the revenue trend: one tile per series, so the chart
     reads at a glance without hovering. No net/margin tiles — the card is the
     income-vs-expenses comparison, and net margin lives on Profit & Loss. */
  const incomeLabel = t('dashboard.series.income', { defaultValue: 'Income' });
  const expensesLabel = t('dashboard.series.expenses', { defaultValue: 'Expenses' });
  const trendTotals = useMemo(() => {
    const income = lineData.income.reduce((s, v) => s + v, 0);
    const expenses = lineData.expenses.reduce((s, v) => s + v, 0);
    return { income, expenses };
  }, [lineData]);

  /* ── Donut: category split ── */
  const donutSegments = useMemo(() => {
    const FALLBACK_COLORS = ['#F97316', '#F59E0B', '#DC2626'];
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

  /* ── Order type bars: top N items by share, N from the "Top 5/10/20" filter ── */
  const orderTypeEntries = useMemo<OrderTypeEntry[]>(() => {
    const visible = topItems.slice(0, topCount);
    const total = visible.reduce((s, x) => s + x.totalRevenue, 0) || 1;
    return visible.map((it, i) => ({
      id: it.name,
      name: it.name,
      percent: Math.round((it.totalRevenue / total) * 100),
      total: it.totalRevenue,
      imageUrl: it.imageUrl,
      icon: pickIconForName(it.name),
      iconBg: ICON_BG[i % ICON_BG.length],
      iconColor: ICON_COLOR[i % ICON_COLOR.length],
    }));
  }, [topItems, topCount]);

  /* ── Recent orders (table) — honours the "Today / Last 7 days / …" filter ── */
  const recentRows = useMemo<RecentOrder[]>(() => {
    const STATUS_MAP: Record<string, OrderStatusKey> = {
      PAID: 'paid',
      CANCELLED: 'cancelled',
      SERVED: 'pending',
      SUBMITTED: 'pending',
      IN_KITCHEN: 'pending',
    };
    const floor = new Date(recentFrom).getTime();
    return recentOrders
      .filter((o) => new Date(o.createdAt).getTime() >= floor)
      .slice(0, 7)
      .map((o) => {
      const attendant =
        o.waiter?.name ??
        o.cashier?.name ??
        user?.name ??
        '—';
      const orderType = o.tableNumber ? `Dine-in · T${o.tableNumber}` : 'Takeaway';
      return {
        id: o.id,
        type: orderType,
        attendant,
        time: o.createdAt,
        status: STATUS_MAP[o.status] ?? 'pending',
        price: o.totalAmount,
      };
      });
  }, [recentOrders, recentFrom, user?.name]);

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
            title={t('dashboard.sections.revenueTrend')}
            description={t('dashboard.sections.revenueTrendDesc', {
              defaultValue: 'Income vs. operating expenses',
            })}
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
          >
            <RevenueLineChart
              labels={lineData.labels}
              series={[
                {
                  key: 'income',
                  label: incomeLabel,
                  values: lineData.income,
                  color: 'blue',
                },
                {
                  key: 'expenses',
                  label: expensesLabel,
                  values: lineData.expenses,
                  color: 'red',
                },
              ]}
              yFormat={(v) => v.toLocaleString('en-US')}
              tooltipFormat={(v) => formatCurrency(v)}
              summary={[
                {
                  label: incomeLabel,
                  value: formatCurrency(trendTotals.income),
                  color: '#3b82f6',
                },
                {
                  label: expensesLabel,
                  value: formatCurrency(trendTotals.expenses),
                  color: '#ef4444',
                },
              ]}
            />
          </SectionCard>

          <SectionCard
            className="col-span-1 max-[767px]:col-span-3"
            title={t('dashboard.sections.categoryMix')}
            description={t('dashboard.sections.categoryMixDesc', {
              defaultValue: 'Where the revenue is coming from',
            })}
            filterAlign="right"
            filter={{
              label: categoryWindow,
              options: ['This month', 'Last month', 'This year'],
              value: categoryWindow,
              onChange: (v) => setCategoryWindow(v as typeof categoryWindow),
            }}
          >
            {donutSegments.length > 0 ? (
              <RevenueDonut
                segments={donutSegments}
              />
            ) : (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {t('dashboard.emptySales')}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            title={t('dashboard.sections.recentOrders')}
            description={t('dashboard.sections.recentOrdersDesc', {
              defaultValue: 'The latest activity across all stations',
            })}
            filterAlign="right"
            filter={{
              label: recentWindow,
              options: ['Today', 'Last 7 days', 'Last 30 days', 'Last year'],
              value: recentWindow,
              onChange: (v) => setRecentWindow(v as typeof recentWindow),
            }}
            className="lg:col-span-2"
            flush
          >
            <div className="px-5 sm:px-6 pb-5">
              <RecentOrdersTable orders={recentRows} />
            </div>
          </SectionCard>

          <SectionCard
            title={t('dashboard.sections.topItems')}
            description={t('dashboard.sections.topItemsDesc', {
              defaultValue: 'Best sellers in the selected window',
            })}
            filter={{
              label: `Top ${topCount}`,
              options: ['Top 5', 'Top 10', 'Top 20'],
              value: `Top ${topCount}`,
              onChange: (v) => setTopCount(Number(v.replace('Top ', '')) || 5),
            }}
          >
            {orderTypeEntries.length > 0 ? (
              <OrderTypeBars entries={orderTypeEntries} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t('dashboard.emptyTopItems')}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Waiter Performance */}
        <SectionCard
          title={t('dashboard.sections.waiterPerformance')}
          description={t('dashboard.sections.waiterPerformanceDesc', {
            defaultValue: 'Orders and revenue attributed per waiter in the selected period',
          })}
        >
          {waiterPerf.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t('dashboard.emptyWaiter')}
            </div>
          ) : (
            <ul className="space-y-4" aria-label={t('dashboard.sections.waiterPerformanceAria')}>
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
          <p className="text-center text-[11px] text-muted-foreground">{t('dashboard.refreshing')}</p>
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
