import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Banknote,
  ChefHat,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Send,
  ShoppingCart,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { Order } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { axiosClient } from '../../api/axiosClient';
import { dailyCloseApi } from '../../api/phase9Api';
import { useHeaderStore } from '../../store/headerStore';
import { useSocketStore } from '../../store/socketStore';
import { useAuthStore } from '../../store/authStore';
import { useElapsedTime } from '../../components/cashier/dashboard/hooks/useElapsedTime';
import { AnimatedCurrency, AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { cn } from '../../lib/utils';

interface SettlementRow {
  id: string;
  amountMinor: number;
  /** NONE marks the VOID row written when a ticket is cancelled. */
  method: 'CASH' | 'CARD' | 'MOBILE' | 'NONE';
  createdAt: string;
}

interface DailyCloseRecord {
  status: 'OPEN' | 'PENDING_REVIEW' | 'CLOSED' | 'REJECTED';
  businessDate: string;
  requestedBy?: { name: string } | null;
  closedBy?: { name: string } | null;
  reviewNotes?: string | null;
}

const METHOD_COLOR: Record<string, string> = {
  CASH: 'hsl(152 63% 40%)',
  CARD: 'hsl(221 83% 53%)',
  MOBILE: 'hsl(262 83% 58%)',
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', MOBILE: 'Mobile' };

/**
 * The cashier's console.
 *
 * Deliberately not a copy of the owner's analytics board: this screen is built
 * around the counter — what is ready to be paid, what the kitchen is still
 * working on, what has been collected today, and the one-tap actions the cashier
 * reaches for all shift.
 */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Cashier dashboard', subtitle: 'Live service overview' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  /* ── Live orders (mirrors the tickets queue window) ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const res = await axiosClient.get('/orders');
      setOrders(res.data.data || res.data);
    } catch {
      // Auth/network errors are surfaced globally; stay quiet on the dashboard.
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNew = (o: Order) => setOrders((prev) => [o, ...prev.filter((x) => x.id !== o.id)]);
    const onUpdate = (o: Order) => {
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
      // A freshly settled ticket means new money hit today's collection totals.
      if (o.status === 'PAID') {
        queryClient.invalidateQueries({ queryKey: ['settlements', 'today-dashboard'] });
      }
    };
    const onCancel = (o: Order) =>
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
    socket.on('order:new', onNew);
    socket.on('order:updated', onUpdate);
    socket.on('order:cancelled', onCancel);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:updated', onUpdate);
      socket.off('order:cancelled', onCancel);
    };
  }, [socket, queryClient]);

  /* ── Today's collections (from the settlement ledger) ── */
  const todayWindow = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: start.toISOString(), to: now.toISOString() };
  }, []);

  const settlementsQuery = useQuery<{ data: SettlementRow[] }>({
    queryKey: ['settlements', 'today-dashboard', todayWindow.from],
    queryFn: async () => {
      const res = await axiosClient.get('/settlements', {
        params: { from: todayWindow.from, to: todayWindow.to, page: 1, limit: 100 },
      });
      return res.data;
    },
    staleTime: 15_000,
  });

  const settlements = settlementsQuery.data?.data ?? [];

  /* ── End of Day state, so the console can nudge at closing time ── */
  const closeQuery = useQuery<DailyCloseRecord | null>({
    queryKey: ['dailyClose', 'current', 'cashier'],
    queryFn: () => dailyCloseApi.getCurrentStatus(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
    socket.on('daily-close:completed', refresh);
    socket.on('daily-close:requested', refresh);
    return () => {
      socket.off('daily-close:completed', refresh);
      socket.off('daily-close:requested', refresh);
    };
  }, [socket, queryClient]);

  /* ── Derived stats ── */
  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
    const ready = active.filter((o) => o.status === 'SERVED');
    const cooking = active.filter((o) => o.status === 'SUBMITTED' || o.status === 'IN_KITCHEN');
    // VOID rows carry the cancelled ticket's value for the audit trail, but no
    // money was collected — counting them here inflated "Collected today".
    const paidSettlements = settlements.filter((s) => s.method !== 'NONE');
    const collectedMinor = paidSettlements.reduce((sum, s) => sum + (s.amountMinor || 0), 0);
    const byMethod = paidSettlements.reduce<Record<string, number>>((acc, s) => {
      acc[s.method] = (acc[s.method] || 0) + (s.amountMinor || 0);
      return acc;
    }, {});
    const readySorted = [...ready].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const recent = [...orders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
    return {
      ready: ready.length,
      cooking: cooking.length,
      readyOrders: readySorted.slice(0, 6),
      collectedMinor,
      settledCount: paidSettlements.length,
      byMethod,
      recent,
    };
  }, [orders, settlements]);

  const firstName = (user?.name || '').trim().split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const closeStatus = closeQuery.data?.status ?? 'OPEN';
  const closeTone = {
    PENDING_REVIEW: { label: 'Awaiting manager approval', tone: 'warning' as const },
    CLOSED: { label: 'Day approved & closed', tone: 'success' as const },
    REJECTED: { label: 'Request disapproved', tone: 'danger' as const },
    OPEN: { label: 'Not requested yet', tone: 'neutral' as const },
  }[closeStatus];

  const mixTotal = Object.values(stats.byMethod).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="h-full overflow-y-auto px-5 py-6 sm:px-6 space-y-5 sm:space-y-6 animate-fade-in">
      {/* ── Hero: greeting, live state, and the actions a cashier uses all shift ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-blue-500/15 shadow-[0_20px_50px_-30px_rgba(59,130,246,0.55)]"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/15 via-sky-400/10 to-transparent" />
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
              <Sparkles className="h-3.5 w-3.5" />
              Service desk
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>{stats.ready} ready to collect</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>{stats.cooking} still in the kitchen</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span>{stats.settledCount} payments taken today</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/70 px-3.5 py-2.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Live service
              </p>
              <p className="font-mono text-xs font-semibold text-foreground">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

        </div>
      </motion.section>

      {/* ── Big-number band: the three questions a cashier asks all shift ── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        <ServiceTile
          label="Ready to collect"
          hint="Waiting at the counter"
          icon={Zap}
          accent="emerald"
          value={<AnimatedNumber value={stats.ready} />}
        />
        <ServiceTile
          label="In the kitchen"
          hint="Still being prepared"
          icon={ChefHat}
          accent="amber"
          value={<AnimatedNumber value={stats.cooking} />}
        />
        <ServiceTile
          label="Collected today"
          hint={`${stats.settledCount} ${stats.settledCount === 1 ? 'payment' : 'payments'} recorded`}
          icon={CircleDollarSign}
          accent="orange"
          value={<AnimatedCurrency value={stats.collectedMinor} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Ready-to-pay queue ── */}
        <section className="lg:col-span-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <header className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Banknote className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-[15px] font-semibold text-foreground">
                  Ready to collect
                </h2>
                <p className="text-xs text-muted-foreground">Oldest first — take payment at the till</p>
              </div>
            </div>
            <Link
              to="/cashier/tickets"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60"
            >
              All tickets
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </header>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading tickets…</p>
          ) : stats.readyOrders.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">Nothing waiting on you</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tickets appear here the moment the kitchen serves them.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {stats.readyOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    to="/cashier/tickets"
                    className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/40"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 font-display text-sm font-bold text-emerald-700">
                      {order.tableNumber ? order.tableNumber : <ShoppingCart className="h-4 w-4 text-emerald-600" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
                        <span className="ml-2 font-mono text-[11px] font-medium text-muted-foreground">
                          #{order.clientOrderId.slice(0, 6).toUpperCase()}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {(order.items || []).reduce((n, i) => n + i.quantity, 0)} items ·{' '}
                        {order.waiter?.name ?? order.cashier?.name ?? '—'}
                      </p>
                    </div>
                    <WaitChip createdAt={order.createdAt} />
                    <p className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
                      {formatCurrency(order.totalAmount)}
                    </p>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Right rail: payment mix, end-of-day nudge, floor tape ── */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[15px] font-semibold text-foreground">
                Payments today
              </h2>
              <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(stats.collectedMinor)}
              </span>
            </div>

            {stats.settledCount === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <CreditCard className="mx-auto mb-2 h-6 w-6 opacity-40" />
                No payments recorded yet today.
              </div>
            ) : (
              <>
                {/* Stacked mix bar — a compact read on how money came in. */}
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary">
                  {(['CASH', 'CARD', 'MOBILE'] as const).map((m) => {
                    const value = stats.byMethod[m] ?? 0;
                    if (value <= 0) return null;
                    return (
                      <span
                        key={m}
                        title={`${METHOD_LABEL[m]} · ${formatCurrency(value)}`}
                        style={{ width: `${(value / mixTotal) * 100}%`, background: METHOD_COLOR[m] }}
                        className="h-full transition-[width] duration-700"
                      />
                    );
                  })}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {(['CASH', 'CARD', 'MOBILE'] as const).map((m) => (
                    <li key={m} className="flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: METHOD_COLOR[m] }}
                        />
                        {METHOD_LABEL[m]}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(stats.byMethod[m] ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* End of Day — the cashier's one job at closing time. */}
          <Link
            to="/cashier/end-of-day"
            className="group block rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  End of Day
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">{closeTone.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {closeStatus === 'PENDING_REVIEW'
                    ? closeQuery.data?.requestedBy?.name
                      ? `Sent by ${closeQuery.data.requestedBy.name}`
                      : 'Waiting on your manager'
                    : closeStatus === 'CLOSED'
                      ? `${closeQuery.data?.closedBy?.name ?? 'A manager'} approved the close`
                      : closeStatus === 'REJECTED'
                        ? closeQuery.data?.reviewNotes || 'Fix the flagged issue and re-send'
                        : 'Send the close request when service ends'}
                </p>
              </div>
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform group-hover:translate-x-0.5',
                  closeStatus === 'PENDING_REVIEW'
                    ? 'bg-amber-500/10 text-amber-600 ring-amber-500/20'
                    : closeStatus === 'CLOSED'
                      ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20'
                      : closeStatus === 'REJECTED'
                        ? 'bg-rose-500/10 text-rose-600 ring-rose-500/20'
                        : 'bg-primary/10 text-primary ring-primary/20',
                )}
              >
                <Send className="h-4 w-4" />
              </span>
            </div>
          </Link>

        </div>
      </div>

      {/* ── Floor tape: the last few tickets at a glance ── */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock3 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-foreground">
                Floor activity
              </h2>
              <p className="text-xs text-muted-foreground">The latest tickets across the room</p>
            </div>
          </div>
        </header>
        {stats.recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No tickets yet today.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {stats.recent.map((o) => (
              <li key={o.id} className="flex items-center gap-4 px-5 py-3">
                <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                  #{o.clientOrderId.slice(0, 6).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {o.tableNumber ? `Table ${o.tableNumber}` : 'Takeout'}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {o.waiter?.name ?? o.cashier?.name ?? '—'}
                  </span>
                </span>
                <StatusPill status={o.status} />
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">
                  {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(o.totalAmount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(isLoading || settlementsQuery.isLoading) && (
        <p className="text-center text-[11px] text-muted-foreground">Refreshing…</p>
      )}
    </div>
  );
};

/* ─────────────────────────── small building blocks ─────────────────────── */

const TILE_ACCENT: Record<string, { ring: string; glow: string; icon: string }> = {
  emerald: {
    ring: 'border-emerald-500/25',
    glow: 'from-emerald-500/12 to-transparent',
    icon: 'bg-emerald-500/12 text-emerald-600',
  },
  amber: {
    ring: 'border-amber-500/25',
    glow: 'from-amber-500/12 to-transparent',
    icon: 'bg-amber-500/12 text-amber-600',
  },
  orange: {
    ring: 'border-blue-500/25',
    glow: 'from-blue-500/12 to-transparent',
    icon: 'bg-blue-500/12 text-[hsl(var(--primary))]',
  },
};

const ServiceTile: React.FC<{
  label: string;
  hint: string;
  icon: React.FC<{ className?: string }>;
  accent: keyof typeof TILE_ACCENT;
  value: React.ReactNode;
}> = ({ label, hint, icon: Icon, accent, value }) => {
  const a = TILE_ACCENT[accent];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm transition-transform hover:-translate-y-0.5 sm:p-5',
        a.ring,
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br', a.glow)} aria-hidden />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase leading-tight tracking-wider text-muted-foreground sm:text-[11px]">
            {label}
          </p>
          <p className="mt-1.5 font-display text-xl font-bold leading-none tabular-nums text-foreground sm:mt-2 sm:text-[32px]">
            {value}
          </p>
          <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground sm:mt-2 sm:text-xs">
            {hint}
          </p>
        </div>
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl',
            a.icon,
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
    </div>
  );
};

const STATUS_STYLE: Record<string, string> = {
  SERVED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
  SUBMITTED: 'bg-sky-500/10 text-sky-700 border-sky-500/25',
  IN_KITCHEN: 'bg-amber-500/10 text-amber-700 border-amber-500/25',
  PAID: 'bg-secondary text-muted-foreground border-border',
  CANCELLED: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
};
const STATUS_LABEL: Record<string, string> = {
  SERVED: 'Ready',
  SUBMITTED: 'New',
  IN_KITCHEN: 'Cooking',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={cn(
      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
      STATUS_STYLE[status] ?? 'border-border bg-secondary text-muted-foreground',
    )}
  >
    {STATUS_LABEL[status] ?? status}
  </span>
);

const WaitChip: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const elapsed = useElapsedTime(createdAt);
  return (
    <span
      className={cn(
        'hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums sm:inline-flex',
        elapsed.tone === 'danger'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : elapsed.tone === 'warning'
            ? 'border-warning/30 bg-warning/10 text-[hsl(var(--warning))]'
            : 'border-transparent bg-secondary/60 text-muted-foreground',
      )}
    >
      <Clock3 className="h-3 w-3" />
      {elapsed.display}
    </span>
  );
};

export default CashierDashboard;
