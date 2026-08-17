import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';

export interface CancelModalProps {
  open: boolean;
  orderLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** Quick-pick reasons so the cashier doesn't type every time */
  quickReasons?: string[];
}

const DEFAULT_QUICK_REASONS = [
  'Customer walked out',
  'Wrong order',
  'Duplicate ticket',
  'Kitchen out of item',
];

/**
 * Cancellation dialog. Cashier-facing: deliberately a little more
 * friction than other dialogs because this is a destructive action.
 *
 * Requires a non-empty reason. Offers quick-pick reasons for speed.
 */
export const CancelModal: React.FC<CancelModalProps> = ({
  open,
  orderLabel,
  busy,
  onCancel,
  onConfirm,
  quickReasons = DEFAULT_QUICK_REASONS,
}) => {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      // Focus on next tick so the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-modal-title"
          >
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-rose-500" />

              <div className="p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 id="cancel-modal-title" className="font-display text-lg font-bold text-foreground">
                      Cancel {orderLabel}?
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      This sends a cancellation request to the manager for approval. They will
                      see the reason you provide.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Close"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick reasons */}
                <div className="mt-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Quick reason
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickReasons.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setReason(q)}
                        className={cn(
                          'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                          reason === q
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-border',
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason input */}
                <div className="mt-4">
                  <label
                    htmlFor="cancel-reason"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Reason
                    <span className="text-rose-500 ml-1">*</span>
                  </label>
                  <input
                    id="cancel-reason"
                    ref={inputRef}
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && reason.trim() && !busy) onConfirm(reason.trim());
                    }}
                    placeholder="e.g. Customer walked out"
                    className={cn(
                      'mt-1.5 w-full h-11 px-3.5 rounded-lg',
                      'bg-secondary/50 border border-transparent',
                      'hover:border-border focus:border-rose-500 focus:bg-background',
                      'focus:shadow-[0_0_0_4px_rgba(244,63,94,0.15)]',
                      'text-sm outline-none transition-all',
                    )}
                  />
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={onCancel} disabled={busy}>
                    Keep order
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => onConfirm(reason.trim())}
                    disabled={!reason.trim() || busy}
                    className="shadow-sm"
                  >
                    {busy ? 'Sending…' : 'Request cancellation'}
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
