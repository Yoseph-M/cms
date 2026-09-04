import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleDollarSign, Clock3, ListTodo, ReceiptText, Sparkles, TrendingUp } from 'lucide-react';
import type { Order } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { useHeaderStore } from '../../store/headerStore';
import { useOrdersQuery } from '../../hooks/useCachedQueries';

/** A calm starting point for a cashier shift. Ticket processing lives in /tickets. */
export const CashierDashboard: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const ordersQuery = useOrdersQuery();

  const orders: Order[] = useMemo(() => {
    const raw = ordersQuery.data;
    if (!raw) return [];
    const list = raw?.data ?? raw;
    return Array.isArray(list) ? list : [];
  }, [ordersQuery.data]);
  const loading = ordersQuery.isLoading;

  useEffect(() => {
    setPageTitle({ title: 'Cashier dashboard', subtitle: 'Live shift overview' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const stats = useMemo(() => {
    const active = orders.filter((order) => order.status !== 'PAID' && order.status !== 'CANCELLED');
    const ready = active.filter((order) => order.status === 'SERVED');
    const paid = orders.filter((order) => order.status === 'PAID');
    return {
      active: active.length,
      ready: ready.length,
      revenue: paid.reduce((sum, order) => sum + order.totalAmount, 0),
      recent: active.slice(0, 4),
    };
  }, [orders]);

  return (
    <div className="h-full overflow-y-auto bg-white p-5 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9">
          <span className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Cashier workspace</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">A clearer shift, from first ticket to close.</h1><p className="mt-3 max-w-xl text-sm text-slate-300">Use the Tickets workspace for focused payment collection and live service flow.</p></div>
            <Link to="/cashier/tickets" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100">Open tickets <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </motion.div>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <OverviewStat label="Ready to collect" value={loading ? '—' : stats.ready} note="Tickets awaiting payment" icon={<CircleDollarSign className="w-5 h-5" />} tone="emerald" />
          <OverviewStat label="Active tickets" value={loading ? '—' : stats.active} note="Currently on the floor" icon={<ListTodo className="w-5 h-5" />} tone="blue" />
          <OverviewStat label="Sales recorded" value={loading ? '—' : formatCurrency(stats.revenue)} note="From settled tickets" icon={<TrendingUp className="w-5 h-5" />} tone="violet" />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">At a glance</p><h2 className="mt-1 font-display text-xl font-bold text-slate-950">Recent activity</h2></div><Link to="/cashier/tickets" className="text-sm font-semibold text-primary hover:underline">View tickets</Link></div>
            <div className="mt-5 divide-y divide-slate-100">
              {stats.recent.length ? stats.recent.map((order) => <div key={order.id} className="flex items-center justify-between gap-4 py-3"><div className="flex items-center gap-3 min-w-0"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">{order.tableNumber || 'TO'}</span><div className="min-w-0"><p className="font-semibold text-slate-900">{order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}</p><p className="text-xs text-slate-500">{order.status === 'SERVED' ? 'Ready to collect' : 'In progress'}</p></div></div><p className="font-display font-bold tabular-nums text-slate-950">{formatCurrency(order.totalAmount)}</p></div>) : <p className="py-10 text-center text-sm text-slate-500">No active tickets right now.</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-6"><ReceiptText className="w-6 h-6 text-primary" /><h2 className="mt-5 font-display text-xl font-bold text-slate-950">Ticket-first checkout</h2><p className="mt-2 text-sm leading-6 text-slate-600">The Tickets page keeps the payment workflow in one distraction-free place.</p><div className="mt-6 space-y-3 text-sm text-slate-600"><p className="flex gap-2"><Sparkles className="mt-0.5 w-4 h-4 text-primary" />Live queue grouping</p><p className="flex gap-2"><Clock3 className="mt-0.5 w-4 h-4 text-primary" />Wait-time visibility</p></div><Link to="/cashier/tickets" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-slate-950">Go to tickets <ArrowRight className="w-4 h-4" /></Link></div>
        </section>
      </div>
    </div>
  );
};

const OverviewStat: React.FC<{ label: string; value: React.ReactNode; note: string; icon: React.ReactNode; tone: 'emerald' | 'blue' | 'violet' }> = ({ label, value, note, icon, tone }) => {
  const tones = { emerald: 'bg-emerald-50 text-emerald-700', blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700' };
  return <motion.div whileHover={{ y: -3 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 font-display text-3xl font-bold tabular-nums text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></motion.div>;
};

export default CashierDashboard;
