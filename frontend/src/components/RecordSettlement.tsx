/**
 * Record Settlement Component
 * 
 * Form for cashiers to record external payments.
 * Includes idempotency key generation for safe retries.
 */

import React, { useState } from 'react';
import { axiosClient } from '../api/axiosClient';
import { useAuthStore } from '../store/authStore';

interface RecordSettlementProps {
  orderId: string;
  remainingAmount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const RecordSettlement: React.FC<RecordSettlementProps> = ({
  orderId,
  remainingAmount,
  onSuccess,
  onCancel,
}) => {
  const { accessToken } = useAuthStore();
  const [amount, setAmount] = useState<string>((remainingAmount / 100).toFixed(2));
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'MOBILE'>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateIdempotencyKey = () => {
    return `settlement-${orderId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountMinor = Math.round(parseFloat(amount) * 100);

    if (amountMinor <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (amountMinor > remainingAmount) {
      setError(
        `Amount cannot exceed remaining balance of $${(remainingAmount / 100).toFixed(2)}`
      );
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = generateIdempotencyKey();

      await axiosClient.post(
        `/orders/${orderId}/settlements`,
        {
          amountMinor,
          method,
          reference: reference.trim(),
          note: note.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Idempotency-Key': idempotencyKey,
          },
        }
      );

      onSuccess();
    } catch (err: any) {
      console.error('Failed to record settlement:', err);
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        'Failed to record settlement';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAmount = (percentage: number) => {
    const quickAmount = (remainingAmount * percentage) / 100;
    setAmount((quickAmount / 100).toFixed(2));
  };

  return (
    <div className="record-settlement bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold mb-4">Record External Payment</h3>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-red-700">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        <p className="font-semibold">Remaining Balance</p>
        <p className="text-2xl font-bold mt-1">
          ${(remainingAmount / 100).toFixed(2)}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Amount */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Payment Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500 text-lg">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={(remainingAmount / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              required
              disabled={submitting}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleQuickAmount(25)}
              className="flex-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
              disabled={submitting}
            >
              25%
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(50)}
              className="flex-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
              disabled={submitting}
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => handleQuickAmount(100)}
              className="flex-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm font-semibold"
              disabled={submitting}
            >
              Full
            </button>
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Payment Method <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMethod('CASH')}
              className={`py-3 px-4 border-2 rounded-lg font-semibold transition ${
                method === 'CASH'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              disabled={submitting}
            >
              💵 Cash
            </button>
            <button
              type="button"
              onClick={() => setMethod('CARD')}
              className={`py-3 px-4 border-2 rounded-lg font-semibold transition ${
                method === 'CARD'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              disabled={submitting}
            >
              💳 Card
            </button>
            <button
              type="button"
              onClick={() => setMethod('MOBILE')}
              className={`py-3 px-4 border-2 rounded-lg font-semibold transition ${
                method === 'MOBILE'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              disabled={submitting}
            >
              📱 Mobile
            </button>
          </div>
        </div>

        {/* Reference */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Transaction Reference (optional)
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g., Receipt #12345, Transaction ID"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={submitting}
            maxLength={100}
          />
          <p className="mt-1 text-xs text-gray-500">
            External transaction ID or receipt number
          </p>
        </div>

        {/* Note */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional notes about this payment"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            disabled={submitting}
            maxLength={500}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                Recording...
              </span>
            ) : (
              'Record Payment'
            )}
          </button>
        </div>
      </form>

      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p>
          ℹ️ This records that an external payment was received. The actual payment
          processing happens outside this system.
        </p>
      </div>
    </div>
  );
};
