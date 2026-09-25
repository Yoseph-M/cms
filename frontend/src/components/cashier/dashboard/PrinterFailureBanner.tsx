import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PrinterFailureEvent {
  station: string;
  /** Human-readable device label (Bluetooth MAC or USB vendor:product). */
  device?: string;
  ip?: string;
  port?: number;
  orderId?: string;
  failedAt: string;
}

export interface PrinterFailureBannerProps {
  failures: PrinterFailureEvent[];
  onDismiss: () => void;
}

export const PrinterFailureBanner: React.FC<PrinterFailureBannerProps> = ({ failures, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {failures.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-gradient-to-r from-rose-500 to-amber-500 text-white px-5 sm:px-6 py-2.5 flex items-center gap-3 z-10 overflow-hidden"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="font-semibold text-sm truncate">
            {t('cashier.printerFailure.detected', { count: failures.length })}
          </p>
          <span className="hidden sm:inline text-xs opacity-90">
            {failures[0].station}
            {failures[0].device || failures[0].ip
              ? ` @ ${failures[0].device || failures[0].ip}${failures[0].port ? `:${failures[0].port}` : ''}`
              : ''}
            {failures.length > 1 ? t('cashier.printerFailure.more', { count: failures.length - 1 }) : ''}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto p-1.5 rounded-md text-white/90 hover:bg-white/20 transition-colors"
            aria-label={t('buttons.dismiss')}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
