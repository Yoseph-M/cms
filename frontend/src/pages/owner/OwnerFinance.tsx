import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { DateRangePicker, computeRange, type DateRange } from '../../components/ui/DateRangePicker';
import { Donut, BarChart, LineChart } from '../../components/ui/Charts';
import { Tooltip } from '../../components/ui/Tooltip';
import { motion } from 'framer-motion';
import {
  Download, AlertCircle, RotateCcw, TrendingUp, ShoppingCart, DollarSign, PieChart
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';
import { extractErrorMessage } from '../../utils/errorHandler';

function exportPDF(title: string, rows: string[][]) {
  const body = rows.map((r) => r.join('\t')).join('\n');
  const content = `${title}\n${'='.repeat(title.length)}\n\n${body}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.txt`;
  a.click();
}

const Widget: React.FC<{
  title: string;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty?: boolean;
  emptyMsg?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, onExportCSV, onExportPDF, loading, error, onRetry, empty, emptyMsg, emptyIcon, emptyTitle, headerExtra, children }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-3 gap-2 flex-wrap">
      <CardTitle className="text-sm font-bold text-foreground">{title}</CardTitle>
      <div className="flex items-center gap-2 flex-wrap">
        {headerExtra}
        {onExportCSV && (
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            <Download className="w-3 h-3 mr-1.5" />CSV
          </Button>
        )}
        {onExportPDF && (
          <Button variant="outline" size="sm" onClick={onExportPDF}>
            <Download className="w-3 h-3 mr-1.5" />PDF
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {loading ? (
        <div className="h-48 bg-secondary/40 rounded-lg animate-pulse" />
      ) : error ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onRetry}><RotateCcw className="w-3 h-3 mr-1.5" />Retry</Button>
        </div>
      ) : empty ? (
        <EmptyState
          title={emptyTitle || 'No data for this period'}
          message={emptyMsg || 'Try widening the date range or check back once there is activity.'}
          icon={emptyIcon || <PieChart className="w-7 h-7" />}
          className="min-h-[10rem] py-8"
        />
      ) : children}
    </CardContent>
  </Card>
);

function useWidget<T>(endpoint: string, deps: Record<string, string> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(deps);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(deps).toString();
      const res = await axiosClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      setData(res.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(extractErrorMessage(err, 'Failed to load data.'));
    } finally {
      setLoading(false);
    }
  }, [endpoint, key]);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

const DONUT_PALETTE = [
  'hsl(220,80%,55%)',
  'hsl(35,90%,55%)',
  'hsl(150,65%,42%)',
];

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
  const [staffRole, setStaffRole] = useState('');

  const rangeDeps = useMemo(() => ({ from, to }), [from, to]);
  const staffDeps = useMemo(
    () => (staffRole ? { ...rangeDeps, role: staffRole } : rangeDeps),
    [rangeDeps, staffRole]
  );
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
    staffDeps
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

  const trendLabels = useMemo(() => (trend.data || []).map((d) => d.date.slice(5)), [trend.data]);
  const trendValues = useMemo(() => (trend.data || []).map((d) => d.revenue), [trend.data]);

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const heatmap = useMemo(() => {
    const grid: Record<number, Record<number, number>> = {};
    (peak.data || []).forEach((d) => {
      const dow = d.dayOfWeek ?? 1;
      const h = d.hour ?? 0;
      if (!grid[dow]) grid[dow] = {};
      grid[dow][h] = (grid[dow][h] || 0) + (d.count || 0);
    });
    return grid;
  }, [peak.data]);

  const maxHeat = useMemo(() => {
    let m = 0;
    Object.values(heatmap).forEach((row) => Object.values(row).forEach((v) => { if (v > m) m = v; }));
    return m;
  }, [heatmap]);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Finance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Analytics & revenue intelligence</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Revenue", value: daily.data ? formatCurrency(daily.data.totalRevenue ?? 0) : '—', delta: daily.data?.deltas?.revenueVsPriorDay, icon: DollarSign },
          { label: 'MTD Revenue', value: daily.data ? formatCurrency(daily.data.mtdRevenue ?? 0) : '—', delta: daily.data?.deltas?.mtdVsPriorMonth, icon: TrendingUp },
          { label: 'Order Count', value: daily.data?.orderCount ?? '—', delta: daily.data?.deltas?.ordersVsPriorDay, icon: ShoppingCart },
          { label: 'AOV', value: daily.data ? formatCurrency(daily.data.avgTicket ?? 0) : '—', delta: daily.data?.deltas?.aovVsPriorDay, icon: DollarSign },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  {daily.loading ? (
                    <div className="h-7 w-20 rounded bg-secondary/50 animate-pulse" />
                  ) : (
                    <>
                      <p className="text-2xl font-bold font-mono text-foreground">{kpi.value}</p>
                      <div className="mt-1"><Delta value={kpi.delta} /></div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Profit & Loss */}
      <Widget
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
      </Widget>

      {/* Revenue Trend */}
      <Widget
        title="Revenue Trend"
        loading={trend.loading}
        error={trend.error}
        onRetry={trend.refetch}
        empty={!trend.data?.length}
        emptyMsg="No revenue in this date range."
        onExportPDF={() => trend.data && exportPDF('Revenue Trend', [['Date', 'Revenue', 'Orders'], ...trend.data.map((d) => [d.date, String(d.revenue), String(d.orderCount)])])}
        headerExtra={
          <div className="flex gap-1">
            <button onClick={() => setTrendChart('line')} className={`px-2 py-1 text-xs rounded border ${trendChart === 'line' ? 'border-primary bg-primary/10' : 'border-border'}`}>Line</button>
            <button onClick={() => setTrendChart('bar')} className={`px-2 py-1 text-xs rounded border ${trendChart === 'bar' ? 'border-primary bg-primary/10' : 'border-border'}`}>Bar</button>
            <Select value={trendOverlay} onChange={(e) => setTrendOverlay(e.target.value as typeof trendOverlay)} className="h-7 text-xs w-24">
              <option value="none">No overlay</option>
              <option value="wow">WoW</option>
              <option value="mom">MoM</option>
              <option value="yoy">YoY</option>
            </Select>
          </div>
        }
      >
        {trendChart === 'line' ? (
          <LineChart labels={trendLabels} values={trendValues} height={180} yTickFormat={(v) => formatCurrency(v)} />
        ) : (
          <BarChart labels={trendLabels} series={[{ label: 'Revenue', values: trendValues }]} height={180} yTickFormat={(v) => formatCurrency(v)} />
        )}
      </Widget>

      <Widget
        title="Top Items"
        loading={topItm.loading}
        error={topItm.error}
        onRetry={topItm.refetch}
        empty={!topItm.data?.length}
        headerExtra={
          <div className="flex gap-1">
            <button onClick={() => setTopItemsMode('qty')} className={`px-2 py-1 text-xs rounded border ${topItemsMode === 'qty' ? 'border-primary bg-primary/10' : 'border-border'}`}>Qty</button>
            <button onClick={() => setTopItemsMode('revenue')} className={`px-2 py-1 text-xs rounded border ${topItemsMode === 'revenue' ? 'border-primary bg-primary/10' : 'border-border'}`}>Revenue</button>
          </div>
        }
      >
        <BarChart
          labels={topChartData.labels}
          series={[{ label: topItemsMode, values: topChartData.values }]}
          height={180}
          yTickFormat={(v) => (topItemsMode === 'revenue' ? formatCurrency(v) : String(v))}
        />
      </Widget>

      <div className="grid grid-cols-2 gap-4">
        <Widget
          title="Staff Leaderboard"
          loading={staffP.loading}
          error={staffP.error}
          onRetry={staffP.refetch}
          empty={!staffP.data?.length}
          headerExtra={
            <Select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="h-7 text-xs w-28">
              <option value="">All roles</option>
              <option value="WAITER">Waiter</option>
              <option value="CASHIER">Cashier</option>
              <option value="COOKER">Kitchen</option>
              <option value="BARISTA">Barista</option>
            </Select>
          }
        >
          <div className="space-y-2.5">
            {(staffP.data || []).slice(0, 8).map((s, i) => {
              const max = Math.max(...(staffP.data || []).map((x) => x.totalSales || 0), 1);
              return (
                <div key={s.waiterId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium truncate">{s.name} <span className="text-muted-foreground">({s.role})</span></span>
                      <span className="text-xs font-mono font-bold text-primary ml-2 shrink-0">{formatCurrency(s.totalSales)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(s.totalSales / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Widget>

        <Widget
          title="Cancellation Analysis"
          loading={cancels.loading}
          error={cancels.error}
          onRetry={cancels.refetch}
          empty={!cancels.data?.length}
          emptyMsg="No cancellations in this period."
        >
          <div className="space-y-2">
            {(cancels.data || []).slice(0, 10).map((d, i) => {
              const max = Math.max(...(cancels.data || []).map((x) => x.count || 0), 1);
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground truncate">{d.reason || 'No reason given'}</span>
                      <span className="text-xs font-bold ml-2 shrink-0">{d.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-destructive/60" style={{ width: `${((d.count || 0) / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Widget>
      </div>

      <Widget
        title="Peak Hours Heatmap"
        loading={peak.loading}
        error={peak.error}
        onRetry={peak.refetch}
        empty={!peak.data?.length}
      >
        <div className="overflow-x-auto">
          <div style={{ minWidth: 600 }}>
            <div className="flex mb-1 pl-10">
              {HOURS.map((h) => <div key={h} className="flex-1 text-center text-[8px] text-muted-foreground">{h}</div>)}
            </div>
            {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
              <div key={dow} className="flex items-center mb-0.5">
                <div className="w-10 text-[10px] text-muted-foreground text-right pr-2 shrink-0">{DAYS[dow - 1]}</div>
                {HOURS.map((h) => {
                  const v = heatmap[dow]?.[h] || 0;
                  const intensity = maxHeat > 0 ? v / maxHeat : 0;
                  return (
                    <div key={h} className="flex-1 mx-px">
                      <Tooltip label={`${DAYS[dow - 1]} ${h}:00 — ${v} orders`} side="top">
                        <div className="h-5 w-full rounded-sm cursor-default" style={{ background: `hsla(24,80%,55%,${0.08 + intensity * 0.87})` }} />
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Widget>

      <div className="grid grid-cols-2 gap-4">
        <Widget
          title="Revenue by Category"
          loading={catSpl.loading}
          error={catSpl.error}
          onRetry={catSpl.refetch}
          empty={!catSpl.data?.length}
        >
          <Donut
            slices={(catSpl.data || []).map((d, i) => ({
              label: d.category,
              value: Number(d.revenue) || 0,
              color: DONUT_PALETTE[i % DONUT_PALETTE.length],
            }))}
          />
        </Widget>

        <Widget
          title="Payment Method Split"
          loading={payMth.loading}
          error={payMth.error}
          onRetry={payMth.refetch}
          empty={!payMth.data?.length}
        >
          <Donut
            slices={(payMth.data || []).map((d, i) => ({
              label: d.method,
              value: Number(d.revenue) || 0,
              color: DONUT_PALETTE[i % DONUT_PALETTE.length],
            }))}
          />
        </Widget>
      </div>

    </div>
  );
};
