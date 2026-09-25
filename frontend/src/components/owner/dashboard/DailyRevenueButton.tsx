import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CalendarCheck, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../../../utils/currency';
import { cn } from '../../../lib/utils';

export interface EodDayRow {
  /** `YYYY-MM-DD` business date of the day the manager closed. */
  date: string;
  /** That day's sales total, exactly as the End of Day record holds it. */
  amount: number;
  /** The manager who approved the close. */
  closedByName: string | null;
  /** The same day's paid revenue as the ledger reads it now. */
  paidRevenue?: number;
  /** Signed off minus the ledger's figure: 0 when the day still agrees. */
  delta?: number;
  /** True when the two figures differ by at least one birr. */
  flagged?: boolean;
}

interface DailyRevenueButtonProps {
  /** Days the manager closed at End of Day, inside the selected window. */
  rows: EodDayRow[];
  className?: string;
}

const fmtDay = (date: string) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * Right-hand control on the Revenue Trend card: one button that opens the
 * day-by-day takings as a card of its own, with a reconciliation check on top.
 *
 * The figures here are the locked End of Day records the MANAGER approved on
 * the End of Day page — one line per closed day with that day's money, who
 * closed it, and the total across the window. Nothing on this card is derived
 * from the chart beside it: a day that was never closed has no line, and a day
 * the manager approved keeps the number they signed off on.
 *
 * Alongside each signed-off figure the card shows what the ledger says that day
 * took in paid tickets. Two figures produced by two different paths may drift —
 * money landing after the close, a ticket re-priced or cancelled later — so a
 * day that no longer agrees is flagged in place, the header says how many days
 * diverge, and the button itself carries the count so the drift is visible
 * without opening anything.
 */
export const DailyRevenueButton: React.FC<DailyRevenueButtonProps> = ({ rows, className }) => {
  const { t } = useTranslation('owner');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [rows]);
  /** The best closed day of the window — the number an owner looks for first. */
  const best = useMemo(
    () => rows.reduce<EodDayRow | null>((top, r) => (top === null || r.amount > top.amount ? r : top), null),
    [rows],
  );
  /** Days in this window whose signed-off takings no longer match the ledger. */
  const diverged = useMemo(() => rows.filter((r) => r.flagged), [rows]);
  /** Signed off minus ledger across the window: the size, and the direction, of the drift. */
  const drift = useMemo(() => diverged.reduce((sum, r) => sum + (Number(r.delta) || 0), 0), [diverged]);

  const label = t('finance.dailyRevenue', { defaultValue: 'Daily takings' });
  const flaggedLabel = t('finance.eodReconDiverged', {
    count: diverged.length,
    total: rows.length,
    defaultValue: '{{count}} of {{total}} days diverge',
  });

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-foreground/20 hover:bg-secondary/40',
          diverged.length > 0 ? 'border-warning/50' : 'border-input',
        )}
      >
        {diverged.length > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        ) : (
          <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {label}
        {/* One glance from the chart: how many closed days drifted off the
            ledger. The count is a child of the button, and the button's name is
            still its aria-label, so the trigger keeps reading "Daily takings". */}
        {diverged.length > 0 && (
          <span
            className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning/15 px-1 font-mono text-[10px] font-bold text-warning"
            title={flaggedLabel}
          >
            {diverged.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute right-0 z-40 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-fade-in"
        >
          {/* The card's own header: what these days are, and how many there are. */}
          <div className="border-b border-border/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                {t('finance.eodDaysClosed', {
                  count: rows.length,
                  defaultValue: '{{count}} days closed',
                })}
              </span>
            </div>
            <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3 shrink-0 text-[hsl(var(--success))]" />
              {t('finance.eodClosedBy', {
                defaultValue: 'Approved at End of Day by the manager',
              })}
            </p>
            {/* The reconciliation verdict for the window: either every closed
                day still agrees with the ledger, or how many no longer do. */}
            {rows.length > 0 && (
              <p
                className={cn(
                  'mt-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                  diverged.length > 0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
                )}
              >
                {diverged.length > 0 ? (
                  <>
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {flaggedLabel}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3 shrink-0" />
                    {t('finance.eodReconAllMatch', {
                      defaultValue: 'Every closed day matches the ledger',
                    })}
                  </>
                )}
              </p>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t('finance.noClosedDays', {
                defaultValue: 'No closed days in this date range.',
              })}
            </p>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto px-1 py-1">
                {rows.map((row) => {
                  const isBest = best !== null && row.amount === best.amount && row.amount > 0;
                  return (
                    <li
                      key={row.date}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs',
                        row.flagged
                          ? 'bg-warning/10'
                          : isBest
                            ? 'bg-[hsl(var(--success))]/10'
                            : 'even:bg-secondary/30',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1 truncate font-medium text-foreground">
                          {row.flagged && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
                          {fmtDay(row.date)}
                        </span>
                        {row.closedByName && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {t('finance.closedByName', {
                              name: row.closedByName,
                              defaultValue: 'closed by {{name}}',
                            })}
                          </span>
                        )}
                        {/* What the ledger says this day took, and how far the
                            signed-off figure is from it. */}
                        {row.flagged && typeof row.delta === 'number' && (
                          <span className="truncate text-[10px] font-medium text-warning">
                            {row.delta > 0
                              ? t('finance.eodReconMore', {
                                  amount: formatCurrency(row.delta),
                                  defaultValue: 'signed off {{amount}} more than the ledger shows',
                                })
                              : t('finance.eodReconLate', {
                                  amount: formatCurrency(Math.abs(row.delta)),
                                  defaultValue: '{{amount}} landed after the close',
                                })}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono font-semibold tabular-nums text-foreground">
                          {formatCurrency(row.amount)}
                        </span>
                        {row.flagged && typeof row.paidRevenue === 'number' && (
                          <span className="block font-mono text-[10px] tabular-nums text-warning">
                            {t('finance.eodReconLedger', {
                              amount: formatCurrency(row.paidRevenue),
                              defaultValue: 'ledger {{amount}}',
                            })}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t('finance.totalInRange', { defaultValue: 'Total in range' })}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {formatCurrency(total)}
                </span>
              </div>
              {/* The check itself, in one line: what the ledger adds up to for
                  these days beside the figures that were signed off. */}
              <div className="border-t border-border/60 bg-secondary/20 px-3 py-2">
                {diverged.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-warning">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {t('finance.eodReconDrift', { defaultValue: 'Off the ledger' })}
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-warning">
                        {formatCurrency(drift)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t('finance.eodReconHint', {
                        defaultValue:
                          'Each closed day is re-read from the paid tickets on it; a day that no longer agrees is flagged.',
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    {t('finance.eodReconHint', {
                      defaultValue:
                        'Each closed day is re-read from the paid tickets on it; a day that no longer agrees is flagged.',
                    })}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
