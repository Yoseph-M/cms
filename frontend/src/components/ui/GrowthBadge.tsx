import React from 'react';
import {
  RiArrowDownLine,
  RiArrowRightLine,
  RiArrowUpLine,
} from '@remixicon/react';
import { cn } from '../../lib/utils';

export interface GrowthBadgeProps {
  /** Percentage change, e.g. 9.3 for +9.3%. Null/undefined renders nothing. */
  value: number | null | undefined;
  className?: string;
}

/**
 * Compact growth pill: green with an up arrow when growth is positive, red
 * with a down arrow when negative, and neutral grey with a right arrow when
 * the change rounds to zero.
 */
export const GrowthBadge: React.FC<GrowthBadgeProps> = ({ value, className }) => {
  if (value == null || !Number.isFinite(value)) return null;

  // Anything that rounds to 0.0% is reported as flat rather than a red/green move.
  const rounded = Number(value.toFixed(1));
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';

  const Icon =
    direction === 'up' ? RiArrowUpLine : direction === 'down' ? RiArrowDownLine : RiArrowRightLine;

  const tone =
    direction === 'up'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-500'
      : direction === 'down'
        ? 'bg-red-100 text-red-800 dark:bg-red-400/20 dark:text-red-500'
        : 'bg-gray-200/50 text-gray-700 dark:bg-gray-500/30 dark:text-gray-300';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-x-1 rounded-tremor-small px-1.5 py-1 text-[11px] font-semibold leading-none tabular-nums',
        tone,
        className,
      )}
    >
      <Icon className="-ml-0.5 size-3.5" aria-hidden={true} />
      {Math.abs(rounded).toFixed(1)}%
    </span>
  );
};
