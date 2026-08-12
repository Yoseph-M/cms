import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import {
  DollarSign, Plus
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
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = [2024, 2025, 2026, 2027];
const SCOPED_ROLES = ['CASHIER', 'WAITER', 'COOKER', 'BARISTA'];

export const ManagerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('manager');

  const [ledger, setLedger] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [paidAmount, setPaidAmount] = useState('');
  const [note, setNote] = useState('');
  const [refSalary, setRefSalary] = useState<number | null>(null);
  const [isLoadingRef, setIsLoadingRef] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLedger = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axiosClient.get('/payroll?scope=manager');
      setLedger(
        res.data.filter((r: PayrollRecord) => SCOPED_ROLES.includes(r.user?.role))
      );
    } catch {
      setLedger([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axiosClient.get('/users');
      setStaff(
        res.data.filter(
          (u: StaffUser) => u.isActive && SCOPED_ROLES.includes(u.role)
        )
      );
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

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
    fetchStaff();
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
      addToast({ type: 'error', title: t('toasts.refSalaryError', { defaultValue: 'Could not load salary reference' }), message: err.response?.data?.error });
    } finally {
      setIsLoadingRef(false);
    }
  };

  const handleRecordEntry = async () => {
    if (!userId || !paidAmount) {
      addToast({ type: 'error', title: t('toasts.staffAmountRequired', { defaultValue: 'Staff and paid amount are required.' }) });
      return;
    }
    const amount = parseFloat(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      addToast({ type: 'error', title: t('toasts.invalidAmount', { defaultValue: 'Paid amount must be a non-negative number.' }) });
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
      addToast({ type: 'success', title: t('toasts.payrollRecorded', { defaultValue: 'Payroll entry recorded' }) });
      setFormOpen(false);
      resetForm();
      fetchLedger();
    } catch (err: any) {
      const detail = err.response?.data?.details?.[0]?.error;
      addToast({
        type: 'error',
        title: t('toasts.payrollRecordError', { defaultValue: 'Could not record entry' }),
        message: detail || err.response?.data?.error,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
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
          ) : ledger.length === 0 ? (
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold">
                  <th className="px-4 py-3 text-left font-semibold">{t('payroll.columns.staff', { defaultValue: 'Staff' })}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t('payroll.columns.period', { defaultValue: 'Period' })}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('payroll.columns.paid', { defaultValue: 'Paid' })}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('payroll.columns.date', { defaultValue: 'Date' })}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{row.user?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {/* TODO: translate month names if desired, for now use standard abbreviation mapping or keep English fallback */}
                      {MONTHS[row.periodMonth - 1]} {row.periodYear}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                      {formatCurrency(row.paidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <label htmlFor="mgr-payroll-staff" className="text-sm font-medium text-foreground block mb-1.5">
              {t('payroll.form.staff', { defaultValue: 'Staff' })} <span className="text-destructive">*</span>
            </label>
            <Select
              id="mgr-payroll-staff"
              value={userId}
              onChange={(e) => handleStaffChange(e.target.value)}
            >
              <option value="">{t('payroll.form.selectStaff', { defaultValue: 'Select staff member' })}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="mgr-payroll-month" className="text-sm font-medium text-foreground block mb-1.5">
                {t('payroll.form.month', { defaultValue: 'Period Month' })}
              </label>
              <Select
                id="mgr-payroll-month"
                value={String(periodMonth)}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <label htmlFor="mgr-payroll-year" className="text-sm font-medium text-foreground block mb-1.5">
                {t('payroll.form.year', { defaultValue: 'Year' })}
              </label>
              <Select
                id="mgr-payroll-year"
                value={String(periodYear)}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
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
              step="0.01"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0.00"
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
        </div>
      </Sheet>
    </div>
  );
};
