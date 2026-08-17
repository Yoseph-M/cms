import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import { Button } from '../../ui/Button';

export interface ShiftCloseDialogProps {
  open: boolean;
  shiftLabel?: string;
  expectedDrawerMinor?: number;
  txnCount?: number;
  cashSalesMinor?: number;
  busy?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: (data: { declaredCashMinor: number; notes: string }) => void;
}

/**
 * Close-shift dialog. Built to keep the cashier focused: declared cash
 * is the only field that matters; the rest is auto-derived read-only data.
 */
export const ShiftCloseDialog: React.FC<ShiftCloseDialogProps> = ({
  open,
  shiftLabel,
  expectedDrawerMinor = 0,
  txnCount = 0,
  cashSalesMinor = 0,
  busy,
  errorMessage,
  onCancel,
  onConfirm,
}) => {
  const [declared, setDeclared] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setDeclared('');
      setNotes('');
    }
  }, [open]);

  const declaredNum = parseFloat(declared || '0') || 0;
  const declaredMinor = Math.round(declaredNum * 100);
  const varianceMinor = declaredMinor - expectedDrawerMinor;
  const hasVariance = Math.abs(varianceMinor) > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-shift-title"
          >
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500" />
              <div className="p-6">
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 id="close-shift-title" className="font-display text-lg font-bold text-foreground">
                      Close shift
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {shiftLabel ?? 'End-of-day reconciliation'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    aria-label="Close"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-3 gap-2 mb-5">
                  <SummaryTile label="Expected" value={formatCurrency(expectedDrawerMinor)} />
                  <SummaryTile label="Sales" value={formatCurrency(cashSalesMinor)} />
                  <SummaryTile label="Txns" value={String(txnCount)} mono />
                </div>

                {/* Declared input */}
                <div>
                  <label
                    htmlFor="declared-cash"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Declared cash
                    <span className="text-rose-500 ml-1">*</span>
                  </label>
                  <div className="mt-1.5 relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-lg">
                      $
                    </span>
                    <input
                      id="declared-cash"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={declared}
                      onChange={(e) => setDeclared(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      className={cn(
                        'w-full h-14 pl-8 pr-3.5 rounded-lg',
                        'bg-secondary/50 border border-transparent',
                        'hover:border-border focus:border-amber-500 focus:bg-background',
                        'focus:shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
                        'text-2xl font-semibold tabular-nums outline-none transition-all',
                      )}
                    />
                  </div>
                </div>

                {/* Variance preview */}
                {declared && (
                  <div
                    className={cn(
                      'mt-3 flex items-center gap-2 text-sm font-semibold',
                      varianceMinor === 0
                        ? 'text-emerald-600'
                        : varianceMinor > 0
                          ? 'text-sky-600'
                          : 'text-rose-600',
                    )}
                  >
                    {varianceMinor === 0 ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span>
                      {varianceMinor === 0
                        ? 'Drawer matches — no variance'
                        : varianceMinor > 0
                          ? `Over by ${formatCurrency(varianceMinor)}`
                          : `Short by ${formatCurrency(Math.abs(varianceMinor))}`}
                    </span>
                  </div>
                )}

                <div className="mt-4">
                  <label
                    htmlFor="shift-notes"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Notes <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <textarea
                    id="shift-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Explain any variance, late deposits, etc."
                    className={cn(
                      'mt-1.5 w-full px-3.5 py-2.5 rounded-lg resize-none',
                      'bg-secondary/50 border border-transparent',
                      'hover:border-border focus:border-amber-500 focus:bg-background',
                      'focus:shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
                      'text-sm outline-none transition-all',
                    )}
                  />
                </div>

                {errorMessage && (
                  <p className="mt-3 text-xs text-rose-600 font-semibold">{errorMessage}</p>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onCancel} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => onConfirm({ declaredCashMinor: declaredMinor, notes })}
                    disabled={busy || !declared}
                    className="bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Close shift'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const SummaryTile: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="rounded-lg bg-secondary/40 border border-border px-2.5 py-2">
    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={cn('text-sm font-semibold tabular-nums truncate', mono && 'font-mono')}>{value}</p>
  </div>
);
