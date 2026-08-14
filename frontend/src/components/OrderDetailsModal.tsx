/**
 * Order Details Modal
 * 
 * Comprehensive view of order including items, status, and settlement history.
 * Allows cashiers to record payments and view complete payment history.
 */

import React, { useState } from 'react';
import { SettlementHistory } from './SettlementHistory';
import { RecordSettlement } from './RecordSettlement';

interface OrderItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

interface Order {
  id: string;
  clientOrderId: string;
  tableNumber: string;
  totalAmount: number;
  status: string;
  settlementStatus: string;
  items: OrderItem[];
  waiter?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

interface OrderDetailsModalProps {
  order: Order;
  onClose: () => void;
  onUpdate?: () => void;
  allowRecordPayment?: boolean;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  order,
  onClose,
  onUpdate,
  allowRecordPayment = false,
}) => {
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'settlements'>('details');

  const formatAmount = (amountMinor: number) => {
    return `$${(amountMinor / 100).toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      SUBMITTED: { bg: 'bg-blue-100', text: 'text-blue-800', label: '📝 Submitted' },
      IN_KITCHEN: { bg: 'bg-orange-100', text: 'text-orange-800', label: '🍳 In Kitchen' },
      SERVED: { bg: 'bg-purple-100', text: 'text-purple-800', label: '🍽️ Served' },
      PAID: { bg: 'bg-green-100', text: 'text-green-800', label: '✓ Paid' },
      CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: '✗ Cancelled' },
    };

    const badge = badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getSettlementStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      UNSETTLED: { bg: 'bg-red-100', text: 'text-red-800', label: '✗ Unsettled' },
      PARTIALLY_SETTLED: {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        label: '⚠ Partial',
      },
      SETTLED: { bg: 'bg-green-100', text: 'text-green-800', label: '✓ Settled' },
    };

    const badge = badges[status] || { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const handleSettlementSuccess = () => {
    setShowRecordPayment(false);
    if (onUpdate) {
      onUpdate();
    }
  };

  const canRecordPayment =
    allowRecordPayment &&
    order.status !== 'CANCELLED' &&
    order.settlementStatus !== 'SETTLED';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Order Details</h2>
            <p className="text-sm text-gray-600 mt-1">
              Order #{order.clientOrderId} • Table {order.tableNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-3 font-semibold transition ${
              activeTab === 'details'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Order Details
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-3 font-semibold transition ${
              activeTab === 'settlements'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Settlement History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Status Section */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Order Status</p>
                    {getStatusBadge(order.status)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Payment Status</p>
                    {getSettlementStatusBadge(order.settlementStatus)}
                  </div>
                </div>
              </div>

              {/* Order Info */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Order Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Waiter</p>
                    <p className="font-semibold">{order.waiter?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Created At</p>
                    <p className="font-semibold">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Order Items</h3>
                <div className="space-y-2">
                  {order.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-start p-3 bg-gray-50 rounded border border-gray-200"
                    >
                      <div className="flex-1">
                        <p className="font-semibold">{item.name}</p>
                        {item.notes && (
                          <p className="text-sm text-gray-600 mt-1">Note: {item.notes}</p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm text-gray-600">
                          {item.quantity} × {formatAmount(item.unitPrice)}
                        </p>
                        <p className="font-semibold">
                          {formatAmount(item.unitPrice * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mt-4 pt-4 border-t-2 border-gray-300 flex justify-between items-center">
                  <p className="text-xl font-bold">Total</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatAmount(order.totalAmount)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settlements' && (
            <div>
              {showRecordPayment ? (
                <RecordSettlement
                  orderId={order.id}
                  remainingAmount={order.totalAmount} // Will be fetched fresh by component
                  onSuccess={handleSettlementSuccess}
                  onCancel={() => setShowRecordPayment(false)}
                />
              ) : (
                <>
                  {canRecordPayment && (
                    <div className="mb-4">
                      <button
                        onClick={() => setShowRecordPayment(true)}
                        className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition"
                      >
                        💰 Record Payment
                      </button>
                    </div>
                  )}
                  <SettlementHistory
                    orderId={order.id}
                    orderTotal={order.totalAmount}
                    onSettlementAdded={onUpdate}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
