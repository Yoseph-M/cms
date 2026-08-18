import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Plus, Download, RotateCcw, ChevronRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';
import { extractErrorMessage } from '../../utils/errorHandler';

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
  originalPaymentId?: string;
  reason?: string;
  note?: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LEDGER_ROW_HEIGHT = 48;
const LEDGER_LIST_HEIGHT = 420;
const YEARS = [2024, 2025, 2026, 2027];

type LedgerDisplayRow =
  | { kind: 'payment'; data: PayrollRecord }
  | { kind: 'adjustment'; data: PayrollRecord };

export const OwnerPayroll: React.FC = () => {
  const { addToast } = useToastStore();

  const [ledger, setLedger] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const [detailRow, setDetailRow] = useState<PayrollRecord | null>(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjReason, setAdjReason] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const fetchLedger = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/payroll');
      setLedger(res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load payroll ledger.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axiosClient.get('/users');
      setStaff(
        res.data.filter((u: StaffUser) => u.isActive && u.role !== 'OWNER')
      );
    } catch {
      // silent — form will show empty select
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
      addToast({ type: 'error', title: 'Could not load salary reference', message: extractErrorMessage(err) });
    } finally {
      setIsLoadingRef(false);
    }
  };

  const handleRecordEntry = async () => {
    if (!userId || !paidAmount) {
      addToast({ type: 'error', title: 'Staff and paid amount are required.' });
      return;
    }
    const amount = parseFloat(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      addToast({ type: 'error', title: 'Paid amount must be a non-negative number.' });
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
      addToast({ type: 'success', title: 'Payroll entry recorded' });
      setFormOpen(false);
      resetForm();
      fetchLedger();
    } catch (err: any) {
      const detail = err.response?.data?.details?.[0]?.error;
      addToast({
        type: 'error',
        title: 'Could not record entry',
        message: detail || extractErrorMessage(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustment = async () => {
    if (!detailRow || !adjReason.trim() || !adjAmount) {
      addToast({ type: 'error', title: 'Reason and amount are required.' });
      return;
    }
    setIsAdjusting(true);
    try {
      await axiosClient.post('/payroll/adjustments', {
        originalPaymentId: detailRow.id,
        reason: adjReason,
        adjustmentAmount: parseFloat(adjAmount),
      });
      addToast({ type: 'success', title: 'Correction issued' });
      setAdjOpen(false);
      setAdjReason('');
      setAdjAmount('');
      setDetailRow(null);
      fetchLedger();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Adjustment failed', message: extractErrorMessage(err) });
    } finally {
      setIsAdjusting(false);
    }
  };

  const MONTHS_LOCAL = MONTHS;
  const paymentRows = useMemo(
    () => ledger.filter((r) => r.recordType !== 'adjustment'),
    [ledger]
  );

  const displayRows = useMemo<LedgerDisplayRow[]>(() => {
    const rows: LedgerDisplayRow[] = [];
    paymentRows.forEach((payment) => {
      rows.push({ kind: 'payment', data: payment });
      ledger
        .filter((a) => a.recordType === 'adjustment' && a.originalPaymentId === payment.id)
        .forEach((adj) => rows.push({ kind: 'adjustment', data: adj }));
    });
    return rows;
  }, [paymentRows, ledger]);

  const exportCSV = useCallback(() => {
    const rows = [['Staff', 'Role', 'Period', 'Base Salary', 'Paid', 'Processed By', 'Date', 'Note']];
    ledger.forEach(r => {
      if (r.recordType === 'adjustment') {
        rows.push(['(correction)', r.user.name, `${r.periodMonth}/${r.periodYear}`, '', formatCurrency(r.paidAmount), r.processedBy?.name || '', new Date(r.createdAt).toLocaleDateString(), r.reason || '']);
      } else {
        rows.push([
          r.user.name, r.user.role,
          `${r.periodMonth}/${r.periodYear}`,
          formatCurrency(r.baseSalary), formatCurrency(r.paidAmount),
          r.processedBy?.name || '', new Date(r.createdAt).toLocaleDateString(), r.note || ''
        ]);
      }
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payroll-ledger.csv'; a.click();
  }, [ledger]);

  const renderLedgerRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = displayRows[index];
      if (!row) return null;

      if (row.kind === 'payment') {
        const p = row.data;
        return (
          <div
            style={style}
            className="flex items-center border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors text-sm px-4"
            onClick={() => setDetailRow(p)}
          >
            <div className="flex-[2] font-medium truncate">{p.user.name}</div>
            <div className="flex-1 text-center hidden sm:block text-muted-foreground">
              {MONTHS_LOCAL[p.periodMonth - 1]} {p.periodYear}
            </div>
            <div className="flex-1 text-right hidden md:block font-mono text-muted-foreground">
              {formatCurrency(p.baseSalary)}
            </div>
            <div className="flex-1 text-right font-mono font-bold text-primary">
              {formatCurrency(p.paidAmount)}
            </div>
            <div className="flex-1 hidden lg:block text-muted-foreground text-xs truncate">
              {p.processedBy?.name}
            </div>
            <div className="flex-1 hidden lg:block text-muted-foreground text-xs">
              {new Date(p.createdAt).toLocaleDateString()}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        );
      }

      const adj = row.data;
      return (
        <div
          style={style}
          className="flex items-center border-b border-border/30 bg-[hsl(var(--warning))]/5 text-sm px-4 pl-8"
        >
          <div className="flex-[2] text-xs text-muted-foreground italic">↳ Correction</div>
          <div className="flex-1 hidden sm:block" />
          <div className="flex-1 hidden md:block" />
          <div className="flex-1 text-right font-mono text-xs text-[hsl(var(--warning))]">
            {formatCurrency(adj.paidAmount)}
          </div>
          <div className="flex-[2] hidden lg:block text-xs text-muted-foreground truncate">
            {adj.reason}
          </div>
        </div>
      );
    },
    [displayRows]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />Record Payroll Entry
            </CardTitle>
            <Button id="record-payroll-btn" onClick={openForm}>
              <Plus className="w-4 h-4 mr-2" />New Entry
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold">Payroll Ledger</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-2" />Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">{Array.from({length: 5}).map((_,i)=><div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchLedger}>Retry</Button>
            </div>
          ) : paymentRows.length === 0 ? (
            <EmptyState
              title="No payroll entries yet"
              message="Record your first payroll entry to build the ledger. You can log what was actually paid per staff member and period."
              icon={<DollarSign className="w-7 h-7" />}
              action={{
                label: 'Record your first payroll entry',
                onClick: openForm,
                icon: <Plus className="w-4 h-4 mr-1.5" />,
              }}
            />
          ) : (
            <div>
              <div className="flex items-center border-b border-border bg-secondary/30 text-sm px-4 py-3 font-semibold text-muted-foreground">
                <div className="flex-[2]">Staff</div>
                <div className="flex-1 text-center hidden sm:block">Period</div>
                <div className="flex-1 text-right hidden md:block">Base</div>
                <div className="flex-1 text-right">Paid</div>
                <div className="flex-1 hidden lg:block">By</div>
                <div className="flex-1 hidden lg:block">Date</div>
                <div className="w-4" />
              </div>
              <FixedSizeList
                height={LEDGER_LIST_HEIGHT}
                itemCount={displayRows.length}
                itemSize={LEDGER_ROW_HEIGHT}
                width="100%"
              >
                {renderLedgerRow}
              </FixedSizeList>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Record Payroll Entry"
        description="Log what was actually paid for a staff member and period."
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleRecordEntry}
              disabled={isSubmitting || !userId || !paidAmount}
              className="flex-1"
            >
              {isSubmitting ? 'Saving...' : 'Record Entry'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="payroll-staff" className="text-sm font-medium text-foreground block mb-1.5">
              Staff <span className="text-destructive">*</span>
            </label>
            <Select
              id="payroll-staff"
              value={userId}
              onChange={(e) => handleStaffChange(e.target.value)}
            >
              <option value="">Select staff member</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="payroll-month" className="text-sm font-medium text-foreground block mb-1.5">
                Period Month
              </label>
              <Select
                id="payroll-month"
                value={String(periodMonth)}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <label htmlFor="payroll-year" className="text-sm font-medium text-foreground block mb-1.5">
                Year
              </label>
              <Select
                id="payroll-year"
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
            <label htmlFor="payroll-amount" className="text-sm font-medium text-foreground block mb-1.5">
              Paid Amount (ETB) <span className="text-destructive">*</span>
            </label>
            {userId && (
              <p className="text-xs text-muted-foreground mb-1.5">
                {isLoadingRef
                  ? 'Loading reference salary…'
                  : refSalary !== null
                    ? `Suggested reference salary — edit to what you actually paid (${formatCurrency(refSalary)})`
                    : 'Suggested reference salary — edit to what you actually paid'}
              </p>
            )}
            <Input
              id="payroll-amount"
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
            <label htmlFor="payroll-note" className="text-sm font-medium text-foreground block mb-1.5">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="payroll-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid in cash on the 28th"
            />
          </div>
        </div>
      </Sheet>

      <AnimatePresence>
        {detailRow && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => { setDetailRow(null); setAdjOpen(false); }} />
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md pointer-events-auto">
                <h3 className="font-bold text-base mb-4">{detailRow.user.name} — {MONTHS[detailRow.periodMonth-1]} {detailRow.periodYear}</h3>
                <div className="space-y-2 mb-5 text-sm">
                  {[
                    ['Base Salary', formatCurrency(detailRow.baseSalary)],
                    ['Amount Paid', formatCurrency(detailRow.paidAmount)],
                    ['Processed By', detailRow.processedBy?.name],
                    ['Date', new Date(detailRow.createdAt).toLocaleDateString()],
                    ...(detailRow.note ? [['Note', detailRow.note] as const] : []),
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-1 border-b border-border/50 gap-4">
                      <span className="text-muted-foreground shrink-0">{label}</span>
                      <span className="font-medium text-right truncate">{val}</span>
                    </div>
                  ))}
                </div>
                {!adjOpen ? (
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setDetailRow(null)} className="flex-1">Close</Button>
                    <Button onClick={() => { setAdjOpen(true); setAdjReason(''); setAdjAmount(''); }} className="flex-1">
                      <RotateCcw className="w-3.5 h-3.5 mr-2" />Issue Correction
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-[hsl(var(--warning))] font-medium">
                      A correction creates a new linked record — the original is never modified.
                    </p>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Adjustment Amount (ETB)</label>
                      <Input id="adj-amount" value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                        placeholder="-100 (deduction) or +200 (bonus)" type="number" step="0.01" />
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Reason <span className="text-destructive">*</span></label>
                      <Input id="adj-reason" value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="e.g. Advance repayment deduction" />
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => setAdjOpen(false)} className="flex-1">Back</Button>
                      <Button onClick={handleAdjustment} disabled={isAdjusting} className="flex-1">
                        {isAdjusting ? 'Saving...' : 'Confirm Correction'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
