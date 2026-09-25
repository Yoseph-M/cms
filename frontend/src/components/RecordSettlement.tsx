/**
 * Record Settlement Component
 * 
 * Form for cashiers to record external payments.
 * Includes idempotency key generation for safe retries.
 */

import React, { useState, useRef } from 'react';
import { axiosClient } from '../api/axiosClient';
import { useAuthStore } from '../store/authStore';
import { extractErrorMessage, extractErrorDetails } from '../utils/errorHandler';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [amount, setAmount] = useState<string>(String(Math.round(remainingAmount)));
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'MOBILE'>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [500, 1000, 2000]; // Exponential backoff

  const generateIdempotencyKey = () => {
    return `settlement-${orderId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const submitSettlement = async (idempotencyKey: string) => {
    const amountMinor = parseFloat(amount);

    try {
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
      retryCountRef.current = 0; // Reset for next submission
      isSubmittingRef.current = false;
    } catch (err: any) {
      const errorDetails = extractErrorDetails(err);
      const isConcurrentError = errorDetails.code === 'CONCURRENT_MODIFICATION';

      // Retry logic for concurrent modification
      if (isConcurrentError && retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCountRef.current];
        console.log(`Concurrent modification detected. Retrying in ${delay}ms (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})...`);
        
        if (retryCountRef.current === 0) {
          setError(t('settlements.retryingAuto'));
        }
        
        retryCountRef.current += 1;
        
        // Wait and retry with same idempotency key
        setTimeout(() => {
          submitSettlement(idempotencyKey);
        }, delay);
        return;
      }

      // Max retries reached or non-retryable error
      retryCountRef.current = 0;
      isSubmittingRef.current = false;
      
      if (isConcurrentError) {
        setError(t('settlements.concurrentError'));
      } else {
        const errorMessage = extractErrorMessage(err, t('settlements.recordFailed'));
        setError(errorMessage);
      }
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    
    setError(null);
    retryCountRef.current = 0;
    isSubmittingRef.current = true;

    const amountMinor = parseFloat(amount);

    if (amountMinor <= 0) {
      setError(t('settlements.amountTooLow'));
      isSubmittingRef.current = false;
      return;
    }

    if (amountMinor > remainingAmount) {
      setError(
        t('settlements.amountTooHigh', {
          remaining: Math.round(remainingAmount).toLocaleString('en-US'),
        })
      );
      isSubmittingRef.current = false;
      return;
    }

    setSubmitting(true);
    const idempotencyKey = generateIdempotencyKey();
    await submitSettlement(idempotencyKey);
  };

  const handleQuickAmount = (percentage: number) => {
    const quickAmount = (remainingAmount * percentage) / 100;
    setAmount(String(Math.round(quickAmount)));
  };

  return (
    <div className="record-settlement bg-white rounded-lg shadow-lg p-6 max-[767px]:p-4">
      <h3 className="text-xl font-bold mb-4">{t('settlements.recordTitle')}</h3>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-red-700">
          <p className="font-semibold">{t('settlements.errorLabel')}</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        <p className="font-semibold">{t('settlements.remainingBalance')}</p>
        <p className="text-2xl font-bold mt-1">
          {Math.round(remainingAmount).toLocaleString('en-US')} ETB
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Amount */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('settlements.paymentAmount')} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500 text-lg">ETB</span>
            <input
              type="number"
              step="1"
              min="1"
              max={Math.round(remainingAmount)}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
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
              {t('settlements.full')}
            </button>
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('settlements.paymentMethod')} <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 max-[419px]:grid-cols-1 gap-2">
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
              💵 {t('cashier.method.cash')}
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
              💳 {t('cashier.method.card')}
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
              📱 {t('cashier.method.mobile')}
            </button>
          </div>
        </div>

        {/* Reference */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('settlements.transactionRef')}
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('settlements.refPlaceholder')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={submitting}
            maxLength={100}
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('settlements.refHint')}
          </p>
        </div>

        {/* Note */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {t('settlements.noteOptional')}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('settlements.notePlaceholder2')}
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
            {t('buttons.cancel')}
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                {t('settlements.recording')}
              </span>
            ) : (
              t('settlements.recordPayment')
            )}
          </button>
        </div>
      </form>

      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p>
          ℹ️ {t('settlements.recordHint')}
        </p>
      </div>
    </div>
  );
};
