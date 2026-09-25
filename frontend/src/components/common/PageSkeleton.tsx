import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

type Variant = 'dashboard' | 'analytics' | 'table' | 'grid' | 'calendar' | 'settings' | 'cards' | 'auth';

/**
 * Pick the skeleton shape that best matches the page the router is about to
 * render, so the loading state reads as a faded copy of the real UI instead of
 * a generic stack of grey bars.
 */
function variantForPath(pathname: string): Variant {
  const path = pathname.replace(/\/+$/, '');
  if (/\/login?$/.test(path) || path === '' || path === '/') return 'auth';
  if (/^\/(owner|manager|cashier)$/.test(path)) return 'dashboard';
  if (/\/finance$/.test(path)) return 'analytics';
  if (/\/menu$/.test(path)) return 'grid';
  if (/\/attendance$/.test(path)) return 'calendar';
  if (/\/settings$/.test(path)) return 'settings';
  if (path.includes('tab=printers') || /\/printers$/.test(path)) return 'cards';
  return 'table';
}

const Bar: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('rounded-md bg-secondary/50', className)} />
);

const Card: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('rounded-2xl border border-border/60 bg-card/70', className)}>{children}</div>
);

const TitleRow: React.FC = () => (
  <div className="flex items-end justify-between gap-4">
    <div className="space-y-2">
      <Bar className="h-7 w-56 max-w-[60vw]" />
      <Bar className="h-3.5 w-72 max-w-[70vw] bg-secondary/40" />
    </div>
    <Bar className="hidden h-9 w-28 rounded-lg sm:block" />
  </div>
);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-5">
    <TitleRow />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-[419px]:grid-cols-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="h-[104px] p-5">
          <Bar className="h-3 w-20 bg-secondary/40" />
          <Bar className="mt-4 h-6 w-28" />
          <Bar className="mt-3 h-2.5 w-16 bg-secondary/40" />
        </Card>
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-80 p-5 lg:col-span-2">
        <Bar className="h-4 w-40" />
        <Bar className="mt-6 h-56 w-full bg-secondary/30" />
      </Card>
      <Card className="h-80 p-5">
        <Bar className="h-4 w-32" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Bar className="h-3.5 w-24 bg-secondary/40" />
              <Bar className="h-3.5 w-12 bg-secondary/40" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const AnalyticsSkeleton: React.FC = () => (
  <div className="space-y-5">
    <TitleRow />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-[419px]:grid-cols-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="h-24 p-4">
          <Bar className="h-3 w-20 bg-secondary/40" />
          <Bar className="mt-4 h-6 w-24" />
        </Card>
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="h-72 p-5">
        <Bar className="h-4 w-36" />
        <Bar className="mt-6 h-48 w-full bg-secondary/30" />
      </Card>
      <Card className="h-72 p-5">
        <Bar className="h-4 w-36" />
        <Bar className="mt-6 h-48 w-full bg-secondary/30" />
      </Card>
    </div>
  </div>
);

const TableSkeleton: React.FC = () => (
  <div className="space-y-5">
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-secondary/30 px-4 py-3">
        <Bar className="h-8 w-28 rounded-lg" />
        <div className="flex items-center gap-2">
          <Bar className="h-9 w-52 rounded-lg bg-secondary/40" />
          <Bar className="h-9 w-28 rounded-lg bg-secondary/40" />
        </div>
      </div>
      <div className="border-b border-border/60 bg-secondary/40 px-4 py-3">
        <div className="flex items-center gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} className="h-3 w-20 bg-secondary/60" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-9 w-9 shrink-0 rounded-full bg-secondary/50" />
            <Bar className="h-3.5 w-40" />
            <Bar className="ml-auto hidden h-6 w-16 rounded-full bg-secondary/40 sm:block" />
            <Bar className="hidden h-3.5 w-24 bg-secondary/40 md:block" />
            <Bar className="h-3.5 w-16 bg-secondary/40" />
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const GridSkeleton: React.FC = () => (
  <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Bar key={i} className="h-8 w-24 rounded-full bg-secondary/40" />
      ))}
      <Bar className="ml-auto h-9 w-40 rounded-lg bg-secondary/40" />
    </div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 max-[419px]:grid-cols-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="h-28 w-full bg-secondary/40" />
          <div className="space-y-2 p-4">
            <Bar className="h-3.5 w-3/4" />
            <Bar className="h-3 w-1/3 bg-secondary/40" />
          </div>
        </Card>
      ))}
    </div>
  </div>
);

const CalendarSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Bar className="h-8 w-8 rounded-lg" />
        <Bar className="h-5 w-36" />
        <Bar className="h-8 w-8 rounded-lg" />
      </div>
      <Bar className="h-9 w-40 rounded-lg bg-secondary/40" />
    </div>
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border/60 bg-secondary/40 px-3 py-2">
        <Bar className="h-4 w-24 bg-secondary/60" />
        {Array.from({ length: 16 }).map((_, i) => (
          <Bar key={i} className="h-4 w-6 bg-secondary/50" />
        ))}
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex items-center gap-2 px-3 py-2">
            <Bar className="h-5 w-24 bg-secondary/40" />
            {Array.from({ length: 16 }).map((_, c) => (
              <Bar key={c} className="h-5 w-6 rounded bg-secondary/30" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const SettingsSkeleton: React.FC = () => (
  <div className="space-y-5">
    <TitleRow />
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} className={cn('h-10 rounded-xl bg-secondary/40', i === 0 && 'bg-primary/15')} />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Bar className="h-4 w-40" />
            <Bar className="mt-2 h-3 w-64 bg-secondary/40" />
            <Bar className="mt-5 h-10 w-full rounded-lg bg-secondary/30" />
          </Card>
        ))}
      </div>
    </div>
  </div>
);

const CardsSkeleton: React.FC = () => (
  <div className="space-y-5">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Bar className="h-5 w-40" />
        <Bar className="h-3 w-64 bg-secondary/40" />
      </div>
      <Bar className="h-9 w-32 rounded-lg" />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="h-36 p-5">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-secondary/60" />
            <Bar className="h-4 w-28" />
          </div>
          <Bar className="mt-3 h-3 w-40 bg-secondary/40" />
          <Bar className="mt-6 h-9 w-full rounded-lg bg-secondary/40" />
        </Card>
      ))}
    </div>
  </div>
);

const AuthSkeleton: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-4">
    <div className="w-full max-w-sm space-y-5">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary/50" />
      <Bar className="mx-auto h-6 w-40" />
      <Card className="space-y-4 p-6">
        <Bar className="h-10 w-full rounded-lg bg-secondary/40" />
        <Bar className="h-10 w-full rounded-lg bg-secondary/40" />
        <Bar className="h-10 w-full rounded-lg bg-primary/20" />
      </Card>
    </div>
  </div>
);

const RENDERERS: Record<Variant, React.FC> = {
  dashboard: DashboardSkeleton,
  analytics: AnalyticsSkeleton,
  table: TableSkeleton,
  grid: GridSkeleton,
  calendar: CalendarSkeleton,
  settings: SettingsSkeleton,
  cards: CardsSkeleton,
  auth: AuthSkeleton,
};

/**
 * Route-level loading fallback. Mirrors the shape of the page that is being
 * loaded (KPIs, tables, grids, …) using the same card and spacing classes as
 * the real components, so the transition reads as the UI filling in rather
 * than a generic placeholder appearing first.
 */
export const PageSkeleton: React.FC<{ variant?: Variant }> = ({ variant }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const resolved = variant ?? variantForPath(location.pathname);
  const Renderer = RENDERERS[resolved] ?? TableSkeleton;

  return (
    <div className="space-y-4 p-1 animate-pulse" aria-busy aria-label={t('a11y.loadingPage')}>
      <Renderer />
    </div>
  );
};

export default PageSkeleton;
