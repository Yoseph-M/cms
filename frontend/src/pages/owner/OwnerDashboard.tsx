import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Coffee, GlassWater, CupSoda, TrendingUp, type LucideIcon } from 'lucide-react';
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
  useMenuQuery,
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
import { FilterBar } from '../../components/ui/FilterBar';
import { formatCurrency } from '../../utils/currency';
import {
  findItemBySnapshot,
  indexItemsByName,
  isAmharicLanguage,
  labelForSnapshot,
} from '../../utils/itemName';
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
interface TopItem {
  name: string;
  totalQty: number;
  totalRevenue: number;
  imageUrl?: string;
}
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
/** i18n keys per menu category; labels resolve through the common namespace. */
const CATEGORY_KEY: Record<string, string> = {
  FOOD: 'categories.food',
  DRINK: 'categories.drink',
  DESSERT: 'categories.dessert',
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

/** Label keys resolve through the owner namespace's finance block. */
const TREND_OPTIONS: Array<{ key: TrendRange; labelKey: string; months: number }> = [
  { key: '7d',   labelKey: 'finance.last7Days',  months: 0 },   // handled as days in the loader
  { key: '30d',  labelKey: 'finance.last30Days', months: 0 },
  { key: '90d',  labelKey: 'finance.last90Days', months: 0 },
  { key: '12m',  labelKey: 'finance.last12Months', months: 12 },
];

const CATEGORY_WINDOWS = ['This month', 'Last month', 'This year'] as const;
type CategoryWindow = (typeof CATEGORY_WINDOWS)[number];
const RECENT_WINDOWS = ['Today', 'Last 7 days', 'Last 30 days', 'Last year'] as const;
type RecentWindow = (typeof RECENT_WINDOWS)[number];

export const OwnerDashboard: React.FC = () => {
  const { t, i18n } = useTranslation('owner');
  const { t: tc } = useTranslation('common');
  const { user } = useAuthStore();
  const {
    dateRange: headerDateRange,
    setDateRange: setHeaderDateRange,
    setShowDateRange,
    setPageTitle,
  } = useHeaderStore();

  // Set the page title in the global header
  useEffect(() => {
    setPageTitle({
      title: t('dashboard.title', { defaultValue: 'Analytics Overview' }),
      subtitle: t('dashboard.subtitle', { defaultValue: 'How the business is doing right now' }),
    });
    return () => setPageTitle({ title: tc('app.overview', { defaultValue: 'Overview' }), subtitle: '' });
  }, [setPageTitle, t, tc]);

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
  // Category mix window — the option list is stored as its key so the UI
  // language can translate the labels without losing the selection.
  const [categoryWindow, setCategoryWindow] = useState<CategoryWindow>('This month');
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

  // Recent orders window — keyed like the category window above.
  const [recentWindow, setRecentWindow] = useState<RecentWindow>('Last 7 days');
  const recentFrom = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = recentWindow === 'Today' ? 0 : recentWindow === 'Last 7 days' ? 6 : recentWindow === 'Last 30 days' ? 29 : 364;
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }, [recentWindow]);

  // Top items depth
  const [topCount, setTopCount] = useState(5);

  /* Which metric "best seller" ranks by. Both numbers ship in the same API
     response, so switching is a pure client-side re-rank — the card and the
     Item Sales page can be read on the same footing. */
  const [bestSellerMetric, setBestSellerMetric] = useState<'revenue' | 'units'>('revenue');

  /* ── Data (React Query — cached across navigations) ── */
  const fromIso = useMemo(() => new Date(dateRange.from).toISOString(), [dateRange.from]);
  const toIso = useMemo(() => new Date(`${dateRange.to}T23:59:59.999`).toISOString(), [dateRange.to]);

  /* The catalogue carries both names per item; order lines only carry the
     snapshot, so it is what turns a mixed-language best-seller list into one
     language. */
  const menuQuery = useMenuQuery();
  const menuItems = Array.isArray(menuQuery.data) ? menuQuery.data : [];
  const catalogueByName = useMemo(() => indexItemsByName(menuItems), [menuItems]);
  const preferAmharic = isAmharicLanguage(i18n.resolvedLanguage || i18n.language);

  const dailyQuery = useDailySalesQuery();
  const monthlyQuery = useMonthlySalesQuery();
  // Fetch headroom for the "Top 20" filter option: rows are grouped by the
  // order-line snapshot name, so the same dish can arrive more than once and the
  // dedupe below still has to be able to fill twenty rows. Slicing happens here.
  const topItemsQuery = useAnalyticsQuery<TopItem[]>(
    '/analytics/top-items',
    { from: fromIso, to: toIso, limit: '40' },
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

  const trendLabel = t(
    TREND_OPTIONS.find((o) => o.key === trendRange)?.labelKey ?? 'finance.last12Months',
    { defaultValue: 'Last 12 months' },
  );

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
      label: CATEGORY_KEY[c.category]
        ? tc(CATEGORY_KEY[c.category], { defaultValue: c.category })
        : c.category,
      value: c.revenue,
      color: CATEGORY_COLOR[c.category] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));
  }, [categories, tc]);

  const totalCategoryRevenue = useMemo(
    () => categories.reduce((s, c) => s + c.revenue, 0),
    [categories],
  );

  /* ── Best sellers: top N items by the selected metric, N from the "Top
        5/10/20" filter. Ranked highest-to-lowest so the bars descend top to
        bottom.

        The API groups rows by the order-line snapshot name, which is written
        in the language the item was saved in — so the same dish can arrive
        twice (once Amharic, once English) and an Amharic label could sit in the
        middle of an English list. Each snapshot is resolved back to its
        catalogue item here, both to label it in the active language and to fold
        the duplicate rows into one entry. ── */
  const bestSellerEntries = useMemo<OrderTypeEntry[]>(() => {
    const byUnits = bestSellerMetric === 'units';
    const folded = new Map<
      string,
      {
        key: string;
        label: string;
        snapshot: string;
        totalQty: number;
        totalRevenue: number;
        imageUrl?: string;
      }
    >();
    for (const item of topItems) {
      // Normalises the snapshot first, so "ዶሮ ወጥ (Doro Wat)" and "Doro Wat"
      // resolve to the same catalogue row and fold together.
      const catalogue = findItemBySnapshot(catalogueByName, item.name);
      const label = labelForSnapshot(item.name, catalogue, preferAmharic);
      const key = catalogue?.id ?? `snapshot:${label}`;
      const current = folded.get(key);
      if (current) {
        current.totalQty += item.totalQty || 0;
        current.totalRevenue += item.totalRevenue || 0;
        if (!current.imageUrl && item.imageUrl) current.imageUrl = item.imageUrl;
      } else {
        folded.set(key, {
          key,
          label,
          snapshot: item.name,
          totalQty: item.totalQty || 0,
          totalRevenue: item.totalRevenue || 0,
          imageUrl: item.imageUrl,
        });
      }
    }

    const rows = [...folded.values()];
    const valueFor = (row: { totalQty: number; totalRevenue: number }) =>
      (byUnits ? row.totalQty : row.totalRevenue) || 0;
    const ranked = rows.sort(
      (a, b) => valueFor(b) - valueFor(a) || (b.totalQty || 0) - (a.totalQty || 0),
    );
    const visible = ranked.slice(0, topCount);
    const total = visible.reduce((s, x) => s + valueFor(x), 0) || 1;
    return visible.map((it, i) => ({
      id: it.key,
      name: it.label,
      percent: Math.round((valueFor(it) / total) * 100),
      total: it.totalRevenue,
      // Units sold, so the card reads like the manager's Best sellers list.
      qty: it.totalQty,
      metric: bestSellerMetric,
      imageUrl: it.imageUrl,
      icon: pickIconForName(it.label),
      iconBg: ICON_BG[i % ICON_BG.length],
      iconColor: ICON_COLOR[i % ICON_COLOR.length],
    }));
  }, [topItems, topCount, bestSellerMetric, catalogueByName, preferAmharic]);

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
      return {
        id: o.id,
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
              options: TREND_OPTIONS.map((o) => ({
                value: o.key,
                label: t(o.labelKey, { defaultValue: o.key }),
              })),
              value: trendRange,
              onChange: (v) => setTrendRange(v as TrendRange),
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
              label: tc(`dashboard.categoryWindow.${categoryWindow}`, { ns: 'owner', defaultValue: categoryWindow }),
              options: CATEGORY_WINDOWS.map((w) => ({
                value: w,
                label: tc(`dashboard.categoryWindow.${w}`, { ns: 'owner', defaultValue: w }),
              })),
              value: categoryWindow,
              onChange: (v) => setCategoryWindow(v as CategoryWindow),
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
              label: tc(`dashboard.recentWindow.${recentWindow}`, { ns: 'owner', defaultValue: recentWindow }),
              options: RECENT_WINDOWS.map((w) => ({
                value: w,
                label: tc(`dashboard.recentWindow.${w}`, { ns: 'owner', defaultValue: w }),
              })),
              value: recentWindow,
              onChange: (v) => setRecentWindow(v as RecentWindow),
            }}
            className="lg:col-span-2"
            flush
          >
            <div className="px-5 sm:px-6 pb-5">
              <RecentOrdersTable orders={recentRows} />
            </div>
          </SectionCard>

          <SectionCard
            title={t('dashboard.sections.bestSellers', { defaultValue: 'Best sellers' })}
            description={
              bestSellerMetric === 'units'
                ? t('dashboard.sections.bestSellersDescUnits', {
                    defaultValue: 'Share of units sold in range',
                  })
                : t('dashboard.sections.bestSellersDesc', {
                    defaultValue: 'Share of revenue in range',
                  })
            }
            // Ranking metric and depth selector share the card's filter bar so
            // the header row stays a single, always-visible control — and both
            // are dropdowns, the same filter control the rest of the app uses.
            toolbar={
              <FilterBar
                ariaLabel={t('dashboard.rankBy', { ns: 'owner', defaultValue: 'Rank by' })}
                icon={TrendingUp}
                options={[
                  { value: 'revenue', label: t('dashboard.metricRevenue', { defaultValue: 'Revenue' }) },
                  { value: 'units', label: t('dashboard.metricUnits', { defaultValue: 'Units' }) },
                ]}
                value={bestSellerMetric}
                onChange={(v) => setBestSellerMetric(v === 'units' ? 'units' : 'revenue')}
                className="w-auto"
              />
            }
            filter={{
              label: t('dashboard.topCount', { ns: 'owner', count: topCount, defaultValue: 'Top {{count}}' }),
              options: [5, 10, 20].map((n) => ({
                value: String(n),
                label: t('dashboard.topCount', { ns: 'owner', count: n, defaultValue: 'Top {{count}}' }),
              })),
              value: String(topCount),
              onChange: (v) => setTopCount(Number(v) || 5),
              // Compact pill: it shares the header row with the metric switch.
              className: 'w-auto',
            }}
          >
            {bestSellerEntries.length > 0 ? (
              <OrderTypeBars entries={bestSellerEntries} />
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t('dashboard.emptyBestSellers', { defaultValue: 'No sales in this period.' })}
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
                          {/* A key without a placeholder swallows the count, so
                              `app.orders` alone rendered "orders" with no
                              number — `app.orderCount` carries the count. */}
                          {tc('app.orderCount', { count: w.orderCount, defaultValue: '{{count}} orders' })}
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
