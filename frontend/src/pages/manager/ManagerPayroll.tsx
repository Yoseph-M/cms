import React, { useState, useEffect, useCallback } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { motion } from 'framer-motion';
import {
  DollarSign, Plus, ChevronRight, Download
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
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SCOPED_ROLES = ['CASHIER', 'WAITER', 'COOKER', 'BARISTA'];

export const ManagerPayroll: React.FC = () => {
  const { addToast } = useToastStore();
  const { user } = useAuthStore();

  const [recentRuns, setRecentRuns] = useState<PayrollRecord[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizMonth, setWizMonth] = useState(() => new Date().getMonth() + 1);
  const [wizYear, setWizYear] = useState(() => new Date().getFullYear());
  const [preview, setPreview] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  const fetchRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const res = await axiosClient.get('/payroll');
      // Filter to last 5 runs for scoped staff only
      const scoped = res.data
        .filter((r: PayrollRecord) => SCOPED_ROLES.includes(r.user?.role))
        .slice(0, 5);
      setRecentRuns(scoped);
    } catch {
      // silent
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const fetchPreview = async () => {
    setIsLoadingPreview(true);
    setPreview([]);
    try {
      const res = await axiosClient.get('/users');
      const staff = res.data.filter((u: any) => u.isActive && SCOPED_ROLES.includes(u.role));
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
      fetchRecent();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Payroll run failed', message: err.response?.data?.error });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Run Wizard Trigger */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Run Payroll</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Process monthly payroll for your staff roster.</p>
            </div>
            <Button id="manager-run-payroll-btn" onClick={() => { setWizardOpen(true); fetchPreview(); }}>
              <Plus className="w-4 h-4 mr-2" />Run Payroll
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Recent Runs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">Recent Payroll Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingRecent ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />)}
            </div>
          ) : recentRuns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No recent payroll runs.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {recentRuns.map(row => (
                  <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.user?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{MONTHS[row.periodMonth - 1]} {row.periodYear}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">${row.paidAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm flex items-start justify-center p-4 pt-16">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">Run Payroll</h2>
            <div className="flex gap-3 mb-6">
              <Select value={String(wizMonth)} onChange={e => setWizMonth(Number(e.target.value))} className="flex-1">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
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
                {isRunning ? 'Processing...' : 'Confirm & Run'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
