import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { Order, PaymentMethod } from '../../types';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage, extractErrorDetails } from '../../utils/errorHandler';
import { cn } from '../../lib/utils';
import { PageSkeleton } from '../../components/common/PageSkeleton';

// New subcomponents
import { QueueTabs, type FilterKey } from '../../components/cashier/dashboard/QueueTabs';
import { OrderList } from '../../components/cashier/dashboard/OrderList';
import { OrderDetailPanel } from '../../components/cashier/dashboard/OrderDetailPanel';
import { TableMap } from '../../components/cashier/dashboard/TableMap';
import { CancelModal } from '../../components/cashier/dashboard/CancelModal';
import {
  PrinterFailureBanner,
  type PrinterFailureEvent,
} from '../../components/cashier/dashboard/PrinterFailureBanner';
import { useCashierShortcuts } from '../../components/cashier/dashboard/hooks/useCashierShortcuts';
import type { PaymentPhase } from '../../components/cashier/dashboard/PaymentPad';

// UI primitives
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  AlertTriangle,
  Clock,
  ShoppingCart,
  ListOrdered,
  Armchair,
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Timer,
  Receipt,
  Keyboard,
  ChevronRight,
  CircleDot,
  Hash,
  Inbox,
  Search,
} from 'lucide-react';

const CashierOrderingPanel = lazy(() =>
  import('../../components/cashier/CashierOrderingPanel').then((m) => ({
    default: m.CashierOrderingPanel,
  })),
);

/* ─── Payment method visual config (matches original) ─── */
type PaymentTile = {
  pm: PaymentMethod;
  label: string;
  short: string;
  icon: React.FC<{ className?: string }>;
  hotkey: string;
};
const PAYMENT_TILES: PaymentTile[] = [
  { pm: 'CASH',   label: 'Cash',   short: 'Cash',   icon: Banknote,   hotkey: '1' },
  { pm: 'CARD',   label: 'Card',   short: 'Card',   icon: CreditCard, hotkey: '2' },
  { pm: 'MOBILE', label: 'Mobile', short: 'Mobile', icon: Smartphone, hotkey: '3' },
];

import { KpiCard } from '../../components/owner/dashboard/KpiCards';

/* ─── Order detail pay block (matches original, with my 3-state CTA) ─── */
const PayBlock: React.FC<{
  total: number;
  method: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
  phase: PaymentPhase;
  onCollect: () => void;
  onCancel: () => void;
  isClosed: boolean;
  t: (k: string, opts?: any) => string;
}> = ({ total, method, onMethodChange, phase, onCollect, onCancel, isClosed, t }) => {
  if (isClosed) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        {phase === 'printed' ? 'Receipt printed.' : 'This ticket is settled.'}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t('orderDetail.total')}
        </span>
        <span className="font-display text-3xl font-bold tabular-nums text-foreground leading-none">
          {formatCurrency(total)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_TILES.map((meta) => {
          const Icon = meta.icon;
          const active = method === meta.pm;
          return (
            <button
              key={meta.pm}
              onClick={() => onMethodChange(meta.pm)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition-all py-3 group',
                active
                  ? 'border-primary bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-brand'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {active && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand">
                  <CheckCircle2 className="w-3 h-3" />
                </span>
              )}
              <Icon className={cn('w-5 h-5', active && 'text-primary')} />
              <span className="text-xs font-bold">{meta.short}</span>
              <kbd
                className={cn(
                  'absolute bottom-1 right-1 text-[9px] font-mono px-1 rounded',
                  active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                )}
              >
                {meta.hotkey}
              </kbd>
            </button>
          );
        })}
      </div>

      <BigCollectButton phase={phase} total={total} onClick={onCollect} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Keyboard className="w-3 h-3" />
          <span>
            <kbd className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-[10px]">1</kbd>
            <kbd className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-[10px] ml-1">2</kbd>
            <kbd className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-[10px] ml-1">3</kbd>
            <span className="ml-1.5">method</span>
            <kbd className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-[10px] ml-2">↵</kbd>
            <span className="ml-1.5">settle</span>
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
        >
          {t('orderDetail.cancelOrder')}
        </button>
      </div>
    </div>
  );
};

/* Big CTA — 3 visual states (idle / processing / printed) */
const BigCollectButton: React.FC<{
  phase: PaymentPhase;
  total: number;
  onClick: () => void;
}> = ({ phase, total, onClick }) => {
  const { t } = useTranslation('cashier');
  const label =
    phase === 'processing'
      ? t('orderDetail.processing')
      : phase === 'printed'
        ? t('orderDetail.printed', { defaultValue: 'Receipt printed' })
        : t('orderDetail.markPaid');
  return (
    <button
      onClick={onClick}
      disabled={phase !== 'idle'}
      className={cn(
        'relative w-full h-14 text-base font-bold overflow-hidden rounded-xl text-white',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed transition-all',
        !phase && 'bg-brand-gradient hover:opacity-95 shadow-brand-lg',
        phase === 'printed' && 'bg-emerald-500 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]',
        phase === 'processing' && 'bg-primary/85',
        // idle (when phase is 'idle')
        phase === 'idle' && 'bg-brand-gradient hover:opacity-95 shadow-brand-lg',
      )}
    >
      <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-xl" />
      {phase === 'idle' && (
        <span className="relative inline-flex items-center gap-2">
          Mark paid · {formatCurrency(total)} <ChevronRight className="w-4 h-4" />
        </span>
      )}
      {phase === 'processing' && (
        <span className="relative inline-flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {label}
        </span>
      )}
      {phase === 'printed' && (
        <span className="relative inline-flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          {label}
          <Sparkles className="w-4 h-4" />
        </span>
      )}
    </button>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * CashierDashboard
 * Restored to the original left/right layout:
 *   ┌───────────────────────────────┬──────────────────┐
 *   │ Queue + filters + grid         │ Order detail     │
 *   │                                │ (header + items  │
 *   │                                │  + pay block)    │
 *   └───────────────────────────────┴──────────────────┘
 * Visual upgrades kept: status accent bar on cards, 3-state CTA, better
 * empty states, quick-reason cancel modal.
 * ──────────────────────────────────────────────────────────────────────── */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation('cashier');

  /* ── Settings ── */
  const settingQuery = useSystemSettingQuery('cashierOrderingEnabled');
  const tableCountQuery = useSystemSettingQuery('tableCount');
  const [cashierOrderingEnabled, setCashierOrderingEnabled] = useState(false);
  const [tableCount, setTableCount] = useState(12);
  useEffect(() => {
    if (settingQuery.data) setCashierOrderingEnabled(settingQuery.data.value === 'true');
  }, [settingQuery.data]);
  useEffect(() => {
    if (tableCountQuery.data) {
      const v = parseInt(tableCountQuery.data.value ?? '', 10);
      setTableCount(isNaN(v) ? 12 : v);
    }
  }, [tableCountQuery.data]);

  /* ── View mode ── */
  const [mode, setMode] = useState<'queue' | 'tables' | 'order'>('queue');
  const [tableForNewOrder, setTableForNewOrder] = useState('');

  /* ── Orders + selection ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Payment / settlement state ── */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const isSettlingRef = useRef(false);

  /* ── Cancellation ── */
  const [showCancelModal, setShowCancelModal] = useState(false);

  /* ── Printer failures ── */
  const [printerFailures, setPrinterFailures] = useState<PrinterFailureEvent[]>([]);

  /* ── Card refs ── */
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  /* ── Derived ── */
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED'),
    [orders],
  );

  // "Ready to pay" cards are bumped to the top, then oldest-first
  const sortedActiveOrders = useMemo(() => {
    return [...activeOrders].sort((a, b) => {
      if (a.status === 'SERVED' && b.status !== 'SERVED') return -1;
      if (b.status === 'SERVED' && a.status !== 'SERVED') return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [activeOrders]);

  const filteredOrders = useMemo(() => {
    let list = sortedActiveOrders;
    if (filter === 'needsPayment') list = list.filter((o) => o.status === 'SERVED');
    else if (filter === 'waiting') list = list.filter((o) => o.status !== 'SERVED');
    else if (filter === 'fresh') {
      list = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.clientOrderId.toLowerCase().includes(q) ||
          (o.tableNumber && String(o.tableNumber).includes(q)) ||
          (o.waiter?.name || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [sortedActiveOrders, filter, search]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? sortedActiveOrders[0] ?? null,
    [orders, selectedOrderId, sortedActiveOrders],
  );

  const readyCount = useMemo(
    () => activeOrders.filter((o) => o.status === 'SERVED').length,
    [activeOrders],
  );

  /* ── KPIs (today from in-memory paid orders) ── */
  const settledOrders = useMemo(() => orders.filter((o) => o.status === 'PAID'), [orders]);
  const todayRevenue = settledOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const settledCount = settledOrders.length;
  const avgTicket = settledCount > 0 ? todayRevenue / settledCount : 0;
  const oldestWaitMinutes = useMemo(() => {
    if (activeOrders.length === 0) return 0;
    const oldest = activeOrders.reduce((a, b) =>
      new Date(a.createdAt).getTime() < new Date(b.createdAt).getTime() ? a : b,
    );
    return Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 60000);
  }, [activeOrders]);

  /* ─────────────────────────────────────────────────────────
   * Data loading + realtime
   * ───────────────────────────────────────────────────────── */
  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/orders');
      setOrders(res.data.data || res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch active queue'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Settings realtime */
  useEffect(() => {
    if (!socket) return;
    const onOrdering = (p: { value: string }) => {
      setCashierOrderingEnabled(p.value === 'true');
      queryClient.setQueryData(['systemSetting', 'cashierOrderingEnabled'], (old: any) =>
        old ? { ...old, value: p.value } : old,
      );
    };
    const onTableCount = (p: { value: string }) => {
      const v = parseInt(p.value, 10);
      setTableCount(isNaN(v) ? 12 : v);
      queryClient.setQueryData(['systemSetting', 'tableCount'], (old: any) =>
        old ? { ...old, value: p.value } : old,
      );
    };
    socket.on('settings:cashierOrderingChanged', onOrdering);
    socket.on('settings:tableCountChanged', onTableCount);
    return () => {
      socket.off('settings:cashierOrderingChanged', onOrdering);
      socket.off('settings:tableCountChanged', onTableCount);
    };
  }, [socket, queryClient]);

  /* Order realtime */
  useEffect(() => {
    if (!socket) return;
    const onNew = (o: Order) => setOrders((p) => [o, ...p.filter((x) => x.id !== o.id)]);
    const onUpdate = (o: Order) => setOrders((p) => p.map((x) => (x.id === o.id ? o : x)));
    const onCancel = (o: Order) => setOrders((p) => p.map((x) => (x.id === o.id ? o : x)));
    const onCancelReq = (p: { order: Order }) => {
      setOrders((prev) => prev.map((x) => (x.id === p.order.id ? p.order : x)));
      addToast({
        type: 'info',
        title: 'Cancellation requested',
        message: `Order ${p.order.clientOrderId.slice(0, 8)} — pending manager approval.`,
      });
    };
    const onCancelReject = async (p: { request: { orderId: string; rejectedReason: string } }) => {
      addToast({ type: 'warning', title: 'Cancellation rejected', message: p.request.rejectedReason });
      try {
        const res = await axiosClient.get(`/orders/${p.request.orderId}`);
        setOrders((prev) => prev.map((x) => (x.id === p.request.orderId ? res.data : x)));
      } catch {
        /* ignore */
      }
    };
    const onPrinterFail = (p: PrinterFailureEvent) => setPrinterFailures((prev) => [...prev, p]);
    socket.on('order:new', onNew);
    socket.on('order:updated', onUpdate);
    socket.on('order:cancelled', onCancel);
    socket.on('cancellation:requested', onCancelReq);
    socket.on('cancellation:rejected', onCancelReject);
    socket.on('printer:failed', onPrinterFail);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:updated', onUpdate);
      socket.off('order:cancelled', onCancel);
      socket.off('cancellation:requested', onCancelReq);
      socket.off('cancellation:rejected', onCancelReject);
      socket.off('printer:failed', onPrinterFail);
    };
  }, [socket, addToast]);

  /* ─────────────────────────────────────────────────────────
   * Actions
   * ───────────────────────────────────────────────────────── */
  const MAX_SETTLE_RETRIES = 3;
  const SETTLE_BACKOFF_MS = [500, 1000, 2000];

  const handleMarkPaid = async (orderId: string, retryCount = 0) => {
    if (retryCount === 0 && isSettlingRef.current) return;
    if (retryCount === 0) isSettlingRef.current = true;
    setPhase('processing');

    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found');

      const res = await axiosClient.post(
        `/orders/${orderId}/settlements`,
        {
          amountMinor: order.totalAmount,
          method: paymentMethod,
          reference: '',
          note: 'Settlement recorded via Cashier Dashboard',
        },
        { headers: { 'Idempotency-Key': `settle-full-${orderId}` } },
      );

      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data.order : o)));

      const tableText = res.data.order.tableNumber
        ? t('toasts.tableText', { table: res.data.order.tableNumber })
        : t('toasts.takeoutText');
      addToast({ type: 'success', title: t('toasts.settled', { tableText }) });

      setTimeout(() => {
        setPhase('printed');
        setTimeout(() => {
          setPhase('idle');
          const next =
            sortedActiveOrders.filter((o) => o.id !== orderId && o.status === 'SERVED')[0] ??
            sortedActiveOrders.filter((o) => o.id !== orderId)[0];
          setSelectedOrderId(next?.id ?? null);
        }, 1400);
      }, 500);
    } catch (err: any) {
      const isConcurrent = extractErrorDetails(err).code === 'CONCURRENT_MODIFICATION';
      if (isConcurrent && retryCount < MAX_SETTLE_RETRIES) {
        const delay = SETTLE_BACKOFF_MS[retryCount];
        if (retryCount === 0) {
          addToast({
            type: 'info',
            title: 'Retrying…',
            message: 'Order is being updated. Retrying automatically.',
          });
        }
        setTimeout(() => handleMarkPaid(orderId, retryCount + 1), delay);
        return;
      }
      setPhase('idle');
      addToast({
        type: 'error',
        title: t('toasts.paymentFailed'),
        message: isConcurrent
          ? 'Order is being modified by another user. Please wait and try again.'
          : extractErrorMessage(err),
      });
    } finally {
      if (retryCount === 0 || !isSettlingRef.current) {
        isSettlingRef.current = false;
      }
    }
  };

  const handleRequestCancellation = async (reason: string) => {
    if (!selectedOrderId || !reason.trim()) return;
    try {
      await axiosClient.post(`/orders/${selectedOrderId}/cancellation-request`, { reason });
      addToast({
        type: 'success',
        title: t('toasts.cancelRequested', { defaultValue: 'Cancellation requested' }),
        message: 'Waiting for manager approval.',
      });
      setShowCancelModal(false);
      const res = await axiosClient.get(`/orders/${selectedOrderId}`);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrderId ? res.data : o)));
    } catch (err: any) {
      addToast({
        type: 'error',
        title: t('toasts.cancelFailed', { defaultValue: 'Cancel failed' }),
        message: err?.response?.data?.error || 'Failed to request cancellation.',
      });
    }
  };

  /* Force queue mode if cashier-ordering is disabled */
  useEffect(() => {
    if (!cashierOrderingEnabled && mode === 'order') setMode('queue');
  }, [cashierOrderingEnabled, mode]);

  /* Keyboard shortcuts */
  useCashierShortcuts({
    enabled: mode === 'queue',
    orders: sortedActiveOrders,
    selectedId: selectedOrderId,
    onSelect: (id) => setSelectedOrderId(id),
    onSettle: (id) => {
      if (phase === 'idle') void handleMarkPaid(id);
    },
    onCancel: () => {
      if (
        selectedOrder &&
        selectedOrder.status !== 'PAID' &&
        selectedOrder.status !== 'CANCELLED'
      ) {
        setShowCancelModal(true);
      }
    },
    onMethodChange: (m) => setPaymentMethod(m),
    onClearSelection: () => {
      if (showCancelModal) {
        setShowCancelModal(false);
        return;
      }
      setSelectedOrderId(null);
    },
    cardFocus: (id) => requestAnimationFrame(() => cardRefs.current.get(id)?.focus()),
    method: paymentMethod,
    isSettling: phase !== 'idle',
  });

  /* ─────────────────────────────────────────────────────────
   * Render
   * ───────────────────────────────────────────────────────── */
  if (mode === 'order' && cashierOrderingEnabled) {
    return (
      <div className="h-full flex flex-col bg-app-gradient text-foreground overflow-hidden">
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0 relative">
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode('queue')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Back to queue
            </button>
            <span className="w-px h-6 bg-border" />
            <span className="font-display font-semibold text-base text-foreground flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-brand-gradient text-white flex items-center justify-center shadow-brand">
                <ShoppingCart className="w-3.5 h-3.5" />
              </span>
              New Order
            </span>
          </div>
        </header>
        <Suspense fallback={<PageSkeleton />}>
          <CashierOrderingPanel
            initialTableNumber={tableForNewOrder}
            onOrderCreated={() => {
              void fetchOrders();
              setMode('queue');
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (mode === 'tables' && cashierOrderingEnabled) {
    return (
      <TableMap
        tableCount={tableCount}
        activeOrders={activeOrders}
        onTableClick={(tableNumber) => {
          const existing = activeOrders.find((o) => o.tableNumber === tableNumber);
          if (existing) {
            setSelectedOrderId(existing.id);
            setMode('queue');
          } else {
            setTableForNewOrder(tableNumber);
            setMode('order');
          }
        }}
        onBack={() => setMode('queue')}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-app-gradient overflow-hidden text-foreground">
      <PrinterFailureBanner failures={printerFailures} onDismiss={() => setPrinterFailures([])} />

      {/* Top bar — original 80px height: brand (left), 4 KPI tiles (center), Tables button (right) */}
      <header className="relative h-20 bg-card/85 backdrop-blur-md border-b border-border px-6 flex items-center justify-between gap-4 shrink-0 shadow-[0_4px_18px_-12px_rgba(59,130,246,0.25)]">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Cashier</p>
            <h1 className="font-display text-xl font-bold text-foreground leading-tight tracking-tight">Live Queue</h1>
          </div>
        </div>

        <div className="hidden md:grid grid-cols-4 flex-1 max-w-4xl gap-4">
          <KpiCard
            label="Today revenue"
            value={todayRevenue}
            kind="currency"
            icon={TrendingUp}
            tone="mint"
            hint={`${settledCount} settled`}
          />
          <KpiCard
            label="Active tickets"
            value={activeOrders.length}
            kind="number"
            icon={ListOrdered}
            tone="cream"
            hint={activeOrders.length === 0 ? 'All clear' : 'On the floor'}
          />
          <KpiCard
            label="Avg ticket"
            value={avgTicket}
            kind="currency"
            icon={Sparkles}
            tone="rose"
          />
          <KpiCard
            label="Oldest wait"
            value={oldestWaitMinutes}
            kind="number"
            icon={Timer}
            tone={oldestWaitMinutes >= 15 ? 'blush' : 'cream'}
            hint={oldestWaitMinutes >= 30 ? 'Check now' : oldestWaitMinutes >= 15 ? 'Watch' : 'm'}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {cashierOrderingEnabled && (
            <Button
              id="cashier-new-order-btn"
              size="sm"
              onClick={() => setMode('tables')}
              className="h-10 px-4"
            >
              <Armchair className="w-4 h-4 mr-1.5" />
              Tables
            </Button>
          )}
        </div>
      </header>

      {/* Main workspace — original 3/5 + 2/5 split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Queue (left) */}
        <div className="w-3/5 lg:w-2/3 flex flex-col overflow-hidden border-r border-border">
          <QueueTabs
            active={filter}
            onChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            readyCount={readyCount}
          />
          <OrderList
            orders={filteredOrders}
            selectedId={selectedOrderId ?? sortedActiveOrders[0]?.id ?? null}
            isLoading={isLoading}
            error={error}
            hasAnyOrders={sortedActiveOrders.length > 0}
            cardRef={(id, node) => {
              if (node) cardRefs.current.set(id, node);
              else cardRefs.current.delete(id);
            }}
            onSelect={(id) => setSelectedOrderId(id)}
            onRetry={fetchOrders}
            searchActive={search.trim().length > 0}
          />
        </div>

        {/* Order Detail (right) */}
        <OrderDetailPanel
          order={selectedOrder}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          phase={phase}
          onCollect={() => selectedOrder && phase === 'idle' && handleMarkPaid(selectedOrder.id)}
          onCancel={() => setShowCancelModal(true)}
        />
      </div>

      <CancelModal
        open={showCancelModal}
        orderLabel={
          selectedOrder?.tableNumber
            ? `Table ${selectedOrder.tableNumber}`
            : 'takeout order'
        }
        onCancel={() => setShowCancelModal(false)}
        onConfirm={handleRequestCancellation}
      />
    </div>
  );
};

export default CashierDashboard;
