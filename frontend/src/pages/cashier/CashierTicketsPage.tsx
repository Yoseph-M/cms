import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { useHeaderStore } from '../../store/headerStore';
import { Order, PaymentMethod } from '../../types';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage, extractErrorDetails } from '../../utils/errorHandler';
import { cn } from '../../lib/utils';
import { PageSkeleton } from '../../components/common/PageSkeleton';

// New subcomponents
import { QueueTabs, type SortKey } from '../../components/cashier/dashboard/QueueTabs';
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
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  CheckSquare,
  Ban,
  X,
  Sparkles,
  Keyboard,
  ChevronRight,
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
export const CashierTicketsPage: React.FC = () => {
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation('cashier');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Tickets', subtitle: 'Live order queue and payment collection' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

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
  const [sort, setSort] = useState<SortKey>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'served' | 'in_kitchen' | 'submitted'>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Payment / settlement state ── */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const isSettlingRef = useRef(false);

  // Reset payment state when selecting a different order
  useEffect(() => {
    setPhase('idle');
    setPaymentMethod('CASH');
    isSettlingRef.current = false;
  }, [selectedOrderId]);

  /* ── Cancellation ── */
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationState, setCancellationState] = useState<'idle' | 'processing' | 'complete'>('idle');
  const [cancelledOrderLabel, setCancelledOrderLabel] = useState('');

  /* ── Responsive ── */
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const sortedQueue = useMemo(() => {
    let list = sortedActiveOrders;
    if (sort === 'newest') {
      list = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sort === 'longer') {
      list = [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
  }, [sortedActiveOrders, sort, search]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

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
    const onPrinterFail = (p: PrinterFailureEvent) => setPrinterFailures((prev) => [...prev, p]);
    socket.on('order:new', onNew);
    socket.on('order:updated', onUpdate);
    socket.on('order:cancelled', onCancel);
    socket.on('printer:failed', onPrinterFail);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:updated', onUpdate);
      socket.off('order:cancelled', onCancel);
      socket.off('printer:failed', onPrinterFail);
    };
  }, [socket, addToast]);

  /* ─── Actions ─── */
  const MAX_SETTLE_RETRIES = 5;
  const SETTLE_BACKOFF_MS = [500, 1000, 2000, 4000, 5000];

  const handleMarkPaid = async (orderId: string, retryCount = 0) => {
    if (retryCount === 0 && isSettlingRef.current) return;
    if (retryCount === 0) isSettlingRef.current = true;
    setPhase('processing');

    try {
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found');

      // If the order is already settled in our local state, don't even try.
      // This can happen if a socket message arrived while we were waiting to retry.
      if (order.status === 'PAID') {
        setPhase('idle');
        isSettlingRef.current = false;
        return;
      }

      const res = await axiosClient.post(
        `/orders/${orderId}/settlements`,
        {
          amountMinor: order.totalAmount,
          method: paymentMethod,
          reference: '',
          note: 'Settlement recorded via Cashier Dashboard',
        },
        { headers: { 'Idempotency-Key': `settle-full-${orderId}-${user?.id || 'anon'}` } },
      );

      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data.order : o)));
      isSettlingRef.current = false; // Clear ref on success

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
      const errorDetails = extractErrorDetails(err);
      const isConcurrent = errorDetails.code === 'CONCURRENT_MODIFICATION';
      const isAlreadySettled = errorDetails.code === 'ALREADY_SETTLED';
      const isOverage = errorDetails.code === 'SETTLEMENT_OVERAGE';
      
      // For already settled or overage, don't retry - these are final states
      if (isAlreadySettled || isOverage) {
        setPhase('idle');
        
        let errorMessage = extractErrorMessage(err);
        let errorTitle = 'Payment Issue';
        
        if (isAlreadySettled) {
          errorMessage = 'This order has already been fully settled.';
          errorTitle = 'Already Settled';
        } else if (isOverage) {
          errorMessage = 'Settlement amount exceeds the remaining balance.';
          errorTitle = 'Overpayment Attempted';
        }
        
        // Refresh the order to show current state
        axiosClient.get(`/orders/${orderId}`)
          .then(res => setOrders(prev => prev.map(o => o.id === orderId ? res.data : o)))
          .catch(() => {});
        
        addToast({
          type: 'warning',
          title: errorTitle,
          message: errorMessage,
        });
        
        isSettlingRef.current = false; // Clear ref on terminal error
        return;
      }
      
      // Retry only for concurrent modification errors, with a max of 5 attempts
      if (isConcurrent && retryCount < MAX_SETTLE_RETRIES) {
        const delay = SETTLE_BACKOFF_MS[retryCount];
        if (retryCount === 0) {
          addToast({
            type: 'info',
            title: 'Retrying…',
            message: 'Order is being updated. Retrying automatically.',
          });
        } else if (retryCount === 2) {
          // Additional notification for persistent conflicts
          addToast({
            type: 'warning',
            title: 'Busy Order',
            message: 'This order is still being modified. Still trying…',
          });
        }
        setTimeout(() => handleMarkPaid(orderId, retryCount + 1), delay);
        return;
      }
      
      setPhase('idle');
      isSettlingRef.current = false; // Clear ref on terminal error
      
      // Provide specific error messages for other scenarios
      let errorMessage = extractErrorMessage(err);
      let errorTitle = t('toasts.paymentFailed');
      
      if (errorDetails.statusCode === 401) {
        errorMessage = 'Your session has expired. Please log in again.';
        errorTitle = 'Session Expired';
      } else if (errorDetails.message?.includes('cashier shift')) {
        errorMessage = 'CASH settlements require an active cashier shift. Please open a shift first.';
        errorTitle = 'Shift Required';
      } else if (isConcurrent) {
        errorMessage = 'Order is being modified by another user or process. Please try again.';
        // Also refresh the order
        axiosClient.get(`/orders/${orderId}`)
          .then(res => setOrders(prev => prev.map(o => o.id === orderId ? res.data : o)))
          .catch(() => {});
      }
      
      addToast({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
      });
    } finally {
      // Only clear the ref if we are not retrying and not in a nested call
      // The catch block already handles terminal errors and retries
    }
  };

  const handleRequestCancellation = async (reason: string) => {
    if (!selectedOrderId || !reason.trim() || cancellationState === 'processing') return;
    const orderLabel = selectedOrder?.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'This order';
    setCancellationState('processing');
    try {
      const res = await axiosClient.post(`/orders/${selectedOrderId}/cancel`, { reason });
      setOrders((prev) => prev.map((o) => (o.id === selectedOrderId ? res.data : o)));
      setCancelledOrderLabel(orderLabel);
      setCancellationState('complete');
    } catch (err: any) {
      setCancellationState('idle');
      addToast({
        type: 'error',
        title: t('toasts.cancelFailed', { defaultValue: 'Cancel failed' }),
        message: extractErrorMessage(err, 'Failed to cancel the order.'),
      });
    }
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancellationState('idle');
    setCancelledOrderLabel('');
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
        closeCancelModal();
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
        <div className="flex-1 min-h-0 overflow-hidden">
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

      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Service desk</p>
              <h1 className="font-display text-lg font-bold leading-tight tracking-tight text-slate-950">Tickets</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {cashierOrderingEnabled && (
              <Button
                id="cashier-new-order-btn"
                size="sm"
                onClick={() => setMode('tables')}
                className="h-10 px-4"
              >
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                New order
            </Button>
          )}
        </div>
        </div>
      </header>

      {/* Queue stays primary; selecting a ticket reveals the detail inspector at right. */}
      <div className="relative flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white/35">
          <QueueTabs
            active={sort}
            onChange={setSort}
            search={search}
            onSearchChange={setSearch}
          />
          <OrderList
            orders={sortedQueue}
            selectedId={selectedOrderId}
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

        <AnimatePresence initial={false}>
          {selectedOrder && (
            <motion.aside
              initial={isDesktop ? { width: 0, opacity: 0, x: 24 } : { opacity: 0, y: '100%' }}
              animate={isDesktop ? { width: 'min(430px, 42vw)', opacity: 1, x: 0 } : { opacity: 1, y: 0 }}
              exit={isDesktop ? { width: 0, opacity: 0, x: 24 } : { opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className={cn(
                "h-full min-h-0 self-stretch shrink-0 overflow-hidden border-l border-slate-200 bg-white",
                !isDesktop && "absolute inset-0 z-50 w-full shadow-2xl"
              )}
            >
              <OrderDetailPanel
                order={selectedOrder}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                phase={phase}
                onCollect={() => phase === 'idle' && handleMarkPaid(selectedOrder.id)}
                onCancel={() => setShowCancelModal(true)}
                onClose={() => setSelectedOrderId(null)}
                className="w-full h-full border-0 rounded-none shadow-none"
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <CancelModal
        open={showCancelModal}
        onCancel={closeCancelModal}
        onConfirm={handleRequestCancellation}
        busy={cancellationState === 'processing'}
        completed={cancellationState === 'complete'}
        orderLabel={
          cancellationState === 'complete'
            ? cancelledOrderLabel
            : selectedOrder?.tableNumber
              ? `Table ${selectedOrder.tableNumber}`
              : 'takeout order'
        }
      />
    </div>
  );
};

export default CashierTicketsPage;
