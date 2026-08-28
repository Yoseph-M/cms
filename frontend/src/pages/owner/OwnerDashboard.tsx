import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Coffee, GlassWater, CupSoda, type LucideIcon } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { useHeaderStore } from '../../store/headerStore';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';

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
interface ProfitLossRow {
  revenue: number;
  payrollCost: number;
  otherExpenses: number;
  netProfit: number;
}

/* ─── Helpers ─── */
const CATEGORY_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DRINK: 'Drink',
  DESSERT: 'Dessert',
};
const CATEGORY_COLOR: Record<string, string> = {
  FOOD: 'hsl(20 95% 53%)',     // orange
  DRINK: 'hsl(24 60% 35%)',    // brown
  DESSERT: 'hsl(30 80% 75%)',  // peach
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
  const { dateRange: headerDateRange, setDateRange: setHeaderDateRange, setShowDateRange } = useHeaderStore();

  // Date range — defaults to last 30 days for the trend chart.
  // The header store is the single source of truth, so the chip in the
  // global header and the dashboard's queries stay in sync.
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

  // Seed the store with the default range on first mount, then keep using it.
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

  // Opt this page into showing the date-range chip in the header.
  useEffect(() => {
    setShowDateRange(true);
    return () => setShowDateRange(false);
  }, [setShowDateRange]);

  /* ── Data ── */
  const [daily, setDaily] = useState<DailySales | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [totalSales, setTotalSales] = useState<{ totalRevenue: number, orderCount: number } | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const fromIso = new Date(dateRange.from).toISOString();
        const toIso = new Date(`${dateRange.to}T23:59:59.999`).toISOString();
        const [d, m, ti, cat, ord, comp, pl] = await Promise.all([
          axiosClient.get('/analytics/sales/daily'),
          axiosClient.get('/analytics/sales/monthly'),
          axiosClient.get('/analytics/top-items', { params: { from: fromIso, to: toIso, limit: 5 } }),
          axiosClient.get('/analytics/category-split', { params: { from: fromIso, to: toIso } }),
          axiosClient.get('/orders', { params: { limit: 8, sort: 'createdAt:desc' } }),
          axiosClient.get('/analytics/sales/total'),
          axiosClient.get('/analytics/profit-loss'),
        ]);
        if (!alive) return;
        setDaily(d.data);
        setMonthly(m.data || []);
        setTopItems(ti.data || []);
        setCategories(cat.data || []);
        const orderList = ord.data?.data || ord.data || [];
        setRecentOrders(Array.isArray(orderList) ? orderList : []);
        setTotalSales(comp.data || null);
        setProfitLoss(pl.data || null);
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
      completed: totalSales?.orderCount ?? 0,
      todayRevenue: daily?.totalRevenue ?? 0,
      totalRevenue: totalSales?.totalRevenue ?? 0,
      revenueDelta: daily?.deltas.revenueVsPriorDay ?? null,
    };
  }, [daily, totalSales]);

  /* ── Line chart: monthly revenue + expenses derived from the real
        profit/loss aggregate (payroll + other expenses vs revenue) ── */
  const lineData = useMemo(() => {
    const labels = monthly.map((m) => m.month);
    const income = monthly.map((m) => Math.round(m.revenue / 100));
    // Expense ratio comes from the database (profit-loss endpoint), so the
    // Expenses line reflects actual payroll + operating costs.
    const totalExpenses = profitLoss
      ? profitLoss.payrollCost + profitLoss.otherExpenses
      : 0;
    const expenseRatio =
      profitLoss && profitLoss.revenue > 0 ? totalExpenses / profitLoss.revenue : 0;
    const expenses = income.map((v) => Math.round(v * expenseRatio));
    return { labels, income, expenses };
  }, [monthly, profitLoss]);

  /* ── Donut: category split (real data from /analytics/category-split) ── */
  const donutSegments = useMemo(() => {
    // Palette for categories without a dedicated colour
    const FALLBACK_COLORS = ['#fb923c', '#fdba74', '#fed7aa'];

    return categories.map((c, i) => ({
      label: CATEGORY_LABEL[c.category] ?? c.category,
      value: c.revenue,
      color: CATEGORY_COLOR[c.category] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
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
      <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-5 sm:space-y-6">
          {/* KPI cards — 4 floating islands */}
          <KpiCards
            totalOrders={kpis.totalOrders}
            inProgress={kpis.inProgress}
            completed={kpis.completed}
            todayRevenue={kpis.todayRevenue}
            totalRevenue={kpis.totalRevenue}
          />

          {/* Chart row — 2-column mode (line chart 2/3 + donut 1/3, side by side) */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
            <SectionCard
              className="col-span-2"
              title={t('dashboard.trend.title', { defaultValue: 'Total Revenue' })}
              filter={{ label: 'This Year', options: ['This Year', 'This Month', 'This Week', 'Last Year'] }}
              filterAlign="left"
              rightAccessory={
                <div className="flex items-center gap-5 shrink-0">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-[4px]" style={{ backgroundColor: '#f97316' }} />
                    Income
                  </span>
                  <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-[4px]" style={{ backgroundColor: '#5d1a12' }} />
                    Expenses
                  </span>
                </div>
              }
            >
              <RevenueLineChart
                labels={lineData.labels}
                series={[
                  {
                    key: 'income',
                    label: 'Income',
                    values: lineData.income,
                    color: '#f97316',
                    fill: true,
                  },
                  {
                    key: 'expenses',
                    label: 'Expenses',
                    values: lineData.expenses,
                    color: '#5d1a12',
                    fill: false,
                  },
                ]}
                yFormat={(v) => v.toLocaleString('en-US')}
                tooltipFormat={(v) => `$${Math.round(v).toLocaleString('en-US')}`}
              />
            </SectionCard>

            <SectionCard
              className="col-span-1"
              title={t('dashboard.donut.title', { defaultValue: 'Total Revenue' })}
              filter={{ label: 'This Month', options: ['This Month', 'Last Month', 'This Year'] }}
            >
              {donutSegments.length > 0 ? (
                <RevenueDonut
                  segments={donutSegments}
                  size={200}
                  thickness={26}
                />
              ) : (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No sales data for this period.
                </div>
              )}
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
