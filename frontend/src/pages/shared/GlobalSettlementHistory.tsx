/**
 * Global Settlement History Page
 *
 * Displays all settlement records across all orders.
 * Accessible by all authenticated roles (OWNER, MANAGER, CASHIER, WAITER).
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ArrowLeft, ArrowRight, CreditCard, Banknote, Smartphone, ChevronDown, Calendar, Users, Hash, Table2, CircleDollarSign, X, Search } from 'lucide-react';
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
  method: 'CASH' | 'CARD' | 'MOBILE';
  reference: string;
  note: string;
  createdAt: string;
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
    status: string;
    waiter?: {
      id: string;
      name: string;
      role: string;
    };
  };
  recordedBy: {
    id: string;
    name: string;
    role: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortColumn = 'date' | 'amount' | 'method' | 'table' | 'total' | 'recordedBy';
type SortDirection = 'asc' | 'desc';

const METHOD_ICONS: Record<string, React.ReactNode> = {
  CASH: <Banknote className="w-4 h-4 text-green-600" />,
  CARD: <CreditCard className="w-4 h-4 text-blue-600" />,
  MOBILE: <Smartphone className="w-4 h-4 text-purple-600" />,
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile',
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
  { key: 'lt50', label: 'Under 50', get: () => ({ min: '', max: '5000' }) },
  { key: '50-200', label: '50 – 200', get: () => ({ min: '5000', max: '20000' }) },
  { key: '200-1000', label: '200 – 1,000', get: () => ({ min: '20000', max: '100000' }) },
  { key: 'gt1000', label: 'Over 1,000', get: () => ({ min: '100000', max: '' }) },
];

export const GlobalSettlementHistory: React.FC = () => {
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [amountPreset, setAmountPreset] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [tableFilter, setTableFilter] = useState<string>('');
  const [orderFilter, setOrderFilter] = useState<string>('');
  const [totalFilter, setTotalFilter] = useState<string>('');
  const [recordedByFilter, setRecordedByFilter] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Settlements', subtitle: 'All payment settlements across orders' });
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
  } = useQuery<{ data: SettlementRecord[]; pagination: Pagination }>({
    queryKey: [
      'settlements',
      methodFilter,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      tableFilter.trim(),
      orderFilter.trim(),
      recordedByFilter.trim(),
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
      if (minAmount) params.minAmount = String(Math.round(parseFloat(minAmount) * 100));
      if (maxAmount) params.maxAmount = String(Math.round(parseFloat(maxAmount) * 100));
      if (tableFilter.trim()) params.table = tableFilter.trim();
      if (orderFilter.trim()) params.order = orderFilter.trim();
      if (recordedByFilter.trim()) params.recordedBy = recordedByFilter.trim();

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

  // Any filter change starts over at page 1.
  useEffect(() => {
    setPage(1);
  }, [methodFilter, dateFrom, dateTo, minAmount, maxAmount, tableFilter, orderFilter, recordedByFilter]);

  const formatAmount = (amountMinor: number) => {
    return (amountMinor / 100).toFixed(2);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Apply the table-side "Total" filter on the client because the API filters
  // the settlement amount, not the parent order total.
  const visibleSettlements = useMemo(() => {
    if (!totalFilter.trim()) return settlements;
    const q = totalFilter.trim();
    const asNumber = Number(q);
    return settlements.filter((s) => {
      if (!s.order) return false;
      const total = (s.order.totalAmount / 100).toString();
      if (!Number.isNaN(asNumber) && /^\d+(\.\d+)?$/.test(q)) {
        return Math.round(s.order.totalAmount / 100) === Math.round(asNumber);
      }
      return total.includes(q);
    });
  }, [settlements, totalFilter]);

  const sortedSettlements = useMemo(() => {
    const sorted = [...visibleSettlements].sort((a, b) => {
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
        case 'table':
          comparison = (a.order?.tableNumber || '').localeCompare(b.order?.tableNumber || '');
          break;
        case 'total':
          comparison = (a.order?.totalAmount || 0) - (b.order?.totalAmount || 0);
          break;
        case 'recordedBy':
          comparison = (a.order?.waiter?.name || '').localeCompare(b.order?.waiter?.name || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [visibleSettlements, sortColumn, sortDirection]);

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
            All payment settlements across all orders. {pagination.total} records total.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
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
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none focus:border-primary"
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
                    inputMode="decimal"
                    value={minAmount}
                    onChange={(e) => {
                      setMinAmount(e.target.value);
                      setAmountPreset('custom');
                    }}
                    placeholder="Min"
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={maxAmount}
                    onChange={(e) => {
                      setMaxAmount(e.target.value);
                      setAmountPreset('custom');
                    }}
                    placeholder="Max"
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-xs text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Method filter */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by method" className="shrink-0 h-11">
              {methodFilter ? METHOD_ICONS[methodFilter] : <CreditCard className="w-4 h-4 text-muted-foreground" />}
              <span>{methodFilter ? METHOD_LABELS[methodFilter] : 'Method'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem selected={!methodFilter} onSelect={() => setMethodFilter('')}>
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>All methods</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(['CASH', 'CARD', 'MOBILE'] as const).map((method) => (
                <DropdownMenuItem
                  key={method}
                  selected={methodFilter === method}
                  onSelect={() => setMethodFilter(method)}
                >
                  {METHOD_ICONS[method]}
                  <span>{METHOD_LABELS[method]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Table filter */}
          <div className="relative">
            <Table2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Table"
              aria-label="Filter by table"
              className="h-11 w-28 pl-9 pr-7"
            />
            {tableFilter && (
              <button
                type="button"
                onClick={() => setTableFilter('')}
                aria-label="Clear table filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Order filter */}
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              placeholder="Order"
              aria-label="Filter by order"
              className="h-11 w-32 pl-9 pr-7"
            />
            {orderFilter && (
              <button
                type="button"
                onClick={() => setOrderFilter('')}
                aria-label="Clear order filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Total filter */}
          <div className="relative">
            <CircleDollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              inputMode="decimal"
              value={totalFilter}
              onChange={(e) => setTotalFilter(e.target.value)}
              placeholder="Total"
              aria-label="Filter by order total"
              className="h-11 w-28 pl-9 pr-7"
            />
            {totalFilter && (
              <button
                type="button"
                onClick={() => setTotalFilter('')}
                aria-label="Clear total filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Recorded By filter */}
          <div className="relative">
            <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={recordedByFilter}
              onChange={(e) => setRecordedByFilter(e.target.value)}
              placeholder="Waiter"
              aria-label="Filter by waiter"
              className="h-11 w-36 pl-9 pr-7"
            />
            {recordedByFilter && (
              <button
                type="button"
                onClick={() => setRecordedByFilter('')}
                aria-label="Clear waiter filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : sortedSettlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CreditCard className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No settlements found</p>
              <p className="text-sm mt-1">Settlement records will appear here once payments are recorded.</p>
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
                        onClick={() => handleSort('table')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Table
                        {sortColumn === 'table' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('total')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Order Total
                        {sortColumn === 'total' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort('recordedBy')}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Waiter
                        {sortColumn === 'recordedBy' && (
                          <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSettlements.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {formatAmount(s.amountMinor)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {METHOD_ICONS[s.method]}
                          {METHOD_LABELS[s.method] || s.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.order?.tableNumber || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {s.order ? formatAmount(s.order.totalAmount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.order?.waiter?.name || 'Unknown'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
