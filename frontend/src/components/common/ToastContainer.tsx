import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../store/toastStore';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const VARIANT_STYLES: Record<
  string,
  { icon: React.ReactNode; accent: string; ring: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5" />,
    accent: 'text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/40',
    ring: 'before:bg-[hsl(var(--success))]',
  },
  error: {
    icon: <AlertCircle className="w-5 h-5" />,
    accent: 'text-destructive bg-destructive/10 border-destructive/40',
    ring: 'before:bg-destructive',
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    accent: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/40',
    ring: 'before:bg-[hsl(var(--warning))]',
  },
  info: {
    icon: <Info className="w-5 h-5" />,
    accent: 'text-primary bg-primary/10 border-primary/40',
    ring: 'before:bg-primary',
  },
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const variant = VARIANT_STYLES[toast.type] ?? VARIANT_STYLES.info;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto relative overflow-hidden flex items-start gap-3 p-4 pr-10 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-xl"
            >
              {/* Accent bar on the left */}
              <span
                className={`absolute left-0 inset-y-0 w-0.5 ${variant.ring} before:absolute before:inset-0`}
                aria-hidden
              />
              <div
                className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${variant.accent}`}
              >
                {variant.icon}
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold text-foreground leading-tight">
                  {toast.title}
                </p>
                {toast.message != null && (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {typeof toast.message === 'string'
                      ? toast.message
                      : typeof (toast.message as any)?.message === 'string'
                        ? (toast.message as any).message
                        : JSON.stringify(toast.message)}
                  </p>
                )}
                {toast.undo && (
                  <button
                    onClick={() => {
                      toast.undo!.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline underline-offset-2"
                  >
                    <span>↩</span>
                    {toast.undo.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss"
                className="absolute top-2.5 right-2.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
