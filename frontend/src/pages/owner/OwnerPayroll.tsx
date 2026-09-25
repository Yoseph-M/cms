import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
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
  DollarSign, Plus, ChevronRight, TrendingUp, TrendingDown, Minus, X, Receipt
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useTranslation } from 'react-i18next';

interface StaffUser {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  salaryAmount: number; // in cents
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
  originalPaymentId?: string;
  reason?: string;
  note?: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
const LEDGER_ROW_HEIGHT = 48;
const LEDGER_LIST_HEIGHT = 420;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear + i);

/** One row of the Historical Ledger — a single employee with all their records. */
interface EmployeeLedger {
  userId: string;
  name: string;
  role: string;
  payments: PayrollRecord[];
  adjustments: PayrollRecord[];
  totalPaid: number;
  latest: PayrollRecord;
}

export const OwnerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t } = useTranslation('common');

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({
      title: t('payroll.title', { defaultValue: 'Payroll' }),
      subtitle: t('payroll.subtitle', { defaultValue: 'Salary records and adjustments' }),
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: t('app.overview', { defaultValue: 'Overview' }), subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  const queryClient = useQueryClient();
  const payrollQuery = usePayrollQuery();
  const usersQuery = useUsersQuery();

  const ledger: PayrollRecord[] = Array.isArray(payrollQuery.data) ? payrollQuery.data : [];
  const staff: StaffUser[] = useMemo(
    () => (Array.isArray(usersQuery.data) ? usersQuery.data.filter((u: StaffUser) => u.isActive && u.role !== 'OWNER') : []),
    [usersQuery.data],
  );
  const isLoading = payrollQuery.isLoading || usersQuery.isLoading;
  const error = payrollQuery.error ? 'Failed to load payroll ledger.' : null;

  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  
  // Form specific state for bonus/deduction logic
  const [adjustmentType, setAdjustmentType] = useState<'none' | 'bonus' | 'deduction'>('none');
  const [adjustmentAmount, setAdjustmentAmount] = useState(''); // user types here
  const [editableBaseSalary, setEditableBaseSalary] = useState<string>('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [detailEmployee, setDetailEmployee] = useState<EmployeeLedger | null>(null);

  const invalidatePayroll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['payroll'] });
  }, [queryClient]);

  const resetForm = () => {
    setUserId('');
    setPeriodMonth(new Date().getMonth() + 1);
    setPeriodYear(new Date().getFullYear());
    setAdjustmentType('none');
    setAdjustmentAmount('');
    setNote('');
  };

  const openFormForStaff = (staffId: string) => {
    resetForm();
    setUserId(staffId);
    setFormOpen(true);
  };

  const selectedStaff = useMemo(() => staff.find(s => s.id === userId), [staff, userId]);
  
  useEffect(() => {
    setEditableBaseSalary(String(selectedStaff?.salaryAmount || ''));
  }, [selectedStaff]);

  const calculatedPaidAmount = useMemo(() => {
    const base = Number(editableBaseSalary) || 0;
    const adj = Number(adjustmentAmount) || 0;
    if (adjustmentType === 'bonus') return base + adj;
    if (adjustmentType === 'deduction') return Math.max(0, base - adj);
    return base;
  }, [editableBaseSalary, adjustmentType, adjustmentAmount]);

  const handleRecordEntry = async () => {
    if (!userId) {
      addToast({ type: 'error', title: t('payroll.staffRequired', { defaultValue: 'Staff is required.' }) });
      return;
    }
    
    if (calculatedPaidAmount < 0) {
      addToast({ type: 'error', title: t('payroll.amountNegative', { defaultValue: 'Calculated paid amount cannot be negative.' }) });
      return;
    }

    let finalNote = note.trim();
    if (adjustmentType === 'bonus' && Number(adjustmentAmount) > 0) {
      finalNote = finalNote ? `[Bonus: +${adjustmentAmount}] ${finalNote}` : `[Bonus: +${adjustmentAmount}]`;
    } else if (adjustmentType === 'deduction' && Number(adjustmentAmount) > 0) {
      finalNote = finalNote ? `[Deduction: -${adjustmentAmount}] ${finalNote}` : `[Deduction: -${adjustmentAmount}]`;
    }

    setIsSubmitting(true);
    try {
      await axiosClient.post('/payroll/entries', {
        userId,
        periodMonth,
        periodYear,
        paidAmount: calculatedPaidAmount,
        note: finalNote || undefined,
      });
      addToast({
        type: 'success',
        title: t('payroll.recorded', { defaultValue: 'Payroll entry recorded' }),
        message: t('payroll.recordedMsg', { defaultValue: 'Also logged in Expenses under Payroll.' }),
      });
      setFormOpen(false);
      resetForm();
      invalidatePayroll();
    } catch (err: any) {
      const detail = err.response?.data?.details?.[0]?.error;
      addToast({
        type: 'error',
        title: t('payroll.recordFailed', { defaultValue: 'Could not record entry' }),
        message: detail || extractErrorMessage(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentRows = useMemo(
    () => ledger.filter((r) => r.recordType !== 'adjustment'),
    [ledger]
  );

  /**
   * Historical Ledger, grouped per employee: one row per person who has been
   * paid. Clicking a row opens a float card with that employee's full history.
   */
  const employeeLedger = useMemo<EmployeeLedger[]>(() => {
    const groups = new Map<string, EmployeeLedger>();
    for (const record of ledger) {
      const isAdjustment = record.recordType === 'adjustment';
      let group = groups.get(record.userId);
      if (!group) {
        // Adjustments are always attached to a payment, so an employee that only
        // shows up as a correction has no ledger row of their own.
        if (isAdjustment) continue;
        group = {
          userId: record.userId,
          name: record.user.name,
          role: record.user.role,
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
      // Server returns payments newest-first, so payments[0] is the latest period.
      row.latest = row.payments[0];
    });
    return rows.sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [ledger]);

  const totalPaid = useMemo(
    () => ledger.reduce((sum, r) => sum + r.paidAmount, 0),
    [ledger]
  );

  /** Payroll for the current period, summed over every staff member. */
  const payrollThisMonth = useMemo(() => {
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

  const renderLedgerRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const employee = employeeLedger[index];
      if (!employee) return null;
      const open = () => setDetailEmployee(employee);
      return (
        <div
          style={style}
          role="button"
          tabIndex={0}
          aria-label={`View payroll history for ${employee.name}`}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open();
            }
          }}
          className="flex items-center border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors text-sm px-4 focus:outline-none focus-visible:bg-secondary/40"
        >
          <div className="flex-[2] min-w-0 pr-2">
            <div className="font-medium truncate">{employee.name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{employee.role}</div>
          </div>
          <div className="flex-1 text-center hidden sm:block text-muted-foreground">
            {MONTHS[employee.latest.periodMonth - 1]} {employee.latest.periodYear}
          </div>
          <div className="flex-1 text-center hidden md:block text-muted-foreground">
            {employee.payments.length}
            {employee.adjustments.length > 0 ? ` +${employee.adjustments.length}` : ''}
          </div>
          <div className="flex-1 text-right font-mono font-bold text-primary">
            {formatCurrency(employee.totalPaid)}
          </div>
          <div className="flex-1 hidden lg:block text-muted-foreground text-xs">
            {new Date(employee.latest.createdAt).toLocaleDateString()}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      );
    },
    [employeeLedger]
  );

  const staffWithRecords = useMemo(() => {
    const recordedIds = new Set(ledger.map(l => l.userId));
    return staff.filter(s => recordedIds.has(s.id));
  }, [staff, ledger]);

  const now = new Date();

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">

      {/* Payroll totals — every staff member's payments rolled up. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 max-[419px]:grid-cols-1">
        <PayrollStat
          label={t('payroll.totalAllStaff', { defaultValue: 'Total payroll · all staff' })}
          value={formatCurrency(totalPaid)}
          hint={t('payroll.paymentsRecorded', { count: paymentRows.length, defaultValue: '{{count}} payments recorded' })}
          accent="text-primary"
        />
        <PayrollStat
          label={`${t('payroll.thisMonth', { defaultValue: 'This month' })} · ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}
          value={formatCurrency(payrollThisMonth)}
          hint={t('payroll.currentPeriod', { defaultValue: 'Current payroll period' })}
          accent="text-emerald-600"
        />
        <PayrollStat
          label={t('payroll.staffOnPayroll', { defaultValue: 'Staff on payroll' })}
          value={String(employeeLedger.length)}
          hint={t('payroll.activeStaffTotal', { count: staff.length, defaultValue: '{{count}} active staff in total' })}
          accent="text-sky-600"
        />
        <PayrollStat
          label={t('payroll.adjustments', { defaultValue: 'Adjustments' })}
          value={String(ledger.length - paymentRows.length)}
          hint={t('payroll.adjustmentsHint', { defaultValue: 'Bonuses and deductions' })}
          accent="text-[hsl(var(--warning))]"
        />
      </div>

      {/* Staff Grid for quick payroll insertion */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">{t('payroll.activeStaff', { defaultValue: 'Active Staff' })}</h2>
        
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-[419px]:grid-cols-1 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-secondary/40 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-[419px]:grid-cols-1 gap-4">
            <motion.div 
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { resetForm(); setFormOpen(true); }}
              className="bg-primary/5 border border-primary/20 hover:border-primary/40 rounded-xl p-4 shadow-sm cursor-pointer transition-colors flex flex-col items-center justify-center text-primary min-h-[6rem]"
            >
              <Plus className="w-8 h-8 mb-2" />
              <div className="font-semibold text-sm">{t('payroll.addRecord', { defaultValue: 'Add Record' })}</div>
            </motion.div>
            {staffWithRecords.map(s => (
              <motion.div 
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={s.id} 
                onClick={() => openFormForStaff(s.id)}
                className="bg-card border border-border hover:border-primary/40 rounded-xl p-4 shadow-sm cursor-pointer transition-colors"
              >
                <div className="font-semibold text-foreground truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground mb-3">{s.role}</div>
                <div className="text-sm font-mono font-medium text-primary">
                  {formatCurrency(s.salaryAmount)} <span className="text-[10px] text-muted-foreground ml-1">{t('payroll.perMonth', { defaultValue: '/ mo' })}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-3">
            {t('payroll.historicalLedger', { defaultValue: 'Historical Ledger' })}
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                {t('payroll.staffAndRecords', { count: employeeLedger.length, records: paymentRows.length, defaultValue: '{{count}} staff · {{records}} records' })}
              </span>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {t('payroll.totalPaid', { total: formatCurrency(totalPaid), defaultValue: '{{total}} total paid' })}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && paymentRows.length === 0 ? (
            <div className="p-6 space-y-2">{Array.from({length: 5}).map((_,i)=><div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={invalidatePayroll}>{t('payroll.retry', { defaultValue: 'Retry' })}</Button>
            </div>
          ) : employeeLedger.length === 0 ? (
            <EmptyState
              title={t('payroll.emptyTitle', { defaultValue: 'No payroll entries yet' })}
              message={t('payroll.emptyMsg', { defaultValue: 'Click on a staff card above to record your first payroll entry.' })}
              icon={<DollarSign className="w-7 h-7" />}
            />
          ) : (
            <div>                <div className="flex items-center border-b border-border bg-secondary/30 text-sm px-4 py-3 font-semibold text-muted-foreground">
                  <div className="flex-[2]">{t('payroll.colStaff', { defaultValue: 'Staff' })}</div>
                  <div className="flex-1 text-center hidden sm:block">{t('payroll.colLastPeriod', { defaultValue: 'Last period' })}</div>
                  <div className="flex-1 text-center hidden md:block">{t('payroll.colRecords', { defaultValue: 'Records' })}</div>
                  <div className="flex-1 text-right">{t('payroll.colTotalPaid', { defaultValue: 'Total paid' })}</div>
                  <div className="flex-1 hidden lg:block">{t('payroll.colLastPaid', { defaultValue: 'Last paid' })}</div>
                  <div className="w-4" />
                </div>
              <FixedSizeList
                height={LEDGER_LIST_HEIGHT}
                itemCount={employeeLedger.length}
                itemSize={LEDGER_ROW_HEIGHT}
                width="100%"
              >
                {renderLedgerRow}
              </FixedSizeList>
              <div className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
                {t('payroll.tapEmployee', { defaultValue: 'Tap an employee to open their full payroll history.' })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('payroll.formTitle', { defaultValue: 'Record Payroll Entry' })}
        description={selectedStaff ? t('payroll.logPaymentFor', { name: selectedStaff.name, defaultValue: 'Log payment for {{name}}' }) : ''}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1">{t('payroll.cancel', { defaultValue: 'Cancel' })}</Button>
            <Button
              onClick={handleRecordEntry}
              disabled={isSubmitting || !userId || calculatedPaidAmount < 0}
              className="flex-1"
            >
              {isSubmitting ? t('payroll.saving', { defaultValue: 'Saving...' }) : t('payroll.recordPayment', { defaultValue: 'Record Payment' })}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          
          <div className="bg-secondary/30 rounded-lg p-4 border border-border/50">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">{t('payroll.staffMember', { defaultValue: 'Staff Member' })}</label>
            <DropdownSelect
              ariaLabel={t('payroll.staffMember', { defaultValue: 'Staff Member' })}
              className="w-full justify-between mb-4"
              contentClassName="max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
              value={userId}
              onChange={setUserId}
              placeholder={t('payroll.selectStaff', { defaultValue: 'Select Staff' })}
              options={staff.map(s => ({ value: s.id, label: `${s.name} (${s.role})` }))}
            />
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">{t('payroll.baseSalary', { defaultValue: 'Base Salary' })}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold font-mono text-foreground text-base">ETB</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={editableBaseSalary}
                onChange={e => setEditableBaseSalary(e.target.value.replace(/[^\d]/g, ''))}
                className="font-bold font-mono text-foreground text-lg pl-12 bg-background border-border"
              />
            </div>
          </div>

          <div className="bg-secondary/30 rounded-lg p-4 border border-border/50 flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                {t('payroll.periodMonth', { defaultValue: 'Period Month' })}
              </label>
              <DropdownSelect
                ariaLabel={t('payroll.periodMonth', { defaultValue: 'Period Month' })}
                className="w-full justify-between"
                contentClassName="max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
                value={String(periodMonth)}
                onChange={(v) => setPeriodMonth(Number(v))}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                {t('payroll.year', { defaultValue: 'Year' })}
              </label>
              <DropdownSelect
                ariaLabel={t('payroll.year', { defaultValue: 'Year' })}
                className="w-full justify-between"
                contentClassName="max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
                value={String(periodYear)}
                onChange={(v) => setPeriodYear(Number(v))}
                options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-2">{t('payroll.adjustmentsOptional', { defaultValue: 'Adjustments (Optional)' })}</label>
            <div className="flex gap-2 mb-3">
              <button 
                onClick={() => setAdjustmentType('none')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'none' ? 'bg-secondary border-border text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <Minus className="w-4 h-4 mx-auto mb-1" />
                {t('payroll.adjNone', { defaultValue: 'None' })}
              </button>
              <button 
                onClick={() => setAdjustmentType('bonus')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'bonus' ? 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                {t('payroll.adjBonus', { defaultValue: 'Bonus' })}
              </button>
              <button 
                onClick={() => setAdjustmentType('deduction')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'deduction' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <TrendingDown className="w-4 h-4 mx-auto mb-1" />
                {t('payroll.adjDeduct', { defaultValue: 'Deduct' })}
              </button>
            </div>

            <AnimatePresence>
              {adjustmentType !== 'none' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={t('payroll.adjustmentPlaceholder', { kind: adjustmentType, defaultValue: 'Enter {{kind}} amount in ETB' })}
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value.replace(/[^\d]/g, ''))}
                    className="font-mono mt-1"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20 flex justify-between items-center">
            <span className="font-semibold text-primary text-sm">{t('payroll.totalToPay', { defaultValue: 'Total to Pay:' })}</span>
            <span className="font-bold font-mono text-primary text-xl">
              {formatCurrency(calculatedPaidAmount)}
            </span>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {t('payroll.autoExpenses', { defaultValue: 'Logged in Expenses automatically' })}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t('payroll.autoExpensesMsg', { defaultValue: 'Every payroll payment is recorded on the Expenses page under the Payroll category — nothing to enter twice.' })}
              </span>
            </span>
          </div>

          <div>
            <label htmlFor="payroll-note" className="text-sm font-medium text-foreground block mb-1.5">
              {t('payroll.note', { defaultValue: 'Note' })} <span className="text-muted-foreground font-normal">{t('payroll.optional', { defaultValue: '(optional)' })}</span>
            </label>
            <Input
              id="payroll-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('payroll.notePlaceholder', { defaultValue: 'e.g. Paid in cash on the 28th' })}
            />
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
                      {detailEmployee.role} · {t('payroll.paymentsCount', { count: detailEmployee.payments.length, defaultValue: '{{count}} payments' })}
                      {detailEmployee.adjustments.length > 0 ? ` · ${t('payroll.correctionsCount', { count: detailEmployee.adjustments.length, defaultValue: '{{count}} corrections' })}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailEmployee(null)}
                    aria-label={t('payroll.close', { defaultValue: 'Close' })}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-primary/20 bg-primary/5 px-5 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{t('payroll.colTotalPaid', { defaultValue: 'Total paid' })}</span>
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
                              {t('payroll.correction', { defaultValue: 'Correction' })}
                            </span>
                          )}
                        </div>
                        <span className={`font-mono text-sm font-bold ${row.isAdjustment ? 'text-[hsl(var(--warning))]' : 'text-primary'}`}>
                          {row.isAdjustment ? `+${formatCurrency(row.paid)}` : formatCurrency(row.paid)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {row.base !== undefined && <span>{t('payroll.base', { base: formatCurrency(row.base), defaultValue: 'Base {{base}}' })}</span>}
                        {row.by && <span>{t('payroll.by', { name: row.by, defaultValue: 'By {{name}}' })}</span>}
                        <span>{row.date}</span>
                      </div>
                      {row.note && <p className="mt-1 truncate text-xs italic text-muted-foreground">{row.note}</p>}
                    </div>
                  ))}
                </div>

                <div className="border-t border-border p-4">
                  <Button variant="outline" onClick={() => setDetailEmployee(null)} className="w-full">
                    {t('payroll.close', { defaultValue: 'Close' })}
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
