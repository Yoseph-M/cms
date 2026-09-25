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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('common');
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    setPageTitle({
      title: t('cashier.endOfDay', { defaultValue: 'End of Day' }),
      subtitle: t('cashier.eodSubtitle', { defaultValue: 'Send the close request to your manager' }),
    });
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
        title: t('cashier.eod.sentToast', { defaultValue: 'Close request sent' }),
        message: t('cashier.eod.sentToastMsg', {
          defaultValue: 'Your manager has been notified. The day closes once they approve it.',
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['dailyClose'] });
    },
    onError: (err: unknown) => {
      addToast({
        type: 'error',
        title: t('cashier.eod.sendFailed', { defaultValue: 'Could not send the request' }),
        message: extractErrorMessage(err, t('cashier.eod.tryAgain', { defaultValue: 'Please try again in a moment.' })),
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
      ? t('cashier.eod.recordedLocked', { defaultValue: 'Recorded and locked' })
      : status === 'PENDING_REVIEW'
        ? t('cashier.eod.recordedAtRequest', { defaultValue: 'Recorded at request time' })
        : t('cashier.eod.todaySoFar', { defaultValue: 'Today so far' });

  if (statusQuery.isLoading || previewQuery.isLoading) {
    return (
      <div className="w-full min-w-0 space-y-5 pb-8">
        <div className="h-64 animate-pulse rounded-2xl bg-secondary/40" />
      </div>
    );
  }

  /**
   * Full-canvas width, like every other page in the shell.
   *
   * This card used to sit in its own `mx-auto max-w-3xl` column. Because the
   * sidebar animates its width (80px ↔ 260px) and the canvas is `flex-1`, that
   * column re-centred on every collapse/expand: the card slid sideways while
   * every other page simply grew in place. It also left the summary tiles at
   * two columns on a desktop, because the `sm:`/`md:`/`lg:` prefixes this file
   * used match nothing in `tailwind.config.js` — the only breakpoints in this
   * project are `tablet-portrait` (768px), `tablet-landscape` (1024px) and
   * `desktop` (1280px). Both are fixed here: the page is a normal fluid child
   * of the canvas, and the strip uses a breakpoint that exists.
   */
  return (
    <div className="w-full min-w-0 space-y-5 pb-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
      >
        {/* Hero — the state banner decides the whole mood of the page. */}
        <div
          className={cn(
            'relative px-5 py-6 tablet-portrait:px-7',
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
                  ? t('cashier.eod.waitingManager', { defaultValue: 'Waiting for your manager' })
                  : status === 'CLOSED'
                    ? t('cashier.eod.dayClosed', { defaultValue: 'Day approved and closed' })
                    : status === 'REJECTED'
                      ? t('cashier.eod.disapproved', { defaultValue: 'Request disapproved' })
                      : t('cashier.eod.readyToClose', { defaultValue: 'Ready to close the day' })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {status === 'PENDING_REVIEW'
                  ? t('cashier.eod.waitingManagerMsg', {
                      name: record?.requestedBy?.name ?? '',
                      defaultValue: 'Request sent{{name}}. A manager needs to approve it before the day locks.',
                    }).replace('{{name}}', record?.requestedBy?.name ? ` ${t('cashier.close.byName', { name: record.requestedBy.name, defaultValue: 'by {{name}}' })}` : '')
                  : status === 'CLOSED'
                    ? t('cashier.eod.dayClosedMsg', {
                        name: record?.closedBy?.name ?? t('cashier.close.aManager', { defaultValue: 'A manager' }),
                        date: record?.businessDate ?? '',
                        defaultValue: "{{name}} approved the close{{date}}. Nothing further to do.",
                      }).replace('{{date}}', record?.businessDate ? ` ${t('cashier.eod.forDate', { date: record.businessDate, defaultValue: 'for {{date}}' })}` : '')
                    : status === 'REJECTED'
                      ? t('cashier.eod.rejectedMsg', { defaultValue: 'The request came back with a note. Fix what is flagged, then send it again.' })
                      : t('cashier.eod.openMsg', { defaultValue: 'Everything for today is tallied below. Send the request and your manager will approve or disapprove it.' })}
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
                ? t('cashier.eod.sentJustNow', { defaultValue: 'Sent just now — this page updates on its own once they decide.' })
                : t('cashier.eod.awaitingDecision', { defaultValue: 'Awaiting a decision — this page updates on its own once they decide.' })}
            </div>
          )}

          {status === 'REJECTED' && record?.reviewNotes && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  {t('cashier.eod.managerNote', { defaultValue: "Manager's note" })}
                </p>
                <p className="mt-0.5 text-sm text-foreground">{record.reviewNotes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Today's sales. Live until the day is closed, then the locked record. */}
        {figures ? (
          <div className="space-y-4 border-t border-border/60 px-5 py-5 tablet-portrait:px-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {figuresLabel}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{figures.businessDate}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 tablet-landscape:grid-cols-4">
              <Stat label={t('cashier.eod.totalSales', { defaultValue: 'Total sales' })} value={figures.totalSalesMinor ?? 0} />
              <Stat label={t('cashier.method.cash', { defaultValue: 'Cash' })} value={figures.cashSettledMinor ?? 0} tone="primary" />
              <Stat label={t('cashier.method.card', { defaultValue: 'Card' })} value={figures.cardSettledMinor ?? 0} />
              <Stat label={t('cashier.method.mobile', { defaultValue: 'Mobile' })} value={figures.mobileSettledMinor ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('cashier.eod.summaryLine', {
                unsettled: figures.unsettledOrderCount || 0,
                cancelled: figures.cancelledOrderCount || 0,
                total: formatCurrency(figures.totalSettledMinor ?? 0),
                defaultValue: '{{unsettled}} unsettled · {{cancelled}} cancelled tickets · total settled {{total}}',
              })}
            </p>
          </div>
        ) : (
          <div className="border-t border-border/60 px-5 py-5 tablet-portrait:px-7">
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t('cashier.eod.hintAutoTally', { defaultValue: "Your day's sales, payments, and cancellations are tallied automatically when you send the request." })}
              </li>
              <li className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t('cashier.eod.hintManagerReviews', { defaultValue: 'A manager reviews it and either approves the close or sends it back with a note.' })}
              </li>
            </ul>
          </div>
        )}

        <div className="border-t border-border/60 bg-secondary/20 px-5 py-4 tablet-portrait:px-7">
          {status === 'PENDING_REVIEW' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t('cashier.eod.checkBackAnyTime', { defaultValue: 'You can check back any time — the bell will tell you when it is decided.' })}
              </p>
              <Button variant="outline" disabled>
                <Clock3 className="mr-2 h-4 w-4" />
                {t('cashier.eod.waitingApproval', { defaultValue: 'Waiting for approval' })}
              </Button>
            </div>
          ) : status === 'CLOSED' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {t('cashier.eod.dayLockedSeeYou', { defaultValue: 'Business day locked. See you tomorrow.' })}
              </p>
              <Button variant="outline" disabled>
                <BadgeCheck className="mr-2 h-4 w-4" />
                {t('cashier.eod.dayClosedBtn', { defaultValue: 'Day closed' })}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {status === 'REJECTED'
                  ? t('cashier.eod.resendHint', { defaultValue: 'Send a fresh request once the issue is sorted.' })
                  : t('cashier.eod.sendHint', { defaultValue: "Sending the request locks nothing — only your manager's approval does." })}
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
                  ? t('cashier.eod.sending', { defaultValue: 'Sending…' })
                  : status === 'REJECTED'
                    ? t('cashier.eod.resendBtn', { defaultValue: 'Send request again' })
                    : t('cashier.eod.sendBtn', { defaultValue: 'Send close request' })}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default CashierEndOfDay;
