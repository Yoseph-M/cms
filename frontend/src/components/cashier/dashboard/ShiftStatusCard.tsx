import React from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Clock3,
  Receipt as ReceiptIcon,
  ChevronRight,
  CircleDollarSign,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';

export interface ShiftStatus {
  /** "OPEN" | "PENDING_REVIEW" | undefined */
  state: 'open' | 'pending' | 'closed';
  openedAt?: string;
  cashierName?: string;
  openingCashMinor?: number;
  /** Live drawer total = opening + cash sales. Best-effort, only what we have. */
  drawerTotalMinor?: number;
  txnCount?: number;
  cashSalesMinor?: number;
}

export interface ShiftStatusCardProps {
  status: ShiftStatus;
  onClick?: () => void;
}

/**
 * Compact shift summary pill. Hover/click to open shift details / close.
 * Designed to live in the dashboard sub-header next to KPIs.
 */
export const ShiftStatusCard: React.FC<ShiftStatusCardProps> = ({ status, onClick }) => {
  const isOpen = status.state === 'open';
  const isPending = status.state === 'pending';

  const time = status.openedAt ? formatStartedAgo(status.openedAt) : null;

  const tone = isOpen
    ? 'from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/30'
    : isPending
      ? 'from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/30'
      : 'from-slate-300/40 to-transparent border-slate-300/60';

  const dotTone = isOpen
    ? 'bg-emerald-500'
    : isPending
      ? 'bg-amber-500'
      : 'bg-slate-400';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'group relative flex items-center gap-3 pl-3 pr-2.5 h-11 rounded-xl border bg-gradient-to-r',
        'text-left text-foreground',
        'hover:shadow-md transition-shadow',
        tone,
      )}
      aria-label={isOpen ? 'Open shift summary' : 'Open shift'}
    >
      {/* live dot */}
      <span className="relative flex h-2 w-2">
        {(isOpen || isPending) && (
          <span
            className={cn(
              'absolute inset-0 rounded-full opacity-70 animate-ping',
              dotTone,
            )}
          />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotTone)} />
      </span>

      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {isOpen ? 'Shift open' : isPending ? 'Shift pending review' : 'Shift closed'}
        </span>
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {isOpen && status.drawerTotalMinor != null ? (
            <>
              <CircleDollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span className="tabular-nums">{formatCurrency(status.drawerTotalMinor)}</span>
              <span className="text-muted-foreground font-normal text-xs">in drawer</span>
            </>
          ) : isPending ? (
            <span className="text-amber-700">Manager reviewing…</span>
          ) : (
            <span className="text-muted-foreground">Not started</span>
          )}
        </span>
      </div>

      {isOpen && (time || status.txnCount != null) && (
        <div className="hidden md:flex items-center gap-1.5 pl-3 ml-1 border-l border-border/70 text-[11px] text-muted-foreground">
          {time && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3 h-3" />
              <span className="tabular-nums">{time}</span>
            </span>
          )}
          {status.txnCount != null && (
            <span className="inline-flex items-center gap-1">
              <ReceiptIcon className="w-3 h-3" />
              <span className="tabular-nums">{status.txnCount}</span>
            </span>
          )}
        </div>
      )}

      <ChevronRight
        className={cn(
          'w-4 h-4 text-muted-foreground transition-transform',
          'group-hover:translate-x-0.5',
        )}
      />

      {isOpen && (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent"
        />
      )}
    </motion.button>
  );
};

function formatStartedAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const totalMin = Math.max(0, Math.floor(diffMs / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
