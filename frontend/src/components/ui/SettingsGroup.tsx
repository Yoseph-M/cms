import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SettingsGroupProps {
  /** Optional anchor id, used by the page TOC rail to deep-link. */
  id?: string;
  /** Group icon — rendered in a colored badge to the left of the title. */
  icon?: LucideIcon;
  /** Tailwind class for the icon color. Defaults to text-primary. */
  iconClassName?: string;
  /** Tailwind class for the icon badge background. Defaults to bg-primary/10. */
  iconBgClassName?: string;
  /** Required group title. */
  title: React.ReactNode;
  /** Optional short description rendered under the title. */
  description?: React.ReactNode;
  /** Optional badge text rendered next to the title (e.g. "2 enabled"). */
  badge?: React.ReactNode;
  /** Optional right-aligned element in the header row (e.g. a button). */
  action?: React.ReactNode;
  /** Card body. */
  children: React.ReactNode;
  /** Disable hover lift — useful for the outer group cards that are visually static. */
  flat?: boolean;
  className?: string;
}

/**
 * A floating card that groups related settings under a labeled header.
 * Renders a prominent icon badge, title, optional description, and an
 * optional badge / action slot. Used as the building block of the
 * System Settings page.
 */
export const SettingsGroup = React.forwardRef<HTMLElement, SettingsGroupProps>(
  (
    {
      id,
      icon: Icon,
      iconClassName = 'text-primary',
      iconBgClassName = 'bg-primary/10',
      title,
      description,
      badge,
      action,
      children,
      flat = true,
      className,
    },
    ref,
  ) => (
    <section
      ref={ref}
      id={id}
      className={cn(
        'scroll-mt-24 rounded-2xl border border-border/50 bg-card text-card-foreground',
        flat
          ? 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-18px_rgba(15,23,42,0.18)]'
          : 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)] transition-all duration-200 hover:-translate-y-0.5',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border/50 px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {Icon && (
            <span
              aria-hidden
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
                iconBgClassName,
              )}
            >
              <Icon className={cn('h-5 w-5', iconClassName)} strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                {title}
              </h2>
              {badge}
            </div>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-5 py-2 sm:px-6">{children}</div>
    </section>
  ),
);
SettingsGroup.displayName = 'SettingsGroup';
