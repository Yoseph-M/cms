import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'destructive' | 'default';
  /** Optional busy state while async onConfirm runs. */
  loading?: boolean;
}

const ICONS = {
  destructive: <Trash2 className="w-6 h-6" />,
  default: <Info className="w-6 h-6" />,
};

const TONE_CLASSES = {
  destructive: {
    ring: 'border-destructive/30 bg-destructive/10 text-destructive',
    button: 'destructive' as const,
  },
  default: {
    ring: 'border-primary/30 bg-primary/10 text-primary',
    button: 'default' as const,
  },
};

export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  tone = 'default',
  loading = false,
}) => {
  // Close on ESC
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, loading]);

  const palette = TONE_CLASSES[tone];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={() => !loading && onClose()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full pointer-events-auto"
            role="alertdialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border shrink-0',
                  palette.ring
                )}
              >
                {ICONS[tone]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                {description && (
                  <div className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {description}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                {cancelText}
              </Button>
              <Button
                variant={palette.button}
                onClick={onConfirm}
                disabled={loading}
              >
                {loading ? 'Working…' : confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
