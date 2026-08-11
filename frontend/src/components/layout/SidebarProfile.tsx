import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSidebar } from '../../store/SidebarContext';

export const SidebarProfile: React.FC = () => {
  const { user } = useAuthStore();
  const { collapsed } = useSidebar();
  const navigate = useNavigate();

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`mt-auto border-t border-border ${collapsed ? 'p-2' : 'p-3'}`}>
      <button
        onClick={() => navigate(`/${user.role.toLowerCase()}/profile`)}
        className={`w-full flex items-center hover:bg-secondary transition-colors text-left ${
          collapsed ? 'justify-center p-2 rounded-xl' : 'gap-3 px-2 py-2 rounded-lg'
        }`}
        title={collapsed ? 'Profile & Settings' : undefined}
      >
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">
              {user.role}
            </p>
          </div>
        )}
      </button>
    </div>
  );
};

