import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

const V_POSITION: Record<'top' | 'bottom', string> = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
};

const H_ALIGN: Record<NonNullable<TooltipProps['align']>, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

const LR_POSITION: Record<'left' | 'right', string> = {
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Smooth hover tooltip. Renders through a portal so it is never clipped by an
 * ancestor scroll container, and repositions itself while open. Uses
 * framer-motion for a subtle spring pop-in. Purely presentational.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  label,
  side = 'top',
  align = 'center',
  children,
  className,
  delay = 120,
}) => {
  const [open, setOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const hoverTimeout = React.useRef<number | null>(null);

  const positionClass =
    side === 'top' || side === 'bottom'
      ? `${V_POSITION[side]} ${H_ALIGN[align]}`
      : LR_POSITION[side];

  const scheduleOpen = () => {
    if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current);
    hoverTimeout.current = window.setTimeout(() => setOpen(true), delay);
  };

  const cancel = () => {
    if (hoverTimeout.current) {
      window.clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setOpen(false);
  };

  const reposition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  React.useEffect(() => {
    return () => {
      if (hoverTimeout.current) window.clearTimeout(hoverTimeout.current);
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('relative inline-flex', className)}
        onMouseEnter={scheduleOpen}
        onMouseLeave={cancel}
        onFocus={scheduleOpen}
        onBlur={cancel}
      >
        {children}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && anchor && (
            <span
              role="tooltip"
              className="pointer-events-none fixed left-0 top-0 z-[100]"
              style={{ top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height }}
            >
              <span className={cn('absolute', positionClass)}>
                <motion.span
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="block whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
                >
                  {label}
                </motion.span>
              </span>
            </span>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
