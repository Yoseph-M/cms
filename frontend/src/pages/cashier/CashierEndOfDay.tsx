import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  ClipboardCheck,
  Clock3,
  RotateCcw,
  Send,
  ShieldQuestion,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { dailyCloseApi } from '../../api/phase9Api';
import { useHeaderStore } from '../../store/headerStore';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { cn } from '../../lib/utils';

type CloseStatus = 'OPEN' | 'PENDING_REVIEW' | 'CLOSED' | 'REJECTED';

interface DayPreview {
  businessDate: string;
  totalSalesMinor: number;
  totalSettledMinor: number;
  cashSettledMinor: number;
  cardSettledMinor: number;
  mobileSettledMinor: number;
  unsettledOrderCount: number;
  cancelledOrderCount: number;
}

interface DailyCloseRecord extends DayPreview {
  id: string;
  status: CloseStatus;
  requestedAt?: string | null;
  closedAt?: string | null;
  reviewNotes?: string | null;
  requestedBy?: { name: string } | null;
  closedBy?: { name: string } | null;
}

/** One money figure in the summary strip. */
const Stat: React.FC<{ label: string; value: number; tone?: 'default' | 'primary' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div className="rounded-xl border border-border/60 bg-card px-3.5 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p
      className={cn(
        'mt-1 font-mono text-base font-bold tabular-nums',
        tone === 'primary' ? 'text-primary' : 'text-foreground',
      )}
    >
      {formatCurrency(value)}
    </p>
  </div>
);

/**
 * Cashier side of the End of Day flow.
 *
 * The cashier does not close the day — they *ask* to close it. A manager then
 * approves or disapproves, and the answer comes back here (and in the bell).
 */
export const CashierEndOfDay: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { socket } = useSocketStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    setPageTitle({ title: 'End of Day', subtitle: 'Send the close request to your manager' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const statusQuery = useQuery<DailyCloseRecord | null>({
    queryKey: ['dailyClose', 'current', 'cashier'],
    queryFn: () => dailyCloseApi.getCurrentStatus(),
    refetchInterval: 30_000,
  });

  // Today's live figures straight from the server's aggregation for the current
  // business day. Shown before a request exists so the cashier sees today's own
  // sales — never a running or cached total.
  const previewQuery = useQuery<DayPreview>({
    queryKey: ['dailyClose', 'preview'],
    queryFn: () => dailyCloseApi.previewDailyClose(),
    refetchInterval: 30_000,
  });

  // A manager's decision lands on the socket — refresh the state right away so
  // the waiting screen flips without a manual reload.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
    };
    socket.on('daily-close:completed', refresh);
    socket.on('daily-close:requested', refresh);
    return () => {
      socket.off('daily-close:completed', refresh);
      socket.off('daily-close:requested', refresh);
    };
  }, [socket, queryClient]);

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.get<{ businessDate: string }>('/daily-close/business-date');
      return dailyCloseApi.startDailyClose(res.data.businessDate);
    },
    onSuccess: () => {
      setSentAt(Date.now());
      addToast({
        type: 'success',
        title: 'Close request sent',
        message: 'Your manager has been notified. The day closes once they approve it.',
      });
      void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
    },
    onError: (err: unknown) => {
      addToast({
        type: 'error',
        title: 'Could not send the request',
        message: extractErrorMessage(err, 'Please try again in a moment.'),
      });
    },
  });

  const record = statusQuery.data ?? null;
  const status: CloseStatus = record?.status ?? 'OPEN';

  // The snapshot is the record of truth while a request is being decided and
  // after the day is closed. Otherwise show today's live figures, so the
  // numbers always belong to the current business date.
  const live = previewQuery.data ?? null;
  const figures = status === 'OPEN' || status === 'REJECTED' ? live ?? record : record ?? live;
  const figuresLabel =
    status === 'CLOSED'
      ? 'Recorded and locked'
      : status === 'PENDING_REVIEW'
        ? 'Recorded at request time'
        : 'Today so far';

  if (statusQuery.isLoading || previewQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-64 animate-pulse rounded-2xl bg-secondary/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
      >
        {/* Hero — the state banner decides the whole mood of the page. */}
        <div
          className={cn(
            'relative px-5 py-6 sm:px-7',
            status === 'PENDING_REVIEW'
              ? 'bg-gradient-to-br from-amber-500/15 via-amber-400/5 to-transparent'
              : status === 'CLOSED'
                ? 'bg-gradient-to-br from-emerald-500/15 via-emerald-400/5 to-transparent'
                : status === 'REJECTED'
                  ? 'bg-gradient-to-br from-rose-500/15 via-rose-400/5 to-transparent'
                  : 'bg-gradient-to-br from-primary/15 via-primary/5 to-transparent',
          )}
        >
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset',
                status === 'PENDING_REVIEW'
                  ? 'bg-amber-500/15 text-amber-600 ring-amber-500/20'
                  : status === 'CLOSED'
                    ? 'bg-emerald-500/15 text-emerald-600 ring-emerald-500/20'
                    : status === 'REJECTED'
                      ? 'bg-rose-500/15 text-rose-600 ring-rose-500/20'
                      : 'bg-primary/15 text-primary ring-primary/20',
              )}
            >
              {status === 'PENDING_REVIEW' ? (
                <Clock3 className="h-6 w-6" />
              ) : status === 'CLOSED' ? (
                <BadgeCheck className="h-6 w-6" />
              ) : status === 'REJECTED' ? (
                <XCircle className="h-6 w-6" />
              ) : (
                <ClipboardCheck className="h-6 w-6" />
              )}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                {status === 'PENDING_REVIEW'
                  ? 'Waiting for your manager'
                  : status === 'CLOSED'
                    ? 'Day approved and closed'
                    : status === 'REJECTED'
                      ? 'Request disapproved'
                      : 'Ready to close the day'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {status === 'PENDING_REVIEW'
                  ? `Request sent${record?.requestedBy?.name ? ` by ${record.requestedBy.name}` : ''}. A manager needs to approve it before the day locks.`
                  : status === 'CLOSED'
                    ? `${record?.closedBy?.name ?? 'A manager'} approved the close${record?.businessDate ? ` for ${record.businessDate}` : ''}. Nothing further to do.`
                    : status === 'REJECTED'
                      ? `The request came back with a note. Fix what is flagged, then send it again.`
                      : 'Everything for today is tallied below. Send the request and your manager will approve or disapprove it.'}
              </p>
            </div>
          </div>

          {status === 'PENDING_REVIEW' && (
            <div className="mt-5 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              {sentAt
                ? 'Sent just now — this page updates on its own once they decide.'
                : 'Awaiting a decision — this page updates on its own once they decide.'}
            </div>
          )}

          {status === 'REJECTED' && record?.reviewNotes && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  Manager&apos;s note
                </p>
                <p className="mt-0.5 text-sm text-foreground">{record.reviewNotes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Today's sales. Live until the day is closed, then the locked record. */}
        {figures ? (
          <div className="space-y-4 border-t border-border/60 px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {figuresLabel}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{figures.businessDate}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total sales" value={figures.totalSalesMinor ?? 0} />
              <Stat label="Cash" value={figures.cashSettledMinor ?? 0} tone="primary" />
              <Stat label="Card" value={figures.cardSettledMinor ?? 0} />
              <Stat label="Mobile" value={figures.mobileSettledMinor ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              {figures.unsettledOrderCount || 0} unsettled · {figures.cancelledOrderCount || 0}{' '}
              cancelled ticket{figures.cancelledOrderCount === 1 ? '' : 's'} · total settled{' '}
              {formatCurrency(figures.totalSettledMinor ?? 0)}
            </p>
          </div>
        ) : (
          <div className="border-t border-border/60 px-5 py-5 sm:px-7">
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Your day&apos;s sales, payments, and cancellations are tallied automatically when you
                send the request.
              </li>
              <li className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                A manager reviews it and either approves the close or sends it back with a note.
              </li>
            </ul>
          </div>
        )}

        <div className="border-t border-border/60 bg-secondary/20 px-5 py-4 sm:px-7">
          {status === 'PENDING_REVIEW' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                You can check back any time — the bell will tell you when it is decided.
              </p>
              <Button variant="outline" disabled>
                <Clock3 className="mr-2 h-4 w-4" />
                Waiting for approval
              </Button>
            </div>
          ) : status === 'CLOSED' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Business day locked. See you tomorrow.
              </p>
              <Button variant="outline" disabled>
                <BadgeCheck className="mr-2 h-4 w-4" />
                Day closed
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {status === 'REJECTED'
                  ? 'Send a fresh request once the issue is sorted.'
                  : 'Sending the request locks nothing — only your manager’s approval does.'}
              </p>
              <Button
                size="lg"
                className="shadow-brand"
                disabled={requestMutation.isPending}
                onClick={() => requestMutation.mutate()}
              >
                {status === 'REJECTED' ? (
                  <RotateCcw className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {requestMutation.isPending
                  ? 'Sending…'
                  : status === 'REJECTED'
                    ? 'Send request again'
                    : 'Send close request'}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CashierEndOfDay;
