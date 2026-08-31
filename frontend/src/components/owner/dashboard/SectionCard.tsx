import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SectionCardProps {
  title: string;
  /** Optional short subtitle rendered under the title in the header. */
  description?: string;
  /** Optional dropdown filter rendered in the top-right */
  filter?: { label: string; options?: string[]; value?: string; onChange?: (v: string) => void };
  /** Render a custom right-hand control (overrides `filter`) */
  rightAccessory?: React.ReactNode;
  /** Where the filter dropdown sits: next to the title (left) or far right. Default is 'right'. */
  filterAlign?: 'left' | 'right';
  className?: string;
  /** Removes default padding from the content area */
  flush?: boolean;
  children: React.ReactNode;
}

/**
 * A floating card with a header strip (title + optional description + optional
 * dropdown) and a content area. Used as the container for every section in
 * the owner dashboard so the visual rhythm stays consistent.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  description,
  filter,
  rightAccessory,
  filterAlign = 'right',
  className,
  flush = false,
  children,
}) => {
  const filterEl = filter ? <FilterDropdown {...filter} /> : null;
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/40 bg-card text-card-foreground',
        'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-18px_rgba(15,23,42,0.18)]',
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[15px] font-semibold text-foreground sm:text-base">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {filterAlign === 'left' ? filterEl : null}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {filterAlign === 'right' ? filterEl : null}
          {rightAccessory}
        </div>
      </header>

      <div className={cn(flush ? '' : 'px-5 py-5 sm:px-6')}>{children}</div>
    </section>
  );
};

export const FilterDropdown: React.FC<{
  label: string;
  options?: string[];
  value?: string;
  onChange?: (v: string) => void;
}> = ({ label, options, value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const displayLabel = value ?? label;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-muted-foreground transition-all',
          'hover:border-primary/40 hover:text-foreground',
          open && 'border-primary/50 text-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]',
        )}
      >
        {displayLabel}
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && options && options.length > 0 && (
        <div className="absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onChange?.(opt);
                setOpen(false);
              }}
              className={cn(
                'block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
                displayLabel === opt
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground hover:bg-secondary',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
