import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
  Printer,
  Keyboard,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import type { PaymentMethod } from '../../../types';
import { METHOD_HOTKEY, METHOD_LABEL, METHOD_ORDER } from './utils';

export type PaymentPhase = 'idle' | 'processing' | 'printed';

export interface PaymentPadProps {
  total: number;
  method: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
  phase: PaymentPhase;
  onCollect: () => void;
  onCancel: () => void;
  /** Render a small cancellation link, only for active (not paid/cancelled) orders */
  showCancel?: boolean;
  /** When true, replaces CTA with a "Settled" badge */
  isSettled?: boolean;
  isCancelled?: boolean;
  className?: string;
}

const METHOD_ICON: Record<PaymentMethod, React.FC<{ className?: string }>> = {
  CASH: Banknote,
  CARD: CreditCard,
  MOBILE: Smartphone,
  NONE: Banknote,
};

const METHOD_TONE_ACTIVE: Record<PaymentMethod, string> = {
  CASH: 'from-emerald-500/15 to-emerald-500/0 border-emerald-500 text-emerald-700',
  CARD: 'from-sky-500/15 to-sky-500/0 border-sky-500 text-sky-700',
  MOBILE: 'from-violet-500/15 to-violet-500/0 border-violet-500 text-violet-700',
  NONE: 'from-slate-200 to-slate-100 border-slate-400 text-slate-600',
};

/**
 * The settle block: the highest-stakes interaction on the page.
 *
 * Design intent:
 *  - Total is the **largest** element. The cashier needs to confirm the number first.
 *  - Method tiles are visually equal — choice should feel non-prejudicial.
 *    The active one gets a tonal border + checkmark overlay.
 *  - The CTA is the only button on the page that's both (a) full width and (b) gradient.
 *  - Idle / processing / printed each have a distinct visual state.
 *  - The CTA "press ↵ to collect" hint lives inside the button on hover,
 *    so it's discoverable without being noisy.
 */
export const PaymentPad: React.FC<PaymentPadProps> = ({
  total,
  method,
  onMethodChange,
  phase,
  onCollect,
  onCancel,
  showCancel = true,
  isSettled = false,
  isCancelled = false,
  className,
}) => {
  if (isSettled || isCancelled) {
    return (
      <div
        className={cn(
          'rounded-xl border p-4 flex items-center gap-3',
          isSettled
            ? 'bg-emerald-500/8 border-emerald-500/30 text-emerald-700'
            : 'bg-rose-500/8 border-rose-500/30 text-rose-700',
          className,
        )}
      >
        {isSettled ? (
          <CheckCircle2 className="w-5 h-5 shrink-0" />
        ) : (
          <X className="w-5 h-5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">
            {isSettled ? 'Settled' : 'Cancelled'}
          </p>
          <p className="text-xs opacity-80">
            {isSettled
              ? 'Receipt printed. Funds captured.'
              : 'This order has been voided.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-xl bg-gradient-to-b from-secondary/30 to-secondary/60 border border-border p-4 space-y-4',
        className,
      )}
    >
      {/* Total row */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Total
          </p>
          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
            Tap a method, then press ↵
          </p>
        </div>
        <p className="font-display text-3xl font-bold tabular-nums text-foreground leading-none">
          {formatCurrency(total)}
        </p>
      </div>

      {/* Method tiles */}
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
        {METHOD_ORDER.map((pm) => {
          const Icon = METHOD_ICON[pm];
          const active = method === pm;
          return (
            <motion.button
              key={pm}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onMethodChange(pm)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition-all',
                'h-[64px] bg-background',
                active
                  ? METHOD_TONE_ACTIVE[pm] + ' shadow-sm bg-gradient-to-b'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="payment-check"
                  className={cn(
                    'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white flex items-center justify-center shadow-sm',
                    pm === 'CASH' && 'bg-emerald-500',
                    pm === 'CARD' && 'bg-sky-500',
                    pm === 'MOBILE' && 'bg-violet-500',
                  )}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  <CheckCircle2 className="w-3 h-3" />
                </motion.span>
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {METHOD_LABEL[pm]}
              </span>
              <kbd
                className={cn(
                  'absolute bottom-1 right-1.5 text-[9px] font-mono px-1 rounded',
                  active ? 'bg-foreground/10' : 'bg-secondary text-muted-foreground',
                )}
              >
                {METHOD_HOTKEY[pm]}
              </kbd>
            </motion.button>
          );
        })}
      </div>

      {/* Big collect CTA — three visual states */}
      <motion.div whileTap={phase === 'idle' ? { scale: 0.985 } : undefined}>
        <button
          type="button"
          onClick={onCollect}
          disabled={phase !== 'idle'}
          aria-busy={phase === 'processing'}
          className={cn(
            'group relative w-full h-14 rounded-xl font-bold text-base overflow-hidden',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed transition-all',
            phase === 'printed'
              ? 'bg-emerald-500 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.55)]'
              : phase === 'processing'
                ? 'bg-primary/85 text-primary-foreground'
                : 'bg-brand-gradient text-white shadow-[0_8px_24px_-10px_rgba(59,130,246,0.65)] hover:shadow-[0_12px_28px_-10px_rgba(59,130,246,0.7)]',
          )}
        >
          {/* Subtle inner gloss */}
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none"
          />

          <AnimatePresence mode="wait" initial={false}>
            {phase === 'idle' && (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="relative inline-flex items-center justify-center gap-2"
              >
                <span>Collect {formatCurrency(total)}</span>
                <ChevronRight className="w-4 h-4" />
                <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-white/25 text-white text-[10px] font-mono">
                  ↵
                </kbd>
              </motion.span>
            )}
            {phase === 'processing' && (
              <motion.span
                key="processing"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="relative inline-flex items-center justify-center gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </motion.span>
            )}
            {phase === 'printed' && (
              <motion.span
                key="printed"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16 }}
                className="relative inline-flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Receipt printed
                <Sparkles className="w-4 h-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </motion.div>

      {/* Footer: shortcuts + cancel link */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Keyboard className="w-3 h-3" />
          <span className="inline-flex items-center gap-0.5">
            <Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd>
          </span>
          <span className="ml-1">method</span>
          <Kbd className="ml-1.5">↵</Kbd>
          <span className="ml-1">collect</span>
        </div>
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] font-semibold text-muted-foreground hover:text-rose-600 transition-colors px-2 py-1 rounded-md hover:bg-rose-500/10 inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cancel order
          </button>
        )}
      </div>
    </div>
  );
};

const Kbd: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <kbd
    className={cn(
      'px-1 py-0.5 rounded bg-secondary border border-border font-mono text-[9px]',
      className,
    )}
  >
    {children}
  </kbd>
);
