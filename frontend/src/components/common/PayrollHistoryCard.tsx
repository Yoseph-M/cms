import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, History, ReceiptText } from 'lucide-react';
import { FloatingCard } from '../ui/FloatingCard';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';

/**
 * One row of the payroll ledger as returned by GET /payroll. Payments carry the
 * staff member and the base salary; corrections (adjustments) carry a reason and
 * reuse the parent payment's user/period.
 */
export interface PayrollLedgerRecord {
  id: string;
  userId: string;
  user?: { id: string; name: string; role?: string } | null;
  periodMonth: number;
  periodYear: number;
  baseSalary: number;
  paidAmount: number;
  note?: string;
  reason?: string;
  createdAt: string;
  recordType?: 'payment' | 'adjustment';
  processedBy?: { name?: string } | null;
}

export interface MonthGroup {
  key: string;
  year: number;
  month: number;
  label: string;
  total: number;
  payments: PayrollLedgerRecord[];
  adjustments: PayrollLedgerRecord[];
}

/**
 * Collapse the ledger into one entry per payroll period, newest first. Shared
 * with the Expenses page, which summarises all of this as a single payroll row.
 */
export function groupPayrollByMonth(ledger: PayrollLedgerRecord[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const record of ledger) {
    const key = `${record.periodYear}-${String(record.periodMonth).padStart(2, '0')}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        year: record.periodYear,
        month: record.periodMonth,
        label: `${MONTH_NAMES[record.periodMonth - 1] ?? record.periodMonth} ${record.periodYear}`,
        total: 0,
        payments: [],
        adjustments: [],
      };
      groups.set(key, group);
    }
    group.total += record.paidAmount;
    if (record.recordType === 'adjustment') group.adjustments.push(record);
    else group.payments.push(record);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month,
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Payroll arrives one row per staff member per month, which is far too granular
 * for a general expenses list and collapses into a single misleading total once
 * every month is paid on the same day. This card replaces that with the thing
 * people actually want to see: every payroll period as its own line, each one
 * expandable to the individual payments behind it.
 */
export const PayrollHistoryCard: React.FC<{
  ledger: PayrollLedgerRecord[];
  isLoading?: boolean;
}> = ({ ledger, isLoading = false }) => {
  const { t } = useTranslation('manager');

  const months = useMemo<MonthGroup[]>(() => groupPayrollByMonth(ledger), [ledger]);

  const newestKey = months[0]?.key ?? null;
  const [expanded, setExpanded] = useState<string | null>(null);

  // Open the latest period by default, but never fight the user for control of
  // a month they deliberately collapsed.
  useEffect(() => {
    setExpanded((prev) => prev ?? newestKey);
  }, [newestKey]);

  const grandTotal = useMemo(
    () => months.reduce((sum, month) => sum + month.total, 0),
    [months],
  );
  const paymentCount = useMemo(
    () => months.reduce((sum, month) => sum + month.payments.length, 0),
    [months],
  );
  // What one month of payroll costs on average — the figure the Expenses page
  // shows as its single payroll row.
  const averageMonthly = months.length > 0 ? Math.round(grandTotal / months.length) : 0;

  return (
    <FloatingCard className="overflow-hidden hover:translate-y-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <History className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              {t('expenses.payrollHistory.title', { defaultValue: 'Payroll history' })}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('expenses.payrollHistory.subtitle', {
                defaultValue: 'Every month on its own line — added automatically from recorded payroll.',
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
            {months.length} {months.length === 1 ? 'month' : 'months'} · {paymentCount}{' '}
            {paymentCount === 1 ? 'payment' : 'payments'}
          </span>
          <span
            className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground"
            title="Average per month across every recorded payroll period"
          >
            {t('expenses.payrollHistory.average', { defaultValue: 'Avg' })}{' '}
            {formatCurrency(averageMonthly)}/mo
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      </div>

      {isLoading && months.length === 0 ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-secondary/40" />
          ))}
        </div>
      ) : months.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-muted-foreground">
          <ReceiptText className="h-4 w-4 shrink-0 opacity-60" />
          {t('expenses.payrollHistory.empty', {
            defaultValue:
              'No payroll recorded yet. Monthly totals appear here as soon as a payroll entry is saved.',
          })}
        </div>
      ) : (
        <div className="max-h-[22rem] overflow-y-auto">
          {months.map((month) => {
            const isOpen = expanded === month.key;
            const correctionCount = month.adjustments.length;
            return (
              <div key={month.key} className="border-b border-border/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : month.key)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 focus:outline-none focus-visible:bg-secondary/50"
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{month.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {month.payments.length}{' '}
                      {month.payments.length === 1 ? 'staff payment' : 'staff payments'}
                      {correctionCount > 0
                        ? ` · ${correctionCount} correction${correctionCount === 1 ? '' : 's'}`
                        : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-primary">
                    {formatCurrency(month.total)}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/40 bg-secondary/20">
                        {month.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-start justify-between gap-3 px-4 py-2.5 pl-11"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {payment.user?.name ?? 'Unknown staff'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {payment.user?.role ? `${payment.user.role} · ` : ''}
                                Base {formatCurrency(payment.baseSalary)}
                                {payment.processedBy?.name
                                  ? ` · paid by ${payment.processedBy.name}`
                                  : ''}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(payment.createdAt).toLocaleDateString()}
                              </p>
                              {payment.note && (
                                <p className="mt-0.5 truncate text-[11px] italic text-muted-foreground">
                                  {payment.note}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-sm font-semibold text-primary">
                              {formatCurrency(payment.paidAmount)}
                            </span>
                          </div>
                        ))}

                        {month.adjustments.map((adjustment) => (
                          <div
                            key={adjustment.id}
                            className="flex items-start justify-between gap-3 px-4 py-2.5 pl-11"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {adjustment.user?.name ?? 'Correction'}
                                <span className="ml-2 rounded bg-[hsl(var(--warning))]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--warning))]">
                                  Correction
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {adjustment.reason ?? 'Adjustment'}
                                {adjustment.processedBy?.name
                                  ? ` · by ${adjustment.processedBy.name}`
                                  : ''}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(adjustment.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-sm font-semibold text-[hsl(var(--warning))]">
                              +{formatCurrency(adjustment.paidAmount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </FloatingCard>
  );
};

export default PayrollHistoryCard;
