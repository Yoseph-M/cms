/**
 * Global Settlement History Page
 *
 * Displays all settlement records across all orders.
 * Accessible by all authenticated roles (OWNER, MANAGER, CASHIER, WAITER).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, ArrowRight, RefreshCw, CreditCard, Banknote, Smartphone, Filter } from 'lucide-react';

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

export const GlobalSettlementHistory: React.FC = () => {
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState<string>('');

  const fetchSettlements = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (methodFilter) params.method = methodFilter;

      const res = await axiosClient.get('/settlements', { params });
      setSettlements(res.data.data);
      setPagination(res.data.pagination);
    } catch (error) {
      console.error('Failed to fetch settlement history:', error);
    } finally {
      setLoading(false);
    }
  }, [methodFilter]);

  useEffect(() => {
    fetchSettlements(1);
  }, [fetchSettlements]);

  const formatAmount = (amountMinor: number) => {
    return (amountMinor / 100).toFixed(2);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Settlement History</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            All payment settlements across all orders. {pagination.total} records total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE">Mobile</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => fetchSettlements(pagination.page)} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : settlements.length === 0 ? (
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
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Method</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Table</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Order Total</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Recorded By</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
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
                        {s.recordedBy?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                        {s.reference || '—'}
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
              onClick={() => fetchSettlements(pagination.page - 1)}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchSettlements(pagination.page + 1)}
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
