import React from 'react';
import { Card, Title, Text } from '@tremor/react';
import { cn } from '../../../lib/utils';
import { FilterBar, type FilterOption } from '../../ui/FilterBar';

export interface SectionCardProps {
  title: string;
  description?: string;
  filter?: { label: string; options?: (string | FilterOption)[]; value?: string; onChange?: (v: string) => void };
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
    />
  ) : null;

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl ring-1 ring-border/40 bg-card p-0 shadow-sm',
        className,
      )}
    >
      <div
        className="flex flex-row items-center justify-between gap-3 border-b border-border/40 px-5 py-4 sm:px-6 sm:py-5"
      >
        <div className="flex items-start min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
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
        <div className="flex items-center shrink-0 gap-3">
          {rightAccessory}
          {filterAlign === 'right' ? filterEl : null}
        </div>
      </div>

      <div className={cn(flush ? '' : 'px-5 py-5 sm:px-6')}>{children}</div>
    </Card>
  );
};
