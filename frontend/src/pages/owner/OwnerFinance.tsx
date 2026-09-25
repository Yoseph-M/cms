import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarList, Title, Text, Grid, Flex } from '@tremor/react';
import { useQuery } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { DateRangePicker, computeRange, type DateRange } from '../../components/ui/DateRangePicker';
import { BarChart, LineChart, DONUT_COLORS } from '../../components/ui/Charts';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';
import { MarginDial } from '../../components/owner/dashboard/MarginDial';
import { DailyRevenueButton, type EodDayRow } from '../../components/owner/dashboard/DailyRevenueButton';
import { PeakHoursHeatmap } from '../../components/ui/PeakHoursHeatmap';
import { TremorWidget, KpiMetricCard, ChartToggle } from '../../components/ui/TremorWidgets';
import { GrowthBadge } from '../../components/ui/GrowthBadge';
import { motion } from 'framer-motion';
import { Clock, Gauge, TrendingUp } from 'lucide-react';
import { formatCurrency, formatCurrencyCompact } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useHeaderStore } from '../../store/headerStore';
import { useSocketStore } from '../../store/socketStore';
import { useTranslation } from 'react-i18next';

function useWidget<T>(endpoint: string, deps: Record<string, string> = {}) {
  // React Query backs every finance widget so results are cached across page
  // switches — navigating back to Finance renders instantly instead of
  // re-fetching all ~8 analytics endpoints from scratch.
  const { data, isLoading, error, refetch } = useQuery<T>({
    queryKey: ['analytics', endpoint, deps],
    queryFn: async () => {
      const qs = new URLSearchParams(deps).toString();
      const res = await axiosClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      return res.data as T;
    },
    staleTime: 90_000,
  });
  const message = error ? extractErrorMessage(error, 'Failed to load data.') : null;
  return { data: data ?? null, loading: isLoading, error: message, refetch };
}

/**
 * One row of `GET /daily-close/reconciliation` — a business day a manager
 * approved, the total they signed off on, and that same day's paid revenue as
 * the ledger reads it now. The server does the comparison; the page only shows
 * where the two disagree.
 */
interface ReconciliationRow {
  businessDate: string;
  closedSalesMinor: number;
  paidRevenueMinor: number;
  deltaMinor: number;
  deltaPercent: number | null;
  flagged: boolean;
  closedByName: string | null;
}

interface ReconciliationReport {
  days: ReconciliationRow[];
  closedDayCount: number;
  flaggedCount: number;
}

const DONUT_PALETTE = DONUT_COLORS;

const fmtDate = (d: Date) => d.toISOString().split('T')[0];

/* ── Peak-hours heatmap range presets ── */
type PeakRangePreset = 'today' | '7d' | '30d' | '90d' | 'page';

const PEAK_RANGE_OPTIONS: Array<{ value: PeakRangePreset; key: string }> = [
  { value: 'today', key: 'today' },
  { value: '7d', key: 'last7Days' },
  { value: '30d', key: 'last30Days' },
  { value: '90d', key: 'last90Days' },
  { value: 'page', key: 'selectedRange' },
];

/** Days back from today for each preset (today = 0). */
const PEAK_PRESET_OFFSET: Record<Exclude<PeakRangePreset, 'page'>, number> = {
  today: 0,
  '7d': 6,
  '30d': 29,
  '90d': 89,
};

export const OwnerFinance: React.FC = () => {
  const [range, setRange] = useState<DateRange>(() => computeRange('30d'));
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t } = useTranslation('owner');

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({
      title: t('finance.title', { defaultValue: 'Finance' }),
      subtitle: t('finance.subtitle', { defaultValue: 'Analytics & revenue intelligence' }),
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPageTitle, setShowDateRange]);

  // Send full ISO boundary strings so the backend query is anchored to the
  // user's local day (start-of-day and end-of-day in local tz), not UTC midnight.
  const from = (() => {
    const d = new Date(range.from);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const to = (() => {
    const d = new Date(range.to);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  })();

  const [trendChart, setTrendChart] = useState<'line' | 'bar'>('line');
  const [peakPreset, setPeakPreset] = useState<PeakRangePreset>('7d');

  const rangeDeps = useMemo(() => ({ from, to }), [from, to]);

  /**
   * Headline revenue follows the page's date filter: the paid total for the
   * selected window. (It used to read month-to-date from `/sales/daily`, so
   * dragging the range left the number frozen at this month's revenue.)
   */
  const rangeTotal = useWidget<{ totalRevenue: number; orderCount: number }>(
    '/analytics/sales/total',
    rangeDeps
  );

  // The immediately preceding window of the same length, so the KPI can show a
  // like-for-like delta instead of comparing to a fixed month.
  const priorRangeDeps = useMemo(() => {
    const start = new Date(from).getTime();
    const span = new Date(to).getTime() - start;
    return {
      from: new Date(start - span - 1).toISOString(),
      to: new Date(start - 1).toISOString(),
    };
  }, [from, to]);
  const priorTotal = useWidget<{ totalRevenue: number; orderCount: number }>(
    '/analytics/sales/total',
    priorRangeDeps
  );

  const revenueDelta = useMemo(() => {
    const current = rangeTotal.data?.totalRevenue ?? 0;
    const prior = priorTotal.data?.totalRevenue ?? 0;
    if (prior === 0) return null;
    return Math.round(((current - prior) / prior) * 1000) / 10;
  }, [rangeTotal.data, priorTotal.data]);

  const trend = useWidget<{ date: string; revenue: number; orderCount: number }[]>(
    '/analytics/sales/trend',
    { startDate: from, endDate: to }
  );

  const catSpl = useWidget<{ category: string; revenue: number; count: number }[]>(
    '/analytics/category-split',
    rangeDeps
  );

  // The heatmap gets its own range so it can be narrowed to today / the last
  // week without disturbing the page-wide date range the other widgets share.
  const peakDeps = useMemo(() => {
    if (peakPreset === 'page') return rangeDeps;
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - PEAK_PRESET_OFFSET[peakPreset]);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [peakPreset, rangeDeps]);

  const peak = useWidget<{ hour: number; dayOfWeek: number; count: number }[]>(
    '/analytics/peak-hours',
    peakDeps
  );

  const payMth = useWidget<{ method: string; revenue: number; count: number }[]>(
    '/analytics/payment-methods',
    rangeDeps
  );

  const staffP = useWidget<{ waiterId: string; name: string; role: string; totalSales: number; orderCount: number }[]>(
    '/analytics/staff-performance',
    rangeDeps
  );

  const cancels = useWidget<{ reason: string; count: number }[]>(
    '/analytics/cancellations',
    rangeDeps
  );

  const pnl = useWidget<{
    revenue: number;
    /** Total spending for the period — payroll included, never a separate line. */
    expenses: number;
    payrollCost: number;
    otherExpenses: number;
    netProfit: number;
  }>('/analytics/profit-loss', rangeDeps);

  /**
   * The End of Day ledger — one entry per business day a manager approved,
   * each carrying that day's takings AND the same day's paid revenue read from
   * the ledger now. This, and not the trend series, is what the "Daily takings"
   * card reads: a day's money is the figure the manager signed off on, and a day
   * nobody closed simply has no line. The reconciliation the endpoint returns is
   * what lets the card mark a day whose two figures no longer agree.
   */
  const recon = useWidget<ReconciliationReport>('/daily-close/reconciliation', { days: '90' });

  // ── Real-time: re-fetch finance widgets when backend signals a change ──
  const socket = useSocketStore((s) => s.socket);
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      // Silently refetch – skip loading spinners so the UX stays smooth
      rangeTotal.refetch();
      priorTotal.refetch();
      trend.refetch();
      pnl.refetch();
      catSpl.refetch();
      peak.refetch();
      payMth.refetch();
      staffP.refetch();
      cancels.refetch();
      recon.refetch();
    };
    socket.on('finance:updated', handler);
    return () => { socket.off('finance:updated', handler); };
    // We deliberately use a stable list – the refetch callbacks are memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const trendLabels = useMemo(() => (trend.data || []).map((d) => d.date.slice(5)), [trend.data]);
  const trendValues = useMemo(() => (trend.data || []).map((d) => d.revenue), [trend.data]);

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Cancellation reasons chosen on the floor. Auto-cancellations are the
   * system voiding an unsettled ticket — written either as "Auto-cancelled …"
   * or as "No settlement received within N hours" — not a person's decision,
   * so every phrasing of those is left out of the analysis card.
   */
  const cancellationReasons = useMemo(
    () =>
      (cancels.data || []).filter(
        (d) => !/auto[\s-]*cancel|no settlement received within/i.test(d.reason ?? ''),
      ),
    [cancels.data],
  );

  const heatmap = useMemo(() => {
    const grid: Record<number, Record<number, number>> = {};
    // Normalize the payload: Prisma's `aggregateRaw` can return numbers as BigInts
    // (and occasionally wrap the array in `{ data: [...] }` on certain server
    // configurations). Coerce everything to plain numbers so the grid lookup
    // works regardless of the wire format.
    const raw = peak.data as unknown;
    
    const rows: Array<{ dayOfWeek: number; hour: number; count: number }> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>).map((d) => ({
          dayOfWeek: Number(d.dayOfWeek ?? d.day ?? 0),
          hour: Number(d.hour ?? 0),
          count: Number(d.count ?? 0),
        }))
      : Array.isArray((raw as { data?: unknown[] })?.data)
        ? ((raw as { data: Array<Record<string, unknown>> }).data).map((d) => ({
            dayOfWeek: Number(d.dayOfWeek ?? d.day ?? 0),
            hour: Number(d.hour ?? 0),
            count: Number(d.count ?? 0),
          }))
        : [];

    rows.forEach(({ dayOfWeek, hour, count }) => {
      // MongoDB $dayOfWeek is 1-7 (Sun=1..Sat=7); keep within that range.
      const dow = Math.min(7, Math.max(1, dayOfWeek || 0));
      const h = Math.min(23, Math.max(0, hour));
      if (!grid[dow]) grid[dow] = {};
      grid[dow][h] = (grid[dow][h] || 0) + count;
    });
    return grid;
  }, [peak.data]);

  /**
   * The days the manager closed at End of Day, inside the selected window, in
   * date order — the list behind the "Daily takings" button on the Revenue
   * Trend card. The endpoint only ever returns approved (CLOSED) days, so a day
   * still waiting for a decision is not a day the shop closed. The business day
   * is the unit here, so the window is compared in whole days rather than
   * against the ISO timestamps the trend endpoint is queried with.
   */
  const eodRows = useMemo<EodDayRow[]>(() => {
    const start = new Date(range.from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(range.to);
    end.setHours(23, 59, 59, 999);

    return (recon.data?.days || [])
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.businessDate ?? '')))
      .filter((r) => {
        const day = new Date(`${r.businessDate}T00:00:00`).getTime();
        return !Number.isNaN(day) && day >= start.getTime() && day <= end.getTime();
      })
      .map((r) => ({
        date: r.businessDate,
        amount: Number(r.closedSalesMinor) || 0,
        closedByName: r.closedByName ?? null,
        paidRevenue: Number(r.paidRevenueMinor) || 0,
        delta: Number(r.deltaMinor) || 0,
        flagged: Boolean(r.flagged),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [recon.data, range.from, range.to]);

  /* ── Margin: of every 100 birr this window collected, how much stayed in the
        business. Revenue vs Costs prints the three numbers beside each other;
        the dial reads where the window sits relative to break-even, which no
        other card on the page expresses. ── */
  const margin = useMemo(() => {
    const revenue = rangeTotal.data?.totalRevenue ?? 0;
    const costs = pnl.data?.expenses ?? 0;
    const net = revenue - costs;
    return {
      revenue,
      costs,
      net,
      /** null when the window collected nothing — there is no margin to read. */
      band: revenue === 0 ? 'none' : net < 0 ? 'loss' : net / revenue < 0.2 ? 'thin' : 'healthy',
    };
  }, [rangeTotal.data, pnl.data]);

  /* ── How the week is shaped: revenue per weekday over the selected window,
        Monday first so the weekend reads as one block. ── */
  const weekdayRevenue = useMemo(() => {
    const revenue = new Array(7).fill(0);
    const orders = new Array(7).fill(0);
    for (const row of trend.data || []) {
      const key = String(row.date ?? '').slice(0, 10);
      const day = new Date(`${key}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime())) continue;
      const dow = day.getUTCDay();
      revenue[dow] += Number(row.revenue) || 0;
      orders[dow] += Number(row.orderCount) || 0;
    }
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
      dow,
      // Localised weekday name straight from the platform — no new key to
      // translate, and it follows the reader's language.
      label: new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(undefined, {
        weekday: 'short',
        timeZone: 'UTC',
      }),
      revenue: revenue[dow],
      orders: orders[dow],
    }));
  }, [trend.data]);

  const busiestDay = useMemo(
    () => weekdayRevenue.reduce((top, d) => (d.revenue > top.revenue ? d : top), weekdayRevenue[0]),
    [weekdayRevenue],
  );

  const moneyTickFormat = useCallback((v: number) => formatCurrencyCompact(v), []);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-4">
        <div>
          <Title className="text-xl font-bold text-foreground">{t('nav.finance')}</Title>
          <Text className="text-sm text-muted-foreground mt-0.5">{t('finance.subtitle')}</Text>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </Flex>

      <Grid numItems={1} numItemsSm={2} className="gap-4">
        {[
          { label: t('finance.overallRevenue', { defaultValue: 'Overall Revenue' }), value: rangeTotal.data ? formatCurrency(rangeTotal.data.totalRevenue) : '—', delta: revenueDelta, icon: TrendingUp },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <KpiMetricCard
                label={kpi.label}
                value={kpi.value}
                loading={rangeTotal.loading}
                delta={<GrowthBadge value={kpi.delta} />}
                icon={
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                }
              />
            </motion.div>
          );
        })}
      </Grid>

      {/* Profit & Loss */}
      <TremorWidget
        title={t('finance.revenueVsCosts', { defaultValue: 'Revenue vs Costs' })}
        loading={pnl.loading}
        error={pnl.error}
        onRetry={pnl.refetch}
        empty={false}
      >
        {pnl.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 max-[419px]:grid-cols-1">
              {[
                { label: t('finance.revenue', { defaultValue: 'Revenue' }), value: pnl.data.revenue, tone: 'text-foreground' },
                { label: t('finance.expenses', { defaultValue: 'Expenses' }), value: pnl.data.expenses, tone: 'text-destructive' },
                {
                  label: t('finance.net', { defaultValue: 'Net' }),
                  value: pnl.data.netProfit,
                  tone: pnl.data.netProfit >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive',
                },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-border bg-secondary/20 p-3">
                  <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
                  <p className={`text-lg font-mono font-bold mt-1 ${k.tone}`}>{formatCurrency(k.value)}</p>
                </div>
              ))}
            </div>
            <BarChart
              labels={['Period']}
              series={[
                { label: t('finance.revenue', { defaultValue: 'Revenue' }), values: [pnl.data.revenue] },
                { label: t('finance.expenses', { defaultValue: 'Expenses' }), values: [pnl.data.expenses] },
              ]}
              height={160}
              yTickFormat={moneyTickFormat}
              tooltipFormat={formatCurrency}
              yAxisWidth={72}
            />
          </div>
        )}
      </TremorWidget>

      {/* Revenue Trend */}
      <TremorWidget
        title={t('finance.revenueTrend', { defaultValue: 'Revenue Trend' })}
        loading={trend.loading}
        error={trend.error}
        onRetry={trend.refetch}
        empty={!trend.data?.length}
        emptyMsg={t('finance.noRevenueInRange', { defaultValue: 'No revenue in this date range.' })}
        /* The shape control belongs to the chart, not to the card, so it sits
           in its own bar under the header: the title row is left to the title
           and the one control that is about the whole card. The "compare against
           WoW / MoM / YoY" dropdown that used to sit here is gone — it changed
           nothing on the chart. */
        headerToolbar={
          <div role="group" aria-label={t('finance.chartStyle', { defaultValue: 'Chart style' })}>
            <ChartToggle
              options={[
                { value: 'line', label: t('finance.line', { defaultValue: 'Line' }) },
                { value: 'bar', label: t('finance.bar', { defaultValue: 'Bar' }) },
              ]}
              value={trendChart}
              onChange={(v) => setTrendChart(v === 'bar' ? 'bar' : 'line')}
            />
          </div>
        }
        /* Right end of the card: the day-by-day takings the manager closed, on
           a float card of their own. */
        headerExtra={<DailyRevenueButton rows={eodRows} />}
      >
        {trendChart === 'line' ? (
          <LineChart
            labels={trendLabels}
            values={trendValues}
            height={180}
            yTickFormat={moneyTickFormat}
            tooltipFormat={formatCurrency}
            yAxisWidth={72}
          />
        ) : (
          <BarChart
            labels={trendLabels}
            series={[{ label: t('finance.revenue', { defaultValue: 'Revenue' }), values: trendValues }]}
            height={180}
            yTickFormat={moneyTickFormat}
            tooltipFormat={formatCurrency}
            yAxisWidth={72}
          />
        )}
      </TremorWidget>

      {/* Margin + how the week is shaped. The dial answers a question the other
          cards do not — where this window sits relative to break-even, as a
          position rather than a pair of numbers — and it is the only gauge in
          the system, so nothing here repeats a chart the page already draws.
          Busiest Days reads from the same trend series the chart above plots. */}
      <div className="grid grid-cols-2 max-[767px]:grid-cols-1 gap-4">
        <TremorWidget
          title={t('finance.marginDial', { defaultValue: 'Margin Dial' })}
          loading={rangeTotal.loading || pnl.loading}
          error={rangeTotal.error || pnl.error}
          onRetry={rangeTotal.refetch}
          empty={false}
          /* Where the needle sits, in one word: the window lost money, kept a
             sliver of it, or kept a healthy share. */
          headerExtra={
            <span
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-wider ${
                margin.band === 'loss'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : margin.band === 'healthy'
                    ? 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                    : 'border-border bg-secondary/30 text-muted-foreground'
              }`}
            >
              <Gauge className="h-3.5 w-3.5" />
              {margin.band === 'loss'
                ? t('finance.marginLoss', { defaultValue: 'Loss' })
                : margin.band === 'healthy'
                  ? t('finance.marginHealthy', { defaultValue: 'Healthy margin' })
                  : margin.band === 'thin'
                    ? t('finance.marginThin', { defaultValue: 'Thin margin' })
                    : t('finance.marginNoRevenueShort', { defaultValue: 'No revenue' })}
            </span>
          }
        >
          <MarginDial revenue={margin.revenue} costs={margin.costs} net={margin.net} />
        </TremorWidget>

        <TremorWidget
          title={t('finance.busiestDays', { defaultValue: 'Busiest Days' })}
          loading={trend.loading}
          error={trend.error}
          onRetry={trend.refetch}
          empty={!trend.data?.length}
          emptyMsg={t('finance.noRevenueInRange', { defaultValue: 'No revenue in this date range.' })}
          headerExtra={
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {busiestDay && busiestDay.revenue > 0
                ? t('finance.bestDay', {
                    day: busiestDay.label,
                    defaultValue: 'Best day: {{day}}',
                  })
                : t('finance.revenue', { defaultValue: 'Revenue' })}
            </Text>
          }
        >
          <BarChart
            labels={weekdayRevenue.map((d) => d.label)}
            series={[
              {
                label: t('finance.revenue', { defaultValue: 'Revenue' }),
                values: weekdayRevenue.map((d) => d.revenue),
              },
            ]}
            height={190}
            yTickFormat={moneyTickFormat}
            tooltipFormat={formatCurrency}
            yAxisWidth={72}
          />
        </TremorWidget>
      </div>

      <div className="grid grid-cols-2 max-[767px]:grid-cols-1 gap-4">
        <TremorWidget
          title={t('finance.staffLeaderboard', { defaultValue: 'Staff Leaderboard' })}
          loading={staffP.loading}
          error={staffP.error}
          onRetry={staffP.refetch}
          empty={!staffP.data?.length}
          headerExtra={
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('finance.revenue', { defaultValue: 'Revenue' })}
            </Text>
          }
        >
          <BarList
            data={(staffP.data || []).map((s) => ({
              key: s.waiterId,
              name: (
                <span>
                  {s.name} <span className="text-muted-foreground">({s.role})</span>
                </span>
              ),
              value: s.totalSales || 0,
            }))}
            valueFormatter={(v: number) => formatCurrency(v)}
            color="blue"
            showAnimation
          />
        </TremorWidget>

        <TremorWidget
          title={t('finance.cancellationAnalysis', { defaultValue: 'Cancellation Analysis' })}
          loading={cancels.loading}
          error={cancels.error}
          onRetry={cancels.refetch}
          empty={cancellationReasons.length === 0}
          emptyMsg={t('finance.noCancellations', { defaultValue: 'No cancellations in this period.' })}
          headerExtra={
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('finance.count', { defaultValue: 'Count' })}
            </Text>
          }
        >
          <BarList
            data={cancellationReasons.map((d, i) => ({
              key: String(i),
              name: d.reason || t('finance.noReasonGiven', { defaultValue: 'No reason given' }),
              value: d.count || 0,
            }))}
            color="red"
            showAnimation
          />
        </TremorWidget>
      </div>

      <TremorWidget
        title={t('finance.peakHours', { defaultValue: 'Peak Hours Heatmap' })}
        loading={peak.loading}
        error={peak.error}
        onRetry={peak.refetch}
        empty={!peak.data || (Array.isArray(peak.data) && peak.data.length === 0)}
        emptyTitle={t('finance.peakEmptyTitle', { defaultValue: 'No peak-hour data yet' })}
        emptyMsg={t('finance.peakEmptyMsg', { defaultValue: 'Orders placed during the selected window will populate this heatmap.' })}
        headerExtra={
          // ml-auto pins the range picker to the right end of the card header.
          <div className="ml-auto flex items-center gap-2">
            <DropdownSelect
              ariaLabel={t('finance.peakRange', { defaultValue: 'Peak hours time range' })}
              size="sm"
              icon={Clock}
              className="h-8"
              value={peakPreset}
              onChange={(v) => setPeakPreset(v as PeakRangePreset)}
              options={PEAK_RANGE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(`finance.${o.key}`, { defaultValue: o.key }),
              }))}
              contentClassName="w-52"
            />
          </div>
        }
      >
        <PeakHoursHeatmap grid={heatmap} dayLabels={DAYS} />
      </TremorWidget>

      <div className="grid grid-cols-2 max-[767px]:grid-cols-1 gap-4">
        <TremorWidget
          title={t('finance.revenueByCategory', { defaultValue: 'Revenue by Category' })}
          loading={catSpl.loading}
          error={catSpl.error}
          onRetry={catSpl.refetch}
          empty={!catSpl.data?.length}
        >
          <RevenueDonut
            segments={(catSpl.data || []).map((d, i) => ({
              label: d.category,
              value: d.revenue,
              color: DONUT_PALETTE[i % DONUT_PALETTE.length],
            }))}
          />
        </TremorWidget>

        <TremorWidget
          title={t('finance.paymentMethodSplit', { defaultValue: 'Payment Method Split' })}
          loading={payMth.loading}
          error={payMth.error}
          onRetry={payMth.refetch}
          empty={!payMth.data?.length}
        >
          <RevenueDonut
            segments={(payMth.data || []).map((d, i) => ({
              label: d.method,
              value: d.revenue,
              color: DONUT_PALETTE[i % DONUT_PALETTE.length],
            }))}
          />
        </TremorWidget>
      </div>

    </div>
  );
};
