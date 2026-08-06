import React, { useState, useEffect } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { Order, PaymentMethod } from '../../types';
import { ReceiptModal } from '../../components/receipt/ReceiptModal';
import { AlertTriangle, Clock, Receipt } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency } from '../../utils/currency';

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
function OrderCard({
  order,
  isSelected,
  onClick,
}: {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { elapsed, isWarning, isDanger } = useElapsedTime(order.createdAt);

  let timeColor = 'text-muted-foreground';
  if (isWarning) timeColor = 'text-accent';
  if (isDanger) timeColor = 'text-destructive';

  let statusBadge: React.ReactNode;
  if (order.status === 'PAID') statusBadge = <Badge variant="success">Paid</Badge>;
  else if (order.status === 'CANCELLED') statusBadge = <Badge variant="error">Cancelled</Badge>;
  else if (order.cancellationReason) statusBadge = <Badge variant="warning">Cancel Req</Badge>;
  else statusBadge = <Badge variant="neutral">Active</Badge>;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={onClick}
      className={`ticket-tear relative bg-card cursor-pointer border rounded-xl transition-all duration-200 ${
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
          <h3 className="font-display text-xl font-semibold text-foreground leading-tight">
            {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
          </h3>
        </div>
        {statusBadge}
      </div>
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50">
          <Clock className={`w-3.5 h-3.5 ${timeColor}`} />
          <span className={`text-xs font-mono font-semibold tabular-nums ${timeColor}`}>
            {elapsed}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {order.items.reduce((acc, i) => acc + i.quantity, 0)} items
          </p>
          <p className="font-mono font-bold text-foreground text-lg tabular-nums">
            {formatCurrency(order.totalAmount)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Cashier Dashboard ─── */
export const CashierDashboard: React.FC = () => {
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [printerFailures, setPrinterFailures] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);

  // Cancellation
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Receipt modal
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

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

  const activeOrders = orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || activeOrders[0];

  const todayRevenue = orders.filter((o) => o.status === 'PAID').reduce((acc, o) => acc + o.totalAmount, 0);
  const todayCount = orders.length;

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
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
                <AnimatePresence mode="popLayout">
                  {activeOrders.map((order) => (
                    <OrderCard
                      key={order.id}
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
                    <h2 className="font-display text-2xl font-semibold">
                      {selectedOrder.tableNumber ? `Table ${selectedOrder.tableNumber}` : 'Takeout'}
                    </h2>
                    <span className="font-mono text-sm text-muted-foreground">
                      #{selectedOrder.clientOrderId.slice(0, 8)}
                    </span>
                  </div>
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
                    <span className="font-display font-semibold text-2xl font-mono text-foreground">
                      {formatCurrency(selectedOrder.totalAmount)}
                    </span>
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
                              Printing receipt…
                            </motion.span>
                          ) : printed ? (
                            <motion.span
                              initial={{ scale: 0.8 }}
                              animate={{ scale: 1 }}
                              className="flex items-center gap-2"
                            >
                              ✓ Printed
                            </motion.span>
                          ) : (
                            'Mark Paid'
                          )}
                        </Button>
                      </motion.div>

                      <div className="pt-2 border-t border-border flex justify-between">
                        <Button variant="ghost" size="sm" onClick={() => setReceiptOrder(selectedOrder)}>
                          Preview Receipt
                        </Button>
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

                  {selectedOrder.status === 'PAID' && (
                    <Button className="w-full" variant="secondary" onClick={() => setReceiptOrder(selectedOrder)}>
                      Reprint Receipt
                    </Button>
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

      {/* Customer Receipt Dialog */}
      <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />
    </div>
  );
};
