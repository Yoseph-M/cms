import React from 'react';
import {
  ListOrdered,
  CheckCircle2,
  Timer,
  Sparkles,
  Search,
  X as XIcon,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';

export type FilterKey = 'all' | 'needsPayment' | 'waiting' | 'fresh';

export interface QueueTabsProps {
  active: FilterKey;
  onChange: (k: FilterKey) => void;
  search: string;
  onSearchChange: (s: string) => void;
  readyCount: number;
}

export const QueueTabs: React.FC<QueueTabsProps> = ({
  active,
  onChange,
  search,
  onSearchChange,
  readyCount,
}) => {
  const { t } = useTranslation('cashier');
  return (
    <div className="px-6 pt-5 pb-3 flex items-center gap-2 shrink-0">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('queue.searchPlaceholder', { defaultValue: 'Search table, order, waiter…' })}
          className={cn(
            'w-full h-9 pl-9 pr-9 rounded-lg bg-secondary/50 border border-transparent',
            'hover:border-border focus:border-primary focus:bg-background',
            'focus:shadow-[0_0_0_4px_hsl(217_91%_60%/0.12)]',
            'text-sm outline-none transition-all placeholder:text-muted-foreground/70',
          )}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Clear search"
          >
            <XIcon className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-border/60">
        {([
          { k: 'all' as const,          label: t('queue.filter.all', { defaultValue: 'All' }),           icon: ListOrdered },
          { k: 'needsPayment' as const, label: t('queue.filter.ready', { defaultValue: 'Ready to pay' }), icon: CheckCircle2 },
          { k: 'waiting' as const,      label: t('queue.filter.cooking', { defaultValue: 'In kitchen' }),  icon: Timer },
          { k: 'fresh' as const,        label: t('queue.filter.newest', { defaultValue: 'Newest' }),       icon: Sparkles },
        ]).map(({ k, label, icon: Icon }) => {
          const isActive = active === k;
          return (
            <button
              key={k}
              onClick={() => onChange(k)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all',
                isActive
                  ? 'bg-card text-primary shadow-sm border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground border border-transparent',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {k === 'needsPayment' && (
                <span
                  className={cn(
                    'ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]',
                  )}
                >
                  {readyCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ml-auto text-xs text-muted-foreground hidden lg:flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↑</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↓</kbd>
          navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/60 border border-border font-mono text-[10px]">↵</kbd>
          settle
        </span>
      </div>
    </div>
  );
};
