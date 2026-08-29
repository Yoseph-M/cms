import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSocketStore } from '../../store/socketStore';
import { useOfflineSyncStore } from '../../store/offlineSyncStore';
import { useHeaderStore } from '../../store/headerStore';
import {
  WifiOff,
  RefreshCw,
  LogOut,
  Shield,
  ChevronDown,
  CalendarDays,
  User,
  Search,
  Calendar,
  Sparkles,
  Settings as SettingsIcon,
  HelpCircle,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import {
  getCalendarPreference,
  setCalendarPreference,
  type CalendarSystem,
} from '../../utils/calendar';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

export const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected } = useSocketStore();
  const { isOnline, pendingCount, processSyncQueue, isSyncing } = useOfflineSyncStore();
  const { dateRange, showDateRange, setDateRange, pageTitle } = useHeaderStore();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [calendar, setCalendar] = React.useState<CalendarSystem>(() => getCalendarPreference());
  const [dateOpen, setDateOpen] = React.useState(false);
  const [searchFocused, setSearchFocused] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const dateRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const showSidebarNav = user?.role === 'OWNER' || user?.role === 'MANAGER';

  // Click-outside handlers
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!dateOpen) return;
    const onClick = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [dateOpen]);

  useEffect(() => {
    const onCal = (e: Event) => {
      const detail = (e as CustomEvent<CalendarSystem>).detail;
      if (detail) setCalendar(detail);
    };
    window.addEventListener('cafeflow:calendar-changed', onCal);
    return () => window.removeEventListener('cafeflow:calendar-changed', onCal);
  }, []);

  const toggleCalendar = () => {
    const next: CalendarSystem = calendar === 'gregorian' ? 'ethiopian' : 'gregorian';
    setCalendarPreference(next);
    setCalendar(next);
  };

  // Global Ctrl/Cmd + K shortcut → focus the search input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isFinderShortcut = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (isFinderShortcut) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const formatShort = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <header
      className={cn(
        'relative h-[72px] sm:h-[80px] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4',
        'border-b border-border bg-card/80 backdrop-blur-md z-30 shrink-0',
      )}
    >
      {/* Subtle accent strip — soft brand gradient on the bottom edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />

      {/* Left: page title (set by each route) + status pills + date-range chip */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <h1 className="font-display text-[18px] sm:text-[22px] font-semibold text-foreground tracking-tight leading-tight truncate">
              {pageTitle.title || 'CafeFlow'}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            {pageTitle.subtitle && (
              <>
                <span className="truncate max-w-[28ch]">{pageTitle.subtitle}</span>
                <span className="h-3 w-px bg-border" aria-hidden />
              </>
            )}
            <StatusPill
              tone={isConnected ? 'success' : 'danger'}
              dot
              pulse={isConnected}
              label={isConnected ? 'Live' : 'Reconnecting'}
            />
            {!isOnline && (
              <StatusPill
                tone="warning"
                icon={<WifiOff className="w-3 h-3" />}
                label="Offline"
              />
            )}
            {pendingCount > 0 && (
              <button
                onClick={() => processSyncQueue()}
                disabled={isSyncing || !isOnline}
                className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warning))] transition-colors hover:bg-warning/20 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
                <span className="tabular-nums">{pendingCount}</span> pending
              </button>
            )}
          </div>
        </div>

        {/* Date range chip — only when a page opts in via the header store */}
        {showDateRange && dateRange.from && dateRange.to && (
          <div className="relative hidden sm:block" ref={dateRef}>
            <button
              onClick={() => setDateOpen((o) => !o)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm',
                'hover:text-foreground hover:border-primary/40 transition-all',
                dateOpen && 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]',
              )}
            >
              <Calendar className="h-4 w-4 text-primary/70" />
              <span className="text-foreground">{formatShort(dateRange.from)}</span>
              <span className="text-muted-foreground/60">→</span>
              <span className="text-foreground">{formatShort(dateRange.to)}</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform',
                  dateOpen && 'rotate-180',
                )}
              />
            </button>
            {dateOpen && (
              <div className="absolute top-full left-0 mt-2 w-[18rem] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl z-50">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Date range
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ from: e.target.value, to: dateRange.to })}
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ from: dateRange.from, to: e.target.value })}
                    className="h-9 flex-1 rounded-md border border-input bg-secondary/40 px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    { label: 'Today', days: 0 },
                    { label: 'Last 7 days', days: 6 },
                    { label: 'Last 30 days', days: 29 },
                    { label: 'Last 90 days', days: 89 },
                  ].map((p) => {
                    const today = new Date();
                    const from = new Date(today);
                    from.setDate(today.getDate() - p.days);
                    return (
                      <button
                        key={p.label}
                        onClick={() =>
                          setDateRange({
                            from: from.toISOString().split('T')[0],
                            to: today.toISOString().split('T')[0],
                          })
                        }
                        className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Search bar with Ctrl/Cmd+K shortcut */}
        <div className="relative">
          <Search
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
              searchFocused ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <input
            ref={searchRef}
            type="text"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const q = (e.target as HTMLInputElement).value;
                window.dispatchEvent(new CustomEvent('cafeflow:open-command-palette', { detail: { q } }));
              } else if (e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={cn(
              'h-9 w-44 sm:w-64 lg:w-80 rounded-lg border border-input bg-card pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground shadow-sm outline-none transition-all',
              'focus:border-primary/50 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]',
            )}
          />
          <kbd
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:inline-flex"
          >
            ⌘K
          </kbd>
        </div>

        {showSidebarNav && (
          <>
            <Tooltip
              label={calendar === 'gregorian' ? 'Switch to Ethiopian calendar' : 'Switch to Gregorian calendar'}
              side="bottom"
            >
              <button
                onClick={toggleCalendar}
                className="hidden h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground hover:border-primary/40 lg:inline-flex"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {calendar === 'gregorian' ? 'Gregorian' : 'Ethiopian'}
              </button>
            </Tooltip>
            <NotificationBell />
          </>
        )}

        {/* Help shortcut */}
        <Tooltip label="Help & shortcuts" side="bottom">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('cafeflow:open-command-palette'))}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            aria-label="Help and shortcuts"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </Tooltip>

        {/* Profile avatar dropdown — available for owner / manager / cashier */}
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="ml-1 flex items-center gap-2 rounded-full border border-input bg-card py-1 pl-1 pr-2.5 shadow-sm transition-colors hover:border-primary/40"
              aria-label="Open profile menu"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="px-1 truncate">
                    {(user.name || '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <div className="hidden text-left leading-tight md:block">
                <p className="text-[13px] font-semibold text-foreground">{user.name}</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {user.role}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'hidden h-3.5 w-3.5 text-muted-foreground transition-transform md:block',
                  menuOpen && 'rotate-180',
                )}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-fade-in z-40">
                <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-3.5 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      (user.name || '?').trim().charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Shield className="h-3 w-3 text-primary" />
                      {user.role}
                    </p>
                  </div>
                </div>
                <div className="p-1.5">
                  <MenuLink
                    to={`/${(user.role || 'owner').toLowerCase()}/profile`}
                    icon={<User className="h-4 w-4" />}
                    label="Profile"
                    onClick={() => setMenuOpen(false)}
                  />
                  <MenuLink
                    to={`/${(user.role || 'owner').toLowerCase()}/settings`}
                    icon={<SettingsIcon className="h-4 w-4" />}
                    label="Settings"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="my-1 h-px bg-border" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <CommandPalette />
    </header>
  );
};

const MenuLink: React.FC<{
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ to, icon, label, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
  >
    {icon}
    {label}
  </Link>
);

const StatusPill: React.FC<{
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  label: string;
  dot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
}> = ({ tone, label, dot, pulse, icon }) => {
  const styles: Record<string, string> = {
    success: 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/40 text-[hsl(var(--success))]',
    danger: 'bg-destructive/10 border-destructive/40 text-destructive',
    warning: 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]',
    neutral: 'bg-secondary/60 border-border text-muted-foreground',
  };
  const dotColor: Record<string, string> = {
    success: 'bg-[hsl(var(--success))]',
    danger: 'bg-destructive',
    warning: 'bg-[hsl(var(--warning))]',
    neutral: 'bg-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        styles[tone],
      )}
    >
      {dot ? (
        <span className="relative inline-flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={cn('absolute inset-0 rounded-full opacity-60 animate-ping', dotColor[tone])}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotColor[tone])} />
        </span>
      ) : (
        icon
      )}
      {label}
    </span>
  );
};
