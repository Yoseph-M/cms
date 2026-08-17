import React from 'react';
import { motion } from 'framer-motion';
import { Armchair, ChevronLeft, ShoppingCart, CheckCircle2, Clock, Timer } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import type { Order } from '../../../types';

export type TableStatus = 'free' | 'cooking' | 'ready';

export interface TableMapProps {
  tableCount: number;
  activeOrders: Order[];
  onTableClick: (tableNumber: string) => void;
  onBack: () => void;
  className?: string;
}

function tableState(tableNumber: string, active: Order[]): { status: TableStatus; order?: Order } {
  const order = active.find((o) => o.tableNumber === tableNumber);
  if (!order) return { status: 'free' };
  if (order.status === 'SERVED') return { status: 'ready', order };
  return { status: 'cooking', order };
}

/**
 * Table map. Visual grid of tables with real status colors.
 *  - emerald = free / open
 *  - sky     = in progress (kitchen)
 *  - amber   = ready to pay (with subtle pulse)
 * Tap a free table to start a new order, or an occupied table to jump
 * straight to its ticket.
 */
export const TableMap: React.FC<TableMapProps> = ({
  tableCount,
  activeOrders,
  onTableClick,
  onBack,
  className,
}) => {
  const numbers = Array.from({ length: tableCount }, (_, i) => String(i + 1));
  const occupied = numbers.filter((n) => activeOrders.some((o) => o.tableNumber === n)).length;
  const ready = numbers.filter((n) => activeOrders.some((o) => o.tableNumber === n && o.status === 'SERVED')).length;
  const free = tableCount - occupied;

  return (
    <div className={cn('h-full flex flex-col bg-app-gradient text-foreground overflow-hidden', className)}>
      <header className="h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-5 sm:px-6 shrink-0 relative">
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
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

        <div className="flex items-center gap-2 text-[11px]">
          <StatusChip tone="emerald" label={`${free} free`} />
          <StatusChip tone="sky" label={`${occupied - ready} in kitchen`} />
          <StatusChip tone="amber" label={`${ready} ready`} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="mb-4 text-sm text-muted-foreground max-w-xl">
          Tap a free table to start a new order, or jump to an active ticket to take payment.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {numbers.map((n) => {
            const { status, order } = tableState(n, activeOrders);
            return (
              <TableTile
                key={n}
                number={n}
                status={status}
                amount={order?.totalAmount}
                onClick={() => onTableClick(n)}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
};

const TableTile: React.FC<{
  number: string;
  status: TableStatus;
  amount?: number;
  onClick: () => void;
}> = ({ number, status, amount, onClick }) => {
  const styleByStatus: Record<TableStatus, string> = {
    free: 'border-border bg-card hover:border-emerald-500/40 hover:shadow-[0_8px_24px_-12px_rgba(16,185,129,0.45)]',
    cooking:
      'border-sky-500/40 bg-gradient-to-br from-sky-500/12 to-sky-500/0 shadow-[0_8px_24px_-14px_rgba(56,189,248,0.55)]',
    ready:
      'border-amber-500/50 bg-gradient-to-br from-amber-500/15 to-amber-500/0 shadow-[0_8px_24px_-12px_rgba(245,158,11,0.5)]',
  };
  const labelByStatus: Record<TableStatus, string> = {
    free: 'Open',
    cooking: 'In kitchen',
    ready: 'Ready to pay',
  };
  const colorByStatus: Record<TableStatus, string> = {
    free: 'text-emerald-600',
    cooking: 'text-sky-600',
    ready: 'text-amber-700',
  };
  const Icon = status === 'free' ? Armchair : status === 'cooking' ? Clock : CheckCircle2;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'relative rounded-2xl border p-3.5 text-left transition-all overflow-hidden min-h-[124px] flex flex-col',
        styleByStatus[status],
        status === 'ready' && 'before:absolute before:inset-0 before:rounded-2xl before:animate-pulse-ring before:pointer-events-none',
      )}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Table</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums leading-none text-foreground">
        {number}
      </p>
      <div className="mt-auto pt-3 space-y-0.5">
        <p className={cn('text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1', colorByStatus[status])}>
          <Icon className="w-3 h-3" />
          {labelByStatus[status]}
        </p>
        {amount != null && (
          <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(amount)}</p>
        )}
      </div>
    </motion.button>
  );
};

const StatusChip: React.FC<{ tone: 'emerald' | 'sky' | 'amber'; label: string }> = ({ tone, label }) => {
  const toneClass = {
    emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    sky: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
    amber: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  }[tone];
  return (
    <span className={cn('px-2.5 py-1 rounded-full font-semibold border', toneClass)}>
      {label}
    </span>
  );
};
