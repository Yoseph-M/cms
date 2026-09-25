import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CircleDollarSign,
  Flame,
  Hash,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useHeaderStore } from '../../store/headerStore';
import { useAuthStore } from '../../store/authStore';
import {
  useAnalyticsQuery,
  useDailySalesQuery,
  useStaffPerformanceQuery,
  useMenuQuery,
  useApiQuery,
} from '../../hooks/useCachedQueries';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';
import { AnimatedCurrency, AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { FilterBar } from '../../components/ui/FilterBar';
import {
  findItemBySnapshot,
  indexItemsByName,
  isAmharicLanguage,
  labelForSnapshot,
} from '../../utils/itemName';
import { useTranslation } from 'react-i18next';

/* ─── API response shapes ─── */
interface TrendRow {
  date: string; // YYYY-MM-DD
  revenue: number; // minor units
  orderCount: number;
}
interface TopItemRow {
  name: string;
  totalQty: number;
  totalRevenue: number;
  /** Revenue ÷ units — the price each unit was actually sold at. */
}

/** The value a TopItemRow contributes for a given best-seller metric. */
const topItemValue = (item: TopItemRow, metric: 'revenue' | 'units') =>
  (metric === 'units' ? Number(item.totalQty) : Number(item.totalRevenue)) || 0;
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
interface AttendanceRow {
  id: string;
  userId: string;
  date: string;
  status: string;
}
interface NotificationRow {
  id: string;
  type: string;
  severity: string;
  isRead: boolean;
  message: string;
}

const STATUS_LABEL: Record<string, string> = {
  SERVED: 'Ready',
  SUBMITTED: 'New',
  IN_KITCHEN: 'Cooking',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};
const STATUS_STYLE: Record<string, string> = {
  SERVED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
  SUBMITTED: 'bg-sky-500/10 text-sky-700 border-sky-500/25',
  IN_KITCHEN: 'bg-amber-500/10 text-amber-700 border-amber-500/25',
  PAID: 'bg-secondary text-muted-foreground border-border',
  CANCELLED: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
};

/**
 * The manager's control room.
 *
 * Where the cashier's board is a counter tool, this one is an oversight screen:
 * what needs a decision, who is on the floor, and how the numbers are trending.
 * It intentionally shares no layout skeleton with the cashier board.
 */
export const ManagerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation('common');
  const {
    dateRange: headerDateRange,
    setDateRange: setHeaderDateRange,
    setShowDateRange,
    setPageTitle,
  } = useHeaderStore();

  useEffect(() => {
    setPageTitle({
      title: t('managerDash.title', { defaultValue: 'Dashboard' }),
      subtitle: t('managerDash.subtitle', { defaultValue: 'Operations and revenue overview' }),
    });
    return () => setPageTitle({ title: t('app.overview', { defaultValue: 'Overview' }), subtitle: '' });
  }, [setPageTitle, t]);

  // Date range — defaults to the last 30 days, driven by the global header chip.
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const defaultRange = useMemo(
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
  // Depth is a client-side slice, so "Top 10/20" is not silently capped by the
  // API — and the fetch carries headroom because rows are grouped by the
  // order-line snapshot name, which can list the same dish more than once.
  const topItemsQuery = useAnalyticsQuery<TopItemRow[]>('/analytics/top-items', {
    from: fromIso,
    to: toIso,
    limit: '40',
  });
  /* Catalogue rows carry both item names; order lines only carry the snapshot,
     so the catalogue is what keeps the list in one language. */
  const menuQuery = useMenuQuery();
  const menuItems = Array.isArray(menuQuery.data) ? menuQuery.data : [];
  const catalogueByName = useMemo(() => indexItemsByName(menuItems), [menuItems]);
  const preferAmharic = isAmharicLanguage(i18n.resolvedLanguage || i18n.language);
  const dailyQuery = useDailySalesQuery();
  const waiterPerfQuery = useStaffPerformanceQuery({ from: fromIso, to: toIso, role: 'WAITER' });
  const recentOrdersQuery = useApiQuery<{ data: RecentOrderRow[] }>(
    ['orders', 'recent', 'manager-dashboard'],
    '/orders',
    { limit: 7 },
  );

  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const attendanceQuery = useApiQuery<AttendanceRow[]>(
    ['attendance', 'manager-dashboard'],
    '/attendance',
    { month, year },
  );
  const notificationsQuery = useApiQuery<NotificationRow[]>(
    ['notifications', 'manager-dashboard'],
    '/notifications',
  );

  const trend: TrendRow[] = Array.isArray(trendQuery.data) ? trendQuery.data : [];
  const topItems: TopItemRow[] = Array.isArray(topItemsQuery.data) ? topItemsQuery.data : [];
  const daily = dailyQuery.data ?? null;
  const waiterPerf: WaiterPerfRow[] = Array.isArray(waiterPerfQuery.data) ? waiterPerfQuery.data : [];
  const attendance: AttendanceRow[] = Array.isArray(attendanceQuery.data) ? attendanceQuery.data : [];
  const notifications: NotificationRow[] = Array.isArray(notificationsQuery.data)
    ? notificationsQuery.data
    : [];

  const recentOrders: RecentOrderRow[] = (() => {
    const raw = recentOrdersQuery.data;
    if (!raw) return [];
    const list = raw?.data ?? raw;
    return Array.isArray(list) ? list : [];
  })();

  const isLoading =
    trendQuery.isLoading ||
    topItemsQuery.isLoading ||
    dailyQuery.isLoading ||
    waiterPerfQuery.isLoading ||
    recentOrdersQuery.isLoading;

  /* ── Derived figures ── */
  const rangeStats = useMemo(() => {
    const revenueMinor = trend.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
    const orderCount = trend.reduce((sum, row) => sum + (Number(row.orderCount) || 0), 0);
    return {
      revenueMinor,
      orderCount,
      avgMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
    };
  }, [trend]);

  /* Best sellers ranked highest-to-lowest by the selected metric. Both numbers
     arrive in the same API payload, so the switch only re-ranks the list — it
     never refetches. */
  const [bestSellerMetric, setBestSellerMetric] = useState<'revenue' | 'units'>('revenue');
  // Depth selector — same "Top 5/10/20" control the owner dashboard and the
  // Finance page use, so every best-seller list reads alike.
  const [bestSellerCount, setBestSellerCount] = useState(5);
  /* The API groups by the order-line snapshot name, which is written in the
     language the item was saved in — the same dish can therefore arrive twice,
     and an Amharic label could sit inside an English list. Resolve each
     snapshot back to its catalogue item: label it in the active language and
     fold the duplicate rows into one entry. */
  const labelledTopItems = useMemo(() => {
    const folded = new Map<
      string,
      {
        key: string;
        name: string;
        totalQty: number;
        totalRevenue: number;
      }
    >();
    for (const item of topItems) {
      // Normalises the snapshot first, so "ዶሮ ወጥ (Doro Wat)" and "Doro Wat"
      // resolve to the same catalogue row and fold together.
      const catalogue = findItemBySnapshot(catalogueByName, item.name);
      const name = labelForSnapshot(item.name, catalogue, preferAmharic);
      const key = catalogue?.id ?? `snapshot:${name}`;
      const current = folded.get(key);
      if (current) {
        current.totalQty += Number(item.totalQty) || 0;
        current.totalRevenue += Number(item.totalRevenue) || 0;
      } else {
        folded.set(key, {
          key,
          name,
          totalQty: Number(item.totalQty) || 0,
          totalRevenue: Number(item.totalRevenue) || 0,
        });
      }
    }
    return [...folded.values()];
  }, [topItems, catalogueByName, preferAmharic]);

  const rankedTopItems = useMemo(
    () =>
      [...labelledTopItems].sort(
        (a, b) =>
          topItemValue(b, bestSellerMetric) - topItemValue(a, bestSellerMetric) ||
          (Number(b.totalQty) || 0) - (Number(a.totalQty) || 0),
      ),
    [labelledTopItems, bestSellerMetric],
  );

  const visibleTopItems = useMemo(
    () => rankedTopItems.slice(0, bestSellerCount),
    [rankedTopItems, bestSellerCount],
  );

  // Shares are measured against the items actually on screen, so the bars add
  // up to 100% of the visible list exactly like the owner card does.
  const topItemTotal = useMemo(
    () => visibleTopItems.reduce((sum, i) => sum + topItemValue(i, bestSellerMetric), 0) || 1,
    [visibleTopItems, bestSellerMetric],
  );

  /* ── Needs-attention inbox ── */
  const todayIso = `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const markedToday = useMemo(
    () => attendance.filter((a) => a.date === todayIso).length,
    [attendance, todayIso],
  );
  const unreadAlerts = useMemo(() => notifications.filter((n) => !n.isRead), [notifications]);
  const criticalAlerts = useMemo(
    () => unreadAlerts.filter((n) => n.severity === 'critical' || n.severity === 'warning'),
    [unreadAlerts],
  );

  const firstName = (user?.name || '').trim().split(' ')[0] || t('common:app.firstNameFallback', { defaultValue: 'there' });

  /* ── Sales rhythm: last 14 points of the selected range ── */
  const rhythm = useMemo(() => trend.slice(-14), [trend]);
  const rhythmMax = Math.max(1, ...rhythm.map((r) => Number(r.revenue) || 0));

  /* ── Team leaderboard (highest revenue first) ── */
  const leaderboard = useMemo(
    () => [...waiterPerf].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0)),
    [waiterPerf],
  );
  const leaderMax = Math.max(1, ...leaderboard.map((w) => w.totalSales || 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex h-full flex-col"
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:space-y-6 sm:px-6">
        {/* ── Command header ── */}
        <section className="relative overflow-hidden rounded-3xl border border-indigo-500/15 shadow-[0_20px_50px_-30px_rgba(79,70,229,0.5)]">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/12 via-sky-400/8 to-transparent" />
          <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('managerDash.operationsControl', { defaultValue: 'Operations control' })}
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
                {t('managerDash.floorState', {
                  name: firstName,
                  state: daily?.activeOrdersCount
                    ? t('app.floorBusy', { defaultValue: 'busy' })
                    : t('app.floorCalm', { defaultValue: 'calm' }),
                  defaultValue: '{{name}}, the floor is {{state}}',
                })}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {dateRange.from} → {dateRange.to} · {rangeStats.orderCount} {t('app.orders', { defaultValue: 'orders' })} ·{' '}
                {formatCurrency(rangeStats.revenueMinor)} {t('app.revenue', { defaultValue: 'revenue' })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <HeaderChip
                label={t('managerDash.openOrders', { defaultValue: 'Open orders' })}
                value={String(daily?.activeOrdersCount ?? 0)}
                icon={Hash}
              />
              <HeaderChip label={t('managerDash.onShiftToday', { defaultValue: 'On shift today' })} value={String(markedToday)} icon={Users} />
              <HeaderChip
                label={t('managerDash.unreadAlerts', { defaultValue: 'Unread alerts' })}
                value={String(unreadAlerts.length)}
                icon={BellRing}
                tone={criticalAlerts.length > 0 ? 'danger' : 'default'}
              />
            </div>
          </div>
        </section>

        {/* ── Metrics rail — Revenue, Orders, Average ticket, Live orders,
            always a single row of four (stacks only on the narrowest phones). ── */}
        <section className="grid grid-cols-2 max-[419px]:grid-cols-1 gap-4 sm:grid-cols-4">
          <MetricCard
            label={t('app.revenue', { defaultValue: 'Revenue' }).replace(/^./, (c) => c.toUpperCase())}
            value={<AnimatedCurrency value={rangeStats.revenueMinor} />}
            caption={t('app.paidOrdersInRange', { defaultValue: 'Paid orders in range' })}
            icon={CircleDollarSign}
            accent="indigo"
          />
          <MetricCard
            label={t('managerDash.ordersLabel', { defaultValue: 'Orders' })}
            value={<AnimatedNumber value={rangeStats.orderCount} />}
            caption={t('app.ticketsRaisedInRange', { defaultValue: 'Tickets raised in range' })}
            icon={Receipt}
            accent="sky"
          />
          <MetricCard
            label={t('managerDash.averageTicket', { defaultValue: 'Average ticket' })}
            value={<AnimatedCurrency value={rangeStats.avgMinor} />}
            caption={t('app.revenuePerOrder', { defaultValue: 'Revenue per order' })}
            icon={TrendingUp}
            accent="violet"
          />
          <MetricCard
            label={t('managerDash.liveOrders', { defaultValue: 'Live orders' })}
            value={<AnimatedNumber value={daily?.activeOrdersCount ?? 0} />}
            caption={t('app.currentlyOnTheFloor', { defaultValue: 'Currently on the floor' })}
            icon={Flame}
            accent="rose"
          />
        </section>

        {/* ── Sales rhythm + team ── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="xl:col-span-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-display text-[15px] font-semibold text-foreground">
                    {t('managerDash.salesRhythm', { defaultValue: 'Sales rhythm' })}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t('managerDash.dailyPaidRevenue', { count: rhythm.length, defaultValue: 'Daily paid revenue · last {{count}} days in range' })}
                  </p>
                </div>
              </div>
            </header>
            <div className="px-5 py-5">
              {rhythm.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t('managerDash.noPaidOrders', { defaultValue: 'No paid orders in this period.' })}
                </p>
              ) : (
                <div className="flex h-44 items-end gap-1.5 sm:gap-2">
                  {rhythm.map((row, i) => {
                    const value = Number(row.revenue) || 0;
                    const height = Math.max(3, Math.round((value / rhythmMax) * 100));
                    const isPeak = value === rhythmMax && value > 0;
                    return (
                      <div key={row.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                        <span className="pointer-events-none rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100">
                          {formatCurrency(value)}
                        </span>
                        <div
                          className={cn(
                            'w-full rounded-t-md transition-all duration-500',
                            isPeak
                              ? 'bg-gradient-to-t from-indigo-500 to-sky-400'
                              : 'bg-gradient-to-t from-indigo-500/35 to-sky-400/25 group-hover:from-indigo-500/60 group-hover:to-sky-400/50',
                          )}
                          style={{ height: `${height}%` }}
                          title={`${row.date} · ${formatCurrency(value)} · ${row.orderCount} orders`}
                        />
                        <span className="truncate text-[10px] text-muted-foreground">
                          {i % 2 === 0 ? formatShortDate(row.date, i18n.language) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Team leaderboard */}
          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-display text-[15px] font-semibold text-foreground">
                    {t('managerDash.teamOnFloor', { defaultValue: 'Team on the floor' })}
                  </h2>
                  <p className="text-xs text-muted-foreground">{t('managerDash.revenuePerWaiter', { defaultValue: 'Revenue per waiter in range' })}</p>
                </div>
              </div>
              <Link
                to="/manager/staff"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('managerDash.staff', { defaultValue: 'Staff' })}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>
            {leaderboard.length === 0 ? (                <p className="py-12 text-center text-sm text-muted-foreground">
                  {t('managerDash.noWaiterActivity', { defaultValue: 'No waiter activity in this period.' })}
                </p>
            ) : (
              <ol className="divide-y divide-border/40">
                {leaderboard.slice(0, 6).map((w, i) => (
                  <li key={w.waiterId} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold',
                        i === 0
                          ? 'bg-amber-400/20 text-amber-700'
                          : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{w.name}</span>
                        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                          {formatCurrency(w.totalSales)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-[width] duration-700"
                            style={{
                              width: `${Math.min(100, Math.max(3, Math.round(((w.totalSales || 0) / leaderMax) * 100)))}%`,
                            }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {t('app.orderCount', { count: w.orderCount, defaultValue: '{{count}} orders' })}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* ── Recent orders + top items ── */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="xl:col-span-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-foreground">
                  {t('managerDash.latestTickets', { defaultValue: 'Latest tickets' })}
                </h2>
                <p className="text-xs text-muted-foreground">{t('managerDash.mostRecentActivity', { defaultValue: 'Most recent activity across the room' })}</p>
              </div>
            </header>
            {recentOrders.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t('managerDash.noOrdersYet', { defaultValue: 'No orders yet.' })}</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      #{(o.clientOrderId ?? o.id).slice(0, 6).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {o.tableNumber
                        ? t('app.tableN', { number: o.tableNumber, defaultValue: 'Table {{number}}' })
                        : t('app.takeout', { defaultValue: 'Takeout' })}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {o.waiter?.name ?? o.cashier?.name ?? '—'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        STATUS_STYLE[o.status] ?? 'border-border bg-secondary text-muted-foreground',
                      )}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
                      {new Date(o.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(o.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
              <div>
                <h2 className="font-display text-[15px] font-semibold text-foreground">
                  {t('dashboard.sections.bestSellers', { ns: 'owner', defaultValue: 'Best sellers' })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {bestSellerMetric === 'units'
                    ? t('dashboard.sections.bestSellersDescUnits', {
                        ns: 'owner',
                        defaultValue: 'Share of units sold in range',
                      })
                    : t('dashboard.sections.bestSellersDesc', {
                        ns: 'owner',
                        defaultValue: 'Share of revenue in range',
                      })}
                </p>
              </div>
              {/* Metric switch and depth selector share one wrapping bar, the
                  same control pair the owner dashboard shows. */}
              <div className="flex min-w-0 items-center justify-end gap-2">
                <FilterBar
                  ariaLabel={t('dashboard.rankBy', { ns: 'owner', defaultValue: 'Rank by' })}
                  icon={TrendingUp}
                  options={[
                    {
                      value: 'revenue',
                      label: t('dashboard.metricRevenue', { ns: 'owner', defaultValue: 'Revenue' }),
                    },
                    {
                      value: 'units',
                      label: t('dashboard.metricUnits', { ns: 'owner', defaultValue: 'Units' }),
                    },
                  ]}
                  value={bestSellerMetric}
                  onChange={(v) => setBestSellerMetric(v === 'units' ? 'units' : 'revenue')}
                  className="w-auto"
                />
                <FilterBar
                  ariaLabel={t('dashboard.sections.bestSellers', {
                    ns: 'owner',
                    defaultValue: 'Best sellers',
                  })}
                  options={[5, 10, 20].map((n) => ({
                    value: String(n),
                    label: t('dashboard.topCount', {
                      ns: 'owner',
                      count: n,
                      defaultValue: 'Top {{count}}',
                    }),
                  }))}
                  value={String(bestSellerCount)}
                  onChange={(v) => setBestSellerCount(Number(v) || 5)}
                  className="w-auto"
                />
              </div>
            </header>
            {rankedTopItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('dashboard.emptyBestSellers', { ns: 'owner', defaultValue: 'No sales in this period.' })}
              </p>
            ) : (
              <ul className="space-y-4 px-5 py-5">
                {visibleTopItems.map((item, i) => {
                  const pct = Math.round((topItemValue(item, bestSellerMetric) / topItemTotal) * 100);
                  return (
                    <li key={`${item.key}-${i}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-700"
                          style={{ width: `${Math.max(3, pct)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('dashboard.topItems.sold', { ns: 'owner', count: item.totalQty, defaultValue: '{{count}} sold' })} · {formatCurrency(item.totalRevenue)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {isLoading && (
          <p className="text-center text-[11px] text-muted-foreground">{t('app.refreshing', { defaultValue: 'Refreshing…' })}</p>
        )}
      </div>
    </motion.div>
  );
};

/* ─────────────────────────── building blocks ─────────────────────────── */

const HeaderChip: React.FC<{
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  tone?: 'default' | 'danger';
}> = ({ label, value, icon: Icon, tone = 'default' }) => (
  <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/70 px-3 py-2 backdrop-blur-sm">
    <Icon
      className={cn('h-4 w-4', tone === 'danger' ? 'text-destructive' : 'text-indigo-500')}
    />
    <div className="leading-tight">
      <p className="font-display text-sm font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  </div>
);

const METRIC_ACCENT: Record<string, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-600',
  sky: 'bg-sky-500/10 text-sky-600',
  violet: 'bg-violet-500/10 text-violet-600',
  rose: 'bg-rose-500/10 text-rose-600',
};

const MetricCard: React.FC<{
  label: string;
  value: React.ReactNode;
  caption: string;
  icon: React.FC<{ className?: string }>;
  accent: keyof typeof METRIC_ACCENT;
}> = ({ label, value, caption, icon: Icon, accent }) => (
  <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5 sm:gap-4 sm:p-5">
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-11 sm:w-11', METRIC_ACCENT[accent])}>
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-bold leading-none tabular-nums text-foreground sm:text-xl">
        {value}
      </p>
      <p className="mt-1 hidden truncate text-[11px] text-muted-foreground sm:block">{caption}</p>
    </div>
  </div>
);

function formatShortDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale || 'en-US', { month: 'short', day: 'numeric' });
}

export default ManagerDashboard;
