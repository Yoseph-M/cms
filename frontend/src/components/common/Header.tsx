import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSocketStore } from '../../store/socketStore';
import { useOfflineSyncStore } from '../../store/offlineSyncStore';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  User as UserIcon,
  Shield,
  ChevronDown,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { isConnected } = useSocketStore();
  const { isOnline, pendingCount, processSyncQueue, isSyncing } = useOfflineSyncStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between">
      {/* Brand & Connection Status */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-base font-display font-semibold text-foreground leading-tight truncate">
            CMS
          </h1>
          <p className="text-[10px] text-muted-foreground font-mono tracking-wider truncate">
            Management System · v1.0
          </p>
        </div>

        <div className="hidden sm:block h-8 w-px bg-border mx-1" aria-hidden />

        {/* Status Indicators */}
        <div className="hidden sm:flex items-center gap-2">
          <StatusPill
            tone={isConnected ? 'success' : 'danger'}
            dot
            pulse={isConnected}
            label={isConnected ? 'Live' : 'Reconnecting'}
          />
          <StatusPill
            tone={isOnline ? 'neutral' : 'warning'}
            icon={isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            label={isOnline ? 'Online' : 'Offline'}
          />
          {pendingCount > 0 && (
            <button
              onClick={() => processSyncQueue()}
              disabled={isSyncing || !isOnline}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-warning/40 bg-warning/10 text-[hsl(var(--warning))] hover:bg-warning/20 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="tabular-nums">{pendingCount}</span> pending
            </button>
          )}
        </div>
      </div>

      {/* User menu */}
      <div className="flex items-center gap-2">
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-full border border-border hover:border-border/80 hover:bg-secondary/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="hidden md:block text-left leading-tight">
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
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/40 overflow-hidden animate-fade-in z-40">
                <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
                  <p className="text-sm font-semibold truncate">{user.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                    <Shield className="w-3 h-3 text-primary" />
                    {user.role}
                  </p>
                </div>
                <div className="p-1.5 sm:hidden">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    {isOnline ? (
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                    )}
                    {isOnline ? 'Online' : 'Offline'}
                    <span className="mx-1 text-border">·</span>
                    {isConnected ? 'Live' : 'Reconnecting'}
                  </div>
                </div>
                <div className="p-1.5">
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

        {!menuOpen && (
          <button
            onClick={logout}
            title="Sign Out"
            className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

/* ── Internal: status pill ─────────────────────────────────────────── */
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[tone]}`}
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
