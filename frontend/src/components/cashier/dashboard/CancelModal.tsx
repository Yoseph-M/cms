import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';

export interface CancelModalProps {
  open: boolean;
  orderLabel: string;
  busy?: boolean;
  completed?: boolean;
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

const CUSTOM_REASONS_KEY = 'cms:cancel-reasons';
const MAX_CUSTOM_REASONS = 10;

/** Read saved custom cancel reasons from localStorage. */
function loadCustomReasons(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_REASONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r: unknown) => typeof r === 'string' && r.trim()) : [];
  } catch {
    return [];
  }
}

/** Save a new custom reason (de-duped, most-recent-first, capped). */
function saveCustomReason(reason: string, defaults: string[]): void {
  const trimmed = reason.trim();
  if (!trimmed) return;
  // Don't save if it's one of the built-in defaults
  if (defaults.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return;
  const existing = loadCustomReasons();
  // Don't save duplicates (case-insensitive)
  const filtered = existing.filter((r) => r.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...filtered].slice(0, MAX_CUSTOM_REASONS);
  try {
    localStorage.setItem(CUSTOM_REASONS_KEY, JSON.stringify(updated));
  } catch { /* ignore storage errors */ }
}

/**
 * Cancellation dialog. Cashier-facing: deliberately a little more
 * friction than other dialogs because this is a destructive action.
 *
 * Requires a non-empty reason. Offers quick-pick reasons for speed.
 * Custom reasons are automatically saved and displayed as quick-picks.
 */
export const CancelModal: React.FC<CancelModalProps> = ({
  open,
  orderLabel,
  busy,
  completed = false,
  onCancel,
  onConfirm,
  quickReasons = DEFAULT_QUICK_REASONS,
}) => {
  const [reason, setReason] = useState('');
  const [customReasons, setCustomReasons] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load custom reasons when the modal opens
  useEffect(() => {
    if (open) {
      setReason('');
      setCustomReasons(loadCustomReasons());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Merge defaults + custom reasons (de-duped)
  const allReasons = useMemo(() => {
    const seen = new Set(quickReasons.map((r) => r.toLowerCase()));
    const extra = customReasons.filter((r) => !seen.has(r.toLowerCase()));
    return [...quickReasons, ...extra];
  }, [quickReasons, customReasons]);

  const handleConfirm = useCallback(
    (r: string) => {
      const trimmed = r.trim();
      if (!trimmed) return;
      // Persist the reason for future use
      saveCustomReason(trimmed, quickReasons);
      onConfirm(trimmed);
    },
    [onConfirm, quickReasons],
  );

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

              <div className="p-6 max-[767px]:p-4">
                {completed ? (
                  <div className="text-center py-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 id="cancel-modal-title" className="mt-4 font-display text-lg font-bold text-foreground">
                      Order cancelled
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {orderLabel} has been cancelled and removed from the active queue.
                    </p>
                    <Button className="mt-6 w-full" onClick={onCancel}>
                      Done
                    </Button>
                  </div>
                ) : (
                  <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 id="cancel-modal-title" className="font-display text-lg font-bold text-foreground">
                      Cancel {orderLabel}?
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      This cancels the order immediately. The reason will be recorded for the
                      team.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    aria-label="Close"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick reasons (defaults + previously used custom reasons) */}
                <div className="mt-5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Quick reason
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {allReasons.map((q) => {
                      const isCustom = !quickReasons.includes(q);
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setReason(q)}
                          className={cn(
                            'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                            reason === q
                              ? 'border-primary bg-primary/10 text-primary'
                              : isCustom
                                ? 'border-dashed border-border bg-secondary/20 text-muted-foreground hover:text-foreground hover:border-border'
                                : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-border',
                          )}
                        >
                          {q}
                        </button>
                      );
                    })}
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
                      if (e.key === 'Enter' && reason.trim() && !busy) handleConfirm(reason);
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
                    onClick={() => handleConfirm(reason)}
                    disabled={!reason.trim() || busy}
                    className="shadow-sm"
                  >
                    {busy ? 'Cancelling…' : 'Cancel order'}
                  </Button>
                </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
