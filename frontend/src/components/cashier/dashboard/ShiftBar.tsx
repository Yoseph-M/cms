import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, ListOrdered, Sparkles, Timer, ShoppingCart, LogOut, Receipt } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import { Button } from '../../ui/Button';
import { ShiftStatusCard, type ShiftStatus } from './ShiftStatusCard';

export interface ShiftBarProps {
  todayRevenue: number;
  activeCount: number;
  settledCount: number;
  avgTicket: number;
  oldestWaitMinutes: number;
  shiftStatus: ShiftStatus;
  onShiftCardClick: () => void;
  onCloseShift: () => void;
  onTablesClick: () => void;
  showTablesButton: boolean;
  /** Slot for any additional actions (eg. view-history button) */
  extraActions?: React.ReactNode;
}

/**
 * The dashboard sub-header. Sits below the global Header and above the workspace.
 * Hosts: brand mark, shift card, KPIs, and primary action buttons.
 *
 * Design intent:
 *  - Lower height than the previous version (60 vs 80) so the queue has more room.
 *  - KPIs are monospaced & tabular so numbers don't dance when they tick.
 *  - Oldest-wait tile is tone-coded: green ≤ 14m, amber 15-29m, rose 30m+ with pulse.
 */
export const ShiftBar: React.FC<ShiftBarProps> = ({
  todayRevenue,
  activeCount,
  settledCount,
  avgTicket,
  oldestWaitMinutes,
  shiftStatus,
  onShiftCardClick,
  onCloseShift,
  onTablesClick,
  showTablesButton,
  extraActions,
}) => {
  const oldestTone = oldestWaitMinutes >= 30 ? 'danger' : oldestWaitMinutes >= 15 ? 'warning' : 'fresh';
  const isOpen = shiftStatus.state === 'open';

  return (
    <header
      className={cn(
        'relative h-[60px] shrink-0 px-4 sm:px-5 flex items-center justify-between gap-3',
        'bg-card/85 backdrop-blur-md border-b border-border',
        'shadow-[0_4px_18px_-12px_rgba(59,130,246,0.25)]',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      {/* Brand block — leaner than the old version */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-brand-gradient text-white flex items-center justify-center shadow-brand">
          <Receipt className="w-4 h-4" />
        </div>
        <div className="hidden sm:block leading-tight">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Cashier
          </p>
          <h1 className="font-display text-[15px] font-bold text-foreground tracking-tight">
            Live Queue
          </h1>
        </div>
      </div>

      {/* KPIs + shift card */}
      <div className="flex-1 min-w-0 flex items-center gap-2 justify-center">
        <ShiftStatusCard status={shiftStatus} onClick={onShiftCardClick} />

        <div className="hidden xl:flex items-center gap-1.5 pl-2 ml-1">
          <KpiMini
            label="Revenue"
            value={formatCurrency(todayRevenue)}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            tone="success"
            hint={settledCount > 0 ? `${settledCount} sales` : 'No sales yet'}
          />
          <KpiMini
            label="Active"
            value={activeCount}
            icon={<ListOrdered className="w-3.5 h-3.5" />}
            tone="primary"
            hint={activeCount === 0 ? 'All clear' : 'On the floor'}
          />
          <KpiMini
            label="Avg ticket"
            value={avgTicket > 0 ? formatCurrency(avgTicket) : '—'}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            tone="accent"
          />
          <KpiMini
            label="Oldest wait"
            value={activeCount === 0 ? '—' : `${oldestWaitMinutes}m`}
            icon={<Timer className="w-3.5 h-3.5" />}
            tone={oldestTone === 'fresh' ? 'primary' : oldestTone}
            hint={oldestTone === 'danger' ? 'Check now' : oldestTone === 'warning' ? 'Watch' : undefined}
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {extraActions}
        {showTablesButton && (
          <Button
            size="sm"
            variant="outline"
            onClick={onTablesClick}
            className="h-9 px-3 hidden sm:inline-flex"
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
            New order
          </Button>
        )}
        {isOpen && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCloseShift}
            className="h-9 px-3 text-muted-foreground hover:text-amber-700"
            title="Close shift"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Close shift</span>
          </Button>
        )}
      </div>
    </header>
  );
};

interface KpiMiniProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
  hint?: string;
}

const TONE: Record<KpiMiniProps['tone'], string> = {
  primary: 'border-primary/20 from-primary/10 to-primary/0 text-primary',
  accent: 'border-cyan-500/20 from-cyan-500/10 to-cyan-500/0 text-cyan-600',
  success: 'border-emerald-500/20 from-emerald-500/10 to-emerald-500/0 text-emerald-600',
  warning: 'border-amber-500/30 from-amber-500/15 to-amber-500/0 text-amber-700',
  danger: 'border-rose-500/40 from-rose-500/15 to-rose-500/0 text-rose-600',
};

const KpiMini: React.FC<KpiMiniProps> = ({ label, value, icon, tone, hint }) => {
  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-lg border bg-gradient-to-br backdrop-blur-sm',
        'px-2.5 h-10 min-w-0',
        TONE[tone],
      )}
    >
      <div className="w-7 h-7 rounded-md bg-background/70 border border-current/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-80 truncate leading-none">
          {label}
        </p>
        <p className="font-display text-[13px] font-bold tabular-nums leading-tight truncate">
          {value}
        </p>
        {hint && (
          <p className="text-[9px] opacity-70 truncate leading-none mt-0.5">{hint}</p>
        )}
      </div>
    </div>
  );
};
