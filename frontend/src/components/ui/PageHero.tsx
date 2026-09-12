import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PageHeroProps {
  /** Main icon rendered inside the gradient tile. */
  icon: LucideIcon;
  /** Page title. */
  title: React.ReactNode;
  /** One-line supporting copy under the title. */
  description?: React.ReactNode;
  /** Optional chips rendered next to the title (e.g. sync state). */
  badges?: React.ReactNode;
  /** Right-side actions (buttons). */
  actions?: React.ReactNode;
  /** Tailwind gradient classes for the icon tile. Defaults to the brand gradient. */
  tileClassName?: string;
  /** Hide the dotted grid pattern (defaults to shown). */
  noGrid?: boolean;
  className?: string;
}

/**
 * Shared "hero" header used by the Profile and Settings pages.
 *
 * Renders a floating card with an ambient brand-blue glow, a subtle dotted
 * grid, a gradient icon tile and title/description/actions slots — the same
 * visual language as the login screen, so every page feels on-brand.
 */
export const PageHero = React.forwardRef<HTMLElement, PageHeroProps>(
  (
    {
      icon: Icon,
      title,
      description,
      badges,
      actions,
      tileClassName,
      noGrid = false,
      className,
    },
    ref,
  ) => (
    <header
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-card px-6 py-7',
        'shadow-sm',
        'sm:px-8 sm:py-8',
        className,
      )}
    >
      {/* Dotted grid */}
      {!noGrid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:radial-gradient(hsl(var(--primary)/0.5)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_60%_80%_at_85%_20%,black,transparent_70%)]"
        />
      )}

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground',
              'shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/10',
              tileClassName,
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {badges}
            </div>
            {description && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 sm:self-start">{actions}</div>}
      </div>
    </header>
  ),
);
PageHero.displayName = 'PageHero';

/** Small pill badge used inside PageHero (e.g. "Synced", role chips). */
export const HeroBadge: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
      'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20',
      className,
    )}
  >
    {children}
  </span>
);
