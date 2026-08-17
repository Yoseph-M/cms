import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared "floating card" / island look. Drop this on any container that
 * should read as a self-contained island in the page (e.g. a profile stat
 * card, a custom settings panel, a tab content area).
 *
 * The same shadow recipe is also baked into <Card />, <SectionCard /> and
 * <KpiCard /> so the whole owner area looks consistent.
 */
export const FloatingCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl bg-white border border-border/40 text-card-foreground',
        'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)]',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_40px_-14px_rgba(15,23,42,0.16),0_6px_16px_-10px_rgba(249,115,22,0.16)]',
        className,
      )}
      {...props}
    />
  ),
);
FloatingCard.displayName = 'FloatingCard';

export const floatingCardClassName = cn(
  'rounded-2xl bg-white border border-border/40',
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)]',
  'transition-all duration-200',
  'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_40px_-14px_rgba(15,23,42,0.16),0_6px_16px_-10px_rgba(249,115,22,0.16)]',
);
