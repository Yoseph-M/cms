import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Receipt, AlertTriangle, User, Clock, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';
import type { Order, PaymentMethod } from '../../../types';
import { getOrderStatus, statusAccent, STATUS_LABEL } from './utils';
import { useElapsedTime } from './hooks/useElapsedTime';
import { OrderItemsList } from './OrderItemsList';
import { PaymentPad, type PaymentPhase } from './PaymentPad';

export interface OrderDetailPanelProps {
  order: Order | null;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  phase: PaymentPhase;
  onCollect: () => void;
  onCancel: () => void;
  onClose?: () => void;
  className?: string;
}

/**
 * Right-hand detail panel: fixed identity strip → scrolling items → fixed
 * payment panel. Only the order items can grow beyond the available height.
 */
export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({
  order,
  paymentMethod,
  onPaymentMethodChange,
  phase,
  onCollect,
  onCancel,
  onClose,
  className,
}) => {
  return (
    <div
      className={cn(
        // h-full + min-h-0 lock the panel to the workspace height so it
        // does NOT extend when the queue list grows. The items area below
        // is the one that scrolls.
        'w-2/5 lg:w-1/3 min-h-0 flex flex-col bg-white text-slate-950 relative overflow-hidden',
        className,
      )}
    >
      <span aria-hidden className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <AnimatePresence mode="wait">
        {order ? (
          <DetailBody
            key={order.id}
            order={order}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={onPaymentMethodChange}
            phase={phase}
            onCollect={onCollect}
            onCancel={onCancel}
            onClose={onClose}
          />
        ) : (
          <EmptyDetail key="empty" />
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailBody: React.FC<{
  order: Order;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  phase: PaymentPhase;
  onCollect: () => void;
  onCancel: () => void;
  onClose?: () => void;
}> = ({ order, paymentMethod, onPaymentMethodChange, phase, onCollect, onCancel, onClose }) => {
  const { t } = useTranslation('cashier');
  const elapsed = useElapsedTime(order.createdAt);
  const status = getOrderStatus(order);
  const accent = statusAccent(status);
  const isClosed = order.status === 'PAID' || order.status === 'CANCELLED';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden"
    >
      {/* Identity strip - fixed at top */}
      <div className="relative shrink-0 p-5 sm:p-6 border-b border-slate-100 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono text-xs text-slate-400">
                {order.clientOrderId.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 leading-none">
              {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
            </h2>
            {order.waiter && (
              <p className="text-xs text-slate-400 mt-2">
                {t('orderDetail.orderedBy')}{' '}
                <span className="font-semibold text-slate-950">{order.waiter.name}</span>
              </p>
            )}
            <p className="text-[11px] text-slate-400 mt-1 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span
                className={cn(
                  'font-mono tabular-nums',
                  elapsed.tone === 'danger' && 'text-rose-600 font-semibold',
                  elapsed.tone === 'warning' && 'text-amber-600 font-semibold',
                )}
              >
                {elapsed.display}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {onClose && (
              <button type="button" onClick={onClose} className="-mr-1 -mt-1 mb-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-950" aria-label="Close ticket">
                <X className="w-4 h-4" />
              </button>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                accent.badge,
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>
      </div>

      {/* This is the only scroll region. It expands into spare space so the
          total/payment card stays anchored to the bottom of the inspector. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-1 bg-white">
        <div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Order summary</p><p className="text-[11px] text-slate-500">{(order.items || []).length} lines</p></div>
        <OrderItemsList items={order.items || []} />
      </div>

      {/* Payment summary remains visible regardless of the number of items. */}
      <div className="relative shrink-0 p-4 sm:p-5 bg-white border-t border-slate-100 text-slate-950">
        <PaymentPad
          total={order.totalAmount}
          method={paymentMethod}
          onMethodChange={onPaymentMethodChange}
          phase={phase}
          onCollect={onCollect}
          onCancel={onCancel}
          showCancel={!isClosed}
          isSettled={order.status === 'PAID'}
          isCancelled={order.status === 'CANCELLED'}
        />
      </div>
    </motion.div>
  );
};

const EmptyDetail: React.FC = () => {
  const { t } = useTranslation('cashier');
  return (
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
        {t('queue.selectOrder', {
          defaultValue: 'Select an order from the queue to take payment.',
        })}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↑</kbd>
        <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">↓</kbd>
        <span>navigate</span>
      </div>
    </motion.div>
  );
};
