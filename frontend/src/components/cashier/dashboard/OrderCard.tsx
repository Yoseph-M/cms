import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Clock,
  ShoppingCart,
  CheckCircle2,
  CircleDot,
  X,
  Timer,
  Flame,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import type { Order } from '../../../types';
import { useElapsedTime } from './hooks/useElapsedTime';
import { getOrderStatus, statusAccent, STATUS_LABEL } from './utils';

export interface OrderCardProps {
  order: Order;
  isSelected: boolean;
  onClick: () => void;
  cardRef?: (node: HTMLDivElement | null) => void;
}

/**
 * Ticket card — same shape as the original, with a status accent bar
 * so the cashier can scan ready-to-pay vs in-kitchen at a glance.
 */
export const OrderCard = React.forwardRef<HTMLDivElement, OrderCardProps>(
  ({ order, isSelected, onClick, cardRef }, ref) => {
    const elapsed = useElapsedTime(order.createdAt);
    const status = getOrderStatus(order);
    const accent = statusAccent(status);

    const tableLabel = order.tableNumber
      ? order.tableNumber
      : 'Takeout';
    const isTakeout = !order.tableNumber;
    const itemCount = (order.items || []).reduce((acc, i) => acc + i.quantity, 0);

    const handleKey = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };

    return (
      <motion.div
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (cardRef) cardRef(node);
        }}
        layout
        onClick={onClick}
        onKeyDown={handleKey}
        tabIndex={0}
        role="button"
        aria-label={`${order.tableNumber ? `Table ${tableLabel}` : 'Takeout'} order ${order.clientOrderId.slice(0, 8).toUpperCase()}`}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
        whileHover={!isSelected ? { y: -3 } : undefined}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className={cn(
          'group relative cursor-pointer rounded-2xl text-left transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'bg-card border p-4 pb-5 flex flex-col gap-3 min-h-[150px] overflow-hidden',
          isSelected
            ? 'border-primary shadow-brand-lg ring-1 ring-primary/40 bg-gradient-to-br from-card via-card to-primary/[0.04]'
            : 'border-border hover:border-primary/40 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_14px_-8px_rgba(59,130,246,0.18)] hover:shadow-brand',
        )}
      >
        {/* Brand accent strip — visible on selected, hint on hover */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-0.5 bg-brand-gradient transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
          )}
        />
        {/* Status accent bar (left) — keeps the colour cue from the redesign */}
        <span
          aria-hidden
          className={cn(
            'absolute left-0 inset-y-0 w-1 rounded-l-2xl',
            accent.bar,
            status === 'ready' && 'shadow-[0_0_10px_rgba(16,185,129,0.5)]',
          )}
        />

        <div className="pl-2.5">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                  isTakeout
                    ? isSelected
                      ? 'bg-cyan-500 text-white border-transparent shadow-cyan'
                      : 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20'
                    : isSelected
                      ? 'bg-brand-gradient text-white border-transparent shadow-brand'
                      : 'bg-primary/10 text-primary border-primary/20',
                )}
              >
                {isTakeout ? (
                  <ShoppingCart className="w-4 h-4" />
                ) : (
                  <span className="font-display font-bold text-base leading-none">{tableLabel}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {isTakeout ? 'Takeout' : 'Table'}
                </p>
                <p className="font-display text-lg font-semibold text-foreground leading-tight truncate">
                  {order.clientOrderId.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>

          <div className="flex justify-between items-end">
            <WaitChip elapsed={elapsed} />
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </p>
              <p
                className={cn(
                  'font-display text-xl font-bold tabular-nums leading-none mt-1',
                  isSelected
                    ? 'text-brand-gradient bg-clip-text text-transparent'
                    : 'text-foreground',
                )}
              >
                {formatCurrency(order.totalAmount)}
              </p>
            </div>
          </div>
        </div>

        {order.waiter && (
          <div className="-mx-4 -mb-5 px-4 py-2 border-t border-border/60 bg-secondary/30 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleDot className="w-3 h-3" />
            <span className="truncate">
              by <span className="font-medium text-foreground">{order.waiter.name}</span>
            </span>
          </div>
        )}
      </motion.div>
    );
  },
);
OrderCard.displayName = 'OrderCard';

const StatusBadge: React.FC<{ status: ReturnType<typeof getOrderStatus> }> = ({ status }) => {
  const accent = statusAccent(status);
  const Icon =
    status === 'ready'
      ? CheckCircle2
      : status === 'cooking'
        ? Flame
        : status === 'paid'
          ? CheckCircle2
          : status === 'cancelled'
            ? X
            : AlertTriangle;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
        accent.badge,
      )}
    >
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  );
};

const WaitChip: React.FC<{ elapsed: ReturnType<typeof useElapsedTime> }> = ({ elapsed }) => {
  const Icon =
    elapsed.tone === 'danger'
      ? AlertTriangle
      : elapsed.tone === 'warning'
        ? Timer
        : Clock;
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold tabular-nums border',
        elapsed.tone === 'danger'
          ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse'
          : elapsed.tone === 'warning'
            ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30'
            : 'bg-secondary/60 text-muted-foreground border-transparent',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {elapsed.display}
    </div>
  );
};
