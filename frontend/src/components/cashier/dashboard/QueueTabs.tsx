import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock3, ClockArrowDown, Search, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';

export type SortKey = 'newest' | 'longer';

export interface QueueTabsProps {
  active: SortKey;
  onChange: (key: SortKey) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

/** Queue controls designed as a calm command bar instead of a row of tabs. */
export const QueueTabs: React.FC<QueueTabsProps> = ({ active, onChange, search, onSearchChange }) => {
  const { t } = useTranslation('cashier');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const choices: Array<{ key: SortKey; label: string; icon: typeof Clock3 }> = [
    { key: 'newest', label: t('queue.filter.newest', { defaultValue: 'Newest' }), icon: ClockArrowDown },
    { key: 'longer', label: t('queue.filter.longer', { defaultValue: 'Longer' }), icon: Clock3 },
  ];
  const current = choices.find((c) => c.key === active) ?? choices[0];
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

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

          <div ref={wrapperRef} className="relative shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={t('queue.sortBy', { defaultValue: 'Sort by' })}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-xl border bg-slate-50 px-3 text-sm font-semibold shadow-sm transition',
                'border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-white',
                'focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10',
                open && 'border-primary bg-white ring-4 ring-primary/10'
              )}
            >
              <CurrentIcon className="h-4 w-4 text-slate-500" />
              <span className="whitespace-nowrap">{current.label}</span>
              <ChevronDown
                className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')}
              />
            </button>

            {open && (
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
                          setOpen(false);
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
