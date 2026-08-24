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
  selectMode?: boolean;
  bulkSelected?: boolean;
  onToggleSelect?: () => void;
}

/**
 * Ticket card — same shape as the original, with a status accent bar
 * so the cashier can scan ready-to-pay vs in-kitchen at a glance.
 */
export const OrderCard = React.forwardRef<HTMLDivElement, OrderCardProps>(
  ({ order, isSelected, onClick, cardRef, selectMode, bulkSelected, onToggleSelect }, ref) => {
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
          'bg-white border px-4 py-3.5 overflow-hidden min-h-[112px]',
          isSelected
            ? 'border-slate-900 shadow-[0_14px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/10 bg-gradient-to-br from-white to-slate-50'
            : 'border-slate-200 hover:border-slate-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_18px_-14px_rgba(15,23,42,0.18)] hover:shadow-[0_14px_28px_-18px_rgba(15,23,42,0.30)]',
          selectMode && bulkSelected && 'border-primary ring-2 ring-primary bg-primary/5',
        )}
      >
        {/* Brand accent strip — visible on selected, hint on hover */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-slate-950 via-primary to-cyan-400 transition-opacity',
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

        {/* Bulk-select checkbox (select mode) */}
        {selectMode && (
          <span
            aria-hidden
            className={cn(
              'absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors shadow-sm',
              bulkSelected ? 'bg-primary border-primary' : 'bg-white/95 border-slate-300',
            )}
          >
            {bulkSelected && <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={3} />}
          </span>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border', isTakeout ? 'bg-cyan-50 text-cyan-700 border-cyan-100' : isSelected ? 'bg-slate-950 text-white border-slate-950' : 'bg-primary/10 text-primary border-primary/15')}>
              {isTakeout ? <ShoppingCart className="w-4 h-4" /> : <span className="font-display font-bold text-lg leading-none">{tableLabel}</span>}
            </div>
            <div className="min-w-0"><p className="font-display text-base font-bold text-slate-950 leading-tight truncate">{isTakeout ? 'Takeout' : `Table ${tableLabel}`}</p><p className="mt-1 font-mono text-[10px] tracking-wide text-slate-400">#{order.clientOrderId.slice(0, 6).toUpperCase()}</p></div>
          </div>
          {!selectMode && <StatusBadge status={status} />}
        </div>
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0 text-[11px] text-slate-500"><p>{itemCount} {itemCount === 1 ? 'item' : 'items'}{order.waiter && <span className="ml-1.5 inline-flex items-center gap-1 truncate"><CircleDot className="w-2.5 h-2.5" />{order.waiter.name}</span>}</p><div className="mt-1"><WaitChip elapsed={elapsed} /></div></div>
          <p className="font-display text-lg font-bold tabular-nums leading-none text-slate-950">{formatCurrency(order.totalAmount)}</p>
        </div>
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
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0',
        accent.badge,
      )}
    >
      <Icon className="w-3 h-3" />
      <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
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
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold tabular-nums border shrink-0',
        elapsed.tone === 'danger'
          ? 'bg-destructive/10 text-destructive border-destructive/30 animate-pulse'
          : elapsed.tone === 'warning'
            ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30'
            : 'bg-secondary/60 text-muted-foreground border-transparent',
      )}
    >
      <Icon className="w-3 h-3" />
      {elapsed.display}
    </div>
  );
};
