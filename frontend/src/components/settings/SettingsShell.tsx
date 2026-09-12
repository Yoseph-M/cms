import React, { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, X, SlidersHorizontal, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input } from '../ui/Input';

export interface SettingsShellItem {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  content: React.ReactNode;
}

export interface SettingsShellCategory {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  iconBgClassName?: string;
  badge?: React.ReactNode;
  items: SettingsShellItem[];
}

export interface SettingsShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  categories: SettingsShellCategory[];
  defaultCategoryId?: string;
  className?: string;
}

export const SettingsShell: React.FC<SettingsShellProps> = ({
  title,
  description,
  badge,
  actions,
  categories,
  defaultCategoryId,
  className,
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    defaultCategoryId || categories[0]?.id || '',
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Handle live search
  const trimmedQuery = searchQuery.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!trimmedQuery) return null;

    const results: Array<{
      category: SettingsShellCategory;
      item: SettingsShellItem;
    }> = [];

    for (const cat of categories) {
      for (const item of cat.items) {
        const matchTitle = item.title.toLowerCase().includes(trimmedQuery);
        const matchDesc = item.description?.toLowerCase().includes(trimmedQuery);
        const matchCat = cat.label.toLowerCase().includes(trimmedQuery);
        const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(trimmedQuery));

        if (matchTitle || matchDesc || matchCat || matchKeywords) {
          results.push({ category: cat, item });
        }
      }
    }

    return results;
  }, [categories, trimmedQuery]);

  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === activeCategoryId) || categories[0];
  }, [categories, activeCategoryId]);

  const totalSettingsCount = useMemo(() => {
    return categories.reduce((acc, cat) => acc + cat.items.length, 0);
  }, [categories]);

  return (
    <div className={cn('max-w-7xl mx-auto space-y-6 animate-fade-in pb-12', className)}>
      {/* ─── Modern Settings Header ─── */}
      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all sm:p-8">
        {/* Subtle mesh/ambient glow decoration */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl"
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/10">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Quick Search Bar */}
            <div className="relative w-full sm:w-72">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter settings..."
                leftIcon={<Search className="h-4 w-4" />}
                className="h-10 bg-secondary/60 text-xs shadow-none transition-colors hover:bg-secondary/90 focus:bg-background"
                rightAdornment={
                  searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : undefined
                }
              />
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </div>
      </header>

      {/* ─── Search Results View (when query is active) ─── */}
      {searchResults !== null ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-border/50 bg-secondary/40 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Found{' '}
              <span className="font-bold text-foreground">{searchResults.length}</span>{' '}
              {searchResults.length === 1 ? 'setting' : 'settings'} matching &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear filter
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-12 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <h3 className="mt-3 text-base font-semibold text-foreground">No settings found</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                No setting titles, descriptions, or keywords matched &ldquo;{searchQuery}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80"
              >
                Reset filter
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {searchResults.map(({ category, item }) => (
                <div
                  key={`${category.id}-${item.id}`}
                  className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-border"
                >
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold">
                      {category.label}
                    </span>
                    <span>›</span>
                    <span className="text-foreground">{item.title}</span>
                  </div>
                  {item.content}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── Standard Category Navigation + Detail Workspace ─── */
        <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Mobile / Tablet Horizontal Category Scroll */}
          <div className="lg:hidden flex overflow-x-auto gap-2 pb-1 scrollbar-none">
            {categories.map((cat) => {
              const isActive = cat.id === activeCategoryId;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card border border-border/60 text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{cat.label}</span>
                  <span
                    className={cn(
                      'ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                      isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {cat.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop Left Category Rail */}
          <div className="hidden lg:block space-y-4">
            <nav className="rounded-2xl border border-border/60 bg-card p-2 shadow-sm space-y-1">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Settings Navigation ({totalSettingsCount})
              </div>
              {categories.map((cat) => {
                const isActive = cat.id === activeCategoryId;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={cn(
                      'group relative flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all duration-200',
                      isActive
                        ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 shadow-sm'
                        : 'text-foreground/80 hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ring-1 ring-inset',
                        isActive
                          ? 'bg-primary text-primary-foreground ring-primary/30 shadow-sm'
                          : 'bg-secondary text-muted-foreground ring-border/50 group-hover:bg-background group-hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold leading-none tracking-tight">
                          {cat.label}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground group-hover:bg-background',
                          )}
                        >
                          {cat.items.length}
                        </span>
                      </div>
                      {cat.description && (
                        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground leading-snug">
                          {cat.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>

            {/* Micro Helper / Status Card */}
            <div className="rounded-2xl border border-border/50 bg-secondary/30 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Instant Persistence</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Changes to business details apply across all terminals. Device preferences follow your active account.
              </p>
            </div>
          </div>

          {/* Right Active Category Detail Workspace */}
          {activeCategory && (
            <main className="min-w-0 space-y-6">
              {/* Category Sub-Header */}
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/10',
                      activeCategory.iconBgClassName || 'bg-primary/10',
                    )}
                  >
                    <activeCategory.icon
                      className={cn('h-5 w-5', activeCategory.iconClassName || 'text-primary')}
                    />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                      {activeCategory.label}
                    </h2>
                    {activeCategory.description && (
                      <p className="text-xs text-muted-foreground">
                        {activeCategory.description}
                      </p>
                    )}
                  </div>
                </div>

                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {activeCategory.items.length}{' '}
                  {activeCategory.items.length === 1 ? 'module' : 'modules'}
                </span>
              </div>

              {/* Category Items */}
              <div className="space-y-6">
                {activeCategory.items.map((item) => (
                  <section
                    key={item.id}
                    id={item.id}
                    className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-border sm:p-6"
                  >
                    <div className="mb-4">
                      <h3 className="text-base font-semibold leading-tight text-foreground">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.content}
                  </section>
                ))}
              </div>
            </main>
          )}
        </div>
      )}
    </div>
  );
};
