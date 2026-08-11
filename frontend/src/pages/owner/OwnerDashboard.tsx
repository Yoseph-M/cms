import React, { useState, useEffect, useMemo } from 'react';
import { axiosClient } from '../../api/axiosClient';
import {
  Activity,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Users,
  Download,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/common/LoadingState';
import { LivePulse } from '../../components/common/LivePulse';
import { EmptyState } from '../../components/common/EmptyState';
import { useToastStore } from '../../store/toastStore';
import { cn } from '../../lib/utils';
import { formatCurrency } from '../../utils/currency';
import { PageHeading, StatNumber } from '../../components/ui/Typography';
import { AnimatedCurrency, AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { OnboardingChecklist } from '../../components/onboarding/OnboardingChecklist';

type StatTone = 'primary' | 'accent' | 'success' | 'muted';

const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone: StatTone;
  trend?: { delta: number; positive: boolean };
  badge?: React.ReactNode;
}> = ({ label, value, hint, icon, tone, trend, badge }) => {
  const toneClasses: Record<StatTone, string> = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    accent: 'bg-accent/10 text-accent border-accent/20',
    success: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20',
    muted: 'bg-secondary/60 text-muted-foreground border-border',
  };
  return (
    <Card className="relative overflow-hidden card-lift">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </span>
            {badge}
          </div>
          <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center', toneClasses[tone])}>
            {icon}
          </div>
        </div>
        <StatNumber className="block">
          {value}
        </StatNumber>
        <div className="flex items-center justify-between mt-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {trend && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-semibold',
                trend.positive ? 'text-[hsl(var(--success))]' : 'text-destructive'
              )}
            >
              <TrendingUp
                className={cn('w-3 h-3', !trend.positive && 'rotate-180')}
              />
              {trend.delta.toFixed(1)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface DailySalesData {
  date: string;
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

interface TrendSalesData {
  date: string;
  revenue: number;
  orderCount: number;
}

export const OwnerDashboard: React.FC = () => {
  const { addToast } = useToastStore();
  const [dailySales, setDailySales] = useState<DailySalesData | null>(null);
  const [trendData, setTrendData] = useState<TrendSalesData[]>([]);
  const [staffCount, setStaffCount] = useState(0);

  const [trendStartDate, setTrendStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [trendEndDate, setTrendEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchAdvancedAnalytics();
  }, [trendStartDate, trendEndDate]);

  const fetchDashboardData = async () => {
    try {
      const [salesRes, staffRes] = await Promise.all([
        axiosClient.get('/analytics/sales/daily'),
        axiosClient.get('/users'),
      ]);
      setDailySales(salesRes.data);
      setStaffCount(staffRes.data.filter((s: any) => s.isActive).length);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAdvancedAnalytics = async () => {
    try {
      const res = await axiosClient.get(
        `/analytics/sales/trend?start=${trendStartDate}&end=${trendEndDate}`
      );
      setTrendData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const downloadCSV = (data: any[], filename: string) => {
    if (!data || !data.length) {
      addToast({ type: 'warning', title: 'No data to export' });
      return;
    }
    const keys = Object.keys(data[0]);
    const csvContent = [
      keys.join(','),
      ...data.map((row) => keys.map((k) => row[k]).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast({ type: 'success', title: 'CSV exported' });
  };

  const maxRev = Math.max(1, ...trendData.map((d) => d.revenue));

  const isNewRecord = useMemo(() => {
    if (!dailySales || trendData.length < 2) return false;
    const pastMax = Math.max(
      0,
      ...trendData
        .filter((d) => d.date !== dailySales.date)
        .map((d) => d.revenue)
    );
    return pastMax > 0 && dailySales.totalRevenue > pastMax;
  }, [dailySales, trendData]);

  if (isLoading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <LoadingState message="Loading analytics…" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Owner Console
          </p>
          <PageHeading className="mt-1">
            Analytics Overview
          </PageHeading>
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-card border border-border shadow-sm">
          <LivePulse activeOrdersCount={dailySales?.activeOrdersCount || 0} />
        </div>
      </div>

      <OnboardingChecklist />

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatTile
          label="Today's Revenue"
          value={<AnimatedCurrency value={dailySales?.totalRevenue ?? 0} />}
          badge={
            isNewRecord ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] text-[10px] font-bold animate-fade-in">
                🎉 New Record
              </span>
            ) : null
          }
          hint={`${dailySales?.orderCount ?? 0} orders settled`}
          icon={<DollarSign className="w-4 h-4" />}
          tone="primary"
        />
        <StatTile
          label="Average Ticket"
          value={<AnimatedCurrency value={dailySales?.avgTicket ?? 0} />}
          hint="per table"
          icon={<TrendingUp className="w-4 h-4" />}
          tone="accent"
        />
        <StatTile
          label="Kitchen Queue"
          value={<AnimatedNumber value={dailySales?.activeOrdersCount ?? 0} />}
          hint="active orders"
          icon={<ShoppingBag className="w-4 h-4" />}
          tone="success"
        />
        <StatTile
          label="Active Staff"
          value={<AnimatedNumber value={staffCount} />}
          hint="registered users"
          icon={<Users className="w-4 h-4" />}
          tone="muted"
        />
      </div>

      {/* Date range filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card/40 border border-border rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Range</span>
          </div>
          <input
            type="date"
            value={trendStartDate}
            onChange={(e) => setTrendStartDate(e.target.value)}
            className="bg-secondary/50 border border-input text-foreground text-sm rounded-md px-2.5 py-1.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <input
            type="date"
            value={trendEndDate}
            onChange={(e) => setTrendEndDate(e.target.value)}
            className="bg-secondary/50 border border-input text-foreground text-sm rounded-md px-2.5 py-1.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Download className="w-3.5 h-3.5" />}
          onClick={() => downloadCSV(trendData, 'revenue_trend')}
        >
          Export CSV
        </Button>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <h3 className="text-base font-semibold">Revenue Trend</h3>
            <span className="text-[11px] text-muted-foreground font-mono">
              {trendData.length} days
            </span>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <EmptyState
                title="Quiet in this window"
                message="No orders came through yet. Once they do, you'll see daily revenue trends here."
                icon={<TrendingUp className="w-7 h-7" />}
                className="min-h-[12rem]"
              />
            ) : (
              <div className="flex items-end gap-1.5 h-52 pt-4 border-b border-border overflow-x-auto">
                {trendData.map((t, idx) => {
                  const heightPercent = Math.max(4, (t.revenue / maxRev) * 100);
                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center justify-end group relative min-w-[24px]"
                    >
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-primary/60 to-primary transition-all group-hover:from-primary group-hover:to-accent min-h-[4px]"
                        style={{ height: `${heightPercent}%` }}
                      />
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-popover border border-border text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-xl pointer-events-none transition-opacity">
                        <p className="font-semibold tabular-nums">{formatCurrency(t.revenue)}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{t.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground font-mono">
              <span>{trendStartDate}</span>
              <span>{trendEndDate}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <h3 className="text-base font-semibold">Top Selling Items</h3>
            <span className="text-[11px] text-muted-foreground">Last {trendData.length} days</span>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData[0].topItems ? (
              <ul className="space-y-3">
                {trendData[0].topItems.slice(0, 5).map((item: any, idx: number) => {
                  const max = trendData[0].topItems[0].count || 1;
                  const widthPct = Math.max(8, (item.count / max) * 100);
                  return (
                    <li key={idx} className="group">
                      <div className="flex justify-between items-center text-sm mb-1.5">
                        <span className="font-medium text-foreground flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center tabular-nums">
                            {idx + 1}
                          </span>
                          {item.name}
                        </span>
                        <span className="font-mono text-muted-foreground tabular-nums">
                          {item.count} sold
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary/70 to-accent/70 rounded-full transition-all duration-500"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="Not enough orders yet to crown a favorite."
                message="Once orders are placed, your best-sellers will appear here ranked by volume."
                icon={<Activity className="w-7 h-7" />}
                className="min-h-[10rem]"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
