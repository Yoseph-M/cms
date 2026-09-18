import React from 'react';
import { motion } from 'framer-motion';
import { Armchair, ChevronLeft, Plus, ReceiptText } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface TableMapProps {
  tableCount: number;
  /** How many orders are currently open on each table, keyed by table number. */
  openOrderCounts?: Record<string, number>;
  /** Start a brand-new order on this table (never re-opens an existing one). */
  onTableClick: (tableNumber: string) => void;
  /** Jump to the queue filtered to this table's open orders. */
  onViewOrders?: (tableNumber: string) => void;
  onBack: () => void;
  className?: string;
}

/**
 * New-order table picker.
 *
 * Selecting a table always starts a *separate* new order — a table that is
 * already in service never hijacks the tap, so a table can carry as many open
 * orders as the floor needs. Tables that already have open orders show a count
 * badge with a shortcut into the queue.
 */
export const TableMap: React.FC<TableMapProps> = ({
  tableCount,
  openOrderCounts = {},
  onTableClick,
  onViewOrders,
  onBack,
  className,
}) => {
  const numbers = Array.from({ length: tableCount }, (_, i) => String(i + 1));
  const totalOpen = Object.values(openOrderCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className={cn('h-full flex flex-col bg-app-gradient text-foreground overflow-hidden', className)}>
      <header className="min-h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between gap-3 px-4 py-3 sm:px-6 shrink-0 relative">
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
            New order
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight text-foreground">
                Pick a table
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every tap starts a new ticket — tables already being served just get an extra order.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground shrink-0">
              <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 tabular-nums">
                {tableCount} tables
              </span>
              <span className="rounded-full border border-border bg-secondary/50 px-2 py-0.5 tabular-nums">
                {totalOpen} open {totalOpen === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {numbers.map((n) => (
              <TableTile
                key={n}
                number={n}
                openCount={openOrderCounts[n] ?? 0}
                onClick={() => onTableClick(n)}
                onViewOrders={onViewOrders ? () => onViewOrders(n) : undefined}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

const TableTile: React.FC<{
  number: string;
  openCount: number;
  onClick: () => void;
  onViewOrders?: () => void;
}> = ({ number, openCount, onClick, onViewOrders }) => {
  const busy = openCount > 0;

  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-2.5 transition-all',
        busy
          ? 'border-primary/40 bg-gradient-to-br from-primary/[0.07] to-card'
          : 'border-border hover:border-primary/40',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Start a new order on table ${number}`}
        className="flex items-center justify-between gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded-md"
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Table
          </span>
          <span className="block font-display text-xl font-bold leading-none tabular-nums text-foreground">
            {number}
          </span>
        </span>
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors',
            busy
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border bg-background/70 text-muted-foreground group-hover:text-primary',
          )}
        >
          <Plus className="h-3 w-3" />
        </span>
      </button>

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
          New order
        </span>
        {busy && onViewOrders && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewOrders();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={`View ${openCount} open order${openCount === 1 ? '' : 's'} on table ${number}`}
          >
            <ReceiptText className="h-2.5 w-2.5" />
            {openCount} open
          </button>
        )}
      </div>
    </motion.div>
  );
};
