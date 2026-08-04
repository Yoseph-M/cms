import React, { useState, useEffect, useCallback, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Calendar, CreditCard, Users, Clock, AlertCircle, Download, Plus,
  TrendingUp, TrendingDown, RotateCcw, ChevronRight
} from 'lucide-react';

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
  adjustments?: PayrollAdjustment[];
}

interface PayrollAdjustment {
  id: string;
  originalPaymentId: string;
  adjustmentAmount: number;
  reason: string;
  processedBy: { name: string };
  createdAt: string;
}

export const OwnerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
  const { user } = useAuthStore();

  const [ledger, setLedger] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizMonth, setWizMonth] = useState(() => new Date().getMonth() + 1);
  const [wizYear, setWizYear] = useState(() => new Date().getFullYear());
  const [preview, setPreview] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

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
      setError(err.response?.data?.error || 'Failed to load payroll ledger.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const fetchPreview = async () => {
    setIsLoadingPreview(true);
    setPreview([]);
    try {
      const res = await axiosClient.get('/users');
      const staff = res.data.filter((u: any) => u.isActive && u.role !== 'OWNER');
      const previews = await Promise.all(
        staff.map((s: any) =>
          axiosClient.get(`/payroll/preview/${s.id}/${wizMonth}/${wizYear}`).then(r => r.data)
        )
      );
      setPreview(previews);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Preview failed', message: err.response?.data?.error });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleRunPayroll = async () => {
    setIsRunning(true);
    try {
      const res = await axiosClient.post('/payroll/run', { periodMonth: wizMonth, periodYear: wizYear });
      addToast({ type: 'success', title: `Payroll run: ${res.data.processedCount} paid` });
      setWizardOpen(false);
      fetchLedger();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Payroll run failed', message: err.response?.data?.error });
    } finally {
      setIsRunning(false);
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
      setDetailRow(null);
      fetchLedger();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Adjustment failed', message: err.response?.data?.error });
    } finally {
      setIsAdjusting(false);
    }
  };

  const exportCSV = () => {
    const rows = [['Staff', 'Role', 'Period', 'Base Salary', 'Paid', 'Processed By', 'Date']];
    ledger.forEach(r => {
      rows.push([
        r.user.name, r.user.role,
        `${r.periodMonth}/${r.periodYear}`,
        r.baseSalary.toFixed(2), r.paidAmount.toFixed(2),
        r.processedBy.name, new Date(r.createdAt).toLocaleDateString()
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payroll-ledger.csv'; a.click();
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-6">
      {/* Run Payroll */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />Run Payroll
            </CardTitle>
            <Button id="run-payroll-btn" onClick={() => { setWizardOpen(true); fetchPreview(); }}>
              <Plus className="w-4 h-4 mr-2" />New Run
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Historical Ledger */}
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
          ) : ledger.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No payroll has been run yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Staff</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Period</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Base</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Paid</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">By</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ledger.map(row => (
                  <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 cursor-pointer transition-colors" onClick={() => setDetailRow(row)}>
                    <td className="px-4 py-3 font-medium">{row.user.name}</td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell text-muted-foreground">
                      {MONTHS[row.periodMonth - 1]} {row.periodYear}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-mono text-muted-foreground">${row.baseSalary.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">${row.paidAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{row.processedBy?.name}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 pr-4 text-right text-muted-foreground"><ChevronRight className="w-4 h-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Run Wizard Modal */}
      <AnimatePresence>
        {wizardOpen && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setWizardOpen(false)} />
            <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
              className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 pointer-events-none">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-2xl pointer-events-auto max-h-[80vh] overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">Run Payroll</h2>
                <div className="flex gap-3 mb-6">
                  <Select value={String(wizMonth)} onChange={e => setWizMonth(Number(e.target.value))} className="flex-1">
                    {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
                  </Select>
                  <Select value={String(wizYear)} onChange={e => setWizYear(Number(e.target.value))} className="w-28">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </Select>
                  <Button variant="outline" onClick={fetchPreview} disabled={isLoadingPreview}>
                    {isLoadingPreview ? 'Loading...' : 'Preview'}
                  </Button>
                </div>
                {preview.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {preview.map(p => (
                      <div key={p.user?.id} className={`flex items-center justify-between p-3 rounded-lg border ${p.alreadyPaid ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-secondary/20'}`}>
                        <div>
                          <p className="font-medium text-sm">{p.user?.name}</p>
                          <p className="text-xs text-muted-foreground">{p.user?.role}</p>
                        </div>
                        {p.alreadyPaid ? (
                          <Badge variant="warning">Already Paid</Badge>
                        ) : (
                          <span className="font-mono font-bold text-primary">${p.computedPayout?.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setWizardOpen(false)} className="flex-1">Cancel</Button>
                  <Button onClick={handleRunPayroll} disabled={isRunning} className="flex-1">
                    {isRunning ? 'Processing...' : 'Confirm & Run Payroll'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Row Detail + Adjustment Modal */}
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
                    ['Base Salary', `$${detailRow.baseSalary.toFixed(2)}`],
                    ['Amount Paid', `$${detailRow.paidAmount.toFixed(2)}`],
                    ['Processed By', detailRow.processedBy?.name],
                    ['Date', new Date(detailRow.createdAt).toLocaleDateString()],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{val}</span>
                    </div>
                  ))}
                </div>
                {!adjOpen ? (
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setDetailRow(null)} className="flex-1">Close</Button>
                    <Button onClick={() => setAdjOpen(true)} className="flex-1">
                      <RotateCcw className="w-3.5 h-3.5 mr-2" />Issue Correction
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-amber-500 font-medium">
                      A correction creates a new linked record — the original is never modified.
                    </p>
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Adjustment Amount ($)</label>
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
