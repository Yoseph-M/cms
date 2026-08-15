/**
 * Settlement History Component
 * 
 * Displays the complete settlement history for an order.
 * Shows all payment records including amount, method, reference, and who recorded it.
 */

import React, { useEffect, useState } from 'react';
import { axiosClient } from '../api/axiosClient';
import { useAuthStore } from '../store/authStore';

interface Settlement {
  id: string;
  amountMinor: number;
  method: 'CASH' | 'CARD' | 'MOBILE';
  reference: string;
  note: string;
  recordedBy: {
    id: string;
    name: string;
  };
  recordedAt: string;
}

interface SettlementHistoryProps {
  orderId: string;
  orderTotal: number;
  onSettlementAdded?: () => void;
}

export const SettlementHistory: React.FC<SettlementHistoryProps> = ({
  orderId,
  orderTotal,
  onSettlementAdded,
}) => {
  const { accessToken } = useAuthStore();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingAmount, setRemainingAmount] = useState<number>(0);

  useEffect(() => {
    fetchSettlements();
  }, [orderId]);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      setError(null);

      const [settlementsRes, remainingRes] = await Promise.all([
        axiosClient.get(`/orders/${orderId}/settlements`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        axiosClient.get(`/orders/${orderId}/remaining-amount`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      setSettlements(settlementsRes.data);
      setRemainingAmount(remainingRes.data.remainingAmount);
    } catch (err: any) {
      console.error('Failed to fetch settlements:', err);
      setError(err.response?.data?.error?.message || 'Failed to load settlement history');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amountMinor: number) => {
    return `$${(amountMinor / 100).toFixed(2)}`;
  };

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString();
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH':
        return '💵 Cash';
      case 'CARD':
        return '💳 Card';
      case 'MOBILE':
        return '📱 Mobile';
      default:
        return method;
    }
  };

  const totalSettled = settlements.reduce((sum, s) => sum + s.amountMinor, 0);
  const settlementStatus =
    totalSettled === 0
      ? 'UNSETTLED'
      : totalSettled >= orderTotal
      ? 'SETTLED'
      : 'PARTIALLY_SETTLED';

  if (loading) {
    return (
      <div className="settlement-history">
        <h3 className="text-lg font-semibold mb-4">Settlement History</h3>
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading settlements...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settlement-history">
        <h3 className="text-lg font-semibold mb-4">Settlement History</h3>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          <p className="font-semibold">Error loading settlements</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchSettlements}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settlement-history">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Settlement History</h3>
        <button
          onClick={fetchSettlements}
          className="text-sm text-blue-600 hover:text-blue-800"
          title="Refresh"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Order Total</p>
            <p className="text-xl font-bold">{formatAmount(orderTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Settled</p>
            <p className="text-xl font-bold text-green-600">
              {formatAmount(totalSettled)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Remaining</p>
            <p className="text-xl font-bold text-orange-600">
              {formatAmount(remainingAmount)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <p className="text-xl font-bold">
              {settlementStatus === 'SETTLED' && (
                <span className="text-green-600">✓ Settled</span>
              )}
              {settlementStatus === 'PARTIALLY_SETTLED' && (
                <span className="text-orange-600">⚠ Partial</span>
              )}
              {settlementStatus === 'UNSETTLED' && (
                <span className="text-red-600">✗ Unsettled</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Settlement Records */}
      {settlements.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">💸</p>
          <p className="mt-2">No settlements recorded yet</p>
          <p className="text-sm mt-1">
            External payments will be recorded here by the cashier
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 font-semibold">
            Payment Records ({settlements.length})
          </p>
          {settlements.map((settlement) => (
            <div
              key={settlement.id}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-lg">
                    {formatAmount(settlement.amountMinor)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {getMethodLabel(settlement.method)}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>{formatDate(settlement.recordedAt)}</p>
                </div>
              </div>

              {settlement.reference && (
                <div className="mt-2 text-sm">
                  <span className="text-gray-600">Reference: </span>
                  <span className="font-mono text-gray-800">
                    {settlement.reference}
                  </span>
                </div>
              )}

              {settlement.note && (
                <div className="mt-2 text-sm">
                  <span className="text-gray-600">Note: </span>
                  <span className="text-gray-800">{settlement.note}</span>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                Recorded by: {settlement.recordedBy.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Information Banner */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        <p className="font-semibold">ℹ️ About Settlements</p>
        <p className="mt-1">
          This CMS records external payments only. The actual payment processing
          happens outside this system (e.g., cash register, card terminal, mobile app).
        </p>
      </div>
    </div>
  );
};
