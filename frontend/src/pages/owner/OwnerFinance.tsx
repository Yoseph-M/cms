import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { motion } from 'framer-motion';
import { Download, AlertCircle, RotateCcw, TrendingUp, Activity, ShoppingCart, DollarSign } from 'lucide-react';

// ─── Date helpers ──────────────────────────────────────────────────────────────
const DEFAULT_FROM = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; };
const DEFAULT_TO = () => new Date().toISOString().split('T')[0];

// ─── Export helper ─────────────────────────────────────────────────────────────
function exportCSV(data: any[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${filename}.csv`;
  a.click();
}

// ─── Date Range Control ────────────────────────────────────────────────────────
const DateRangeControl: React.FC<{ from: string; to: string; onChange: (f: string, t: string) => void }> = ({ from, to, onChange }) => (
  <div className="flex flex-wrap items-center gap-2">
    {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }].map(p => (
      <button key={p.label} onClick={() => {
        const end = new Date(); const start = new Date(); start.setDate(start.getDate() - p.days);
        onChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
      }} className="px-2.5 py-1 text-xs rounded-md border border-border hover:border-primary/50 transition-colors font-medium bg-secondary">
        {p.label}
      </button>
    ))}
    <Input type="date" value={from} onChange={e => onChange(e.target.value, to)} className="h-7 text-xs w-36" />
    <span className="text-muted-foreground text-xs">–</span>
    <Input type="date" value={to} onChange={e => onChange(from, e.target.value)} className="h-7 text-xs w-36" />
  </div>
);

// ─── Widget container ──────────────────────────────────────────────────────────
const W: React.FC<{
  title: string; onExport?: () => void; loading: boolean; error: string | null; onRetry: () => void;
  empty?: boolean; emptyMsg?: string; children: React.ReactNode;
}> = ({ title, onExport, loading, error, onRetry, empty, emptyMsg, children }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <CardTitle className="text-sm font-bold text-foreground">{title}</CardTitle>
      {onExport && (
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="w-3 h-3 mr-1.5" />Export
        </Button>
      )}
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
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">{emptyMsg || 'No data for this period.'}</div>
      ) : children}
    </CardContent>
  </Card>
);

// ─── Simple SVG bar chart ──────────────────────────────────────────────────────
const BarChart: React.FC<{ data: { label: string; value: number }[]; color?: string }> = ({ data, color = 'hsl(24,80%,55%)' }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-40 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1 h-full justify-end">
          <div className="w-full rounded-t-sm transition-all" style={{ height: `${(d.value / max) * 100}%`, background: color, opacity: 0.85 }} title={`${d.label}: ${d.value}`} />
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Simple area spark ────────────────────────────────────────────────────────
const AreaSpark: React.FC<{ data: number[]; color?: string }> = ({ data, color = 'hsl(24,80%,55%)' }) => {
  const max = Math.max(...data, 1);
  const w = 600; const h = 120;
  const pts = data.map((v, i) => ({ x: (i / Math.max(data.length - 1, 1)) * w, y: h - (v / max) * (h - 8) }));
  const pathD = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  const areaD = `${pathD} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#areaGrad)" />
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Donut chart ──────────────────────────────────────────────────────────────
const DONUT_COLORS = ['hsl(24,80%,55%)', 'hsl(142,55%,48%)', 'hsl(217,80%,58%)', 'hsl(280,65%,58%)', 'hsl(38,90%,55%)'];

const DonutChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cumulative = 0;
  const r = 40; const cx = 60; const cy = 60;
  const segments = data.map((d, i) => {
    const pct = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle); const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle); const y2 = cy + r * Math.sin(endAngle);
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: DONUT_COLORS[i % DONUT_COLORS.length], label: d.label, value: d.value, pct };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0">
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} fill={seg.color} opacity={0.85} />
        ))}
        <circle cx={cx} cy={cy} r={24} fill="hsl(var(--card))" />
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
              <span className="text-muted-foreground truncate">{seg.label}</span>
            </div>
            <span className="font-mono font-semibold shrink-0">{(seg.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Fetch hook ────────────────────────────────────────────────────────────────
function useW<T>(endpoint: string, deps: Record<string, string> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(deps);

  const fetch = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams(deps).toString();
      const res = await axiosClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load data.');
    } finally { setLoading(false); }
  }, [endpoint, key]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, loading, error, refetch: fetch };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export const OwnerFinance: React.FC = () => {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const handleRange = (f: string, t: string) => { setFrom(f); setTo(t); };

  const daily   = useW<any>('/analytics/sales/daily');
  const trend   = useW<any[]>('/analytics/sales/trend', { startDate: from, endDate: to });
  const topItm  = useW<any[]>('/analytics/top-items');
  const catSpl  = useW<any[]>('/analytics/category-split', { from, to });
  const peak    = useW<any[]>('/analytics/peak-hours', { from, to });
  const payMth  = useW<any[]>('/analytics/payment-methods', { from, to });
  const staffP  = useW<any[]>('/analytics/staff-performance');
  const cancels = useW<any[]>('/analytics/cancellations', { from, to });

  const trendValues = useMemo(() => (trend.data || []).map((d: any) => d.revenue || 0), [trend.data]);

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const heatmap = useMemo(() => {
    const grid: Record<number, Record<number, number>> = {};
    (peak.data || []).forEach((d: any) => {
      const dow = d.dayOfWeek ?? 1; const h = d.hour ?? 0;
      if (!grid[dow]) grid[dow] = {};
      grid[dow][h] = (grid[dow][h] || 0) + (d.count || 0);
    });
    return grid;
  }, [peak.data]);

  const maxHeat = useMemo(() => {
    let m = 0;
    Object.values(heatmap).forEach(row => Object.values(row).forEach(v => { if (v > m) m = v; }));
    return m;
  }, [heatmap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Finance</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Analytics & revenue intelligence</p>
        </div>
        <DateRangeControl from={from} to={to} onChange={handleRange} />
      </div>

      {/* 1. KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Revenue", value: daily.data ? `$${daily.data.totalRevenue?.toFixed(2)}` : '—', icon: DollarSign },
          { label: 'Orders Today',    value: daily.data?.orderCount ?? '—',                              icon: ShoppingCart },
          { label: 'Avg Order',       value: daily.data ? `$${daily.data.avgTicket?.toFixed(2)}` : '—', icon: TrendingUp },
          { label: 'Active Orders',   value: daily.data?.activeOrdersCount ?? '—',                      icon: Activity },
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
                  {daily.loading ? <div className="h-7 w-20 rounded bg-secondary/50 animate-pulse" /> : (
                    <p className="text-2xl font-bold font-mono text-foreground">{kpi.value}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* 2. Revenue Trend */}
      <W title="Revenue Trend" loading={trend.loading} error={trend.error} onRetry={trend.refetch}
        empty={!trend.data || trend.data.length === 0} emptyMsg="No revenue in this date range."
        onExport={() => trend.data && exportCSV(trend.data, 'revenue-trend')}
      >
        <div className="mb-2 flex justify-between text-xs text-muted-foreground px-1">
          <span>{(trend.data || [])[0]?.date}</span>
          <span className="font-mono font-bold text-primary">
            ${(trend.data || []).reduce((s: number, d: any) => s + (d.revenue || 0), 0).toFixed(2)} total
          </span>
          <span>{(trend.data || []).slice(-1)[0]?.date}</span>
        </div>
        <AreaSpark data={trendValues} />
        <div className="mt-2 grid grid-cols-3 text-xs text-center text-muted-foreground">
          <span>Start</span><span>Trend</span><span>End</span>
        </div>
      </W>

      {/* 3 + 4. Top Items + Category Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <W title="Top Items by Quantity" loading={topItm.loading} error={topItm.error} onRetry={topItm.refetch}
          empty={!topItm.data || topItm.data.length === 0}
          onExport={() => topItm.data && exportCSV(topItm.data, 'top-items')}
        >
          <BarChart data={(topItm.data || []).slice(0, 8).map((d: any) => ({ label: d.name?.split(' ')[0] || d.name, value: d.totalQty || 0 }))} />
        </W>

        <W title="Revenue by Category" loading={catSpl.loading} error={catSpl.error} onRetry={catSpl.refetch}
          empty={!catSpl.data || catSpl.data.length === 0}
          onExport={() => catSpl.data && exportCSV(catSpl.data, 'category-split')}
        >
          <DonutChart data={(catSpl.data || []).map((d: any) => ({ label: d.category, value: Number(d.revenue) || 0 }))} />
          <div className="mt-3 grid grid-cols-2 gap-1">
            {(catSpl.data || []).map((d: any) => (
              <div key={d.category} className="text-xs flex justify-between px-2 py-1 rounded bg-secondary/30">
                <span className="text-muted-foreground">{d.category}</span>
                <span className="font-mono">${Number(d.revenue).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </W>
      </div>

      {/* 5. Peak Hours Heatmap */}
      <W title="Peak Hours Heatmap (Day × Hour)" loading={peak.loading} error={peak.error} onRetry={peak.refetch}
        empty={!peak.data || peak.data.length === 0}
        onExport={() => peak.data && exportCSV(peak.data, 'peak-hours')}
      >
        <div className="overflow-x-auto">
          <div style={{ minWidth: 600 }}>
            <div className="flex mb-1 pl-10">
              {HOURS.map(h => <div key={h} className="flex-1 text-center text-[8px] text-muted-foreground">{h}</div>)}
            </div>
            {[1,2,3,4,5,6,7].map(dow => (
              <div key={dow} className="flex items-center mb-0.5">
                <div className="w-10 text-[10px] text-muted-foreground text-right pr-2 shrink-0">{DAYS[dow - 1]}</div>
                {HOURS.map(h => {
                  const v = heatmap[dow]?.[h] || 0;
                  const intensity = maxHeat > 0 ? v / maxHeat : 0;
                  return (
                    <div key={h} className="flex-1 mx-px" title={`${DAYS[dow-1]} ${h}:00 — ${v} orders`}>
                      <div className="h-5 rounded-sm" style={{ background: `hsla(24,80%,55%,${0.08 + intensity * 0.87})` }} />
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-1 mt-2 justify-end">
              <span className="text-[10px] text-muted-foreground">Low</span>
              {[0.1,0.3,0.5,0.7,0.95].map(v => <div key={v} className="w-4 h-3 rounded-sm" style={{ background: `hsla(24,80%,55%,${v})` }} />)}
              <span className="text-[10px] text-muted-foreground">High</span>
            </div>
          </div>
        </div>
      </W>

      {/* 6 + 7. Payment Methods + Staff Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <W title="Payment Method Split" loading={payMth.loading} error={payMth.error} onRetry={payMth.refetch}
          empty={!payMth.data || payMth.data.length === 0}
          onExport={() => payMth.data && exportCSV(payMth.data, 'payment-methods')}
        >
          <DonutChart data={(payMth.data || []).map((d: any) => ({ label: d.method, value: Number(d.revenue) || 0 }))} />
        </W>

        <W title="Staff Leaderboard" loading={staffP.loading} error={staffP.error} onRetry={staffP.refetch}
          empty={!staffP.data || staffP.data.length === 0}
          onExport={() => staffP.data && exportCSV(staffP.data, 'staff-performance')}
        >
          <div className="space-y-2.5">
            {(staffP.data || []).slice(0, 6).map((s: any, i: number) => {
              const max = (staffP.data || []).reduce((m: number, x: any) => Math.max(m, x.totalSales || 0), 1);
              return (
                <div key={s.waiterId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-center leading-none">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium truncate">{s.name}</span>
                      <span className="text-xs font-mono font-bold text-primary ml-2 shrink-0">${s.totalSales.toFixed(0)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${(s.totalSales / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </W>
      </div>

      {/* 8. Cancellation Analysis */}
      <W title="Cancellation Analysis" loading={cancels.loading} error={cancels.error} onRetry={cancels.refetch}
        empty={!cancels.data || cancels.data.length === 0} emptyMsg="No cancellations in this period. 🎉"
        onExport={() => cancels.data && exportCSV(cancels.data, 'cancellations')}
      >
        <div className="space-y-2">
          {(cancels.data || []).slice(0, 8).map((d: any, i: number) => {
            const max = Math.max(...(cancels.data || []).map((x: any) => x.count || 0), 1);
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
      </W>
    </div>
  );
};
