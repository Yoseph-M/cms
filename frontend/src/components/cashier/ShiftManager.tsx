import { extractErrorMessage } from "../../utils/errorHandler";
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftApi } from '../../api/phase9Api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { useToastStore } from '../../store/toastStore';
import { useSettingsStore } from '../../store/settingsStore';
import { motion } from 'framer-motion';
import { LogOut, PlayCircle, StopCircle, DollarSign, Wallet } from 'lucide-react';

interface ShiftManagerProps {
  children: React.ReactNode;
}

export const ShiftManager: React.FC<ShiftManagerProps> = ({ children }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [openingCash, setOpeningCash] = useState<string>('');
  const [closingCash, setClosingCash] = useState<string>('');
  const [closingCard, setClosingCard] = useState<string>('');
  const [closingMobile, setClosingMobile] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState(false);

  const { data: currentShift, isLoading, error, refetch } = useQuery({
    queryKey: ['currentShift'],
    queryFn: () => shiftApi.getCurrentShift(),
  });

  const { settings } = useSettingsStore();
  const shiftEnabled = settings['shiftManagementEnabled'] !== 'false';

  const openShiftMutation = useMutation({
    mutationFn: (amountMinor: number) => shiftApi.openShift({ openingCashMinor: amountMinor }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentShift'] });
      addToast({ title: 'Shift opened successfully', type: 'success' });
      setOpeningCash('');
    },
    onError: (err: any) => {
      addToast({ title: err.response?.data?.error?.message || 'Failed to open shift', type: 'error' });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: (data: { declaredCashMinor: number; declaredCardMinor?: number; declaredMobileMinor?: number; notes: string }) => 
      shiftApi.closeShift(currentShift?.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentShift'] });
      addToast({ title: 'Shift closed successfully. Pending variance review.', type: 'success' });
      setIsClosing(false);
      setClosingCash('');
      setClosingCard('');
      setClosingMobile('');
      setClosingNotes('');
    },
    onError: (err: any) => {
      addToast({ title: err.response?.data?.error?.message || 'Failed to close shift', type: 'error' });
    },
  });

  if (!shiftEnabled) return <>{children}</>;

  if (isLoading) return <LoadingState message="Checking shift status..." />;
  if (error) return <ErrorState message="Failed to load shift status" onRetry={refetch} />;

  // 1. If we have an active shift, render the main dashboard + a "Close Shift" button
  if (currentShift && currentShift.status === 'OPEN') {
    if (isClosing) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
          <Card className="max-w-md w-full p-6 shadow-xl border-t-4 border-t-amber-500">
            <div className="flex justify-center mb-6 text-amber-500">
              <StopCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">Close Register</h2>
            <p className="text-slate-500 text-center mb-6">
              Enter the exact amount of cash in your drawer.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-green-600">Declared Cash Amount</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-green-600 font-bold">$</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7 text-lg h-12 border-green-200"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-blue-600">Declared Card Amount</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-blue-600 font-bold">$</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7 text-lg h-12 border-blue-200"
                    value={closingCard}
                    onChange={(e) => setClosingCard(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-purple-600">Declared Mobile Amount</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-purple-600 font-bold">$</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7 text-lg h-12 border-purple-200"
                    value={closingMobile}
                    onChange={(e) => setClosingMobile(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Closing Notes (Optional)</label>
                <textarea
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm min-h-[80px]"
                  placeholder="Any explanations for revenue variances..."
                  value={closingNotes}
                  onChange={(e: any) => setClosingNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => setIsClosing(false)}
                  disabled={closeShiftMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  variant="default" 
                  className="w-full"
                  onClick={() => {
                    const cashMinor = Math.round(parseFloat(closingCash || '0') * 100);
                    const cardMinor = Math.round(parseFloat(closingCard || '0') * 100);
                    const mobileMinor = Math.round(parseFloat(closingMobile || '0') * 100);
                    closeShiftMutation.mutate({ 
                      declaredCashMinor: cashMinor, 
                      declaredCardMinor: cardMinor,
                      declaredMobileMinor: mobileMinor,
                      notes: closingNotes 
                    });
                  }}
                  disabled={closeShiftMutation.isPending || !closingCash}
                >
                  {closeShiftMutation.isPending ? 'Closing...' : 'Close Shift'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="relative h-full min-h-0">
        {/* Render CashierDashboard inside */}
        {children}
      </div>
    );
  }

  // 2. If no shift is active (or it's pending review), show open shift screen
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="p-8 shadow-2xl border-t-4 border-t-primary">
          <div className="flex justify-center mb-6 text-primary">
            <PlayCircle size={64} />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2 text-slate-800 dark:text-white">Start Shift</h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8">
            Please enter your opening cash balance to start serving customers.
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                Opening Cash Drawer Amount
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <span className="text-slate-500 text-xl font-medium">$</span>
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-9 text-2xl h-14 font-semibold tracking-wide"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <Button 
              size="lg"
              className="w-full h-14 text-lg font-bold shadow-brand"
              onClick={() => {
                const amountMinor = Math.round(parseFloat(openingCash || '0') * 100);
                openShiftMutation.mutate(amountMinor);
              }}
              disabled={openShiftMutation.isPending || !openingCash}
            >
              {openShiftMutation.isPending ? 'Starting...' : 'Start Shift'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
};
