import React from 'react';
import { Card, Title, Text } from '@tremor/react';
import { cn } from '../../../lib/utils';
import { FilterBar, type FilterOption } from '../../ui/FilterBar';

export interface SectionCardProps {
  title: string;
  description?: string;
  filter?: {
    label: string;
    options?: (string | FilterOption)[];
    value?: string;
    onChange?: (v: string) => void;
    /** Trigger width — `w-auto` keeps a paired filter compact instead of
     *  stretching across the header. */
    className?: string;
  };
  /** Extra control shown in the SAME bar as `filter` — e.g. a metric switch
   *  beside a depth selector, so the header carries one filter bar, not two. */
  toolbar?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  filterAlign?: 'left' | 'right';
  className?: string;
  flush?: boolean;
  children: React.ReactNode;
}

/** Dashboard section container built on Tremor Card. */
export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  description,
  filter,
  toolbar,
  rightAccessory,
  filterAlign = 'right',
  className,
  flush = false,
  children,
}) => {
  const filterEl = filter ? (
    <FilterBar
      options={(filter.options ?? []).map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      )}
      value={filter.value ?? filter.label}
      onChange={(v) => filter.onChange?.(v)}
      className={filter.className}
    />
  ) : null;

  // The metric switch and the depth selector are one bar: they are rendered
  // inside a single wrapping group so a narrow card (best sellers sits in a
  // one-third column) drops them onto a second line instead of pushing a
  // control past the card edge, where `overflow-hidden` would hide it.
  const rightFilterEl = filterAlign === 'right' ? filterEl : null;
  const rightControlsEl =
    toolbar || rightFilterEl || rightAccessory ? (
      // One bar: the metric switch and the depth selector never split across
      // lines — the whole bar moves together if the card gets too narrow.
      <div className="flex min-w-0 items-center justify-end gap-2">
        {toolbar}
        {rightFilterEl}
        {rightAccessory}
      </div>
    ) : null;

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl ring-1 ring-border/40 bg-card p-0 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0">
            <Title className="truncate font-display text-[15px] font-semibold text-foreground sm:text-base">
              {title}
            </Title>
            {description && (
              <Text className="mt-0.5 truncate text-xs text-muted-foreground">{description}</Text>
            )}
          </div>
          {filterAlign === 'left' ? filterEl : null}
        </div>
        {rightControlsEl}
      </div>

      <div className={cn(flush ? '' : 'px-5 py-5 sm:px-6')}>{children}</div>
    </Card>
  );
};
