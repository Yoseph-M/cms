/**
 * Global Settlement History Page
 *
 * Displays all settlement records across all orders.
 * Accessible by all authenticated roles (OWNER, MANAGER, CASHIER, WAITER).
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { axiosClient } from '../../api/axiosClient';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, ArrowRight, CreditCard, Banknote, Smartphone, Calendar, CircleDollarSign, AlertCircle, Receipt, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/Dropdown';

interface SettlementRecord {
  id: string;
  amountMinor: number;
  method: 'CASH' | 'CARD' | 'MOBILE' | 'NONE';
  reference: string;
  note: string;
  createdAt: string;
  // Null when the settlement's order was deleted after payment was recorded.
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
    status: string;
    /** Present on cancelled orders — why the ticket was voided. */
    cancellationReason?: string;
    waiter?: {
      id: string;
      name: string;
      role: string;
    };
    createdAt?: string;
    items: Array<{
      menuItemId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      notes: string;
    }>;
  } | null;
  recordedBy: {
    id: string;
    name: string;
    role: string;
  } | null;
  /**
   * True for cancelled tickets that never received a VOID settlement row: the
   * server synthesises the row from the order so the cancellation still shows
   * in this history.
   */
  isSyntheticVoid?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortColumn = 'date' | 'amount' | 'method' | 'status';
type SortDirection = 'asc' | 'desc';

/* The date and money filters are dropdowns of named windows. Typing an exact
   range meant two keyboard fields, a date picker and an amount picker filled
   this card, and the operator had to remember which day last Tuesday was — a
   preset answers the same question in one click. */
type DatePreset = 'all' | 'today' | '7d' | '30d' | '90d';
type AmountPreset = 'all' | 'under50' | '50to200' | '200to1000' | 'over1000';

/** `daysBack: null` means "no date filter at all". */
const DATE_PRESETS: Array<{ value: DatePreset; key: string; daysBack: number | null }> = [
  { value: 'all', key: 'allDates', daysBack: null },
  { value: 'today', key: 'today', daysBack: 0 },
  { value: '7d', key: 'last7', daysBack: 6 },
  { value: '30d', key: 'last30', daysBack: 29 },
  { value: '90d', key: 'last90', daysBack: 89 },
];

const AMOUNT_PRESETS: Array<{ value: AmountPreset; key: string; min?: number; max?: number }> = [
  { value: 'all', key: 'anyAmount' },
  { value: 'under50', key: 'under50', max: 50 },
  { value: '50to200', key: '50to200', min: 50, max: 200 },
  { value: '200to1000', key: '200to1000', min: 200, max: 1000 },
  { value: 'over1000', key: 'over1000', min: 1000 },
];

const METHOD_ICONS: Record<string, React.ReactNode> = {
  CASH: <Banknote className="w-4 h-4 text-green-600" />,
  CARD: <CreditCard className="w-4 h-4 text-blue-600" />,
  MOBILE: <Smartphone className="w-4 h-4 text-purple-600" />,
  NONE: <X className="w-4 h-4 text-slate-500" />,
};

const METHOD_LABEL_KEYS: Record<string, string> = {
  CASH: 'cashier.method.cash',
  CARD: 'cashier.method.card',
  MOBILE: 'cashier.method.mobile',
  // A cancelled ticket carries no payment method. The cell stays blank rather
  // than being labelled "void" — the order's own status already says Cancelled.
  NONE: '',
};

/** The method filter needs a readable name for the blank "no method" option. */
const METHOD_FILTER_LABEL_KEYS: Record<string, string> = {
  ...METHOD_LABEL_KEYS,
  NONE: 'status.cancelled',
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_KITCHEN: 'bg-amber-50 text-amber-700 border-amber-200',
  SERVED: 'bg-violet-50 text-violet-700 border-violet-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

const ORDER_STATUS_LABEL_KEYS: Record<string, string> = {
  SUBMITTED: 'orderStatus.submitted',
  IN_KITCHEN: 'orderStatus.inKitchen',
  SERVED: 'orderStatus.served',
  PAID: 'status.paid',
  CANCELLED: 'status.cancelled',
};

function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        ORDER_STATUS_STYLES[status] ?? 'bg-secondary/60 text-muted-foreground border-border'
      )}
    >
      {(ORDER_STATUS_LABEL_KEYS[status] && t(ORDER_STATUS_LABEL_KEYS[status])) || status}
    </span>
  );
}

/* Thousands-separated money for the settlement tables — 1234567.5 → 1,234,567.50 */
const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatAmount = (amountMinor: number) =>
  amountFormatter.format(Number.isFinite(amountMinor) ? amountMinor : 0);

const formatDate = (iso: string) => new Date(iso).toLocaleString();

/** Short human handle for the related ticket — the tail of its client id. */
const ticketRef = (order: { clientOrderId?: string; id: string }) =>
  (order.clientOrderId || order.id || '').slice(-6);

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right break-words">{children}</span>
    </div>
  );
}

/** Floating card that shows the full order + payment details for one settlement. */
function SettlementDetailsModal({
  settlement: s,
  onClose,
}: {
  settlement: SettlementRecord;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2.5 min-w-0">
            {METHOD_ICONS[s.method]}
            <h3 className="font-display text-base font-bold truncate">
              {METHOD_LABEL_KEYS[s.method]
                ? t('settlementsFilter.methodPayment', { method: t(METHOD_LABEL_KEYS[s.method]) })
                : t('settlementsFilter.cancelledTicket')}
            </h3>
            {s.order && <StatusChip status={s.order.status} />}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="font-mono text-lg font-bold leading-tight">
                {formatAmount(s.amountMinor)}
              </div>
              <div className="text-[11px] text-muted-foreground">{formatDate(s.createdAt)}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('a11y.close')}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          {/* Order items */}
          <div className="min-w-0">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Receipt className="w-3.5 h-3.5" />
              {t('orderDetails.items')}
            </h4>
            {s.order && s.order.items?.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/60">
                    <th className="text-left py-1.5 pr-2 font-semibold">{t('settlementsFilter.colItem')}</th>
                    <th className="text-right py-1.5 px-2 font-semibold">{t('settlementsFilter.colQty')}</th>
                    <th className="text-right py-1.5 px-2 font-semibold">{t('settlementsFilter.colUnit')}</th>
                    <th className="text-right py-1.5 pl-2 font-semibold">{t('orderDetails.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.order.items.map((item, idx) => (
                    <tr key={`${item.menuItemId}-${idx}`} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{item.name}</span>
                        {item.notes ? (
                          <span className="block text-[11px] text-muted-foreground italic">{item.notes}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">×{item.quantity}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{formatAmount(item.unitPrice)}</td>
                      <td className="py-1.5 pl-2 text-right font-mono font-semibold">
                        {formatAmount(item.unitPrice * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : s.order ? (
              <p className="text-sm text-muted-foreground">{t('settlementsFilter.noItems')}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('settlementsFilter.orderDeleted')}
              </p>
            )}
          </div>

          {/* Order & payment summary */}
          <div className="space-y-5 min-w-0">
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settlementsFilter.order')}</h4>
              {s.order ? (
                <div className="divide-y divide-border/40">
                  <DetailRow label={t('cashier:queue.table')}>{s.order.tableNumber}</DetailRow>
                  <DetailRow label={t('settlements.statusLabel')}>
                    <StatusChip status={s.order.status} />
                  </DetailRow>
                  <DetailRow label={t('orderDetails.total')}>
                    <span className="font-mono">{formatAmount(s.order.totalAmount)}</span>
                  </DetailRow>
                  <DetailRow label={t('settlements.waiter')}>{s.order.waiter?.name || t('loginHistory.unknown')}</DetailRow>
                  {s.order.status === 'CANCELLED' ? (
                    <DetailRow label={t('settlementsFilter.cancelledBecause')}>
                      {s.order.cancellationReason || t('settlementsFilter.noReason')}
                    </DetailRow>
                  ) : null}
                  {s.order.createdAt ? (
                    <DetailRow label={t('settlementsFilter.placed')}>{formatDate(s.order.createdAt)}</DetailRow>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('settlementsFilter.orderUnavailable')}</p>
              )}
            </div>
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('settlementsFilter.payment')}</h4>
              <div className="divide-y divide-border/40">
                <DetailRow label={t('settlements.paymentMethod')}>
                  {(METHOD_LABEL_KEYS[s.method] && t(METHOD_LABEL_KEYS[s.method])) || (s.method === 'NONE' ? '—' : s.method)}
                </DetailRow>
                {s.reference ? <DetailRow label={t('settlements.reference')}>{s.reference}</DetailRow> : null}
                {s.method === 'NONE' ? (
                  <DetailRow label={t('settlementsFilter.effect')}>{t('settlementsFilter.effectMsg')}</DetailRow>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const GlobalSettlementHistory: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation() as { state?: { orderFilter?: string } };
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [amountPreset, setAmountPreset] = useState<AmountPreset>('all');
  // Deep-link from header search: pre-filter to a specific order's settlements.
  const [orderFilter, setOrderFilter] = useState<string>(location.state?.orderFilter ?? '');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [selected, setSelected] = useState<SettlementRecord | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: t('cashier:nav.settlements'), subtitle: t('settlementsFilter.pageSubtitle') });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: t('app.overview'), subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  /* The active date window, anchored to the operator's local midnight the same
     way the rest of the app does — a preset means "today" on the POS, not UTC. */
  const dateWindow = useMemo(() => {
    const preset = DATE_PRESETS.find((p) => p.value === datePreset);
    if (!preset || preset.daysBack === null) return { from: '', to: '' };
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - preset.daysBack);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [datePreset]);

  const amountWindow = useMemo(
    () => AMOUNT_PRESETS.find((p) => p.value === amountPreset) ?? AMOUNT_PRESETS[0],
    [amountPreset],
  );

  // The presets the pills read back, so the trigger always names the active
  // window rather than a placeholder.
  const activeDatePreset = DATE_PRESETS.find((p) => p.value === datePreset) ?? DATE_PRESETS[0];
  const activeAmountPreset = AMOUNT_PRESETS.find((p) => p.value === amountPreset) ?? AMOUNT_PRESETS[0];

  // Cached per-filter/page query — revisiting this page renders instantly from
  // cache instead of re-fetching the whole settlement history on every visit.
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery<{ data: SettlementRecord[]; pagination: Pagination }>({
    // Keyed by the chosen presets (stable strings) rather than the resolved
    // timestamps, so "Last 7 days" hits the same cache entry for the whole day.
    queryKey: ['settlements', methodFilter, datePreset, amountPreset, orderFilter, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (methodFilter) params.method = methodFilter;
      if (dateWindow.from) params.from = dateWindow.from;
      if (dateWindow.to) params.to = dateWindow.to;
      if (typeof amountWindow.min === 'number') params.minAmount = String(amountWindow.min);
      if (typeof amountWindow.max === 'number') params.maxAmount = String(amountWindow.max);
      if (orderFilter) params.order = orderFilter;

      const res = await axiosClient.get('/settlements', { params });
      return res.data;
    },
    staleTime: 2 * 60_000,
  });
  useEffect(() => {
    if (queryError) console.error('Failed to fetch settlement history:', queryError);
  }, [queryError]);

  const settlements = data?.data ?? [];
  const pagination = data?.pagination ?? { page, limit: 25, total: 0, totalPages: 0 };
  // Skeleton only while there is no cached page; background refetches stay silent.
  const loading = isLoading || (isFetching && !data);
  const errorMessage =
    queryError instanceof Error ? queryError.message : t('settlements.loadFailed');

  // Any filter change starts over at page 1.
  useEffect(() => {
    setPage(1);
  }, [methodFilter, datePreset, amountPreset, orderFilter]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedSettlements = useMemo(() => {
    const sorted = [...settlements].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'amount':
          comparison = a.amountMinor - b.amountMinor;
          break;
        case 'method':
          comparison = a.method.localeCompare(b.method);
          break;
        case 'status':
          comparison = (a.order?.status || '').localeCompare(b.order?.status || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [settlements, sortColumn, sortDirection]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header>
        <h3 className="text-lg font-bold">{t('settlements.title')}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('settlementsFilter.headerLine', { count: pagination.total })}
        </p>
      </header>

      {/* Filter bar — the menu library's bar, markup for markup: a result line
          on the left, the filter pills right-aligned on ONE row, each pill the
          same `shrink-0 h-11` trigger with a leading icon and its options in
          the same dropdown card. The three questions (when, how much, how it
          was paid) never become full-width rows stacked down the card; the
          pills simply sit in the row's right end and wrap as a group only when
          the window is genuinely too narrow for them. */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {t('settlementsFilter.showingCount', {
                shown: settlements.length,
                total: pagination.total,
              })}
            </p>

            <div className="flex items-center gap-2 flex-wrap ml-auto justify-end">
              {/* When */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('settlementsFilter.filterByDate')}
                  className="shrink-0 h-11"
                >
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{t(`settlementsFilter.${activeDatePreset.key}`)}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {DATE_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.value}
                      selected={datePreset === preset.value}
                      onSelect={() => setDatePreset(preset.value)}
                    >
                      <span>{t(`settlementsFilter.${preset.key}`)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* How much */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('settlementsFilter.filterByAmount')}
                  className="shrink-0 h-11"
                >
                  <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
                  <span>{t(`settlementsFilter.${activeAmountPreset.key}`)}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {AMOUNT_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.value}
                      selected={amountPreset === preset.value}
                      onSelect={() => setAmountPreset(preset.value)}
                    >
                      <span>{t(`settlementsFilter.${preset.key}`)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* How it was paid — the trigger carries the chosen method's own icon. */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('settlementsFilter.filterByMethod')}
                  className="shrink-0 h-11"
                >
                  {methodFilter ? (
                    METHOD_ICONS[methodFilter]
                  ) : (
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span>
                    {methodFilter
                      ? t(METHOD_FILTER_LABEL_KEYS[methodFilter])
                      : t('settlementsFilter.allMethods')}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem selected={methodFilter === ''} onSelect={() => setMethodFilter('')}>
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>{t('settlementsFilter.allMethods')}</span>
                  </DropdownMenuItem>
                  {(['CASH', 'CARD', 'MOBILE', 'NONE'] as const).map((method) => (
                    <DropdownMenuItem
                      key={method}
                      selected={methodFilter === method}
                      onSelect={() => setMethodFilter(method)}
                    >
                      {METHOD_ICONS[method]}
                      <span>{t(METHOD_FILTER_LABEL_KEYS[method])}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Deep-link from header search — a removable chip, kept out of the
              three-column row so it never displaces a filter. */}
          {orderFilter && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOrderFilter('')}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
                title={t('settlementsFilter.clearOrderFilter')}
              >
                <Receipt className="h-4 w-4 text-primary" />
                <span className="max-w-[14ch] truncate">#{orderFilter.slice(-6)}</span>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : queryError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-10 h-10 mb-3 opacity-60 text-red-500" />
              <p className="font-medium text-foreground">{t('settlements.loadError')}</p>
              <p className="text-sm mt-1 max-w-md text-center">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
                {t('buttons.retry')}
              </Button>
            </div>
          ) : sortedSettlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">{t('settlementsFilter.noneFound')}</p>
              <p className="text-sm mt-1">
                {t('settlementsFilter.noneFoundMsg')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('date')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('settlementsFilter.colDate')}
                        {sortColumn === 'date' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('amount')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('settlementsFilter.colAmount')}
                        {sortColumn === 'amount' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('method')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('settlementsFilter.methodWord')}
                        {sortColumn === 'method' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t('settlements.statusLabel')}
                        {sortColumn === 'status' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSettlements.map((s) => {
                    const isCancelled = s.order?.status === 'CANCELLED';
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelected(s)}
                        className={cn(
                          'border-b border-border/50 transition-colors cursor-pointer select-none',
                          'hover:bg-muted/20',
                          // Cancellations are real history, so they get a tint rather
                          // than a faded row (fading made them look disabled/filtered out).
                          isCancelled && 'bg-destructive/[0.045] hover:bg-destructive/[0.07]'
                        )}
                        title={t('settlementsFilter.viewDetailsHint')}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          <div>{formatDate(s.createdAt)}</div>
                          {s.order ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground/90">
                              {t('cashier:queue.table')} {s.order.tableNumber || '—'} · #{ticketRef(s.order)}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 font-mono whitespace-nowrap',
                            isCancelled ? 'text-muted-foreground line-through' : 'font-semibold'
                          )}
                          title={isCancelled ? t('settlementsFilter.cancelledNotRevenue') : undefined}
                        >
                          {formatAmount(s.amountMinor)}
                        </td>
                        <td className={cn('px-4 py-3', s.method === 'NONE' && 'text-center')}>
                          {s.method === 'NONE' ? (
                            /* A cancelled ticket has no payment method — the × sits
                               alone, centred in the column. */
                            METHOD_ICONS.NONE
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {METHOD_ICONS[s.method]}
                              {(METHOD_LABEL_KEYS[s.method] && t(METHOD_LABEL_KEYS[s.method])) || s.method}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.order ? (
                            <StatusChip status={s.order.status} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating details card */}
      {selected && (
        <SettlementDetailsModal settlement={selected} onClose={() => setSelected(null)} />
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('settlementsFilter.pageOf', { page: pagination.page, total: pagination.totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
