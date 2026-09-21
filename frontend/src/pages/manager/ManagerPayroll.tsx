import { extractErrorMessage } from "../../utils/errorHandler";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { usePayrollQuery, useUsersQuery } from '../../hooks/useCachedQueries';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { Sheet } from '../../components/ui/Sheet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Plus, ChevronRight, Receipt, X
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';

interface StaffUser {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface PayrollRecord {
  id: string;
  userId: string;
  user: { id: string; name: string; role: string };
  periodMonth: number;
  periodYear: number;
  baseSalary: number;
  paidAmount: number;
  processedBy: { name: string };
  createdAt: string;
  recordType?: 'payment' | 'adjustment';
  reason?: string;
  note?: string;
}

/** One Historical Ledger row — a single employee with all their records. */
interface EmployeeLedger {
  userId: string;
  name: string;
  role: string;
  payments: PayrollRecord[];
  adjustments: PayrollRecord[];
  totalPaid: number;
  latest: PayrollRecord;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = [2024, 2025, 2026, 2027];

const PayrollStat: React.FC<{
  label: string;
  value: string;
  hint?: string;
  accent: string;
}> = ({ label, value, hint, accent }) => (
  <div className="rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.25)]">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={`mt-2 font-mono text-xl font-bold tracking-tight ${accent}`}>{value}</p>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);
const SCOPED_ROLES = ['CASHIER', 'WAITER', 'COOKER', 'BARISTA'];

export const ManagerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('manager');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Payroll', subtitle: 'Salary records and adjustments' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const queryClient = useQueryClient();
  const payrollQuery = usePayrollQuery('manager');
  const usersQuery = useUsersQuery();

  const ledger: PayrollRecord[] = useMemo(
    () => (Array.isArray(payrollQuery.data) ? payrollQuery.data.filter((r: PayrollRecord) => SCOPED_ROLES.includes(r.user?.role)) : []),
    [payrollQuery.data],
  );
  const isLoading = payrollQuery.isLoading;

  const staff: StaffUser[] = useMemo(
    () => (Array.isArray(usersQuery.data) ? usersQuery.data.filter((u: StaffUser) => u.isActive && SCOPED_ROLES.includes(u.role)) : []),
    [usersQuery.data],
  );
  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [paidAmount, setPaidAmount] = useState('');
  const [note, setNote] = useState('');
  const [refSalary, setRefSalary] = useState<number | null>(null);
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<EmployeeLedger | null>(null);

  /** Historical Ledger grouped per employee — click a row for the full history. */
  const employeeLedger = useMemo<EmployeeLedger[]>(() => {
    const groups = new Map<string, EmployeeLedger>();
    for (const record of ledger) {
      const isAdjustment = record.recordType === 'adjustment';
      let group = groups.get(record.userId);
      if (!group) {
        if (isAdjustment) continue;
        group = {
          userId: record.userId,
          name: record.user?.name ?? '',
          role: record.user?.role ?? '',
          payments: [],
          adjustments: [],
          totalPaid: 0,
          latest: record,
        };
        groups.set(record.userId, group);
      }
      if (isAdjustment) group.adjustments.push(record);
      else group.payments.push(record);
      group.totalPaid += record.paidAmount;
    }
    const rows = Array.from(groups.values());
    rows.forEach((row) => {
      row.latest = row.payments[0];
    });
    return rows.sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [ledger]);

  /** Roster-wide payroll totals — every staff member added up, not one at a time. */
  const rosterTotalPaid = useMemo(
    () => ledger.reduce((sum, r) => sum + r.paidAmount, 0),
    [ledger],
  );
  const rosterPaymentCount = useMemo(
    () => ledger.filter((r) => r.recordType !== 'adjustment').length,
    [ledger],
  );
  const rosterThisMonth = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return ledger.reduce(
      (sum, r) => (r.periodMonth === month && r.periodYear === year ? sum + r.paidAmount : sum),
      0,
    );
  }, [ledger]);

  /** Full, newest-first history for the employee whose float card is open. */
  const detailHistory = useMemo(() => {
    if (!detailEmployee) return [];
    return [...detailEmployee.payments, ...detailEmployee.adjustments]
      .sort(
        (a, b) =>
          b.periodYear - a.periodYear ||
          b.periodMonth - a.periodMonth ||
          b.createdAt.localeCompare(a.createdAt),
      )
      .map((r) => ({
        key: r.id,
        period: `${MONTHS[r.periodMonth - 1]} ${r.periodYear}`,
        paid: r.paidAmount,
        base: r.recordType === 'adjustment' ? undefined : r.baseSalary,
        by: r.processedBy?.name,
        date: new Date(r.createdAt).toLocaleDateString(),
        note: r.recordType === 'adjustment' ? r.reason : r.note,
        isAdjustment: r.recordType === 'adjustment',
      }));
  }, [detailEmployee]);

  const invalidatePayroll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['payroll'] });
  }, [queryClient]);

  const resetForm = () => {
    setUserId('');
    setPeriodMonth(new Date().getMonth() + 1);
    setPeriodYear(new Date().getFullYear());
    setPaidAmount('');
    setNote('');
    setRefSalary(null);
  };

  const openForm = () => {
    resetForm();
    void usersQuery.refetch();
    setFormOpen(true);
  };

  const handleStaffChange = async (id: string) => {
    setUserId(id);
    setRefSalary(null);
    setPaidAmount('');
    if (!id) return;
    setIsLoadingRef(true);
    try {
      const res = await axiosClient.get(`/payroll/staff-ref/${id}`);
      const salary = Number(res.data.salaryAmount) || 0;
      setRefSalary(salary);
      setPaidAmount(String(salary));
    } catch (err: any) {
      addToast({ type: 'error', title: 'Unable to load salary reference', message: extractErrorMessage(err) || 'Could not fetch salary information.' });
    } finally {
      setIsLoadingRef(false);
    }
  };

  const handleRecordEntry = async () => {
    if (!userId || !paidAmount) {
      addToast({ type: 'error', title: 'Please select a staff member and enter the amount paid.' });
      return;
    }
    const amount = parseFloat(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      addToast({ type: 'error', title: 'Please enter a valid amount (must be zero or greater).' });
      return;
    }
    setIsSubmitting(true);
    try {
      await axiosClient.post('/payroll/entries', {
        userId,
        periodMonth,
        periodYear,
        paidAmount: amount,
        note: note.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Payroll recorded',
        message: 'The payment was recorded and logged in Expenses under Payroll.',
      });
      setFormOpen(false);
      resetForm();
      invalidatePayroll();
    } catch (err: any) {
      const detail = err.response?.data?.details?.[0]?.error;
      addToast({
        type: 'error',
        title: 'Unable to record payroll',
        message: detail || extractErrorMessage(err) || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">{t('payroll.title', { defaultValue: 'Record Payroll Entry' })}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t('payroll.subtitle', { defaultValue: 'Log what was actually paid for your staff roster.' })}
              </p>
            </div>
            <Button id="manager-record-payroll-btn" onClick={openForm}>
              <Plus className="w-4 h-4 mr-2" />{t('payroll.newEntry', { defaultValue: 'New Entry' })}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Payroll totals for the whole roster this manager is responsible for. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 max-[419px]:grid-cols-1">
        <PayrollStat
          label={t('payroll.kpiTotalRoster')}
          value={formatCurrency(rosterTotalPaid)}
          hint={`${rosterPaymentCount} payment${rosterPaymentCount === 1 ? '' : 's'} recorded`}
          accent="text-primary"
        />
        <PayrollStat
          label={`This month · ${MONTHS[new Date().getMonth()]}`}
          value={formatCurrency(rosterThisMonth)}
          hint="Current payroll period"
          accent="text-emerald-600"
        />
        <PayrollStat
          label={t('payroll.kpiStaffPaid')}
          value={String(employeeLedger.length)}
          hint={`${staff.length} staff in the roster`}
          accent="text-sky-600"
        />
        <PayrollStat
          label={t('payroll.kpiAverage')}
          value={formatCurrency(rosterPaymentCount ? Math.round(rosterTotalPaid / rosterPaymentCount) : 0)}
          hint="Across the roster"
          accent="text-[hsl(var(--warning))]"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">{t('payroll.ledgerTitle', { defaultValue: 'Payroll Ledger' })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : employeeLedger.length === 0 ? (
            <EmptyState
              title={t('payroll.emptyTitle', { defaultValue: 'No payroll entries yet' })}
              message={t('payroll.emptyMsg', { defaultValue: 'Record your first entry to log what was actually paid to your team roster.' })}
              icon={<DollarSign className="w-7 h-7" />}
              action={{
                label: t('payroll.emptyAction', { defaultValue: 'Record your first payroll entry' }),
                onClick: openForm,
                icon: <Plus className="w-4 h-4 mr-1.5" />,
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold">
                    <th className="px-4 py-3 text-left font-semibold">{t('payroll.columns.staff', { defaultValue: 'Staff' })}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('payroll.columns.period', { defaultValue: 'Last period' })}</th>
                    <th className="px-4 py-3 text-center font-semibold">{t('payroll.records')}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t('payroll.columns.paid', { defaultValue: 'Total paid' })}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t('payroll.columns.date', { defaultValue: 'Last paid' })}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {employeeLedger.map((employee) => (
                    <tr
                      key={employee.userId}
                      role="button"
                      tabIndex={0}
                      aria-label={`View payroll history for ${employee.name}`}
                      onClick={() => setDetailEmployee(employee)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailEmployee(employee);
                        }
                      }}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors focus:outline-none focus-visible:bg-secondary/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{employee.name}</div>
                        <div className="text-[11px] text-muted-foreground">{employee.role}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {/* TODO: translate month names if desired, for now use standard abbreviation mapping or keep English fallback */}
                        {MONTHS[employee.latest.periodMonth - 1]} {employee.latest.periodYear}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {employee.payments.length}
                        {employee.adjustments.length > 0 ? ` +${employee.adjustments.length}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                        {formatCurrency(employee.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {new Date(employee.latest.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
                {t('payroll.tapEmployee')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('payroll.title', { defaultValue: 'Record Payroll Entry' })}
        description={t('payroll.formDesc', { defaultValue: 'Log what was actually paid for a staff member and period.' })}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1">{t('payroll.form.cancel', { defaultValue: 'Cancel' })}</Button>
            <Button
              onClick={handleRecordEntry}
              disabled={isSubmitting || !userId || !paidAmount}
              className="flex-1"
            >
              {isSubmitting ? t('payroll.form.saving', { defaultValue: 'Saving...' }) : t('payroll.form.record', { defaultValue: 'Record Entry' })}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <span className="text-sm font-medium text-foreground block mb-1.5">
              {t('payroll.form.staff', { defaultValue: 'Staff' })} <span className="text-destructive">*</span>
            </span>
            <DropdownSelect
              ariaLabel={t('payroll.form.staff', { defaultValue: 'Staff' })}
              className="w-full justify-between"
              contentClassName="w-[22rem] max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
              value={userId}
              onChange={handleStaffChange}
              placeholder={t('payroll.form.selectStaff', { defaultValue: 'Select staff member' })}
              options={staff.map((s) => ({ value: s.id, label: `${s.name} (${s.role})` }))}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <span className="text-sm font-medium text-foreground block mb-1.5">
                {t('payroll.form.month', { defaultValue: 'Period Month' })}
              </span>
              <DropdownSelect
                ariaLabel={t('payroll.form.month', { defaultValue: 'Period Month' })}
                className="w-full justify-between"
                contentClassName="w-40"
                value={String(periodMonth)}
                onChange={(v) => setPeriodMonth(Number(v))}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
            </div>
            <div className="w-28">
              <span className="text-sm font-medium text-foreground block mb-1.5">
                {t('payroll.form.year', { defaultValue: 'Year' })}
              </span>
              <DropdownSelect
                ariaLabel={t('payroll.form.year', { defaultValue: 'Year' })}
                className="w-full justify-between"
                contentClassName="w-28"
                value={String(periodYear)}
                onChange={(v) => setPeriodYear(Number(v))}
                options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="mgr-payroll-amount" className="text-sm font-medium text-foreground block mb-1.5">
              {t('payroll.form.amount', { defaultValue: 'Paid Amount (ETB)' })} <span className="text-destructive">*</span>
            </label>
            {userId && (
              <p className="text-xs text-muted-foreground mb-1.5">
                {isLoadingRef
                  ? t('payroll.form.loadingRef', { defaultValue: 'Loading reference salary…' })
                  : refSalary !== null
                    ? t('payroll.form.refSuggested', { defaultValue: `Suggested reference salary — edit to what you actually paid (${formatCurrency(refSalary)})`, amount: formatCurrency(refSalary) })
                    : t('payroll.form.refSuggestedFallback', { defaultValue: 'Suggested reference salary — edit to what you actually paid' })}
              </p>
            )}
            <Input
              id="mgr-payroll-amount"
              type="number"
              step="1"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="font-mono"
              disabled={isLoadingRef}
            />
          </div>

          <div>
            <label htmlFor="mgr-payroll-note" className="text-sm font-medium text-foreground block mb-1.5">
              {t('payroll.form.note', { defaultValue: 'Note' })} <span className="text-muted-foreground font-normal">({t('payroll.form.optional', { defaultValue: 'optional' })})</span>
            </label>
            <Input
              id="mgr-payroll-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('payroll.form.notePlaceholder', { defaultValue: 'e.g. Paid in cash on the 28th' })}
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {t('payroll.loggedInExpenses')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Every payroll payment is recorded on the Expenses page under the Payroll category — nothing to enter twice.
              </span>
            </span>
          </div>
        </div>
      </Sheet>

      {/* Employee payroll history — float card opened from the ledger */}
      <AnimatePresence>
        {detailEmployee && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setDetailEmployee(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Payroll history for ${detailEmployee.name}`}
                className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border p-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">{detailEmployee.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {detailEmployee.role} · {detailEmployee.payments.length} payment{detailEmployee.payments.length === 1 ? '' : 's'}
                      {detailEmployee.adjustments.length > 0 ? ` · ${detailEmployee.adjustments.length} correction${detailEmployee.adjustments.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailEmployee(null)}
                    aria-label={t('payroll.a11yClose')}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-primary/20 bg-primary/5 px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('payroll.totalPaid')}</span>
                  <span className="font-mono text-lg font-bold text-primary">{formatCurrency(detailEmployee.totalPaid)}</span>
                </div>

                <div className="flex-1 divide-y divide-border/50 overflow-y-auto">
                  {detailHistory.map((row) => (
                    <div key={row.key} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{row.period}</span>
                          {row.isAdjustment && (
                            <span className="rounded bg-[hsl(var(--warning))]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--warning))]">
                              {t('payroll.correction')}
                            </span>
                          )}
                        </div>
                        <span className={`font-mono text-sm font-bold ${row.isAdjustment ? 'text-[hsl(var(--warning))]' : 'text-primary'}`}>
                          {formatCurrency(row.paid)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {row.base !== undefined && <span>Base {formatCurrency(row.base)}</span>}
                        {row.by && <span>By {row.by}</span>}
                        <span>{row.date}</span>
                      </div>
                      {row.note && <p className="mt-1 truncate text-xs italic text-muted-foreground">{row.note}</p>}
                    </div>
                  ))}
                </div>

                <div className="border-t border-border p-4">
                  <Button variant="outline" onClick={() => setDetailEmployee(null)} className="w-full">
                    {t('payroll.form.cancel', { defaultValue: 'Close' })}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
