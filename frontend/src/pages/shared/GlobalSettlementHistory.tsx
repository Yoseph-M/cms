/**
 * Global Settlement History Page
 *
 * Displays all settlement records across all orders.
 * Accessible by all authenticated roles (OWNER, MANAGER, CASHIER, WAITER).
 */

import React, { useEffect, useState, useMemo } from 'react';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

const METHOD_ICONS: Record<string, React.ReactNode> = {
  CASH: <Banknote className="w-4 h-4 text-green-600" />,
  CARD: <CreditCard className="w-4 h-4 text-blue-600" />,
  MOBILE: <Smartphone className="w-4 h-4 text-purple-600" />,
  NONE: <X className="w-4 h-4 text-slate-500" />,
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile',
  // A cancelled ticket carries no payment method. The cell stays blank rather
  // than being labelled "void" — the order's own status already says Cancelled.
  NONE: '',
};

/** The method filter needs a readable name for the blank "no method" option. */
const METHOD_FILTER_LABELS: Record<string, string> = {
  ...METHOD_LABELS,
  NONE: 'Cancelled',
};

const DATE_PRESETS: Array<{ key: string; label: string; get: () => { from: string; to: string } }> = [
  { key: 'all', label: 'All dates', get: () => ({ from: '', to: '' }) },
  {
    key: 'today',
    label: 'Today',
    get: () => {
      const t = new Date();
      const iso = (d: Date) => d.toISOString().split('T')[0];
      return { from: iso(t), to: iso(t) };
    },
  },
  {
    key: '7d',
    label: 'Last 7 days',
    get: () => {
      const t = new Date();
      const f = new Date();
      f.setDate(t.getDate() - 6);
      const iso = (d: Date) => d.toISOString().split('T')[0];
      return { from: iso(f), to: iso(t) };
    },
  },
  {
    key: '30d',
    label: 'Last 30 days',
    get: () => {
      const t = new Date();
      const f = new Date();
      f.setDate(t.getDate() - 29);
      const iso = (d: Date) => d.toISOString().split('T')[0];
      return { from: iso(f), to: iso(t) };
    },
  },
  {
    key: '90d',
    label: 'Last 90 days',
    get: () => {
      const t = new Date();
      const f = new Date();
      f.setDate(t.getDate() - 89);
      const iso = (d: Date) => d.toISOString().split('T')[0];
      return { from: iso(f), to: iso(t) };
    },
  },
];

const AMOUNT_PRESETS: Array<{ key: string; label: string; get: () => { min: string; max: string } }> = [
  { key: 'all', label: 'Any amount', get: () => ({ min: '', max: '' }) },
  { key: 'lt50', label: 'Under 50', get: () => ({ min: '', max: '50' }) },
  { key: '50-200', label: '50 – 200', get: () => ({ min: '50', max: '200' }) },
  { key: '200-1000', label: '200 – 1,000', get: () => ({ min: '200', max: '1000' }) },
  { key: 'gt1000', label: 'Over 1,000', get: () => ({ min: '1000', max: '' }) },
];

const ORDER_STATUS_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_KITCHEN: 'bg-amber-50 text-amber-700 border-amber-200',
  SERVED: 'bg-violet-50 text-violet-700 border-violet-200',
  PAID: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  IN_KITCHEN: 'In kitchen',
  SERVED: 'Served',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        ORDER_STATUS_STYLES[status] ?? 'bg-secondary/60 text-muted-foreground border-border'
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
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
              {METHOD_LABELS[s.method]
                ? `${METHOD_LABELS[s.method]} payment`
                : 'Cancelled ticket'}
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
              aria-label="Close details"
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
              Order items
            </h4>
            {s.order && s.order.items?.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/60">
                    <th className="text-left py-1.5 pr-2 font-semibold">Item</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Qty</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Unit</th>
                    <th className="text-right py-1.5 pl-2 font-semibold">Total</th>
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
              <p className="text-sm text-muted-foreground">No items recorded on this order.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This order was deleted after the payment was recorded, so its details are no longer
                available.
              </p>
            )}
          </div>

          {/* Order & payment summary */}
          <div className="space-y-5 min-w-0">
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Order</h4>
              {s.order ? (
                <div className="divide-y divide-border/40">
                  <DetailRow label="Table">{s.order.tableNumber}</DetailRow>
                  <DetailRow label="Status">
                    <StatusChip status={s.order.status} />
                  </DetailRow>
                  <DetailRow label="Total">
                    <span className="font-mono">{formatAmount(s.order.totalAmount)}</span>
                  </DetailRow>
                  <DetailRow label="Waiter">{s.order.waiter?.name || 'Unknown'}</DetailRow>
                  {s.order.status === 'CANCELLED' ? (
                    <DetailRow label="Cancelled because">
                      {s.order.cancellationReason || 'No reason recorded'}
                    </DetailRow>
                  ) : null}
                  {s.order.createdAt ? (
                    <DetailRow label="Placed">{formatDate(s.order.createdAt)}</DetailRow>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Order no longer available.</p>
              )}
            </div>
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</h4>
              <div className="divide-y divide-border/40">
                <DetailRow label="Method">
                  {METHOD_LABELS[s.method] || (s.method === 'NONE' ? '—' : s.method)}
                </DetailRow>
                {s.reference ? <DetailRow label="Reference">{s.reference}</DetailRow> : null}
                {s.method === 'NONE' ? (
                  <DetailRow label="Effect">Cancels the ticket</DetailRow>
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
  const location = useLocation() as { state?: { orderFilter?: string } };
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [amountPreset, setAmountPreset] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  // Deep-link from header search: pre-filter to a specific order's settlements.
  const [orderFilter, setOrderFilter] = useState<string>(location.state?.orderFilter ?? '');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [selected, setSelected] = useState<SettlementRecord | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Settlements', subtitle: 'All payments and cancelled tickets across orders' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  // Cached per-filter/page query — revisiting this page renders instantly from
  // cache instead of re-fetching the whole settlement history on every visit.
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery<{ data: SettlementRecord[]; pagination: Pagination }>({
    queryKey: [
      'settlements',
      methodFilter,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      orderFilter,
      page,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (methodFilter) params.method = methodFilter;
      if (dateFrom) params.from = new Date(`${dateFrom}T00:00:00.000`).toISOString();
      if (dateTo) {
        const d = new Date(`${dateTo}T23:59:59.999`);
        params.to = d.toISOString();
      }
      if (minAmount) params.minAmount = String(parseFloat(minAmount));
      if (maxAmount) params.maxAmount = String(parseFloat(maxAmount));
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
    queryError instanceof Error ? queryError.message : 'Failed to load settlement history.';

  // Any filter change starts over at page 1.
  useEffect(() => {
    setPage(1);
  }, [methodFilter, dateFrom, dateTo, minAmount, maxAmount, orderFilter]);

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

  const handleDatePreset = (preset: typeof DATE_PRESETS[number]) => {
    setDatePreset(preset.key);
    const { from, to } = preset.get();
    setDateFrom(from);
    setDateTo(to);
  };

  const handleAmountPreset = (preset: typeof AMOUNT_PRESETS[number]) => {
    setAmountPreset(preset.key);
    const { min, max } = preset.get();
    setMinAmount(min);
    setMaxAmount(max);
  };

  const activeDateLabel = useMemo(() => {
    if (datePreset !== 'all') {
      return DATE_PRESETS.find((p) => p.key === datePreset)?.label ?? 'All dates';
    }
    if (dateFrom || dateTo) {
      return `${dateFrom || '…'} → ${dateTo || '…'}`;
    }
    return 'Date';
  }, [datePreset, dateFrom, dateTo]);

  const activeAmountLabel = useMemo(() => {
    if (amountPreset !== 'all') {
      return AMOUNT_PRESETS.find((p) => p.key === amountPreset)?.label ?? 'Any amount';
    }
    if (minAmount || maxAmount) {
      return `${minAmount || '0'} – ${maxAmount || '∞'}`;
    }
    return 'Amount';
  }, [amountPreset, minAmount, maxAmount]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold">Settlement History</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every payment, plus cancelled tickets. {pagination.total} records total.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Order deep-link from header search — shown as a removable chip. */}
          {orderFilter && (
            <button
              type="button"
              onClick={() => setOrderFilter('')}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10"
              title="Clear order filter"
            >
              <Receipt className="h-4 w-4 text-primary" />
              <span className="max-w-[14ch] truncate">#{orderFilter.slice(-6)}</span>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}

          {/* Date filter */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by date" className="shrink-0 h-11">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>{activeDateLabel}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Date range</DropdownMenuLabel>
              {DATE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.key}
                  selected={datePreset === preset.key && !dateFrom && !dateTo}
                  onSelect={() => handleDatePreset(preset)}
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>{preset.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2.5 py-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custom range</p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none"
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Amount filter */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by amount" className="shrink-0 h-11">
              <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
              <span>{activeAmountLabel}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Amount range</DropdownMenuLabel>
              {AMOUNT_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.key}
                  selected={amountPreset === preset.key && !minAmount && !maxAmount}
                  onSelect={() => handleAmountPreset(preset)}
                >
                  <CircleDollarSign className="w-4 h-4 shrink-0" />
                  <span>{preset.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2.5 py-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custom range</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={minAmount}
                    onChange={(e) => {
                      setMinAmount(e.target.value.replace(/[^\d]/g, ''));
                      setAmountPreset('custom');
                    }}
                    placeholder="Min"
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none"
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={maxAmount}
                    onChange={(e) => {
                      setMaxAmount(e.target.value.replace(/[^\d]/g, ''));
                      setAmountPreset('custom');
                    }}
                    placeholder="Max"
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none"
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Method filter */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by method" className="shrink-0 h-11">
              {methodFilter ? METHOD_ICONS[methodFilter] : <CreditCard className="w-4 h-4 text-muted-foreground" />}
              <span>{methodFilter ? METHOD_FILTER_LABELS[methodFilter] : 'Method'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem selected={!methodFilter} onSelect={() => setMethodFilter('')}>
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>All methods</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(['CASH', 'CARD', 'MOBILE', 'NONE'] as const).map((method) => (
                <DropdownMenuItem
                  key={method}
                  selected={methodFilter === method}
                  onSelect={() => setMethodFilter(method)}
                >
                  {METHOD_ICONS[method]}
                  <span>{METHOD_FILTER_LABELS[method]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : queryError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="w-10 h-10 mb-3 opacity-60 text-red-500" />
              <p className="font-medium text-foreground">Failed to load settlements</p>
              <p className="text-sm mt-1 max-w-md text-center">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
                Try again
              </Button>
            </div>
          ) : sortedSettlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No settlements found</p>
              <p className="text-sm mt-1">
                Payments and cancelled tickets will appear here once they are recorded.
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
                        Date
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
                        Amount
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
                        Method
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
                        Status
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
                        title="Click to view order details"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          <div>{formatDate(s.createdAt)}</div>
                          {s.order ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground/90">
                              Table {s.order.tableNumber || '—'} · #{ticketRef(s.order)}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 font-mono whitespace-nowrap',
                            isCancelled ? 'text-muted-foreground line-through' : 'font-semibold'
                          )}
                          title={isCancelled ? 'Cancelled — not counted as revenue' : undefined}
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
                              {METHOD_LABELS[s.method] || s.method}
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
            Page {pagination.page} of {pagination.totalPages}
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
