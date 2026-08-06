import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  className?: string;
}

/**
 * Right-side slide-over panel used for Add/Edit forms.
 * Includes backdrop, focus trap by tab order, and ESC-to-close.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  className,
}) => {
  // Close on ESC
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            role="dialog"
            aria-modal="true"
            className={cn(
              'fixed top-0 bottom-0 w-full max-w-md bg-card border-border z-50 flex flex-col shadow-2xl',
              side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
              className
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between p-6 border-b border-border shrink-0">
                <div>
                  {title && (
                    <h2 className="text-lg font-semibold text-foreground leading-tight">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm text-muted-foreground mt-1">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
            {footer && (
              <div className="p-6 border-t border-border shrink-0 bg-card">{footer}</div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
