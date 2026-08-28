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
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import {
  getCalendarPreference,
  setCalendarPreference,
  type CalendarSystem,
} from '../../utils/calendar';
import { cn } from '../../lib/utils';

export const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected } = useSocketStore();
  const { isOnline, pendingCount, processSyncQueue, isSyncing } = useOfflineSyncStore();
  const { dateRange, showDateRange, setDateRange } = useHeaderStore();
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
        'relative h-[72px] sm:h-[88px] px-4 sm:px-8 flex items-center justify-between gap-4',
        'border-b border-[hsl(var(--shell-border))] bg-[hsl(var(--canvas-warm))] z-30 shrink-0',
      )}
    >
      {/* Brand accent strip */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--orange-300)/0.5)] to-transparent"
      />

      {/* Left: title + (optional) date range chip + status pill */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] sm:text-[26px] font-semibold text-foreground tracking-tight leading-tight truncate">
            Analytics Overview
          </h1>
          <div className="hidden sm:flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
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
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-warning/40 bg-warning/10 text-[hsl(var(--warning))] hover:bg-warning/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
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
                'h-10 px-3.5 rounded-xl border border-input bg-card text-sm font-medium text-muted-foreground',
                'hover:shadow-sm transition-all inline-flex items-center gap-2',
                dateOpen && 'shadow-sm border-primary/40',
              )}
            >
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>{formatShort(dateRange.from)}</span>
              <span className="text-muted-foreground/60">→</span>
              <span>{formatShort(dateRange.to)}</span>
              <ChevronDown className="w-4 h-4 ml-1 text-muted-foreground" />
            </button>
            {dateOpen && (
              <div className="absolute top-full left-0 mt-2 p-3 bg-card border border-border rounded-xl shadow-lg z-50 flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ from: e.target.value, to: dateRange.to })}
                  className="text-sm bg-secondary border border-input rounded p-1 outline-none focus:border-primary"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ from: dateRange.from, to: e.target.value })}
                  className="text-sm bg-secondary border border-input rounded p-1 outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search bar with Ctrl/Cmd+K shortcut */}
        <div className="relative">
          <Search
            className={cn(
              'absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors',
              searchFocused ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <input
            ref={searchRef}
            type="text"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // Hand off to the command palette so the same shortcuts keep working
                const q = (e.target as HTMLInputElement).value;
                window.dispatchEvent(new CustomEvent('cafeflow:open-command-palette', { detail: { q } }));
              } else if (e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={cn(
              'h-10 pl-10 pr-16 w-44 sm:w-64 lg:w-80 rounded-full bg-card border border-input',
              'focus:border-primary/60 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]',
              'text-[14px] text-foreground placeholder:text-muted-foreground outline-none transition-all shadow-sm',
            )}
          />
          <kbd
            aria-hidden
            className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-secondary text-[10px] font-mono font-semibold text-muted-foreground border border-border pointer-events-none"
          >
            ⌘K
          </kbd>
        </div>

        {showSidebarNav && (
          <>
            <button
              onClick={toggleCalendar}
              title={
                calendar === 'gregorian'
                  ? 'Switch to Ethiopian calendar'
                  : 'Switch to Gregorian calendar'
              }
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {calendar === 'gregorian' ? 'Gregorian' : 'Ethiopian'}
            </button>
            <NotificationBell />
          </>
        )}

        {/* Profile avatar dropdown — available for owner / manager / cashier */}
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-input hover:bg-card bg-card transition-colors shadow-sm"
              aria-label="Open profile menu"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="px-1 truncate">
                    {(user.name || '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <div className="hidden md:block text-left leading-tight pr-1">
                <p className="text-sm font-medium text-foreground">{user.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                  {user.role}
                </p>
              </div>
              <ChevronDown
                className={`hidden md:block w-3.5 h-3.5 text-muted-foreground transition-transform ${
                  menuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl overflow-hidden animate-fade-in z-40">
                <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                    <Shield className="w-3 h-3 text-primary" />
                    {user.role}
                  </p>
                </div>
                <div className="p-1.5">
                  <Link
                    to={`/${(user.role || 'owner').toLowerCase()}/profile`}
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-foreground hover:bg-secondary transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
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

const StatusPill: React.FC<{
  tone: 'success' | 'danger' | 'warning' | 'neutral';
  label: string;
  dot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
}> = ({ tone, label, dot, pulse, icon }) => {
  const styles: Record<string, string> = {
    success:
      'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/40 text-[hsl(var(--success))]',
    danger: 'bg-destructive/10 border-destructive/40 text-destructive',
    warning:
      'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]',
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${styles[tone]}`}
    >
      {dot ? (
        <span className="relative inline-flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={`absolute inset-0 rounded-full ${dotColor[tone]} opacity-60 animate-ping`}
            />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor[tone]}`} />
        </span>
      ) : (
        icon
      )}
      {label}
    </span>
  );
};
