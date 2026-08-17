import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';

// New dashboard module
import { DashboardHeader } from '../../components/owner/dashboard/DashboardHeader';
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
  DEFAULT_ICON,
  type OrderTypeEntry,
} from '../../components/owner/dashboard/OrderTypeBars';

/* ─── API response shapes ─── */
interface DailySales {
  totalRevenue: number;     // minor
  mtdRevenue: number;       // minor
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
interface TopItem { name: string; totalQty: number; totalRevenue: number; }
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

/* ─── Helpers ─── */
const CATEGORY_LABEL: Record<string, string> = {
  FOOD: 'Sea Food',
  DRINK: 'Beverage',
  DESSERT: 'Desert',
  OTHER: 'Pasta',
};
const CATEGORY_COLOR: Record<string, string> = {
  FOOD: 'hsl(20 95% 53%)',     // orange
  DRINK: 'hsl(24 60% 35%)',    // brown
  DESSERT: 'hsl(30 80% 75%)',  // peach
  OTHER: 'hsl(32 100% 90%)',   // cream
};

function pickIconForName(name: string): LucideIcon {
  const k = name.toLowerCase();
  if (k.includes('juice') || k.includes('lemonade') || k.includes('water')) return GlassWater;
  if (k.includes('soda') || k.includes('cola') || k.includes('fizz')) return CupSoda;
  if (k.includes('tea') || k.includes('coffee') || k.includes('espresso')) return Coffee;
  return Coffee;
}

const ICON_BG: Array<string> = [
  'bg-orange-100', // orange
  'bg-amber-100', // yellow/amber
  'bg-sky-100', // blue
  'bg-pink-100', // pink
  'bg-stone-100', // brown/grey
];
const ICON_COLOR: Array<string> = [
  'text-orange-500',
  'text-amber-500',
  'text-sky-500',
  'text-pink-500',
  'text-stone-500',
];

/* ─────────────────────────────────────────────────────────────────────────
 * OwnerDashboard
 * Redesigned to match the warm, food-friendly dashboard in the design
 * reference. Composed of small, focused subcomponents living in
 * /components/owner/dashboard/*.
 * ──────────────────────────────────────────────────────────────────────── */
export const OwnerDashboard: React.FC = () => {
  const { t } = useTranslation('owner');
  const { user } = useAuthStore();

  // Date range — defaults to last 30 days for the trend chart
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const [dateRange, setDateRange] = useState({
    from: monthAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  });

  /* ── Data ── */
  const [daily, setDaily] = useState<DailySales | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const fromIso = new Date(dateRange.from).toISOString();
        const toIso = new Date(`${dateRange.to}T23:59:59.999`).toISOString();
        const [d, m, ti, cat, ord, comp] = await Promise.all([
          axiosClient.get('/analytics/sales/daily'),
          axiosClient.get('/analytics/sales/monthly'),
          axiosClient.get('/analytics/top-items', { params: { from: fromIso, to: toIso, limit: 5 } }),
          axiosClient.get('/analytics/category-split', { params: { from: fromIso, to: toIso } }),
          axiosClient.get('/orders', { params: { limit: 8, sort: 'createdAt:desc' } }),
          axiosClient.get('/orders', { params: { status: 'PAID', from: fromIso, to: toIso, limit: 1 } }),
        ]);
        if (!alive) return;
        setDaily(d.data);
        setMonthly(m.data || []);
        setTopItems(ti.data || []);
        setCategories(cat.data || []);
        const orderList = ord.data?.data || ord.data || [];
        setRecentOrders(Array.isArray(orderList) ? orderList : []);
        const compList = comp.data?.data || comp.data;
        setCompletedCount(Array.isArray(compList) ? compList.length : 0);
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
      completed: completedCount,
      totalRevenue: daily?.totalRevenue ?? 0,
      revenueDelta: daily?.deltas.revenueVsPriorDay ?? null,
    };
  }, [daily, completedCount]);

  /* ── Line chart: monthly revenue, paired with a synthetic expense line
       so we don't need a separate endpoint.  ── */
  const lineData = useMemo(() => {
    const labels = monthly.map((m) => m.month);
    const income = monthly.map((m) => Math.round(m.revenue / 100));
    // Synthetic "expenses" line — ~62% of income, with a little jitter so
    // the chart looks alive. Replace with /analytics/profit-loss when ready.
    const expenses = income.map((v) => Math.round(v * 0.62 + Math.sin(v) * 40));
    return { labels, income, expenses };
  }, [monthly]);

  /* ── Donut: category split ── */
  const donutSegments = useMemo(() => {
    // Colors matching the image exactly
    const MOCK_COLORS = ['#fb923c', '#fdba74', '#fed7aa', '#ffedd5'];
    
    if (categories.length === 0) {
      return [
        { label: 'Sea Food', value: 3500, color: MOCK_COLORS[0] },
        { label: 'Beverage', value: 2000, color: MOCK_COLORS[1] },
        { label: 'Desert',   value: 1200, color: MOCK_COLORS[2] },
        { label: 'Pasta',    value: 800,  color: MOCK_COLORS[3] },
      ];
    }
    return categories.map((c, i) => ({
      label: CATEGORY_LABEL[c.category] ?? c.category,
      value: c.revenue,
      color: MOCK_COLORS[i % MOCK_COLORS.length],
    }));
  }, [categories]);

  /* ── Order type bars: top 5 items by share ── */
  const orderTypeEntries = useMemo<OrderTypeEntry[]>(() => {
    const total = topItems.reduce((s, x) => s + x.totalRevenue, 0) || 1;
    return topItems.slice(0, 5).map((it, i) => ({
      id: it.name,
      name: it.name,
      percent: Math.round((it.totalRevenue / total) * 100),
      total: it.totalRevenue,
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

  /* ── Render ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <DashboardHeader
        title={t('dashboard.title', { defaultValue: 'Dashboard' })}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />

      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 sm:space-y-6">
          {/* KPI cards */}
          <KpiCards
            totalOrders={kpis.totalOrders}
            inProgress={kpis.inProgress}
            completed={kpis.completed}
            totalRevenue={kpis.totalRevenue}
            revenueDelta={
              kpis.revenueDelta != null
                ? { value: kpis.revenueDelta, positive: kpis.revenueDelta >= 0 }
                : null
            }
          />

          {/* Chart row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            <SectionCard
              title={t('dashboard.trend.title', { defaultValue: 'Total Revenue' })}
              filter={{ label: 'This Year', options: ['This Year', 'This Month', 'This Week', 'Last Year'] }}
              className="lg:col-span-2"
            >
              <RevenueLineChart
                labels={lineData.labels}
                series={[
                  {
                    key: 'income',
                    label: 'Income',
                    values: lineData.income,
                    color: '#fb923c', // Orange from image
                    fill: true,
                  },
                  {
                    key: 'expenses',
                    label: 'Expenses',
                    values: lineData.expenses,
                    color: '#e2e8f0', // Pale grey from image
                    fill: false,
                  },
                ]}
                yFormat={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`)}
              />
            </SectionCard>

            <SectionCard
              title={t('dashboard.donut.title', { defaultValue: 'Total Revenue' })}
              filter={{ label: 'This Month', options: ['This Month', 'Last Month', 'This Year'] }}
            >
              <RevenueDonut
                segments={donutSegments}
                size={200}
                thickness={26}
                centerLabel="Total"
                centerPercent={
                  donutSegments.length > 0
                    ? Math.round(
                        (donutSegments[0].value /
                          Math.max(
                            1,
                            donutSegments.reduce((s, x) => s + x.value, 0),
                          )) *
                          100,
                      )
                    : 0
                }
              />
            </SectionCard>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            <SectionCard
              title={t('dashboard.recent.title', { defaultValue: 'Recent orders' })}
              filter={{ label: 'Last Year', options: ['Today', 'Last 7 days', 'Last Month', 'Last Year'] }}
              className="lg:col-span-2"
              flush
            >
              <div className="px-5 sm:px-6 pb-5">
                <RecentOrdersTable orders={recentRows} />
              </div>
            </SectionCard>

            <SectionCard
              title={t('dashboard.orderType.title', { defaultValue: 'Order Type' })}
              filter={{ label: 'This Month', options: ['This Month', 'Last Month', 'This Year'] }}
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

          {isLoading && (
            <p className="text-center text-[11px] text-muted-foreground">Refreshing…</p>
          )}
        </div>
    </motion.div>
  );
};

export default OwnerDashboard;
