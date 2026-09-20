import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck,
  CircleDollarSign,
  ClipboardCheck,
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
  useApiQuery,
} from '../../hooks/useCachedQueries';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';
import { AnimatedCurrency, AnimatedNumber } from '../../components/ui/AnimatedNumber';

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
interface DailyCloseRecord {
  status: 'OPEN' | 'PENDING_REVIEW' | 'CLOSED' | 'REJECTED';
  businessDate: string;
  requestedBy?: { name: string } | null;
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
  const closeQuery = useApiQuery<DailyCloseRecord | null>(
    ['dailyClose', 'current', 'manager-dashboard'],
    '/daily-close/current',
  );

  const trend: TrendRow[] = Array.isArray(trendQuery.data) ? trendQuery.data : [];
  const topItems: TopItemRow[] = Array.isArray(topItemsQuery.data) ? topItemsQuery.data : [];
  const daily = dailyQuery.data ?? null;
  const waiterPerf: WaiterPerfRow[] = Array.isArray(waiterPerfQuery.data) ? waiterPerfQuery.data : [];
  const attendance: AttendanceRow[] = Array.isArray(attendanceQuery.data) ? attendanceQuery.data : [];
  const notifications: NotificationRow[] = Array.isArray(notificationsQuery.data)
    ? notificationsQuery.data
    : [];
  const closeRecord = closeQuery.data ?? null;

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

  const topItemTotal = useMemo(
    () => topItems.reduce((sum, i) => sum + (Number(i.totalRevenue) || 0), 0) || 1,
    [topItems],
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

  const closePending = closeRecord?.status === 'PENDING_REVIEW';
  const firstName = (user?.name || '').trim().split(' ')[0] || 'there';

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
                Operations control
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
                {firstName}, the floor is {daily?.activeOrdersCount ? 'busy' : 'calm'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {dateRange.from} → {dateRange.to} · {rangeStats.orderCount} orders ·{' '}
                {formatCurrency(rangeStats.revenueMinor)} revenue
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <HeaderChip
                label="Open orders"
                value={String(daily?.activeOrdersCount ?? 0)}
                icon={Hash}
              />
              <HeaderChip label="On shift today" value={String(markedToday)} icon={Users} />
              <HeaderChip
                label="Unread alerts"
                value={String(unreadAlerts.length)}
                icon={BellRing}
                tone={criticalAlerts.length > 0 ? 'danger' : 'default'}
              />
            </div>
          </div>
        </section>

        {/* ── Needs your attention ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-foreground">
              Needs your attention
            </h2>
            <span className="text-xs text-muted-foreground">
              {closePending || criticalAlerts.length > 0
                ? 'Action required'
                : 'Nothing is waiting on a decision'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AttentionCard
              to="/manager/reconciliation"
              icon={ClipboardCheck}
              title="End of Day"
              tone={closePending ? 'warning' : 'neutral'}
              headline={
                closePending
                  ? 'A close request is waiting'
                  : closeRecord?.status === 'CLOSED'
                    ? 'Today is closed'
                    : closeRecord?.status === 'REJECTED'
                      ? 'Request disapproved'
                      : 'No request yet'
              }
              detail={
                closePending
                  ? `${closeRecord?.requestedBy?.name ?? 'The floor'} asked to close ${closeRecord?.businessDate}.`
                  : closeRecord?.status === 'CLOSED'
                    ? 'The day is approved and locked.'
                    : 'The cashier sends the request from the till.'
              }
              cta={closePending ? 'Approve or disapprove' : 'Open End of Day'}
            />
            <AttentionCard
              to="/manager/staff"
              icon={AlertTriangle}
              title="Alerts"
              tone={criticalAlerts.length > 0 ? 'danger' : 'neutral'}
              headline={
                unreadAlerts.length === 0
                  ? 'Nothing unread'
                  : `${unreadAlerts.length} unread alert${unreadAlerts.length === 1 ? '' : 's'}`
              }
              detail={
                criticalAlerts.length > 0
                  ? `${criticalAlerts.length} need a look — printers, attendance, or payroll.`
                  : 'Printer, attendance, and payroll notices appear here.'
              }
              cta="Review alerts"
            />
            <AttentionCard
              to="/manager/attendance"
              icon={CalendarCheck}
              title="Attendance today"
              tone="neutral"
              headline={`${markedToday} marked for ${todayIso}`}
              detail={
                markedToday === 0
                  ? 'Nobody has been marked yet today.'
                  : 'Mark anyone missing before the day closes.'
              }
              cta="Open attendance"
            />
          </div>
        </section>

        {/* ── Metrics rail — Revenue, Orders, Average ticket, Live orders,
            always a single row of four (stacks only on the narrowest phones). ── */}
        <section className="grid grid-cols-2 max-[419px]:grid-cols-1 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Revenue"
            value={<AnimatedCurrency value={rangeStats.revenueMinor} />}
            caption="Paid orders in range"
            icon={CircleDollarSign}
            accent="indigo"
          />
          <MetricCard
            label="Orders"
            value={<AnimatedNumber value={rangeStats.orderCount} />}
            caption="Tickets raised in range"
            icon={Receipt}
            accent="sky"
          />
          <MetricCard
            label="Average ticket"
            value={<AnimatedCurrency value={rangeStats.avgMinor} />}
            caption="Revenue per order"
            icon={TrendingUp}
            accent="violet"
          />
          <MetricCard
            label="Live orders"
            value={<AnimatedNumber value={daily?.activeOrdersCount ?? 0} />}
            caption="Currently on the floor"
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
                    Sales rhythm
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Daily paid revenue · last {rhythm.length} {rhythm.length === 1 ? 'day' : 'days'} in range
                  </p>
                </div>
              </div>
            </header>
            <div className="px-5 py-5">
              {rhythm.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No paid orders in this period.
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
                          {i % 2 === 0 ? formatShortDate(row.date) : ''}
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
                    Team on the floor
                  </h2>
                  <p className="text-xs text-muted-foreground">Revenue per waiter in range</p>
                </div>
              </div>
              <Link
                to="/manager/staff"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Staff
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </header>
            {leaderboard.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No waiter activity in this period.
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
                          {w.orderCount} orders
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
                  Latest tickets
                </h2>
                <p className="text-xs text-muted-foreground">Most recent activity across the room</p>
              </div>
            </header>
            {recentOrders.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      #{(o.clientOrderId ?? o.id).slice(0, 6).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {o.tableNumber ? `Table ${o.tableNumber}` : 'Takeout'}
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
            <header className="border-b border-border/50 px-5 py-4">
              <h2 className="font-display text-[15px] font-semibold text-foreground">
                Best sellers
              </h2>
              <p className="text-xs text-muted-foreground">Share of revenue in range</p>
            </header>
            {topItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No sales in this period.
              </p>
            ) : (
              <ul className="space-y-4 px-5 py-5">
                {topItems.map((item, i) => {
                  const pct = Math.round(((Number(item.totalRevenue) || 0) / topItemTotal) * 100);
                  return (
                    <li key={`${item.name}-${i}`}>
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
                        {item.totalQty} sold · {formatCurrency(item.totalRevenue)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {isLoading && (
          <p className="text-center text-[11px] text-muted-foreground">Refreshing…</p>
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

const ATTENTION_TONE: Record<string, { wrap: string; icon: string; cta: string }> = {
  warning: {
    wrap: 'border-amber-500/30 bg-amber-500/[0.06]',
    icon: 'bg-amber-500/15 text-amber-600 ring-amber-500/25',
    cta: 'text-amber-700 dark:text-amber-400',
  },
  danger: {
    wrap: 'border-rose-500/30 bg-rose-500/[0.06]',
    icon: 'bg-rose-500/15 text-rose-600 ring-rose-500/25',
    cta: 'text-rose-700 dark:text-rose-400',
  },
  neutral: {
    wrap: 'border-border/60 bg-card',
    icon: 'bg-secondary text-muted-foreground ring-border',
    cta: 'text-muted-foreground',
  },
};

const AttentionCard: React.FC<{
  to: string;
  icon: React.FC<{ className?: string }>;
  title: string;
  headline: string;
  detail: string;
  cta: string;
  tone: keyof typeof ATTENTION_TONE;
}> = ({ to, icon: Icon, title, headline, detail, cta, tone }) => {
  const t = ATTENTION_TONE[tone];
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col justify-between gap-4 rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        t.wrap,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', t.icon)}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{headline}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-semibold transition-transform group-hover:translate-x-0.5',
          t.cta,
        )}
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
};

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

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default ManagerDashboard;
