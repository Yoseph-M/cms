import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { dailyCloseApi, integrityApi } from '../../api/phase9Api';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { formatCurrency } from '../../utils/currency';
import { PageHeading } from '../../components/ui/Typography';
import { AlertCircle, CheckCircle2, ShieldAlert, Lock, Play } from 'lucide-react';
import { Input } from '../../components/ui/Input';

/**
 * End of Day reconciliation.
 *
 * Shift management has been removed, so there is no open-shift or variance
 * step: the day is ready to close as soon as the integrity checks are clean.
 */
export const OperationalReconciliation: React.FC = () => {
  const { addToast } = useToastStore();
  const { socket } = useSocketStore();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const [reviewNotes, setReviewNotes] = useState('');

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'End of Day', subtitle: 'Integrity checks and daily close' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const { data: integrityIssues, isLoading: isLoadingIntegrity, refetch: refetchIntegrity } = useQuery({
    queryKey: ['integrityIssues'],
    queryFn: () => integrityApi.getIssues(),
  });

  const { data: dailyClose, isLoading: isLoadingClose, refetch: refetchClose } = useQuery({
    queryKey: ['currentDailyClose'],
    queryFn: () => dailyCloseApi.getCurrentStatus(),
  });

  const runIntegrityMutation = useMutation({
    mutationFn: () => integrityApi.runCheck(),
    onSuccess: (data) => {
      addToast({
        title: data.passed
          ? 'All systems check passed!'
          : `Found ${data.newIssuesLogged} issue${data.newIssuesLogged === 1 ? '' : 's'} that need attention.`,
        type: data.passed ? 'success' : 'error',
      });
      refetchIntegrity();
    },
  });

  const startDailyCloseMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return dailyCloseApi.startDailyClose(today);
    },
    onSuccess: () => {
      addToast({ title: 'Daily close started successfully', message: 'All pre-flight checks passed. You can now finalize the business day.', type: 'success' });
      refetchClose();
    },
    onError: (err: any) => {
      addToast({ title: 'Unable to start daily close', message: err.response?.data?.error?.message || 'Please resolve any outstanding issues and try again.', type: 'error' });
    },
  });

  const finalizeDailyCloseMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return dailyCloseApi.finalizeDailyClose(today, { reviewNotes });
    },
    onSuccess: () => {
      addToast({ title: 'Business day closed', message: 'The day has been finalized successfully. All records are now locked.', type: 'success' });
      refetchClose();
      setReviewNotes('');
    },
    onError: (err: any) => {
      addToast({ title: 'Unable to finalize', message: err.response?.data?.error?.message || 'Something went wrong. Please try again.', type: 'error' });
    },
  });

  const resolveIntegrityMutation = useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes?: string }) =>
      integrityApi.resolveIssue(id, { resolutionNotes }),
    onSuccess: () => {
      addToast({ title: 'Issue resolved', message: 'The integrity issue has been marked as resolved.', type: 'success' });
      refetchIntegrity();
    },
    onError: (err: any) => {
      addToast({ title: 'Unable to resolve issue', message: err.response?.data?.error?.message || 'Something went wrong. Please try again.', type: 'error' });
    },
  });

  // Socket listener for real-time integrity alerts
  useEffect(() => {
    if (!socket) return;

    const onIntegrityAlert = (issue: any) => {
      addToast({
        title: 'Data integrity alert',
        message: issue.description || 'A potential issue has been detected in the system data.',
        type: 'error',
      });
      refetchIntegrity();
    };

    socket.on('integrity:alert', onIntegrityAlert);

    return () => {
      socket.off('integrity:alert', onIntegrityAlert);
    };
  }, [socket, refetchIntegrity, addToast]);

  if (isLoadingIntegrity || isLoadingClose) {
    return <LoadingState message="Loading reconciliation data..." />;
  }

  const isReadyForClose = integrityIssues?.length === 0;

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
            <ul className="grid gap-3 mt-2 md:grid-cols-2">
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
                      if (notes !== null) {
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

      {/* Daily Close Action Panel */}
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
                Daily close commits all operational data to the ledger — total sales,
                cash received, and settlement breakdowns — for the business day.
              </p>
              {!isReadyForClose ? (
                <p className="text-amber-600 dark:text-amber-500 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Resolve the integrity issues above before closing the day.
                </p>
              ) : dailyClose?.status === 'PENDING_REVIEW' ? (
                <div className="space-y-4 w-full mt-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border">
                  <div className="grid grid-cols-3 max-[419px]:grid-cols-1 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Total Sales</p>
                      <p className="text-xl font-bold">{formatCurrency(dailyClose.totalSalesMinor)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Cash Received</p>
                      <p className="text-xl font-bold text-primary">{formatCurrency(dailyClose.cashSettledMinor)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Settled</p>
                      <p className="text-xl font-bold">{formatCurrency(dailyClose.totalSettledMinor)}</p>
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
