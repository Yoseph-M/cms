import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Receipt, AlertTriangle, User, Clock } from 'lucide-react';
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
  className?: string;
}

/**
 * Right-hand detail panel. Uses the original layout: identity strip →
 * items list (flex-1, scrolls) → pay block. The pay block is my
 * improved PaymentPad.
 */
export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({
  order,
  paymentMethod,
  onPaymentMethodChange,
  phase,
  onCollect,
  onCancel,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-2/5 lg:w-1/3 flex flex-col bg-card/60 backdrop-blur-sm relative overflow-hidden',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-primary/40 to-transparent"
      />
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
}> = ({ order, paymentMethod, onPaymentMethodChange, phase, onCollect, onCancel }) => {
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
      className="flex flex-col h-full"
    >
      {/* Identity strip */}
      <div className="p-6 border-b border-border bg-gradient-to-b from-primary/[0.04] to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground">
                {order.clientOrderId.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-brand-gradient bg-clip-text text-transparent leading-none">
              {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeout'}
            </h2>
            {order.waiter && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('orderDetail.orderedBy')}{' '}
                <span className="font-semibold text-foreground">{order.waiter.name}</span>
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span
                className={cn(
                  'font-mono tabular-nums',
                  elapsed.tone === 'danger' && 'text-destructive font-semibold',
                  elapsed.tone === 'warning' && 'text-[hsl(var(--warning))] font-semibold',
                )}
              >
                {elapsed.display}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
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
        {order.cancellationReason && (
          <div className="mt-4 p-3 bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg text-[hsl(var(--warning))] text-sm">
            <strong className="block text-[10px] uppercase tracking-wider mb-1">
              {t('orderDetail.cancelRequested')}
            </strong>
            {order.cancellationReason}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        <OrderItemsList items={order.items || []} />
      </div>

      {/* Pay block — improved PaymentPad */}
      <div className="p-6 bg-gradient-to-b from-secondary/30 to-secondary/60 border-t border-border">
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
