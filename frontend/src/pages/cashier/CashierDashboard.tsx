import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { Order, PaymentMethod } from '../../types';
import { AlertTriangle, Clock, ShoppingCart, ListOrdered, Armchair } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { PageSkeleton } from '../../components/common/PageSkeleton';
import { formatCurrency } from '../../utils/currency';
import { PageHeading, StatNumber } from '../../components/ui/Typography';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';

const CashierOrderingPanel = lazy(() =>
  import('../../components/cashier/CashierOrderingPanel').then((m) => ({
    default: m.CashierOrderingPanel,
  }))
);

/* ─── Elapsed-time hook ─── */
function useElapsedTime(createdAt: string) {
  const [elapsed, setElapsed] = useState('');
  const [isWarning, setIsWarning] = useState(false);
  const [isDanger, setIsDanger] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const diff = Date.now() - new Date(createdAt).getTime();
      const mins = Math.floor(diff / 60000);
      setElapsed(`${mins}m`);
      setIsWarning(mins >= 15 && mins < 30);
      setIsDanger(mins >= 30);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return { elapsed, isWarning, isDanger };
}

/* ─── Order ticket card (Framer layout animation) ─── */
const OrderCard = React.forwardRef<HTMLDivElement, {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
}>(({ order, isSelected, onClick }, ref) => {
  const { elapsed, isWarning, isDanger } = useElapsedTime(order.createdAt);

  let timeColor = 'text-muted-foreground';
  if (isWarning) timeColor = 'text-accent';
  if (isDanger) timeColor = 'text-destructive';

  let statusBadge: React.ReactNode;
  if (order.status === 'PAID') statusBadge = <Badge variant="success">Paid</Badge>;
  else if (order.status === 'CANCELLED') statusBadge = <Badge variant="error">Cancelled</Badge>;
  else if (order.cancellationReason) statusBadge = <Badge variant="warning">Cancel Req</Badge>;
  else statusBadge = <Badge variant="neutral">Active</Badge>;

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
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={onClick}
      onKeyDown={handleKey}
      tabIndex={0}
      role="button"
      aria-label={`Order ${order.clientOrderId.slice(0, 8)} ${order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}`}
      className={`ticket-tear relative bg-card cursor-pointer border rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        isSelected
          ? 'border-primary shadow-xl shadow-primary/15 ring-1 ring-primary'
          : 'border-border hover:border-primary/40 hover:shadow-md'
      } p-4 pb-7 flex flex-col justify-between min-h-[140px]`}
    >
      <div className="flex justify-between items-start gap-2 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Order
          </p>
          <PageHeading className="text-xl leading-tight">
            {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
          </PageHeading>
        </div>
        {statusBadge}
      </div>
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 w-fit">
            <Clock className={`w-3.5 h-3.5 ${timeColor}`} />
            <span className={`text-xs font-mono font-semibold tabular-nums ${timeColor}`}>
              {elapsed}
            </span>
          </div>
          {order.waiter && (
            <p className="text-[10px] text-muted-foreground px-1 truncate max-w-[100px]">
              by {order.waiter.name}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {order.items.reduce((acc, i) => acc + i.quantity, 0)} items
          </p>
          <StatNumber className="text-lg">
            {formatCurrency(order.totalAmount)}
          </StatNumber>
        </div>
      </div>
    </motion.div>
  );
});
OrderCard.displayName = 'OrderCard';

/* ─── Main Cashier Dashboard ─── */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();

  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Phase 14, §1.3 — live status of the cashier-ordering toggle.
  // `enabled` flips without a refresh when an Owner/Manager changes the setting
  // because we also subscribe to the `settings:cashierOrderingChanged` socket event.
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
      const val = parseInt(tableCountQuery.data.value, 10);
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

  // View mode: 'queue' (default, existing live-queue + payment surface) or
  // 'order' (the lazy-loaded ordering panel from §1.3).
  const [mode, setMode] = useState<'queue' | 'tables' | 'order'>('queue');
  const [tableForNewOrder, setTableForNewOrder] = useState('');
  // If the toggle is flipped off while the user is in 'order' mode, snap back
  // to 'queue' so we never render the panel for a disabled state.
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

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);

  // Cancellation
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);



  const activeOrders = orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || activeOrders[0];

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
        if (activeOrders.length === 0) return;
        const currentIdx = selectedOrder ? activeOrders.findIndex((o) => o.id === selectedOrder.id) : -1;
        const nextIdx = currentIdx < activeOrders.length - 1 ? currentIdx + 1 : 0;
        const next = activeOrders[nextIdx];
        if (next) {
          setSelectedOrderId(next.id);
          requestAnimationFrame(() => cardRefs.current.get(next.id)?.focus());
        }
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (activeOrders.length === 0) return;
        const currentIdx = selectedOrder ? activeOrders.findIndex((o) => o.id === selectedOrder.id) : 0;
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeOrders.length - 1;
        const prev = activeOrders[prevIdx];
        if (prev) {
          setSelectedOrderId(prev.id);
          requestAnimationFrame(() => cardRefs.current.get(prev.id)?.focus());
        }
        return;
      }

      if (!selectedOrder || selectedOrder.status === 'PAID' || selectedOrder.status === 'CANCELLED') return;

      if (e.key === '1') {
        e.preventDefault();
        setPaymentMethod('CASH');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        setPaymentMethod('CARD');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        setPaymentMethod('MOBILE');
        return;
      }

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
  }, [activeOrders, selectedOrder?.id, selectedOrder?.status, paymentMethod, mode, showCancelModal, isPrinting, printed]);

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
    socket.on('printer:failed', (payload: any) => {
      setPrinterFailures((prev) => [...prev, payload]);
    });
    return () => {
      socket.off('order:new');
      socket.off('order:updated');
      socket.off('order:cancelled');
      socket.off('printer:failed');
    };
  }, [socket]);

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/orders');
      setOrders(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch active queue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (orderId: string) => {
    setIsPrinting(true);
    setPrinted(false);
    try {
      const res = await axiosClient.patch(`/orders/${orderId}/pay`, { paymentMethod });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)));
      
      const tableText = res.data.tableNumber ? `Table ${res.data.tableNumber}'s` : 'Takeout order is';
      addToast({ type: 'success', title: `Nice — ${tableText} all settled` });

      setTimeout(() => {
        setIsPrinting(false);
        setPrinted(true);
        setTimeout(() => setPrinted(false), 3000);
      }, 800);
    } catch (err: any) {
      setIsPrinting(false);
      addToast({ type: 'error', title: 'Payment Failed', message: err.response?.data?.error });
    }
  };

  const handleConfirmCancel = async () => {
    if (!selectedOrderId || !cancelReason.trim()) return;
    try {
      const res = await axiosClient.patch(`/orders/${selectedOrderId}/cancel-confirm`, { reason: cancelReason });
      setOrders((prev) => prev.map((o) => (o.id === selectedOrderId ? res.data : o)));
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cancel Failed', message: err.response?.data?.error });
    }
  };

  const todayRevenue = orders.filter((o) => o.status === 'PAID').reduce((acc, o) => acc + o.totalAmount, 0);
  const todayCount = orders.length;

  // When the cashier-ordering toggle is on AND the user has selected "New
  // Order", mount the dedicated ordering panel. This is the entire dashboard
  // for that mode — the queue is still ticking in the background and the
  // panel will see the new order via the same socket events on switch-back.
  if (mode === 'order' && cashierOrderingEnabled) {
    return (
      <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
        <header className="h-14 bg-card/60 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode('queue')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Back to queue
            </button>
            <span className="font-display font-semibold text-base tracking-tight text-primary flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              New Order
            </span>
          </div>
        </header>
        <Suspense fallback={<PageSkeleton />}>
          <CashierOrderingPanel initialTableNumber={tableForNewOrder}
            onOrderCreated={() => {
              // After placing an order, hop back to the queue so the cashier
              // sees the new ticket in the live grid (the server already
              // emitted `order:new` on the socket, but a refetch is cheap
              // and guarantees the new ticket is visible).
              void fetchOrders();
              setMode('queue');
            }}
          />
        </Suspense>
      </div>
    );
  }

  if (mode === 'tables' && cashierOrderingEnabled) {
    const tableNumbers = Array.from({ length: tableCount }, (_, index) => String(index + 1));
    return <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-14 bg-card/60 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 shrink-0">
        <button onClick={() => setMode('queue')} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60"><ListOrdered className="w-3.5 h-3.5" />Back to queue</button>
        <span className="font-display font-semibold text-base text-primary flex items-center gap-2"><Armchair className="w-4 h-4" />Table map</span>
      </header>
      <main className="flex-1 overflow-y-auto p-6"><p className="mb-5 text-sm text-muted-foreground">Choose a table to start an order or open its active ticket.</p><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">{tableNumbers.map(number => {
        const order = activeOrders.find(item => item.tableNumber === number);
        const needsPayment = order?.status === 'SERVED';
        return <button key={number} onClick={() => { if (order) { setSelectedOrderId(order.id); setMode('queue'); } else { setTableForNewOrder(number); setMode('order'); } }} className={`min-h-32 rounded-xl border p-4 text-left transition-colors ${order ? needsPayment ? 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10' : 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/60 hover:bg-primary/5'}`}><p className="text-xs font-bold uppercase text-muted-foreground">Table</p><p className="mt-1 font-display text-3xl font-bold">{number}</p><p className={`mt-3 text-xs font-semibold ${order ? needsPayment ? 'text-[hsl(var(--warning))]' : 'text-primary' : 'text-[hsl(var(--success))]'}`}>{order ? needsPayment ? 'Needs payment' : 'Occupied' : 'Empty'}</p>{order && <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(order.totalAmount)}</p>}</button>;
      })}</div></main>
    </div>;
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden text-foreground">
      {/* Printer Failure Banner */}
      <AnimatePresence>
        {printerFailures.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-destructive text-destructive-foreground p-3 flex justify-center items-center gap-4 shadow-sm z-10 overflow-hidden"
          >
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold text-sm">Printer failure detected! Some receipts did not print.</span>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 ml-4" onClick={() => setPrinterFailures([])}>
              Dismiss
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Header */}
      <header className="h-14 bg-card/60 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2.5 text-primary font-display font-semibold text-base tracking-tight">
          Cashier Console
        </div>
        <div className="flex items-center gap-2 text-sm">
          {cashierOrderingEnabled && (
            <Button
              id="cashier-new-order-btn"
              size="sm"
              onClick={() => setMode('tables')}
              className="h-9"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
              Table map
            </Button>
          )}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground">{todayCount}</span>
            <span className="text-xs">orders</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary font-mono font-semibold tabular-nums">
            <span className="text-[10px] uppercase tracking-wider text-primary/70">Today</span>
            {formatCurrency(todayRevenue)}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Queue (Left) */}
        <div className="w-3/5 lg:w-2/3 p-6 overflow-y-auto">
          {isLoading ? (
            <LoadingState message="Loading live queue..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchOrders} />
          ) : (
            <LayoutGroup>
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {activeOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      ref={(node) => {
                        cardRefs.current.set(order.id, node);
                      }}
                      order={order}
                      isSelected={selectedOrder?.id === order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                    />
                  ))}
                </AnimatePresence>
                {activeOrders.length === 0 && (
                  <div className="col-span-full">
                    <EmptyState title="No active orders" message="New orders will appear here automatically." />
                  </div>
                )}
              </div>
            </LayoutGroup>
          )}
        </div>

        {/* Active Order Detail (Right) */}
        <div className="w-2/5 lg:w-1/3 bg-card border-l border-border flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          <AnimatePresence mode="wait">
            {selectedOrder ? (
              <motion.div
                key={selectedOrder.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col h-full"
              >
                <div className="p-6 border-b border-border">
                  <div className="flex justify-between items-center mb-1">
                    <PageHeading className="text-2xl">
                      {selectedOrder.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'Takeout'}
                    </PageHeading>
                    <span className="font-mono text-sm text-muted-foreground">
                      #{selectedOrder.clientOrderId.slice(0, 8)}
                    </span>
                  </div>
                  {selectedOrder.waiter && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ordered by <span className="font-semibold text-foreground">{selectedOrder.waiter.name}</span>
                    </p>
                  )}
                  {selectedOrder.cancellationReason && (
                    <div className="mt-3 p-3 bg-accent/10 border border-accent/30 rounded-lg text-accent text-sm">
                      <strong>Cancel requested:</strong> {selectedOrder.cancellationReason}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-sm py-2 border-b border-border/40 last:border-0">
                      <div className="flex gap-3">
                        <span className="font-mono font-bold text-primary w-6 text-center">{item.quantity}</span>
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.notes && <p className="text-muted-foreground italic text-xs mt-0.5">{item.notes}</p>}
                        </div>
                      </div>
                      <span className="font-mono text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="p-6 bg-secondary/50 border-t border-border space-y-5">
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-medium text-muted-foreground">Total</span>
                    <StatNumber className="text-2xl text-foreground">
                      {formatCurrency(selectedOrder.totalAmount)}
                    </StatNumber>
                  </div>

                  {selectedOrder.status !== 'PAID' && selectedOrder.status !== 'CANCELLED' && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {(['CASH', 'CARD', 'MOBILE'] as PaymentMethod[]).map((pm) => (
                          <button
                            key={pm}
                            onClick={() => setPaymentMethod(pm)}
                            className={`py-3 px-2 rounded-lg font-medium text-sm transition-all border-2 ${
                              paymentMethod === pm
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-transparent bg-background text-muted-foreground hover:bg-secondary shadow-sm'
                            }`}
                          >
                            {pm}
                          </button>
                        ))}
                      </div>

                      <motion.div
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      >
                        <Button
                          size="lg"
                          className="w-full h-14 text-base font-bold"
                          onClick={() => handleMarkPaid(selectedOrder.id)}
                          disabled={isPrinting || printed}
                        >
                          {isPrinting ? (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-center gap-2"
                            >
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                              />
                              Processing…
                            </motion.span>
                          ) : printed ? (
                            <motion.span
                              initial={{ scale: 0.8 }}
                              animate={{ scale: [0.8, 1.05, 1] }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="flex items-center gap-2"
                            >
                              ✓ Printed
                            </motion.span>
                          ) : (
                            'Mark Paid'
                          )}
                        </Button>
                      </motion.div>

                      <div className="pt-2 border-t border-border flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setShowCancelModal(true)}
                        >
                          Cancel Order
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center text-muted-foreground p-6 text-center"
              >
                Select an order from the queue to view details and collect payment.
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Card className="w-full max-w-md p-6 bg-card shadow-xl">
                <h3 className="font-display text-xl font-bold mb-2">Cancel Order</h3>
                <p className="text-sm text-muted-foreground mb-4">Please provide a reason for cancelling this order.</p>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer walked out"
                  className="w-full p-3 border border-input bg-background rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent outline-none mb-6 text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setShowCancelModal(false)}>Go Back</Button>
                  <Button variant="destructive" onClick={handleConfirmCancel} disabled={!cancelReason.trim()}>
                    Confirm Cancel
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
