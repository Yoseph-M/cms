import React from 'react';
import { motion } from 'framer-motion';
import { Armchair, ChevronLeft, Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Order } from '../../../types';

export interface TableMapProps {
  tableCount: number;
  activeOrders: Order[];
  onTableClick: (tableNumber: string) => void;
  onBack: () => void;
  className?: string;
}

/**
 * New-order table picker. Only available tables are shown; active tables are
 * managed from the Tickets workspace.
 */
export const TableMap: React.FC<TableMapProps> = ({
  tableCount,
  activeOrders,
  onTableClick,
  onBack,
  className,
}) => {
  const numbers = Array.from({ length: tableCount }, (_, i) => String(i + 1));
  // New orders can only be started on available tables. Active tables remain
  // accessible from Tickets, so they are intentionally omitted here.
  const availableNumbers = numbers.filter((n) => !activeOrders.some((o) => o.tableNumber === n));

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

        <div className="hidden items-center gap-2 text-[11px] sm:flex">
          <StatusChip tone="emerald" label={`${availableNumbers.length} available`} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Choose a table</p>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">Start a new order</h2>
              <p className="mt-1 text-sm text-muted-foreground">Only available tables are shown. Open Tickets to manage tables already in service.</p>
            </div>
            <MapStat value={availableNumbers.length} label="Available" tone="emerald" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {availableNumbers.map((n) => {
            return (
              <TableTile
                key={n}
                number={n}
                onClick={() => onTableClick(n)}
              />
            );
          })}
          </div>
        </div>
      </main>
    </div>
  );
};

const TableTile: React.FC<{
  number: string;
  onClick: () => void;
}> = ({ number, onClick }) => {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'relative min-h-[142px] overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] to-card p-3.5 text-left transition-all hover:border-emerald-500/50 hover:shadow-[0_12px_28px_-14px_rgba(16,185,129,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex flex-col',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Table</p>
          <p className="mt-1 font-display text-3xl font-bold tabular-nums leading-none text-foreground">{number}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-600/10 bg-background/70 text-emerald-600">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-auto pt-3 space-y-0.5">
        <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          <Plus className="w-3 h-3" />
          Available
        </p>
        <p className="pt-1 text-[11px] font-semibold text-foreground/70">Start order →</p>
      </div>
    </motion.button>
  );
};

const MapStat: React.FC<{ value: number; label: string; tone: 'emerald' }> = ({ value, label, tone }) => {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
    sky: 'border-sky-500/20 bg-sky-500/10 text-sky-700',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
  }[tone];
  return (
    <div className={cn('min-w-[70px] rounded-xl border px-3 py-2', colors)}>
      <p className="font-display text-lg font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] opacity-80">{label}</p>
    </div>
  );
};

const StatusChip: React.FC<{ tone: 'emerald'; label: string }> = ({ tone, label }) => {
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
