import * as React from 'react';
import { cn } from '../../lib/utils';

interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}

const SIDE_POSITION: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Lightweight hover tooltip. Wraps the trigger and reveals a styled bubble on
 * hover. Purely presentational — use only where an icon needs context.
 */
export const Tooltip: React.FC<TooltipProps> = ({ label, side = 'top', children, className }) => {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg',
          'opacity-0 transition-opacity duration-150 group-hover/tt:opacity-100',
          SIDE_POSITION[side]
        )}
      >
        {label}
      </span>
    </span>
  );
};
