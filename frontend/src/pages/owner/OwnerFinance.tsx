import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarList, Title, Text, Grid, Flex } from '@tremor/react';
import { useQuery } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { Select } from '../../components/ui/Select';
import { DateRangePicker, computeRange, type DateRange } from '../../components/ui/DateRangePicker';
import { BarChart, LineChart, DONUT_COLORS } from '../../components/ui/Charts';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';
import { PeakHoursHeatmap } from '../../components/ui/PeakHoursHeatmap';
import { TremorWidget, ChartToggle, KpiMetricCard } from '../../components/ui/TremorWidgets';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useHeaderStore } from '../../store/headerStore';
import { useSocketStore } from '../../store/socketStore';

function exportPDF(title: string, rows: string[][]) {
  const body = rows.map((r) => r.join('\t')).join('\n');
  const content = `${title}\n${'='.repeat(title.length)}\n\n${body}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.txt`;
  a.click();
}

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

const DONUT_PALETTE = DONUT_COLORS;

const fmtDate = (d: Date) => d.toISOString().split('T')[0];

const Delta: React.FC<{ value: number | null | undefined }> = ({ value }) => {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${positive ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
      <TrendingUp className={`w-3 h-3 ${!positive ? 'rotate-180' : ''}`} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

export const OwnerFinance: React.FC = () => {
  const [range, setRange] = useState<DateRange>(() => computeRange('30d'));
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Finance', subtitle: 'Analytics & revenue intelligence' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
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
  const [trendOverlay, setTrendOverlay] = useState<'none' | 'wow' | 'mom' | 'yoy'>('none');
  const [topItemsMode, setTopItemsMode] = useState<'revenue' | 'qty'>('qty');

  const rangeDeps = useMemo(() => ({ from, to }), [from, to]);
  const daily = useWidget<{
    totalRevenue: number;
    mtdRevenue: number;
    orderCount: number;
    avgTicket: number;
    deltas?: {
      revenueVsPriorDay?: number | null;
      mtdVsPriorMonth?: number | null;
      ordersVsPriorDay?: number | null;
      aovVsPriorDay?: number | null;
    };
  }>('/analytics/sales/daily');

  const trend = useWidget<{ date: string; revenue: number; orderCount: number }[]>(
    '/analytics/sales/trend',
    { startDate: from, endDate: to }
  );

  const topItm = useWidget<{ name: string; totalQty: number; totalRevenue: number }[]>(
    '/analytics/top-items',
    rangeDeps
  );

  const catSpl = useWidget<{ category: string; revenue: number; count: number }[]>(
    '/analytics/category-split',
    rangeDeps
  );

  const peak = useWidget<{ hour: number; dayOfWeek: number; count: number }[]>(
    '/analytics/peak-hours',
    rangeDeps
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
    payrollCost: number;
    otherExpenses: number;
    netProfit: number;
  }>('/analytics/profit-loss', rangeDeps);

  // ── Real-time: re-fetch finance widgets when backend signals a change ──
  const socket = useSocketStore((s) => s.socket);
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      // Silently refetch – skip loading spinners so the UX stays smooth
      daily.refetch();
      trend.refetch();
      pnl.refetch();
      topItm.refetch();
      catSpl.refetch();
      peak.refetch();
      payMth.refetch();
      staffP.refetch();
      cancels.refetch();
    };
    socket.on('finance:updated', handler);
    return () => { socket.off('finance:updated', handler); };
    // We deliberately use a stable list – the refetch callbacks are memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const trendLabels = useMemo(() => (trend.data || []).map((d) => d.date.slice(5)), [trend.data]);
  const trendValues = useMemo(() => (trend.data || []).map((d) => d.revenue), [trend.data]);

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
   * Item names are snapshotted at order time and may be bilingual,
   * e.g. "የበሬ ጥብስ (Beef Tibs)". Prefer the English name in parentheses
   * so chart labels stay readable instead of single Amharic fragments.
   */
  const displayName = (raw: unknown): string => {
    const s = String(raw ?? '').trim();
    if (!s) return 'Unnamed item';
    const m = s.match(/\(([^)]+)\)\s*$/);
    return m ? m[1] : s;
  };

  const topChartData = useMemo(() => {
    const items = (topItm.data || []).slice(0, 8);
    return {
      labels: items.map((d) => displayName(d.name)),
      values: items.map((d) => (topItemsMode === 'revenue' ? Number(d.totalRevenue) || 0 : Number(d.totalQty) || 0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topItm.data, topItemsMode]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <Flex justifyContent="between" alignItems="center" className="flex-wrap gap-4">
        <div>
          <Title className="text-xl font-bold text-foreground">Finance</Title>
          <Text className="text-sm text-muted-foreground mt-0.5">Analytics & revenue intelligence</Text>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </Flex>

      <Grid numItems={1} numItemsSm={2} className="gap-4">
        {[
          { label: 'MTD Revenue', value: daily.data ? formatCurrency(daily.data.mtdRevenue ?? 0) : '—', delta: daily.data?.deltas?.mtdVsPriorMonth, icon: TrendingUp },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <KpiMetricCard
                label={kpi.label}
                value={kpi.value}
                loading={daily.loading}
                delta={<Delta value={kpi.delta} />}
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
        title="Revenue vs Costs"
        loading={pnl.loading}
        error={pnl.error}
        onRetry={pnl.refetch}
        empty={false}
      >
        {pnl.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Revenue', value: pnl.data.revenue, tone: 'text-foreground' },
                { label: 'Payroll', value: pnl.data.payrollCost, tone: 'text-[hsl(var(--warning))]' },
                { label: 'Other expenses', value: pnl.data.otherExpenses, tone: 'text-destructive' },
                {
                  label: 'Net',
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
                { label: 'Revenue', values: [pnl.data.revenue] },
                { label: 'Payroll', values: [pnl.data.payrollCost] },
                { label: 'Other expenses', values: [pnl.data.otherExpenses] },
              ]}
              height={160}
              yTickFormat={(v) => formatCurrency(v)}
            />
          </div>
        )}
      </TremorWidget>

      {/* Revenue Trend */}
      <TremorWidget
        title="Revenue Trend"
        loading={trend.loading}
        error={trend.error}
        onRetry={trend.refetch}
        empty={!trend.data?.length}
        emptyMsg="No revenue in this date range."
        onExportPDF={() => trend.data && exportPDF('Revenue Trend', [['Date', 'Revenue', 'Orders'], ...trend.data.map((d) => [d.date, String(d.revenue), String(d.orderCount)])])}
        headerExtra={
          <Flex alignItems="center" className="gap-2">
            <ChartToggle
              options={[
                { value: 'line', label: 'Line' },
                { value: 'bar', label: 'Bar' },
              ]}
              value={trendChart}
              onChange={(v) => setTrendChart(v as 'line' | 'bar')}
            />
            <Select value={trendOverlay} onChange={(e) => setTrendOverlay(e.target.value as typeof trendOverlay)} className="h-7 text-xs w-24">
              <option value="none">No overlay</option>
              <option value="wow">WoW</option>
              <option value="mom">MoM</option>
              <option value="yoy">YoY</option>
            </Select>
          </Flex>
        }
      >
        {trendChart === 'line' ? (
          <LineChart labels={trendLabels} values={trendValues} height={180} yTickFormat={(v) => formatCurrency(v)} />
        ) : (
          <BarChart labels={trendLabels} series={[{ label: 'Revenue', values: trendValues }]} height={180} yTickFormat={(v) => formatCurrency(v)} />
        )}
      </TremorWidget>

      <TremorWidget
        title="Top Items"
        loading={topItm.loading}
        error={topItm.error}
        onRetry={topItm.refetch}
        empty={!topItm.data?.length}
        headerExtra={
          <ChartToggle
            options={[
              { value: 'qty', label: 'Qty' },
              { value: 'revenue', label: 'Revenue' },
            ]}
            value={topItemsMode}
            onChange={(v) => setTopItemsMode(v as 'revenue' | 'qty')}
          />
        }
      >
        <BarChart
          labels={topChartData.labels}
          series={[{ label: topItemsMode, values: topChartData.values }]}
          height={180}
          yTickFormat={(v) => (topItemsMode === 'revenue' ? formatCurrency(v) : String(v))}
        />
      </TremorWidget>

      <div className="grid grid-cols-2 gap-4">
        <TremorWidget
          title="Staff Leaderboard"
          loading={staffP.loading}
          error={staffP.error}
          onRetry={staffP.refetch}
          empty={!staffP.data?.length}
          headerExtra={
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue
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
          title="Cancellation Analysis"
          loading={cancels.loading}
          error={cancels.error}
          onRetry={cancels.refetch}
          empty={!cancels.data?.length}
          emptyMsg="No cancellations in this period."
          headerExtra={
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Count
            </Text>
          }
        >
          <BarList
            data={(cancels.data || []).map((d, i) => ({
              key: String(i),
              name: d.reason || 'No reason given',
              value: d.count || 0,
            }))}
            color="red"
            showAnimation
          />
        </TremorWidget>
      </div>

      <TremorWidget
        title="Peak Hours Heatmap"
        loading={peak.loading}
        error={peak.error}
        onRetry={peak.refetch}
        empty={!peak.data || (Array.isArray(peak.data) && peak.data.length === 0)}
        emptyTitle="No peak-hour data yet"
        emptyMsg="Orders placed during the selected window will populate this heatmap."
      >
        <PeakHoursHeatmap grid={heatmap} dayLabels={DAYS} />
      </TremorWidget>

      <div className="grid grid-cols-2 gap-4">
        <TremorWidget
          title="Revenue by Category"
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
          title="Payment Method Split"
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
