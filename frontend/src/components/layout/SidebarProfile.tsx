import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { LogOut, Shield, ChevronUp } from 'lucide-react';

export const SidebarProfile: React.FC = () => {
  const { user, logout } = useAuthStore();
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

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative mt-auto p-3 border-t border-border" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">
            {user.role}
          </p>
        </div>
        <ChevronUp
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
            menuOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {menuOpen && (
        <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/40 overflow-hidden animate-fade-in z-40">
          <div className="px-3 py-2.5 border-b border-border bg-secondary/30">
            <p className="text-sm font-semibold truncate">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              <Shield className="w-3 h-3 text-primary" />
              {user.role}
            </p>
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
  );
};
