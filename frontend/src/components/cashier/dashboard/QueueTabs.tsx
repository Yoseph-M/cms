import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock3, ClockArrowDown, Search, X, LayoutGrid, CircleDollarSign, ChefHat, Utensils } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../ui/Dropdown';

export type SortKey = 'newest' | 'longer';
export type StatusFilter = 'all' | 'served' | 'in_kitchen' | 'submitted';

export interface QueueTabsProps {
  active: SortKey;
  onChange: (key: SortKey) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (filter: StatusFilter) => void;
}

/** Queue controls designed as a calm command bar instead of a row of tabs. */
export const QueueTabs: React.FC<QueueTabsProps> = ({
  active,
  onChange,
  search,
  onSearchChange,
  statusFilter = 'all',
  onStatusFilterChange,
}) => {
  const { t } = useTranslation('cashier');
  const [sortOpen, setSortOpen] = useState(false);
  const sortWrapperRef = useRef<HTMLDivElement | null>(null);

  const choices: Array<{ key: SortKey; label: string; icon: typeof Clock3 }> = [
    { key: 'newest', label: t('queue.filter.newest', { defaultValue: 'Newest' }), icon: ClockArrowDown },
    { key: 'longer', label: t('queue.filter.longer', { defaultValue: 'Longer' }), icon: Clock3 },
  ];

  const statusFilters: Array<{ key: StatusFilter; label: string; icon: typeof LayoutGrid }> = [
    { key: 'all', label: 'All', icon: LayoutGrid },
    { key: 'served', label: 'Ready to Pay', icon: CircleDollarSign },
    { key: 'in_kitchen', label: 'In Kitchen', icon: ChefHat },
    { key: 'submitted', label: 'Submitted', icon: Utensils },
  ];

  const current = choices.find((c) => c.key === active) ?? choices[0];
  const currentFilter = statusFilters.find((f) => f.key === statusFilter) ?? statusFilters[0];
  const CurrentIcon = current.icon;
  const CurrentFilterIcon = currentFilter.icon;

  useEffect(() => {
    if (!sortOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (sortWrapperRef.current && !sortWrapperRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [sortOpen]);

  return (
    <div className="relative z-30 shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-slate-200/80 bg-white/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('queue.searchPlaceholder', { defaultValue: 'Find a table, ticket, or server…' })}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onStatusFilterChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Filter by status"
                className="shrink-0 h-11"
              >
                <CurrentFilterIcon className="w-4 h-4 text-muted-foreground" />
                <span>{currentFilter.label}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {statusFilters.map(({ key, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={key}
                    selected={statusFilter === key}
                    onSelect={() => onStatusFilterChange(key)}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div ref={sortWrapperRef} className="relative shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setSortOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              aria-label={t('queue.sortBy', { defaultValue: 'Sort by' })}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-xl border bg-slate-50 px-3 text-sm font-semibold shadow-sm transition',
                'border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-white',
                'focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10',
                sortOpen && 'border-primary bg-white ring-4 ring-primary/10'
              )}
            >
              <CurrentIcon className="h-4 w-4 text-slate-500" />
              <span className="whitespace-nowrap">{current.label}</span>
              <ChevronDown
                className={cn('h-4 w-4 text-slate-400 transition-transform', sortOpen && 'rotate-180')}
              />
            </button>

            {sortOpen && (
              <ul
                role="listbox"
                aria-label={t('queue.sortBy', { defaultValue: 'Sort by' })}
                className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5"
              >
                {choices.map(({ key, label, icon: Icon }) => {
                  const selected = active === key;
                  return (
                    <li key={key} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChange(key);
                          setSortOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition',
                          selected
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 whitespace-nowrap">{label}</span>
                        {selected && <span className="text-primary text-xs">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
      </div>
    </div>
  );
};
