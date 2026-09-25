/**
 * Settlement History Component
 * 
 * Displays the complete settlement history for an order.
 * Shows all payment records including amount, method, reference, and who recorded it.
 */

import React, { useEffect, useState } from 'react';
import { axiosClient } from '../api/axiosClient';
import { useAuthStore } from '../store/authStore';
import { extractErrorMessage } from '../utils/errorHandler';
import { useTranslation } from 'react-i18next';

interface Settlement {
  id: string;
  amountMinor: number;
  /** NONE is the VOID audit row a cancellation writes — never a payment. */
  method: 'CASH' | 'CARD' | 'MOBILE' | 'NONE';
  reference: string;
  note: string;
  recordedBy: {
    id: string;
    name: string;
  };
  order?: {
    waiter?: {
      id: string;
      name: string;
    };
  };
  createdAt: string;
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
  const { t } = useTranslation();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingAmount, setRemainingAmount] = useState<number>(0);

  useEffect(() => {
    fetchSettlements();
  }, [orderId, onSettlementAdded]);

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
      setError(extractErrorMessage(err, t('settlements.loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amountMinor: number) => `${Math.round(amountMinor).toLocaleString('en-US')} ETB`;

  const formatDate = (isoDate: string) => {
    return new Date(isoDate).toLocaleString();
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH':
        return `💵 ${t('cashier.method.cash')}`;
      case 'CARD':
        return `💳 ${t('cashier.method.card')}`;
      case 'MOBILE':
        return `📱 ${t('cashier.method.mobile')}`;
      default:
        return method;
    }
  };

  /* Money actually taken on this ticket. A VOID row (method NONE) is the
     cancellation audit entry — it carries the ticket's whole value so the void
     shows in the history — so it must not be added to "Total Settled", which
     would show a cancelled ticket as paid in full. */
  const moneyRows = settlements.filter((s) => s.method !== 'NONE');
  const totalSettled = moneyRows.reduce((sum, s) => sum + s.amountMinor, 0);
  const settlementStatus =
    totalSettled === 0
      ? 'UNSETTLED'
      : totalSettled >= orderTotal
      ? 'SETTLED'
      : 'PARTIALLY_SETTLED';

  if (loading) {
    return (
      <div className="settlement-history">
        <h3 className="text-lg font-semibold mb-4">{t('settlements.title')}</h3>
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">{t('settlements.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settlement-history">
        <h3 className="text-lg font-semibold mb-4">{t('settlements.title')}</h3>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
          <p className="font-semibold">{t('settlements.loadError')}</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={fetchSettlements}
            className="mt-2 text-sm underline hover:no-underline"
          >
            {t('buttons.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settlement-history">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{t('settlements.title')}</h3>
        <button
          onClick={fetchSettlements}
          className="text-sm text-blue-600 hover:text-blue-800"
          title={t('settlements.refresh')}
        >
          🔄 {t('settlements.refresh')}
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 max-[419px]:grid-cols-1 gap-4">
          <div>
            <p className="text-sm text-gray-600">{t('settlements.orderTotal')}</p>
            <p className="text-xl font-bold">{formatAmount(orderTotal)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">{t('settlements.totalSettled')}</p>
            <p className="text-xl font-bold text-green-600">
              {formatAmount(totalSettled)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">{t('settlements.remaining')}</p>
            <p className="text-xl font-bold text-amber-600">
              {formatAmount(remainingAmount)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">{t('settlements.statusLabel')}</p>
            <p className="text-xl font-bold">
              {settlementStatus === 'SETTLED' && (
                <span className="text-green-600">✓ {t('settlements.settled')}</span>
              )}
              {settlementStatus === 'PARTIALLY_SETTLED' && (
                <span className="text-amber-600">⚠ {t('settlements.partial')}</span>
              )}
              {settlementStatus === 'UNSETTLED' && (
                <span className="text-red-600">✗ {t('settlements.unsettled')}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Settlement Records */}
      {settlements.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">💸</p>
          <p className="mt-2">{t('settlements.empty')}</p>
          <p className="text-sm mt-1">
            {t('settlements.emptyHint')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 font-semibold">
            {t('settlements.paymentRecords', { count: moneyRows.length })}
          </p>
          {settlements.map((settlement) => (
            <div
              key={settlement.id}
              className={
                settlement.method === 'NONE'
                  ? 'border border-gray-200 rounded-lg p-4 bg-gray-50 hover:shadow-sm transition-shadow'
                  : 'border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow'
              }
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p
                    className={
                      settlement.method === 'NONE'
                        ? 'font-semibold text-lg text-gray-400 line-through'
                        : 'font-semibold text-lg'
                    }
                  >
                    {formatAmount(settlement.amountMinor)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {settlement.method === 'NONE'
                      ? t('settlements.voided')
                      : getMethodLabel(settlement.method)}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>{formatDate(settlement.createdAt)}</p>
                </div>
              </div>

              {settlement.reference && (
                <div className="mt-2 text-sm">
                  <span className="text-gray-600">{t('settlements.reference')} </span>
                  <span className="font-mono text-gray-800">
                    {settlement.reference}
                  </span>
                </div>
              )}

              {settlement.note && (
                <div className="mt-2 text-sm">
                  <span className="text-gray-600">{t('settlements.note')} </span>
                  <span className="text-gray-800">{settlement.note}</span>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                {t('settlements.waiter')}: {settlement.order?.waiter?.name || t('settlements.na')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Information Banner */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        <p className="font-semibold">ℹ️ {t('settlements.about')}</p>
        <p className="mt-1">
          {t('settlements.aboutMsg')}
        </p>
      </div>
    </div>
  );
};
