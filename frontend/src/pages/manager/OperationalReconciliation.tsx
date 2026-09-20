import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { dailyCloseApi } from '../../api/phase9Api';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { cn } from '../../lib/utils';
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  History,
  Inbox,
  Send,
  UserRound,
} from 'lucide-react';

type CloseStatus = 'OPEN' | 'PENDING_REVIEW' | 'CLOSED' | 'REJECTED';

interface DayFigures {
  businessDate: string;
  totalSalesMinor: number;
  totalSettledMinor: number;
  cashSettledMinor: number;
  cardSettledMinor: number;
  mobileSettledMinor: number;
  unsettledOrderCount: number;
  partialSettlementCount: number;
  cancelledOrderCount: number;
}

interface DailyCloseRecord extends DayFigures {
  id: string;
  status: CloseStatus;
  requestedAt?: string | null;
  closedAt?: string | null;
  reviewNotes?: string | null;
  requestedBy?: { id: string; name: string; role: string } | null;
  closedBy?: { id: string; name: string; role: string } | null;
}

/** One row of the End of Day revenue history (server snapshot per business date). */
interface HistoryRow {
  id: string;
  businessDate: string;
  status: CloseStatus;
  totalSalesMinor: number;
  totalSettledMinor: number;
  cashSettledMinor: number;
  cardSettledMinor: number;
  mobileSettledMinor: number;
  cancelledOrderCount: number;
  requestedAt?: string | null;
  closedAt?: string | null;
  reviewNotes?: string | null;
  requestedByName?: string | null;
  closedByName?: string | null;
}

/** A labelled money figure in the verification grid. */
const MoneyStat: React.FC<{ label: string; value: string; tone?: 'default' | 'primary' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div className="rounded-xl border border-border bg-card px-3.5 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p
      className={cn(
        'mt-1 font-mono text-base font-bold tabular-nums',
        tone === 'primary' ? 'text-primary' : 'text-foreground',
      )}
    >
      {value}
    </p>
  </div>
);

/** Today's live totals — the current business date's own sales, nothing older. */
const TodayFigures: React.FC<{ figures: DayFigures }> = ({ figures }) => (
  <div className="rounded-2xl border border-border/60 bg-secondary/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Today so far
      </p>
      <p className="font-mono text-xs text-muted-foreground">{figures.businessDate}</p>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MoneyStat label="Total sales" value={formatCurrency(figures.totalSalesMinor)} />
      <MoneyStat label="Cash" value={formatCurrency(figures.cashSettledMinor)} tone="primary" />
      <MoneyStat label="Card" value={formatCurrency(figures.cardSettledMinor)} />
      <MoneyStat label="Mobile" value={formatCurrency(figures.mobileSettledMinor)} />
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      {figures.unsettledOrderCount} unsettled · {figures.partialSettlementCount} partially settled ·{' '}
      {figures.cancelledOrderCount} cancelled tickets
    </p>
  </div>
);

function formatMoment(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * End of Day — the manager's decision screen.
 *
 * The cashier sends a close request from the till; it lands here as a pending
 * approval. The manager approves it (locking the day) or disapproves it with a
 * reason the cashier can act on. There is no integrity check and no counted-cash
 * variance in this flow.
 */
export const OperationalReconciliation: React.FC = () => {
  const { addToast } = useToastStore();
  const { socket } = useSocketStore();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const queryClient = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState('');

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'End of Day', subtitle: 'Approve or disapprove the close request' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const closeQuery = useQuery<DailyCloseRecord | null>({
    queryKey: ['dailyClose', 'current', 'manager'],
    queryFn: () => dailyCloseApi.getCurrentStatus(),
    refetchInterval: 30_000,
  });

  // Today's live figures, straight from the server's aggregation for the current
  // business date. Used whenever there is no snapshot to show, so the screen
  // never displays a running or cached total.
  const previewQuery = useQuery<DayFigures>({
    queryKey: ['dailyClose', 'preview', 'manager'],
    queryFn: () => dailyCloseApi.previewDailyClose(),
    refetchInterval: 30_000,
  });

  const record = closeQuery.data ?? null;
  const status: CloseStatus = record?.status ?? 'OPEN';
  const live = previewQuery.data ?? null;

  // Revenue history — every past day's approved (and attempted) close. Rendered
  // as a full card above the decision card (same pattern as Attendance history),
  // browsable with its own ‹ month › stepper and day-range filter.
  const [historyMode, setHistoryMode] = useState<'30d' | '60d' | '90d'>('30d');
  const [historyMonthOffset, setHistoryMonthOffset] = useState(0); // 0 = current month
  const historyQuery = useQuery<HistoryRow[]>({
    queryKey: ['dailyClose', 'history'],
    queryFn: () => dailyCloseApi.getHistory(90),
    staleTime: 30_000,
  });
  const history = Array.isArray(historyQuery.data) ? historyQuery.data : [];

  // Month window for the ‹ month › stepper, newest first.
  const historyMonth = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - historyMonthOffset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  }, [historyMonthOffset]);

  /** Day-range filter (30/60/90 days back) applied to the raw history. */
  const historyCutoffDays = historyMode === '30d' ? 30 : historyMode === '60d' ? 60 : 90;
  const filteredHistory = useMemo(() => {
    let rows = history;
    if (historyMonthOffset === 0) {
      // "All days" view: honour the day-range cutoff from today backwards.
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (historyCutoffDays - 1));
      const cutoffIso = cutoff.toISOString().split('T')[0];
      rows = rows.filter((r) => r.businessDate >= cutoffIso);
    } else {
      rows = rows.filter((r) => {
        const ym = r.businessDate.slice(0, 7);
        return ym === `${historyMonth.year}-${String(historyMonth.month).padStart(2, '0')}`;
      });
    }
    return rows;
  }, [history, historyMonthOffset, historyMonth, historyCutoffDays]);

  const historyTotals = useMemo(
    () => ({
      revenue: filteredHistory.reduce((s, r) => s + (r.totalSalesMinor || 0), 0),
      closed: filteredHistory.filter((r) => r.status === 'CLOSED').length,
    }),
    [filteredHistory],
  );

  // A request from the till should appear without a manual refresh — and the
  // history must re-list the day as soon as a decision lands.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
    socket.on('daily-close:requested', refresh);
    socket.on('daily-close:completed', refresh);
    return () => {
      socket.off('daily-close:requested', refresh);
      socket.off('daily-close:completed', refresh);
    };
  }, [socket, queryClient]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
  };

  const approveMutation = useMutation({
    mutationFn: () =>
      dailyCloseApi.approveDailyClose(record?.businessDate ?? todayIso(), { reviewNotes }),
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Day approved',
        message: 'The business day is closed and the cashier has been told.',
      });
      setReviewNotes('');
      invalidate();
    },
    onError: (err: unknown) => {
      addToast({
        type: 'error',
        title: 'Unable to approve',
        message: extractErrorMessage(err, 'Something went wrong. Please try again.'),
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      dailyCloseApi.rejectDailyClose(record?.businessDate ?? todayIso(), { reviewNotes }),
    onSuccess: () => {
      addToast({
        type: 'info',
        title: 'Request disapproved',
        message: 'The cashier has been told, and the day stays open for a new request.',
      });
      setReviewNotes('');
      invalidate();
    },
    onError: (err: unknown) => {
      addToast({
        type: 'error',
        title: 'Unable to disapprove',
        message: extractErrorMessage(err, 'Something went wrong. Please try again.'),
      });
    },
  });

  // Managers can also raise the request themselves when the till is unmanned.
  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.get<{ businessDate: string }>('/daily-close/business-date');
      return dailyCloseApi.startDailyClose(res.data.businessDate);
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Close request sent',
        message: 'The request is now waiting for a manager decision.',
      });
      invalidate();
    },
    onError: (err: unknown) => {
      addToast({
        type: 'error',
        title: 'Unable to send the request',
        message: extractErrorMessage(err, 'Please try again in a moment.'),
      });
    },
  });

  const totals = useMemo(
    () => ({
      cash: record?.cashSettledMinor ?? 0,
      card: record?.cardSettledMinor ?? 0,
      mobile: record?.mobileSettledMinor ?? 0,
    }),
    [record],
  );

  if (closeQuery.isLoading) {
    return <LoadingState message="Loading the close request..." />;
  }

  const isPending = status === 'PENDING_REVIEW';
  const isClosed = status === 'CLOSED';
  const isRejected = status === 'REJECTED';
  const busy = approveMutation.isPending || rejectMutation.isPending;

  const handleDisapprove = () => {
    if (!reviewNotes.trim()) {
      addToast({
        type: 'warning',
        title: 'Tell the cashier why',
        message: 'Add a short reason before disapproving — the request goes back with it.',
      });
      return;
    }
    rejectMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Operations
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
            End of Day
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending
              ? 'A close request is waiting for your decision.'
              : isClosed
                ? 'Today’s business day has already been approved.'
                : 'The cashier sends the close request; you decide.'}
          </p>
        </div>
        <Badge
          variant={isPending ? 'warning' : isClosed ? 'success' : isRejected ? 'error' : 'neutral'}
          className="px-3 py-1 text-[11px] uppercase tracking-wide"
        >
          {isPending
            ? 'Awaiting approval'
            : isClosed
              ? 'Closed'
              : isRejected
                ? 'Disapproved'
                : 'No request yet'}
        </Badge>
      </div>

      {/* ── Day-by-day revenue history — a full card ABOVE the decision card ── */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <History className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-[15px] font-semibold text-foreground">
                  Daily revenue history
                </h2>
                <p className="text-xs text-muted-foreground">
                  {historyMonthOffset === 0
                    ? `Last ${historyCutoffDays} days · ${historyTotals.closed} closed`
                    : historyMonth.label}
                  {filteredHistory.length > 0 &&
                    ` · ${formatCurrency(historyTotals.revenue)} total`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Day-range filter — only meaningful in the "recent days" view */}
              {historyMonthOffset === 0 && (
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/40 p-0.5">
                  {(['30d', '60d', '90d'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setHistoryMode(m)}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                        historyMode === m
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m === '30d' ? '30 days' : m === '60d' ? '60 days' : '90 days'}
                    </button>
                  ))}
                </div>
              )}

              {/* ‹ month › stepper — browse history by month */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setHistoryMonthOffset((o) => o + 1)}
                  aria-label="Previous month"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[7.5rem] text-center text-xs font-semibold text-foreground">
                  {historyMonthOffset === 0 ? 'Recent days' : historyMonth.label}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryMonthOffset((o) => Math.max(0, o - 1))}
                  disabled={historyMonthOffset === 0}
                  aria-label="Next month"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {historyQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading history…</p>
          ) : filteredHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {historyMonthOffset === 0
                ? 'No close requests in the last 90 days.'
                : `No close requests in ${historyMonth.label}.`}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pr-3">Business date</th>
                    <th className="py-2.5 pr-3">Total revenue</th>
                    <th className="py-2.5 pr-3 hidden sm:table-cell">Cash</th>
                    <th className="py-2.5 pr-3 hidden md:table-cell">Card</th>
                    <th className="py-2.5 pr-3 hidden lg:table-cell">Mobile</th>
                    <th className="py-2.5 pr-3 hidden lg:table-cell">Status</th>
                    <th className="py-2.5 pr-3 hidden xl:table-cell">Decided by</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row) => (
                    <tr key={row.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-foreground">
                        {formatBusinessDateLabel(row.businessDate)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(row.totalSalesMinor)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-muted-foreground hidden sm:table-cell">
                        {formatCurrency(row.cashSettledMinor)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-muted-foreground hidden md:table-cell">
                        {formatCurrency(row.cardSettledMinor)}
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-muted-foreground hidden lg:table-cell">
                        {formatCurrency(row.mobileSettledMinor)}
                      </td>
                      <td className="py-2.5 pr-3 hidden lg:table-cell">
                        <Badge
                          variant={
                            row.status === 'CLOSED'
                              ? 'success'
                              : row.status === 'REJECTED'
                                ? 'error'
                                : 'warning'
                          }
                          className="text-[10px] px-2 py-0"
                        >
                          {HISTORY_STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {row.closedByName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <Card
          className={cn(
            'overflow-hidden rounded-2xl shadow-sm',
            isPending
              ? 'border-t-4 border-t-amber-500'
              : isClosed
                ? 'border-t-4 border-t-emerald-500'
                : isRejected
                  ? 'border-t-4 border-t-rose-500'
                  : 'border-t-4 border-t-primary',
          )}
        >
          <CardContent className="flex flex-col space-y-6 p-5 sm:p-7">
            {isClosed ? (
              <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center py-10 text-center sm:min-h-[480px]">
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25">
                  <BadgeCheck className="h-10 w-10" />
                </span>
                <h2 className="mt-6 font-display text-2xl font-bold">Business day closed</h2>
                <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                  {record?.closedBy?.name ? `${record.closedBy.name} approved` : 'Approved'} the close
                  {record?.closedAt ? ` on ${formatMoment(record.closedAt)}` : ''}. Records are locked.
                </p>
                <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                  <MoneyStat label="Total sales" value={formatCurrency(record?.totalSalesMinor ?? 0)} />
                  <MoneyStat label="Cash" value={formatCurrency(totals.cash)} tone="primary" />
                  <MoneyStat label="Card" value={formatCurrency(totals.card)} />
                  <MoneyStat label="Mobile" value={formatCurrency(totals.mobile)} />
                </div>
                {record?.reviewNotes && (
                  <p className="mt-6 w-full rounded-xl border border-border bg-secondary/30 px-3.5 py-3 text-sm text-muted-foreground">
                    Note: {record.reviewNotes}
                  </p>
                )}
              </div>
            ) : isRejected ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center py-4 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
                    <Ban className="h-7 w-7" />
                  </span>
                  <h2 className="mt-4 font-display text-lg font-bold">Request disapproved</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {record?.closedBy?.name ? `${record.closedBy.name} disapproved` : 'Disapproved'} the
                    last request{record?.closedAt ? ` on ${formatMoment(record.closedAt)}` : ''}. The day
                    stays open until the cashier sends a new one.
                  </p>
                  {record?.reviewNotes && (
                    <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-foreground">
                      “{record.reviewNotes}”
                    </p>
                  )}
                </div>
                {live && <TodayFigures figures={live} />}
              </div>
            ) : isPending ? (
              <>
                {/* Who asked, and when. */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <UserRound className="h-4 w-4 text-amber-600" />
                    {record?.requestedBy?.name ?? 'The floor'} sent this request
                  </p>
                  {record?.requestedAt && (
                    <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatMoment(record.requestedAt)}
                    </p>
                  )}
                  <p className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-400">
                    Review the day, then approve or disapprove.
                  </p>
                </div>

                {/* What the day produced. */}
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Recorded for {record?.businessDate}
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <MoneyStat label="Total sales" value={formatCurrency(record?.totalSalesMinor ?? 0)} />
                    <MoneyStat label="Cash" value={formatCurrency(totals.cash)} tone="primary" />
                    <MoneyStat label="Card" value={formatCurrency(totals.card)} />
                    <MoneyStat label="Mobile" value={formatCurrency(totals.mobile)} />
                    <MoneyStat
                      label="Total settled"
                      value={formatCurrency(record?.totalSettledMinor ?? 0)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {record?.unsettledOrderCount || 0} unsettled ·{' '}
                    {record?.partialSettlementCount || 0} partially settled ·{' '}
                    {record?.cancelledOrderCount || 0} cancelled tickets
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="review-notes"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Note for the cashier{' '}
                    <span className="font-normal text-muted-foreground">
                      (required to disapprove)
                    </span>
                  </label>
                  <Input
                    id="review-notes"
                    placeholder="Anything they should check or fix before a new request..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col items-center py-6 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground">
                    <Inbox className="h-7 w-7" />
                  </span>
                  <h2 className="mt-4 font-display text-lg font-bold">No close request yet</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    The cashier sends the request from the till at the end of service. If the counter is
                    already closed, you can raise it yourself.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5"
                    disabled={requestMutation.isPending}
                    onClick={() => requestMutation.mutate()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {requestMutation.isPending ? 'Sending…' : 'Send close request'}
                  </Button>
                </div>
                {live && <TodayFigures figures={live} />}
              </div>
            )}

            {isPending && (
              <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={handleDisapprove}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  {rejectMutation.isPending ? 'Disapproving…' : 'Disapprove'}
                </Button>
                <Button
                  size="lg"
                  className="shadow-brand"
                  disabled={busy}
                  onClick={() => approveMutation.mutate()}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {approveMutation.isPending ? 'Approving…' : 'Approve & close day'}
                </Button>
              </div>
            )}

            {!isPending && !isClosed && !isRejected && (
              <p className="flex items-center gap-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Approving locks the day; disapproving sends it back with your note.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

    </div>
  );
};

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function formatBusinessDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const HISTORY_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Snapshot',
  PENDING_REVIEW: 'Awaiting decision',
  CLOSED: 'Closed',
  REJECTED: 'Disapproved',
};

export default OperationalReconciliation;
