import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SettingsRowProps {
  /** Big left-side icon badge. Optional — render the row without a badge if omitted. */
  icon?: LucideIcon;
  /** Tailwind color class applied to the icon (e.g. "text-primary"). Defaults to text-primary. */
  iconClassName?: string;
  /** Tailwind bg class for the icon badge (e.g. "bg-primary/10"). Defaults to bg-primary/10. */
  iconBgClassName?: string;
  /** Row title. */
  title: React.ReactNode;
  /** Supporting copy under the title. */
  description?: React.ReactNode;
  /** Optional line of accent text (e.g. a small chip or hint). Rendered below the description. */
  meta?: React.ReactNode;
  /** Right-side control (Switch, button group, etc.). */
  control?: React.ReactNode;
  /** Subtle muted state — control becomes non-interactive visually. */
  disabled?: boolean;
  /** Optional extra class names for the root. */
  className?: string;
  /** Adds a divider above the row, except for the first row. Pair with `dense` for tight lists. */
  divider?: boolean;
  /** Reduces vertical padding for compact lists. */
  dense?: boolean;
}

/**
 * A single labeled row used across the System Settings page.
 *
 * Layout:
 *   [icon badge]  Title                        [control]
 *                 Description
 *                 meta (optional)
 */
export const SettingsRow = React.forwardRef<HTMLDivElement, SettingsRowProps>(
  (
    {
      icon: Icon,
      iconClassName = 'text-primary',
      iconBgClassName = 'bg-primary/10',
      title,
      description,
      meta,
      control,
      disabled = false,
      className,
      divider = false,
      dense = false,
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        'flex items-start justify-between gap-4 sm:gap-5',
        dense ? 'py-3' : 'py-4',
        divider && 'border-t border-border/60 first:border-t-0',
        disabled && 'opacity-70',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        {Icon && (
          <span
            aria-hidden
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
              iconBgClassName,
            )}
          >
            <Icon className={cn('h-5 w-5', iconClassName)} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-semibold leading-snug text-foreground">{title}</div>
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
          {meta && <div className="pt-1.5 text-xs">{meta}</div>}
        </div>
      </div>
      {control && <div className="shrink-0 pt-1.5">{control}</div>}
    </div>
  ),
);
SettingsRow.displayName = 'SettingsRow';
