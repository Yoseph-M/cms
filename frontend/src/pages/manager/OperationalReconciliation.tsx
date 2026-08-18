import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftApi, varianceApi, dailyCloseApi, integrityApi } from '../../api/phase9Api';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { formatCurrency } from '../../utils/currency';
import { PageHeading } from '../../components/ui/Typography';
import { AlertCircle, CheckCircle2, ShieldAlert, Wallet, Lock, Play } from 'lucide-react';
import { Input } from '../../components/ui/Input';

export const OperationalReconciliation: React.FC = () => {
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { socket } = useSocketStore();
  const [reviewNotes, setReviewNotes] = useState('');

  // 1. Fetch Open Shifts
  const { data: openShifts, isLoading: isLoadingShifts, refetch: refetchShifts } = useQuery({
    queryKey: ['openShifts'],
    queryFn: () => shiftApi.getOpenShifts(),
  });

  // 2. Fetch Pending Variances
  const { data: pendingVariances, isLoading: isLoadingVariances, refetch: refetchVariances } = useQuery({
    queryKey: ['pendingVariances'],
    queryFn: () => varianceApi.getPendingReviews(),
  });

  // 3. Fetch Integrity Issues
  const { data: integrityIssues, isLoading: isLoadingIntegrity, refetch: refetchIntegrity } = useQuery({
    queryKey: ['integrityIssues'],
    queryFn: () => integrityApi.getIssues(),
  });

  // 4. Fetch Daily Close Status
  const { data: dailyClose, isLoading: isLoadingClose, refetch: refetchClose } = useQuery({
    queryKey: ['currentDailyClose'],
    queryFn: () => dailyCloseApi.getCurrentStatus(),
  });

  const runIntegrityMutation = useMutation({
    mutationFn: () => integrityApi.runCheck(),
    onSuccess: (data) => {
      addToast({ title: `Integrity check complete. ${data.passed ? 'Passed!' : `${data.newIssuesLogged} new issues found.`}`, type: data.passed ? 'success' : 'error' });
      refetchIntegrity();
    }
  });

  const startDailyCloseMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return dailyCloseApi.startDailyClose(today);
    },
    onSuccess: () => {
      addToast({ title: 'Daily Close pre-flight successful.', type: 'success' });
      refetchClose();
    },
    onError: (err: any) => {
      addToast({ title: err.response?.data?.error?.message || 'Failed to start daily close', type: 'error' });
    }
  });

  const finalizeDailyCloseMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return dailyCloseApi.finalizeDailyClose(today, { reviewNotes });
    },
    onSuccess: () => {
      addToast({ title: 'Business day closed successfully.', type: 'success' });
      refetchClose();
      setReviewNotes('');
    },
    onError: (err: any) => {
      addToast({ title: err.response?.data?.error?.message || 'Failed to finalize daily close', type: 'error' });
    }
  });

  const reviewVarianceMutation = useMutation({
    mutationFn: ({ id, status, managerNotes }: { id: string, status: 'APPROVED' | 'REJECTED', managerNotes: string }) => 
      varianceApi.reviewVariance(id, { status, managerNotes }),
    onSuccess: () => {
      addToast({ title: 'Variance reviewed successfully', type: 'success' });
      refetchVariances();
      refetchShifts();
    }
  });

  const resolveIntegrityMutation = useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string, resolutionNotes?: string }) => 
      integrityApi.resolveIssue(id, { resolutionNotes }),
    onSuccess: () => {
      addToast({ title: 'Integrity issue resolved successfully', type: 'success' });
      refetchIntegrity();
    },
    onError: (err: any) => {
      addToast({ title: err.response?.data?.error?.message || 'Failed to resolve issue', type: 'error' });
    }
  });

  // Socket listener for real-time integrity alerts
  useEffect(() => {
    if (!socket) return;
    
    const onIntegrityAlert = (issue: any) => {
      addToast({ 
        title: 'New Integrity Issue Detected', 
        message: issue.description,
        type: 'error' 
      });
      refetchIntegrity();
    };
    
    socket.on('integrity:alert', onIntegrityAlert);
    
    return () => {
      socket.off('integrity:alert', onIntegrityAlert);
    };
  }, [socket, refetchIntegrity, addToast]);

  if (isLoadingShifts || isLoadingVariances || isLoadingIntegrity || isLoadingClose) {
    return <LoadingState message="Loading reconciliation data..." />;
  }

  const isReadyForClose = 
    openShifts?.length === 0 && 
    pendingVariances?.length === 0 && 
    integrityIssues?.length === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Operations</p>
          <PageHeading className="mt-1">End of Day Reconciliation</PageHeading>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => runIntegrityMutation.mutate()} disabled={runIntegrityMutation.isPending}>
            {runIntegrityMutation.isPending ? 'Running...' : 'Run Integrity Check'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Open Shifts */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-500" />
              Active Shifts
              <Badge variant={openShifts?.length ? 'warning' : 'success'} className="ml-auto">
                {openShifts?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openShifts?.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-2">
                <CheckCircle2 className="w-4 h-4" /> All shifts closed
              </div>
            ) : (
              <ul className="space-y-3 mt-2">
                {openShifts?.map((shift: any) => (
                  <li key={shift.id} className="text-sm bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
                    <div className="font-semibold">{shift.cashier?.name}</div>
                    <div className="text-muted-foreground text-xs mt-1">Opened: {new Date(shift.openedAt).toLocaleTimeString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 2. Pending Variances */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Variances Pending
              <Badge variant={pendingVariances?.length ? 'error' : 'success'} className="ml-auto">
                {pendingVariances?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingVariances?.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-2">
                <CheckCircle2 className="w-4 h-4" /> No pending reviews
              </div>
            ) : (
              <ul className="space-y-4 mt-2">
                {pendingVariances?.map((review: any) => (
                  <li key={review.id} className="text-sm bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold">{review.shift?.cashier?.name}</span>
                      <Badge variant={review.shift?.varianceMinor < 0 ? 'error' : 'warning'}>
                        {formatCurrency(review.shift?.varianceMinor / 100)}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-xs italic mb-3">"{review.shift?.notes || 'No notes provided by cashier'}"</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                        const note = prompt('Rejection reason (optional):');
                        reviewVarianceMutation.mutate({ id: review.id, status: 'REJECTED', managerNotes: note || 'Rejected by manager' });
                      }}>Reject</Button>
                      <Button size="sm" variant="default" className="flex-1" onClick={() => {
                        const note = prompt('Approval note (optional):');
                        reviewVarianceMutation.mutate({ id: review.id, status: 'APPROVED', managerNotes: note || 'Approved by manager' });
                      }}>Approve</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 3. Integrity Issues */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              Integrity Issues
              <Badge variant={integrityIssues?.length ? 'error' : 'success'} className="ml-auto">
                {integrityIssues?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {integrityIssues?.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-2">
                <CheckCircle2 className="w-4 h-4" /> System integrity verified
              </div>
            ) : (
              <ul className="space-y-3 mt-2">
                {integrityIssues?.map((issue: any) => (
                  <li key={issue.id} className="text-sm bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 p-3 rounded-lg border border-red-200 dark:border-red-900/50">
                    <div className="font-semibold flex items-center justify-between">
                      {issue.category}
                      <Badge variant="error" className="text-[10px] uppercase">{issue.severity}</Badge>
                    </div>
                    <div className="text-xs mt-1 leading-snug mb-2">{issue.description}</div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="w-full text-xs"
                      onClick={() => {
                        const notes = prompt('Resolution notes (optional):');
                        if (notes !== null) { // Allow empty string but not cancel
                          resolveIntegrityMutation.mutate({ id: issue.id, resolutionNotes: notes || 'Resolved by manager' });
                        }
                      }}
                      disabled={resolveIntegrityMutation.isPending}
                    >
                      Resolve
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Daily Close Action Panel */}
      <Card className="border-t-4 border-t-primary shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Finalize Business Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="flex-1 text-sm text-slate-600 dark:text-slate-400">
              <p className="mb-2">
                Daily close commits all operational data to the ledger, calculating total expected cash, 
                variances, and resolving all pending checks.
              </p>
              {!isReadyForClose ? (
                <p className="text-amber-600 dark:text-amber-500 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Please resolve all pending shifts, variances, and integrity issues before closing the day.
                </p>
              ) : dailyClose?.status === 'PENDING_REVIEW' ? (
                <div className="space-y-4 w-full mt-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Total Sales</p>
                      <p className="text-xl font-bold">{formatCurrency(dailyClose.totalSalesMinor / 100)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Cash Declared</p>
                      <p className="text-xl font-bold text-primary">{formatCurrency(dailyClose.cashDeclaredMinor / 100)}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Final Review Notes (Optional)</label>
                    <Input 
                      placeholder="Add any final notes before locking the day..."
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                    />
                  </div>
                </div>
              ) : dailyClose?.status === 'CLOSED' ? (
                <p className="text-green-600 dark:text-green-500 font-medium flex items-center gap-2 mt-2">
                  <CheckCircle2 className="w-4 h-4" /> Today's operations have been closed and locked.
                </p>
              ) : (
                <p className="text-green-600 dark:text-green-500 font-medium flex items-center gap-2 mt-2">
                  <CheckCircle2 className="w-4 h-4" /> All checks passed. Ready to start daily close.
                </p>
              )}
            </div>

            <div className="shrink-0 w-full md:w-auto flex justify-end">
              {dailyClose?.status === 'PENDING_REVIEW' ? (
                <Button 
                  size="lg" 
                  variant="default" 
                  className="w-full shadow-brand"
                  onClick={() => finalizeDailyCloseMutation.mutate()}
                  disabled={finalizeDailyCloseMutation.isPending}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {finalizeDailyCloseMutation.isPending ? 'Finalizing...' : 'Lock Business Day'}
                </Button>
              ) : dailyClose?.status === 'CLOSED' ? (
                <Button size="lg" disabled variant="outline">Day is Closed</Button>
              ) : (
                <Button 
                  size="lg" 
                  variant="default"
                  className="w-full shadow-brand"
                  disabled={!isReadyForClose || startDailyCloseMutation.isPending}
                  onClick={() => startDailyCloseMutation.mutate()}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {startDailyCloseMutation.isPending ? 'Starting...' : 'Start Daily Close'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
