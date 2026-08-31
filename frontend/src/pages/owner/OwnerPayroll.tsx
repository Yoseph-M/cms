import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Plus, Download, RotateCcw, ChevronRight, User, TrendingUp, TrendingDown, Minus, Info
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { exportRowsCSV } from '../../utils/csvExport';
import { EmptyState } from '../../components/common/EmptyState';
import { extractErrorMessage } from '../../utils/errorHandler';

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
const LEDGER_ROW_HEIGHT = 48;
const LEDGER_LIST_HEIGHT = 420;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear + i);

type LedgerDisplayRow =
  | { kind: 'payment'; data: PayrollRecord }
  | { kind: 'adjustment'; data: PayrollRecord };

export const OwnerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
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

  const [ledger, setLedger] = useState<PayrollRecord[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const [detailRow, setDetailRow] = useState<PayrollRecord | null>(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjReason, setAdjReason] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const fetchLedger = useCallback(async () => {
    try {
      const res = await axiosClient.get('/payroll');
      setLedger(res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load payroll ledger.'));
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await axiosClient.get('/users');
      setStaff(
        res.data.filter((u: StaffUser) => u.isActive && u.role !== 'OWNER')
      );
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchLedger(), fetchStaff()]).finally(() => {
      setIsLoading(false);
    });
  }, [fetchLedger, fetchStaff]);

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
      addToast({ type: 'error', title: 'Staff is required.' });
      return;
    }
    
    if (calculatedPaidAmount < 0) {
      addToast({ type: 'error', title: 'Calculated paid amount cannot be negative.' });
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

  const paymentRows = useMemo(
    () => ledger.filter((r) => r.recordType !== 'adjustment'),
    [ledger]
  );

  const displayRows = useMemo<LedgerDisplayRow[]>(() => {
    const rows: LedgerDisplayRow[] = [];
    paymentRows.forEach((payment) => {
      rows.push({ kind: 'payment', data: payment });
    });
    return rows;
  }, [paymentRows]);

  const totalPaid = useMemo(() => {
    return ledger.reduce((sum, r) => {
      if (r.recordType === 'adjustment') {
        return sum + r.paidAmount;
      }
      return sum + r.paidAmount;
    }, 0);
  }, [ledger]);

  const exportCSV = useCallback(() => {
    exportRowsCSV(
      ['Staff', 'Role', 'Period', 'Base Salary', 'Paid', 'Processed By', 'Date', 'Note'],
      ledger.map((r) => {
        if (r.recordType === 'adjustment') {
          return ['(correction)', r.user.name, `${r.periodMonth}/${r.periodYear}`, '', formatCurrency(r.paidAmount), r.processedBy?.name || '', new Date(r.createdAt).toLocaleDateString(), r.reason || ''];
        }
        return [
          r.user.name, r.user.role,
          `${r.periodMonth}/${r.periodYear}`,
          formatCurrency(r.baseSalary), formatCurrency(r.paidAmount),
          r.processedBy?.name || '', new Date(r.createdAt).toLocaleDateString(), r.note || ''
        ];
      }),
      'payroll-ledger',
      { title: 'Payroll Ledger', meta: [`Generated: ${new Date().toLocaleString()}`] }
    );
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
              {MONTHS[p.periodMonth - 1]} {p.periodYear}
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
      return null;
    },
    [displayRows]
  );

  const staffWithRecords = useMemo(() => {
    const recordedIds = new Set(ledger.map(l => l.userId));
    return staff.filter(s => recordedIds.has(s.id));
  }, [staff, ledger]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      
      {/* Staff Grid for quick payroll insertion */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Active Staff</h2>
        
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-secondary/40 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <motion.div 
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { resetForm(); setFormOpen(true); }}
              className="bg-primary/5 border border-primary/20 hover:border-primary/40 rounded-xl p-4 shadow-sm cursor-pointer transition-colors flex flex-col items-center justify-center text-primary min-h-[6rem]"
            >
              <Plus className="w-8 h-8 mb-2" />
              <div className="font-semibold text-sm">Add Record</div>
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
                  {formatCurrency(s.salaryAmount)} <span className="text-[10px] text-muted-foreground ml-1">/ mo</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-3">
            Historical Ledger
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                {paymentRows.length} records
              </span>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {formatCurrency(totalPaid)} total paid
              </span>
            </div>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && paymentRows.length === 0 ? (
            <div className="p-6 space-y-2">{Array.from({length: 5}).map((_,i)=><div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchLedger}>Retry</Button>
            </div>
          ) : paymentRows.length === 0 ? (
            <EmptyState
              title="No payroll entries yet"
              message="Click on a staff card above to record your first payroll entry."
              icon={<DollarSign className="w-7 h-7" />}
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
        description={selectedStaff ? `Log payment for ${selectedStaff.name}` : ''}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleRecordEntry}
              disabled={isSubmitting || !userId || calculatedPaidAmount < 0}
              className="flex-1"
            >
              {isSubmitting ? 'Saving...' : 'Record Payment'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          
          <div className="bg-secondary/30 rounded-lg p-4 border border-border/50">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Staff Member</label>
            <Select value={userId} onChange={e => setUserId(e.target.value)} className="mb-4">
              <option value="">Select Staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </Select>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Base Salary</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold font-mono text-foreground text-base">ETB</span>
              <Input
                type="number"
                value={editableBaseSalary}
                onChange={e => setEditableBaseSalary(e.target.value)}
                className="font-bold font-mono text-foreground text-lg pl-12 bg-background border-border"
              />
            </div>
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
            <label className="text-sm font-medium text-foreground block mb-2">Adjustments (Optional)</label>
            <div className="flex gap-2 mb-3">
              <button 
                onClick={() => setAdjustmentType('none')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'none' ? 'bg-secondary border-border text-foreground' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <Minus className="w-4 h-4 mx-auto mb-1" />
                None
              </button>
              <button 
                onClick={() => setAdjustmentType('bonus')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'bonus' ? 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                Bonus
              </button>
              <button 
                onClick={() => setAdjustmentType('deduction')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-colors ${adjustmentType === 'deduction' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'border-transparent text-muted-foreground hover:bg-secondary/40'}`}
              >
                <TrendingDown className="w-4 h-4 mx-auto mb-1" />
                Deduct
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
                    placeholder={`Enter ${adjustmentType} amount in ETB`}
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    className="font-mono mt-1"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20 flex justify-between items-center">
            <span className="font-semibold text-primary text-sm">Total to Pay:</span>
            <span className="font-bold font-mono text-primary text-xl">
              {formatCurrency(calculatedPaidAmount)}
            </span>
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
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setDetailRow(null)} className="w-full">Close</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
