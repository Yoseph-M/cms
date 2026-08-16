import React, { useState, useEffect, useRef, Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { Order, PaymentMethod } from '../../types';
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
  X,
  Keyboard,
  Inbox,
  ChevronRight,
  CircleDot,
  Hash,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { PageSkeleton } from '../../components/common/PageSkeleton';
import { formatCurrency } from '../../utils/currency';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { cn } from '../../lib/utils';
import { extractErrorMessage, extractErrorDetails } from '../../utils/errorHandler';

const CashierOrderingPanel = lazy(() =>
  import('../../components/cashier/CashierOrderingPanel').then((m) => ({
    default: m.CashierOrderingPanel,
  }))
);

/* ─── Elapsed-time hook (ticks every 5s for a live feel) ─── */
function useElapsedTime(createdAt: string) {
  const [elapsed, setElapsed] = useState({ mins: 0, secs: 0 });
  const [isWarning, setIsWarning] = useState(false);
  const [isDanger, setIsDanger] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Date.now() - new Date(createdAt).getTime());
      const total = Math.floor(diff / 1000);
      setElapsed({ mins: Math.floor(total / 60), secs: total % 60 });
      const mins = Math.floor(total / 60);
      setIsWarning(mins >= 15 && mins < 30);
      setIsDanger(mins >= 30);
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return { elapsed, isWarning, isDanger };
}

const formatElapsed = (e: { mins: number; secs: number }) =>
  e.mins >= 1 ? `${e.mins}m ${e.secs.toString().padStart(2, '0')}s` : `${e.secs}s`;

/* ─── Payment method visual config ─── */
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

/* ─── Order ticket card ─── */
type FilterKey = 'all' | 'needsPayment' | 'fresh' | 'waiting';

const OrderCard = React.forwardRef<HTMLDivElement, {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
}>(({ order, isSelected, onClick }, ref) => {
  const { elapsed, isWarning, isDanger } = useElapsedTime(order.createdAt);
  const { t } = useTranslation('cashier');

  let statusBadge: React.ReactNode;
  if (order.status === 'PAID') statusBadge = <Badge variant="success">{t('queue.status.paid', { defaultValue: 'Paid' })}</Badge>;
  else if (order.status === 'CANCELLED') statusBadge = <Badge variant="error">{t('queue.status.cancelled', { defaultValue: 'Cancelled' })}</Badge>;
  else if (order.cancellationReason) statusBadge = <Badge variant="warning">{t('queue.status.cancelReq', { defaultValue: 'Cancel Req' })}</Badge>;
  else if (order.status === 'SERVED') statusBadge = <Badge variant="default">Ready to pay</Badge>;
  else statusBadge = <Badge variant="neutral">In kitchen</Badge>;

  const tableLabel = order.tableNumber
    ? `${t('queue.table')} ${order.tableNumber}`
    : t('queue.takeout');

  const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      layout
      ref={ref}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
      whileHover={!isSelected ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onClick={onClick}
      onKeyDown={handleKey}
      tabIndex={0}
      role="button"
      aria-label={`${t('queue.orderLabel')} ${order.clientOrderId.slice(0, 8)} ${tableLabel}`}
      className={cn(
        'group relative cursor-pointer rounded-2xl text-left transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'bg-card border p-4 pb-5 flex flex-col gap-3 min-h-[150px] overflow-hidden',
        isSelected
          ? 'border-primary shadow-brand-lg ring-1 ring-primary/40 bg-gradient-to-br from-card via-card to-primary/[0.04]'
          : 'border-border hover:border-primary/40 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_14px_-8px_rgba(59,130,246,0.18)] hover:shadow-brand',
      )}
    >
      {/* Brand accent strip — pulses on selected */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 bg-brand-gradient transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
        )}
      />

      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
              order.tableNumber
                ? isSelected
                  ? 'bg-brand-gradient text-white border-transparent shadow-brand'
                  : 'bg-primary/10 text-primary border-primary/20'
                : isSelected
                ? 'bg-cyan-500 text-white border-transparent shadow-cyan'
                : 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
            )}
          >
            {order.tableNumber ? (
              <span className="font-display font-bold text-base leading-none">{order.tableNumber}</span>
            ) : (
              <ShoppingCart className="w-4.5 h-4.5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {order.tableNumber ? t('queue.table') : t('queue.takeout')}
            </p>
            <p className="font-display text-lg font-semibold text-foreground leading-tight truncate">
              {order.clientOrderId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        {statusBadge}
      </div>

      <div className="flex justify-between items-end">
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold tabular-nums border',
            isDanger
              ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse'
              : isWarning
              ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30'
              : 'bg-secondary/60 text-muted-foreground border-transparent',
          )}
        >
          {isDanger ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          {formatElapsed(elapsed)}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </p>
          <p className={cn(
            'font-display text-xl font-bold tabular-nums leading-none mt-1',
            isSelected ? 'text-brand-gradient bg-clip-text text-transparent' : 'text-foreground',
          )}>
            {formatCurrency(order.totalAmount)}
          </p>
        </div>
      </div>

      {order.waiter && (
        <div className="-mx-4 -mb-5 px-4 py-2 border-t border-border/60 bg-secondary/30 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CircleDot className="w-3 h-3" />
          <span className="truncate">{t('queue.by')} <span className="font-medium text-foreground">{order.waiter.name}</span></span>
        </div>
      )}
    </motion.div>
  );
});
OrderCard.displayName = 'OrderCard';

/* ─── KPI tile ─── */
const KpiTile: React.FC<{
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: 'primary' | 'accent' | 'success' | 'warning';
  hint?: string;
}> = ({ label, value, icon, tone, hint }) => {
  const toneClasses: Record<typeof tone, string> = {
    primary: 'from-primary/15 to-primary/5 text-primary border-primary/20',
    accent:  'from-cyan-500/15 to-cyan-500/5 text-cyan-600 border-cyan-500/20',
    success: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 border-emerald-500/20',
    warning: 'from-[hsl(var(--warning))]/15 to-[hsl(var(--warning))]/5 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/25',
  };
  return (
    <div className={cn(
      'relative flex items-center gap-3 rounded-xl border bg-gradient-to-br backdrop-blur-sm',
      'px-3.5 py-2.5 min-w-0',
      toneClasses[tone],
    )}>
      <div className="w-8 h-8 rounded-lg bg-background/70 border border-current/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80 truncate">{label}</p>
        <p className="font-display text-lg font-bold tabular-nums leading-tight truncate">{value}</p>
        {hint && <p className="text-[10px] opacity-70 truncate">{hint}</p>}
      </div>
    </div>
  );
};

/* ─── Main Cashier Dashboard ─── */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation('cashier');

  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const settingQuery = useSystemSettingQuery('cashierOrderingEnabled');
  const tableCountQuery = useSystemSettingQuery('tableCount');

  const [cashierOrderingEnabled, setCashierOrderingEnabled] = useState(false);
  const [tableCount, setTableCount] = useState(12);

  useEffect(() => {
    if (settingQuery.data) {
      setCashierOrderingEnabled(settingQuery.data.value === 'true');
    }
  }, [settingQuery.data]);

  useEffect(() => {
    if (tableCountQuery.data) {
      const val = parseInt(tableCountQuery.data.value ?? '', 10);
      setTableCount(isNaN(val) ? 12 : val);
    }
  }, [tableCountQuery.data]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { value: string }) => {
      setCashierOrderingEnabled(payload.value === 'true');
      queryClient.setQueryData(['systemSetting', 'cashierOrderingEnabled'], (old: any) =>
        old ? { ...old, value: payload.value } : old
      );
    };
    const tableCountHandler = (payload: { value: string }) => {
      const val = parseInt(payload.value, 10);
      setTableCount(isNaN(val) ? 12 : val);
      queryClient.setQueryData(['systemSetting', 'tableCount'], (old: any) =>
        old ? { ...old, value: payload.value } : old
      );
    };
    socket.on('settings:cashierOrderingChanged', handler);
    socket.on('settings:tableCountChanged', tableCountHandler);
    return () => {
      socket.off('settings:cashierOrderingChanged', handler);
      socket.off('settings:tableCountChanged', tableCountHandler);
    };
  }, [socket, queryClient]);

  const [mode, setMode] = useState<'queue' | 'tables' | 'order'>('queue');
  const [tableForNewOrder, setTableForNewOrder] = useState('');
  useEffect(() => {
    if (!cashierOrderingEnabled && mode === 'order') {
      setMode('queue');
    }
  }, [cashierOrderingEnabled, mode]);

  interface PrinterFailureEvent {
    station: string;
    ip: string;
    port: number;
    orderId?: string;
    failedAt: string;
  }

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [printerFailures, setPrinterFailures] = useState<PrinterFailureEvent[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const isSettlingRef = useRef(false);

  // Cancellation
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED'),
    [orders],
  );
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || activeOrders[0];

  // Filtering
  const filteredOrders = useMemo(() => {
    let list = activeOrders;
    if (filter === 'needsPayment') list = list.filter((o) => o.status === 'SERVED');
    else if (filter === 'waiting') list = list.filter((o) => o.status !== 'SERVED');
    else if (filter === 'fresh') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
  }, [activeOrders, filter, search]);

  // KPIs
  const todayRevenue = useMemo(
    () => orders.filter((o) => o.status === 'PAID').reduce((acc, o) => acc + o.totalAmount, 0),
    [orders],
  );
  const settledCount = useMemo(
    () => orders.filter((o) => o.status === 'PAID').length,
    [orders],
  );
  const avgTicket = settledCount > 0 ? todayRevenue / settledCount : 0;
  const oldestWaitMins = useMemo(() => {
    if (activeOrders.length === 0) return 0;
    const oldest = activeOrders.reduce((a, b) =>
      new Date(a.createdAt).getTime() < new Date(b.createdAt).getTime() ? a : b,
    );
    return Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 60000);
  }, [activeOrders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inForm = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if (e.key === 'Escape') {
        if (showCancelModal) {
          e.preventDefault();
          setShowCancelModal(false);
          setCancelReason('');
          return;
        }
        if (mode === 'order') {
          e.preventDefault();
          setMode('queue');
          return;
        }
        if (selectedOrderId) {
          e.preventDefault();
          setSelectedOrderId(null);
        }
        return;
      }

      if (mode === 'order') return;
      if (inForm) return;

      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const source = filteredOrders.length ? filteredOrders : activeOrders;
        if (source.length === 0) return;
        const currentIdx = selectedOrder ? source.findIndex((o) => o.id === selectedOrder.id) : -1;
        const nextIdx = currentIdx < source.length - 1 ? currentIdx + 1 : 0;
        const next = source[nextIdx];
        if (next) {
          setSelectedOrderId(next.id);
          requestAnimationFrame(() => cardRefs.current.get(next.id)?.focus());
        }
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const source = filteredOrders.length ? filteredOrders : activeOrders;
        if (source.length === 0) return;
        const currentIdx = selectedOrder ? source.findIndex((o) => o.id === selectedOrder.id) : 0;
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : source.length - 1;
        const prev = source[prevIdx];
        if (prev) {
          setSelectedOrderId(prev.id);
          requestAnimationFrame(() => cardRefs.current.get(prev.id)?.focus());
        }
        return;
      }

      if (!selectedOrder || selectedOrder.status === 'PAID' || selectedOrder.status === 'CANCELLED') return;

      if (e.key === '1') { e.preventDefault(); setPaymentMethod('CASH'); return; }
      if (e.key === '2') { e.preventDefault(); setPaymentMethod('CARD'); return; }
      if (e.key === '3') { e.preventDefault(); setPaymentMethod('MOBILE'); return; }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isPrinting && !printed) {
          void handleMarkPaid(selectedOrder.id);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrders, filteredOrders, selectedOrder?.id, selectedOrder?.status, paymentMethod, mode, showCancelModal, isPrinting, printed]);

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('order:new', (newOrder: Order) => {
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    });
    socket.on('order:updated', (updatedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    });
    socket.on('order:cancelled', (cancelledOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === cancelledOrder.id ? cancelledOrder : o)));
    });
    // Cancellation request events
    socket.on('cancellation:requested', (payload: { order: Order }) => {
      // Update order to show cancellation request
      setOrders((prev) => prev.map((o) => (o.id === payload.order.id ? payload.order : o)));
      addToast({ type: 'info', title: 'Cancellation Requested', message: `Order ${payload.order.clientOrderId} cancellation pending approval` });
    });
    socket.on('cancellation:rejected', (payload: { request: { orderId: string; rejectedReason: string } }) => {
      addToast({ type: 'warning', title: 'Cancellation Rejected', message: payload.request.rejectedReason });
      // Refresh order to clear cancellation status
      axiosClient.get(`/orders/${payload.request.orderId}`).then((res) => {
        setOrders((prev) => prev.map((o) => (o.id === payload.request.orderId ? res.data : o)));
      });
    });
    socket.on('printer:failed', (payload: PrinterFailureEvent) => {
      setPrinterFailures((prev) => [...prev, payload]);
    });
    return () => {
      socket.off('order:new');
      socket.off('order:updated');
      socket.off('order:cancelled');
      socket.off('cancellation:requested');
      socket.off('cancellation:rejected');
      socket.off('printer:failed');
    };
  }, [socket]);

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/orders');
      setOrders(res.data.data || res.data); // Support both paginated and flat arrays
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch active queue'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (orderId: string, retryCount = 0) => {
    if (retryCount === 0 && isSettlingRef.current) return;
    if (retryCount === 0) isSettlingRef.current = true;

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = [500, 1000, 2000]; // Exponential backoff
    
    setIsPrinting(true);
    setPrinted(false);
    let isConcurrentError = false;
    try {
      // Use new settlements endpoint instead of deprecated /pay endpoint
      const order = orders.find(o => o.id === orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const res = await axiosClient.post(`/orders/${orderId}/settlements`, {
        amountMinor: order.totalAmount,
        method: paymentMethod,
        reference: '', // External transaction reference (optional)
        note: 'Settlement recorded via Cashier Dashboard',
      }, {
        headers: {
          'Idempotency-Key': `settle-full-${orderId}`
        }
      });
      
      // Update orders list with the returned order object
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data.order : o)));

      const tableText = res.data.order.tableNumber
        ? t('toasts.tableText', { table: res.data.order.tableNumber })
        : t('toasts.takeoutText');
      addToast({ type: 'success', title: t('toasts.settled', { tableText }) });

      setTimeout(() => {
        setIsPrinting(false);
        setPrinted(true);
        setTimeout(() => setPrinted(false), 3000);
      }, 800);
    } catch (err: any) {
      // Check if it's a concurrent modification error and we can retry
      const errorDetails = extractErrorDetails(err);
      isConcurrentError = errorDetails.code === 'CONCURRENT_MODIFICATION';
      
      if (isConcurrentError && retryCount < MAX_RETRIES) {
        // Automatic retry with backoff
        const delay = RETRY_DELAY_MS[retryCount];
        console.log(`Concurrent modification detected. Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        
        // Show brief feedback
        if (retryCount === 0) {
          addToast({ 
            type: 'info', 
            title: 'Retrying...', 
            message: 'Order was being updated. Retrying automatically.' 
          });
        }
        
        // Wait and retry
        setTimeout(() => {
          handleMarkPaid(orderId, retryCount + 1);
        }, delay);
        return;
      }
      
      // Max retries reached or non-retryable error
      setIsPrinting(false);
      
      if (isConcurrentError && retryCount >= MAX_RETRIES) {
        addToast({ 
          type: 'error', 
          title: t('toasts.paymentFailed'), 
          message: 'Order is being modified by another user. Please wait and try again.' 
        });
      } else {
        addToast({ 
          type: 'error', 
          title: t('toasts.paymentFailed'), 
          message: extractErrorMessage(err) 
        });
      }
    } finally {
      if (retryCount === 0 || !isConcurrentError) {
        isSettlingRef.current = false;
      }
    }
  };

  // Request cancellation (new workflow)
  const handleRequestCancellation = async () => {
    if (!selectedOrderId || !cancelReason.trim()) return;
    try {
      // Use new cancellation request endpoint
      await axiosClient.post(`/orders/${selectedOrderId}/cancellation-request`, { 
        reason: cancelReason 
      });
      addToast({ type: 'success', title: t('toasts.cancelRequested'), message: 'Waiting for manager approval' });
      setShowCancelModal(false);
      setCancelReason('');
      // Refresh order to get updated status
      const res = await axiosClient.get(`/orders/${selectedOrderId}`);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrderId ? res.data : o)));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      addToast({ type: 'error', title: t('toasts.cancelFailed'), message: error.response?.data?.error || 'Failed to request cancellation' });
    }
  };

  // ─── Order mode full-page ───
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
          <CashierOrderingPanel initialTableNumber={tableForNewOrder}
            onOrderCreated={() => {
              void fetchOrders();
              setMode('queue');
            }}
          />
        </Suspense>
      </div>
    );
  }

  // ─── Table map mode ───
  if (mode === 'tables' && cashierOrderingEnabled) {
    const tableNumbers = Array.from({ length: tableCount }, (_, index) => String(index + 1));
    const occupiedCount = tableNumbers.filter(n => activeOrders.some(o => o.tableNumber === n)).length;
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
              <span className="w-7 h-7 rounded-lg bg-cyan-500 text-white flex items-center justify-center shadow-cyan">
                <Armchair className="w-3.5 h-3.5" />
              </span>
              Table Map
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-semibold">
              {tableNumbers.length - occupiedCount} free
            </span>
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">
              {occupiedCount} occupied
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <p className="mb-5 text-sm text-muted-foreground">
            Tap a table to start an order, or jump to its active ticket.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {tableNumbers.map(number => {
              const order = activeOrders.find(item => item.tableNumber === number);
              const needsPayment = order?.status === 'SERVED';
              return (
                <motion.button
                  key={number}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (order) { setSelectedOrderId(order.id); setMode('queue'); }
                    else { setTableForNewOrder(number); setMode('order'); }
                  }}
                  className={cn(
                    'relative rounded-2xl border p-4 text-left transition-all overflow-hidden min-h-[140px] flex flex-col',
                    order
                      ? needsPayment
                        ? 'border-[hsl(var(--warning))]/40 bg-gradient-to-br from-[hsl(var(--warning))]/15 to-[hsl(var(--warning))]/5 shadow-[0_8px_24px_-12px_hsl(var(--warning)/0.45)]'
                        : 'border-primary/40 bg-gradient-to-br from-primary/15 to-primary/5 shadow-brand'
                      : 'border-border bg-card hover:border-primary/40 hover:shadow-brand',
                  )}
                >
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-gradient opacity-0 group-hover:opacity-100" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Table</p>
                  <p className="mt-1 font-display text-4xl font-bold tabular-nums leading-none text-foreground">{number}</p>
                  <div className="mt-auto pt-3 space-y-1">
                    <p className={cn(
                      'text-[11px] font-bold uppercase tracking-wider',
                      order
                        ? needsPayment
                          ? 'text-[hsl(var(--warning))]'
                          : 'text-primary'
                        : 'text-emerald-600',
                    )}>
                      {order ? (needsPayment ? 'Ready to pay' : 'Occupied') : 'Available'}
                    </p>
                    {order && (
                      <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(order.totalAmount)}</p>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  // ─── Default: queue + detail ───
  return (
    <div className="h-full flex flex-col bg-app-gradient overflow-hidden text-foreground">
      {/* Printer Failure Banner */}
      <AnimatePresence>
        {printerFailures.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gradient-to-r from-destructive to-rose-500 text-destructive-foreground px-6 py-3 flex justify-center items-center gap-3 shadow-sm z-10 overflow-hidden"
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold text-sm">Printer failure detected! Some receipts did not print.</span>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 ml-2" onClick={() => setPrinterFailures([])}>
              Dismiss
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar — brand block + KPIs */}
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

        <div className="hidden md:flex flex-1 max-w-3xl items-center gap-2">
          <KpiTile
            label="Today revenue"
            value={formatCurrency(todayRevenue)}
            icon={<TrendingUp className="w-4 h-4" />}
            tone="success"
            hint={`${settledCount} settled`}
          />
          <KpiTile
            label="Active tickets"
            value={activeOrders.length}
            icon={<ListOrdered className="w-4 h-4" />}
            tone="primary"
            hint={activeOrders.length === 0 ? 'All clear' : 'On the floor'}
          />
          <KpiTile
            label="Avg ticket"
            value={avgTicket > 0 ? formatCurrency(avgTicket) : '—'}
            icon={<Sparkles className="w-4 h-4" />}
            tone="accent"
          />
          <KpiTile
            label="Oldest wait"
            value={activeOrders.length === 0 ? '—' : `${oldestWaitMins}m`}
            icon={<Timer className="w-4 h-4" />}
            tone={oldestWaitMins >= 30 ? 'warning' : oldestWaitMins >= 15 ? 'warning' : 'primary'}
            hint={oldestWaitMins >= 30 ? 'Check now' : oldestWaitMins >= 15 ? 'Watch' : undefined}
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

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Queue (left) */}
        <div className="w-3/5 lg:w-2/3 flex flex-col overflow-hidden border-r border-border">
          {/* Filter strip */}
          <div className="px-6 pt-5 pb-3 flex items-center gap-2 shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search table, order, waiter…"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary/50 border border-transparent hover:border-border focus:border-primary focus:bg-background focus:shadow-[0_0_0_4px_hsl(217_91%_60%/0.12)] text-sm outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-border/60">
              {([
                { k: 'all',           label: 'All',          icon: ListOrdered },
                { k: 'needsPayment',  label: 'Ready to pay', icon: CheckCircle2 },
                { k: 'waiting',       label: 'In kitchen',   icon: Timer },
                { k: 'fresh',         label: 'Newest',       icon: Sparkles },
              ] as { k: FilterKey; label: string; icon: React.FC<{ className?: string }> }[]).map(({ k, label, icon: Icon }) => {
                const active = filter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all',
                      active
                        ? 'bg-card text-primary shadow-sm border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground border border-transparent',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {k === 'needsPayment' && (
                      <span className={cn(
                        'ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
                        active ? 'bg-primary text-primary-foreground' : 'bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]',
                      )}>
                        {activeOrders.filter(o => o.status === 'SERVED').length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto text-xs text-muted-foreground hidden lg:flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↑</kbd><kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↓</kbd> navigate</span>
              <span className="inline-flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↵</kbd> settle</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {isLoading ? (
              <LoadingState message={t('queue.loadingQueue')} />
            ) : error ? (
              <ErrorState message={error} onRetry={fetchOrders} />
            ) : (
              <LayoutGroup>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        ref={(node) => { cardRefs.current.set(order.id, node); }}
                        order={order}
                        isSelected={selectedOrder?.id === order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
                {filteredOrders.length === 0 && (
                  <EmptyState
                    icon={activeOrders.length === 0 ? <Inbox className="w-7 h-7" /> : <Search className="w-7 h-7" />}
                    title={activeOrders.length === 0 ? t('queue.noActiveOrders', { defaultValue: 'No active orders' }) : 'No matches'}
                    message={activeOrders.length === 0
                      ? t('queue.noActiveOrdersMsg', { defaultValue: 'New tickets will show up here automatically.' })
                      : 'Try a different filter or search term.'}
                  />
                )}
              </LayoutGroup>
            )}
          </div>
        </div>

        {/* Active Order Detail (right) */}
        <div className="w-2/5 lg:w-1/3 flex flex-col bg-card/60 backdrop-blur-sm relative overflow-hidden">
          <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent" />
          <AnimatePresence mode="wait">
            {selectedOrder ? (
              <motion.div
                key={selectedOrder.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex flex-col h-full"
              >
                {/* Detail header */}
                <div className="p-6 border-b border-border bg-gradient-to-b from-primary/[0.04] to-transparent">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">
                          {selectedOrder.clientOrderId.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <h2 className="font-display text-3xl font-bold tracking-tight text-brand-gradient bg-clip-text text-transparent leading-none">
                        {selectedOrder.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'Takeout'}
                      </h2>
                      {selectedOrder.waiter && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {t('orderDetail.orderedBy')}{' '}
                          <span className="font-semibold text-foreground">{selectedOrder.waiter.name}</span>
                        </p>
                      )}
                    </div>
                    {selectedOrder.status === 'PAID' && <Badge variant="success">Paid</Badge>}
                    {selectedOrder.status === 'CANCELLED' && <Badge variant="error">Cancelled</Badge>}
                    {selectedOrder.status === 'SERVED' && <Badge variant="default">Ready</Badge>}
                    {selectedOrder.cancellationReason && <Badge variant="warning">Cancel Req</Badge>}
                  </div>
                  {selectedOrder.cancellationReason && (
                    <div className="mt-4 p-3 bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg text-[hsl(var(--warning))] text-sm">
                      <strong className="block text-[10px] uppercase tracking-wider mb-1">
                        {t('orderDetail.cancelRequested')}
                      </strong>
                      {selectedOrder.cancellationReason}
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40 last:border-0"
                    >
                      <div className="flex gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-display font-bold text-sm shrink-0">
                          {item.quantity}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{item.name}</p>
                          {item.notes && (
                            <p className="text-muted-foreground italic text-xs mt-0.5 line-clamp-2">{item.notes}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-foreground tabular-nums shrink-0">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pay block */}
                {selectedOrder.status !== 'PAID' && selectedOrder.status !== 'CANCELLED' ? (
                  <div className="p-6 bg-gradient-to-b from-secondary/30 to-secondary/60 border-t border-border space-y-4">
                    <div className="flex items-end justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t('orderDetail.total')}
                      </span>
                      <span className="font-display text-3xl font-bold tabular-nums text-foreground leading-none">
                        {formatCurrency(selectedOrder.totalAmount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_TILES.map((meta) => {
                        const Icon = meta.icon;
                        const active = paymentMethod === meta.pm;
                        return (
                          <motion.button
                            key={meta.pm}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setPaymentMethod(meta.pm)}
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
                            <kbd className={cn(
                              'absolute bottom-1 right-1 text-[9px] font-mono px-1 rounded',
                              active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                            )}>
                              {meta.hotkey}
                            </kbd>
                          </motion.button>
                        );
                      })}
                    </div>

                    <motion.div
                      whileTap={!isPrinting && !printed ? { scale: 0.98 } : undefined}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    >
                      <Button
                        size="lg"
                        className={cn(
                          'relative w-full h-14 text-base font-bold overflow-hidden',
                          !printed && 'bg-brand-gradient hover:opacity-95 shadow-brand-lg',
                          printed && 'bg-emerald-500 hover:bg-emerald-500 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]',
                        )}
                        onClick={() => handleMarkPaid(selectedOrder.id)}
                        disabled={isPrinting || printed}
                      >
                        {isPrinting ? (
                          <span className="flex items-center gap-2 text-white">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {t('orderDetail.processing')}
                          </span>
                        ) : printed ? (
                          <motion.span
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                            className="flex items-center gap-2 text-white"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                            {t('orderDetail.printed', { defaultValue: 'Receipt printed' })}
                            <Sparkles className="w-4 h-4" />
                          </motion.span>
                        ) : (
                          <span className="flex items-center gap-2 text-white">
                            {t('orderDetail.markPaid')}
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        )}
                      </Button>
                    </motion.div>

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
                        onClick={() => setShowCancelModal(true)}
                        className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
                      >
                        {t('orderDetail.cancelOrder')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-secondary/30 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      {selectedOrder.status === 'PAID' ? 'This ticket is settled.' : 'This ticket was cancelled.'}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/15 to-cyan-500/10 border border-primary/20 flex items-center justify-center mb-5">
                  <Receipt className="w-9 h-9 text-primary" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-500 animate-pulse" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground">Pick a ticket to get started</h3>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
                  {t('queue.selectOrder', { defaultValue: 'Select an order from the queue to take payment.' })}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↑</kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↓</kbd>
                  <span>navigate</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Cancel Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowCancelModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md"
            >
              <Card className="p-6 shadow-2xl border-border">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-display text-xl font-bold text-foreground">
                      {t('cancelModal.title')}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1.5">
                      {t('cancelModal.description')}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCancelModal(false)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('cancelModal.placeholder')}
                  className="w-full h-11 px-3.5 rounded-lg bg-secondary/50 border border-transparent hover:border-border focus:border-primary focus:bg-background focus:shadow-[0_0_0_4px_hsl(217_91%_60%/0.12)] text-sm outline-none transition-all mb-5"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setShowCancelModal(false)}>
                    {t('cancelModal.goBack')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRequestCancellation}
                    disabled={!cancelReason.trim()}
                    className="shadow-sm"
                  >
                    {t('cancelModal.confirmCancel')}
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
