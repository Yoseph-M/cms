import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useToastStore } from '../../store/toastStore';
import { useSocketStore } from '../../store/socketStore';

interface CancellationRequest {
  id: string;
  orderId: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: {
    id: string;
    name: string;
    role: string;
  };
  approvedBy?: {
    id: string;
    name: string;
  };
  rejectedReason?: string;
  createdAt: string;
  approvedAt?: string;
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
    items: Array<{
      name: string;
      unitPrice: number;
      quantity: number;
    }>;
  };
}

export const CancellationReview: React.FC = () => {
  const { t } = useTranslation('manager');
  const { addToast } = useToastStore();
  const { socket } = useSocketStore();
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CancellationRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch pending cancellation requests
  const fetchRequests = async () => {
    try {
      const res = await axiosClient.get('/cancellation-requests?status=PENDING');
      setRequests(res.data.data || res.data);
    } catch (err) {
      console.error('Failed to fetch cancellation requests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.on('cancellation:requested', () => {
      fetchRequests();
      addToast({ type: 'info', title: 'New cancellation request', message: 'A staff member is requesting to cancel an order. Please review it now.' });
    });

    socket.on('cancellation:approved', (payload: { request: { id: string } }) => {
      setRequests((prev) => prev.filter((r) => r.id !== payload.request.id));
      addToast({ type: 'success', title: 'Order cancelled successfully', message: 'The cancellation has been approved and the order is now cancelled.' });
    });

    socket.on('cancellation:rejected', (payload: { request: { id: string } }) => {
      setRequests((prev) => prev.filter((r) => r.id !== payload.request.id));
    });

    socket.on('order:cancelled', () => {
      fetchRequests();
    });

    return () => {
      socket.off('cancellation:requested');
      socket.off('cancellation:approved');
      socket.off('cancellation:rejected');
      socket.off('order:cancelled');
    };
  }, [socket, addToast]);

  // Approve cancellation
  const handleApprove = async (requestId: string) => {
    setIsProcessing(true);
    try {
      await axiosClient.patch(`/cancellation-requests/${requestId}/approve`);
      addToast({ type: 'success', title: 'Order cancelled', message: 'The cancellation has been approved. The order is now cancelled.' });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSelectedRequest(null);
    } catch (err: unknown) {
      addToast({ type: 'error', title: 'Unable to approve cancellation', message: extractErrorMessage(err, 'Something went wrong. Please try again.') });
    } finally {
      setIsProcessing(false);
    }
  };

  // Open reject modal
  const handleRejectClick = (request: CancellationRequest) => {
    setSelectedRequest(request);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // Confirm rejection
  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim()) return;
    
    setIsProcessing(true);
    try {
      await axiosClient.patch(`/cancellation-requests/${selectedRequest.id}/reject`, {
        rejectedReason: rejectReason,
      });
      addToast({ type: 'success', title: 'Cancellation request rejected', message: 'You have declined this cancellation. The order remains active.' });
      setRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id));
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectReason('');
    } catch (err: unknown) {
      addToast({ type: 'error', title: 'Unable to reject cancellation', message: extractErrorMessage(err, 'Something went wrong. Please try again.') });
    } finally {
      setIsProcessing(false);
    }
  };

  // Format currency
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ETB' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between max-[767px]:flex-col max-[767px]:items-start max-[767px]:gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('cancellations.title')}</h1>
          <p className="text-muted-foreground">{t('cancellations.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('cancellations.pendingCount', { count: requests.length })}
          </span>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground">{t('cancellations.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="bg-card border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedRequest(request)}
            >
              <div className="flex items-start justify-between max-[767px]:flex-col max-[767px]:gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {t('cancellations.orderNumber', { id: request.order.clientOrderId })}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {t('cancellations.table')} {request.order.tableNumber}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('cancellations.requestedBy', {
                      name: request.requestedBy.name,
                      role: request.requestedBy.role,
                    })}{' '}
                    • {formatDate(request.createdAt)}
                  </p>
                  <p className="text-sm font-medium text-warning">{request.reason}</p>
                </div>
                <div className="text-right max-[767px]:flex max-[767px]:items-center max-[767px]:justify-between max-[767px]:gap-3">
                  <p className="text-lg font-bold">{formatAmount(request.order.totalAmount)}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning">
                    {t('cancellations.pending')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRequest && !showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card rounded-lg border max-w-lg w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6 max-[767px]:p-4 border-b">
              <h2 className="text-xl font-bold">{t('cancellations.detailTitle')}</h2>
              <p className="text-muted-foreground">
                {t('cancellations.orderNumber', { id: selectedRequest.order.clientOrderId })}
              </p>
            </div>
            
            <div className="p-6 max-[767px]:p-4 space-y-4">
              {/* Order Details */}
              <div>
                <h3 className="font-semibold mb-2">{t('cancellations.orderDetails')}</h3>
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cancellations.table')}</span>
                    <span>{selectedRequest.order.tableNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cancellations.total')}</span>
                    <span className="font-semibold">{formatAmount(selectedRequest.order.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="font-semibold mb-2">{t('cancellations.items')}</h3>
                <div className="bg-secondary/50 rounded-lg p-3">
                  {selectedRequest.order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatAmount(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Request Info */}
              <div>
                <h3 className="font-semibold mb-2">{t('cancellations.requestInfo')}</h3>
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cancellations.requestedByLabel')}</span>
                    <span>{selectedRequest.requestedBy.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cancellations.role')}</span>
                    <span>{selectedRequest.requestedBy.role}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cancellations.time')}</span>
                    <span>{formatDate(selectedRequest.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div>
                <h3 className="font-semibold mb-2">{t('cancellations.reason')}</h3>
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-warning">{selectedRequest.reason}</p>
                </div>
              </div>
            </div>

            <div className="p-6 max-[767px]:p-4 border-t flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-secondary transition-colors"
              >
                {t('cancellations.close')}
              </button>
              <button
                onClick={() => handleRejectClick(selectedRequest)}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                disabled={isProcessing}
              >
                {t('cancellations.reject')}
              </button>
              <button
                onClick={() => handleApprove(selectedRequest.id)}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                disabled={isProcessing}
              >
                {isProcessing ? t('cancellations.processing') : t('cancellations.approve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card rounded-lg border max-w-md w-full">
            <div className="p-6 max-[767px]:p-4 border-b">
              <h2 className="text-xl font-bold text-destructive">{t('cancellations.rejectTitle')}</h2>
              <p className="text-muted-foreground">
                {t('cancellations.orderNumber', { id: selectedRequest.order.clientOrderId })}
              </p>
            </div>
            
            <div className="p-6 max-[767px]:p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('cancellations.rejectionReason')} <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t('cancellations.rejectPlaceholder')}
                  className="w-full h-24 px-3 py-2 rounded-lg border bg-secondary/50 focus:bg-background focus:border-primary outline-none resize-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-6 max-[767px]:p-4 border-t flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedRequest(null);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-secondary transition-colors"
                disabled={isProcessing}
              >
                {t('cancellations.cancel')}
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                disabled={!rejectReason.trim() || isProcessing}
              >
                {isProcessing ? t('cancellations.processing') : t('cancellations.confirmRejection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CancellationReview;
