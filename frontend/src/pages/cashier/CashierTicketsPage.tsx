import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
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
  ArrowLeft,
  ArrowRight,
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
  const tableCountQuery = useSystemSettingQuery('tableCount');
  const [tableCount, setTableCount] = useState(12);
  useEffect(() => {
    if (tableCountQuery.data) {
      const v = parseInt(tableCountQuery.data.value ?? '', 10);
      setTableCount(isNaN(v) ? 12 : v);
    }
  }, [tableCountQuery.data]);

  /* ── View mode ── */
  const [mode, setMode] = useState<'queue' | 'tables' | 'order'>('queue');
  const [tableForNewOrder, setTableForNewOrder] = useState('');
  // Menu search the new-order picker should open with (set by a global search hit).
  const [orderItemSearch, setOrderItemSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  /* ── Orders + selection ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'served' | 'in_kitchen' | 'submitted'>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Queue pagination ── */
  const QUEUE_PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  /* ── Payment / settlement state ── */
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const isSettlingRef = useRef(false);
  // A retry belongs to one payment attempt.  Without this guard, a retry timer
  // from a previously selected ticket can submit again after the cashier has
  // moved on (or after a socket event has already settled the order).
  const settlementAttemptRef = useRef(0);
  const settlementRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset payment state when selecting a different order
  useEffect(() => {
    setPhase('idle');
    setPaymentMethod('CASH');
    isSettlingRef.current = false;
    settlementAttemptRef.current += 1;
    if (settlementRetryTimerRef.current) {
      clearTimeout(settlementRetryTimerRef.current);
      settlementRetryTimerRef.current = null;
    }
  }, [selectedOrderId]);

  useEffect(() => () => {
    if (settlementRetryTimerRef.current) clearTimeout(settlementRetryTimerRef.current);
  }, []);

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

  // Client-side slice of the sorted active queue — keeps the custom
  // served-first/oldest-first ordering while capping rendered cards.
  const queueTotalPages = Math.max(1, Math.ceil(sortedQueue.length / QUEUE_PAGE_SIZE));
  const queueStart = (page - 1) * QUEUE_PAGE_SIZE;
  const pagedQueue = sortedQueue.slice(queueStart, queueStart + QUEUE_PAGE_SIZE);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  /* Open-order count per table, for the new-order table picker. */
  const openOrdersByTable = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of activeOrders) {
      if (!order.tableNumber) continue;
      counts[order.tableNumber] = (counts[order.tableNumber] ?? 0) + 1;
    }
    return counts;
  }, [activeOrders]);

  // Only active tickets are fetched from the server — paid/cancelled history
  // stays out of the queue (and out of every background poll).
  const ACTIVE_STATUSES = 'SUBMITTED,IN_KITCHEN,SERVED';

  /* ─────────────────────────────────────────────────────────
   * Data loading + realtime
   * ───────────────────────────────────────────────────────── */
  const fetchOrders = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/orders', {
        params: { statuses: ACTIVE_STATUSES, limit: 100 },
      });
      const fetched = res.data.data || res.data;
      setOrders(fetched);
      // Clamp the queue page if the fetched set shrank below the current page.
      const totalPages = Math.max(1, Math.ceil(fetched.length / QUEUE_PAGE_SIZE));
      if (page > totalPages) setPage(totalPages);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch active queue'));
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background refresh every 30s — new tickets show up without a manual
  // refresh, even if the socket connection is ever interrupted. Silent: it
  // never flashes the loading skeleton over an already-rendered queue.
  const fetchOrdersRef = useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;
  useEffect(() => {
    const id = setInterval(() => void fetchOrdersRef.current(true), 30_000);
    return () => clearInterval(id);
  }, []);

  // Any filter/sort/search change restarts the queue at page 1.
  useEffect(() => {
    setPage(1);
  }, [sort, statusFilter, search]);

  /* Settings realtime */
  useEffect(() => {
    if (!socket) return;
    const onTableCount = (p: { value: string }) => {
      const v = parseInt(p.value, 10);
      setTableCount(isNaN(v) ? 12 : v);
      queryClient.setQueryData(['systemSetting', 'tableCount'], (old: any) =>
        old ? { ...old, value: p.value } : old,
      );
    };
    socket.on('settings:tableCountChanged', onTableCount);
    return () => {
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
    // A kitchen ticket changing state (queued → printed/failed) should refresh
    // the badges on the cards, so the cashier sees what reached paper.
    const onPrintJobChange = () => void fetchOrdersRef.current(true);
    socket.on('order:new', onNew);
    socket.on('order:updated', onUpdate);
    socket.on('order:cancelled', onCancel);
    socket.on('printer:failed', onPrinterFail);
    socket.on('printJob:updated', onPrintJobChange);
    socket.on('printJob:failed', onPrintJobChange);
    socket.on('printJob:queued', onPrintJobChange);
    return () => {
      socket.off('order:new', onNew);
      socket.off('order:updated', onUpdate);
      socket.off('order:cancelled', onCancel);
      socket.off('printer:failed', onPrinterFail);
      socket.off('printJob:updated', onPrintJobChange);
      socket.off('printJob:failed', onPrintJobChange);
      socket.off('printJob:queued', onPrintJobChange);
    };
  }, [socket, addToast]);

  /* ─── Actions ─── */
  // A 409 can mean our first request actually committed but its response raced
  // with another order update.  Reconcile with the server before one bounded
  // retry; repeatedly posting the same payment only creates a noisy conflict
  // loop and cannot make a genuinely busy order succeed.
  const MAX_SETTLE_RETRIES = 1;
  const SETTLE_BACKOFF_MS = [500];

  const handleMarkPaid = async (orderId: string, retryCount = 0, attemptId?: number) => {
    if (retryCount === 0 && isSettlingRef.current) return;
    if (retryCount === 0) {
      isSettlingRef.current = true;
      settlementAttemptRef.current += 1;
      attemptId = settlementAttemptRef.current;
    }
    if (attemptId !== settlementAttemptRef.current) return;
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

      // Money never changes hands for a ticket the kitchen never received.
      // The detail panel hides the CTA in this case; this guard also covers the
      // keyboard shortcut and any stale retry that still holds an order id.
      if (order.latestPrintJob?.status !== 'PRINTED') {
        setPhase('idle');
        isSettlingRef.current = false;
        addToast({
          type: 'warning',
          title: 'Kitchen ticket not printed',
          message: 'Re-send the ticket to the printer before settling it.',
        });
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

      if (attemptId !== settlementAttemptRef.current) return;

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
          // Auto-close the order detail card after the settled ticket is acknowledged.
          setSelectedOrderId(null);
        }, 1400);
      }, 500);
    } catch (err: any) {
      if (attemptId !== settlementAttemptRef.current) return;

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
      
      // Reconcile first. A settlement can have committed while the order update
      // raced, or another cashier may have completed it. In both cases there is
      // nothing to retry and the stale retry closure must stop here.
      if (isConcurrent && retryCount < MAX_SETTLE_RETRIES) {
        try {
          const latest = await axiosClient.get(`/orders/${orderId}`);
          if (attemptId !== settlementAttemptRef.current) return;

          setOrders((prev) => prev.map((o) => (o.id === orderId ? latest.data : o)));
          if (latest.data.status === 'PAID' || latest.data.settlementStatus === 'SETTLED') {
            setPhase('printed');
            isSettlingRef.current = false;
            addToast({
              type: 'success',
              title: 'Payment recorded',
              message: 'This order was settled while the payment was being confirmed.',
            });
            return;
          }
        } catch {
          // The payment request's normal error path below will show a useful
          // message if the reconciliation request cannot be completed.
        }

        const delay = SETTLE_BACKOFF_MS[retryCount];
        addToast({
          type: 'info',
          title: 'Confirming payment…',
          message: 'The order changed while payment was recorded. Checking once more.',
        });
        settlementRetryTimerRef.current = setTimeout(() => {
          settlementRetryTimerRef.current = null;
          void handleMarkPaid(orderId, retryCount + 1, attemptId);
        }, delay);
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

  /** One-tap kitchen reprint from a ticket card. */
  const handleReprint = async (orderId: string) => {
    try {
      await axiosClient.post(`/print-jobs/reprint/${orderId}`, {});
      addToast({
        type: 'success',
        title: 'Reprint sent',
        message: 'The kitchen ticket was sent to the printer again.',
      });
      void fetchOrdersRef.current(true);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Could not reprint',
        message: extractErrorMessage(err, 'Please try again in a moment.'),
      });
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
      // Auto-close the order detail card once the order has been cancelled.
      // The CancelModal remains on top to show the success state until the
      // cashier dismisses it.
      setSelectedOrderId(null);
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

  /* Global-search deep links: focus the order builder on a menu item, or focus
     the queue on a table / order reference. */
  useEffect(() => {
    const state = location.state as
      | { newOrderItemSearch?: string; queueSearch?: string }
      | null;
    if (!state?.newOrderItemSearch && !state?.queueSearch) return;

    if (state.newOrderItemSearch) {
      setOrderItemSearch(state.newOrderItemSearch);
      setTableForNewOrder('');
      setMode('order');
    }
    if (state.queueSearch) {
      setSearch(state.queueSearch);
      setMode('queue');
    }
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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
  if (mode === 'order') {
    return (
      <div className="h-full flex flex-col bg-app-gradient text-foreground overflow-hidden">
        <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 sm:px-6 shrink-0 relative">
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
              initialSearch={orderItemSearch}
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

  if (mode === 'tables') {
    return (
      <TableMap
        tableCount={tableCount}
        openOrderCounts={openOrdersByTable}
        onTableClick={(tableNumber) => {
          // Always a brand-new ticket — an open order on the table is never
          // hijacked, so one table can carry several concurrent orders.
          setOrderItemSearch('');
          setTableForNewOrder(tableNumber);
          setMode('order');
        }}
        onViewOrders={(tableNumber) => {
          setSearch(tableNumber);
          const only = activeOrders.find((o) => o.tableNumber === tableNumber);
          setSelectedOrderId(only ? only.id : null);
          setMode('queue');
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
            <Button
              id="cashier-new-order-btn"
              size="sm"
              onClick={() => setMode('tables')}
              className="h-10 px-4"
            >
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              New order
            </Button>
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
            orders={pagedQueue}
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
            onReprint={handleReprint}
          />
          {sortedQueue.length > QUEUE_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white/60 shrink-0">
              <p className="text-[11px] text-slate-500 font-medium">
                Showing {queueStart + 1}–{Math.min(queueStart + QUEUE_PAGE_SIZE, sortedQueue.length)} of {sortedQueue.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-slate-500 font-mono">
                  {page} / {queueTotalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(queueTotalPages, p + 1))}
                  disabled={page >= queueTotalPages}
                  aria-label="Next page"
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
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
                onReprint={handleReprint}
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
