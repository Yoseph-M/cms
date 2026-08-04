import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from '../common/Header';
import { Users, UtensilsCrossed, CalendarCheck, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const MANAGER_TABS = [
  { to: '/manager/people', label: 'People', icon: Users },
  { to: '/manager/menu', label: 'Menu Catalog', icon: UtensilsCrossed },
  { to: '/manager/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/manager/payroll', label: 'Payroll', icon: DollarSign },
];

export const ManagerLayout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      {/* Tab strip */}
      <div className="bg-card/40 border-b border-border shrink-0 sticky top-16 z-20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 h-14 relative">
            {MANAGER_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                location.pathname.startsWith(tab.to) ||
                (tab.to === '/manager/people' && location.pathname === '/manager');

              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'relative flex items-center gap-2 h-full px-4 text-sm font-medium transition-colors rounded-t-md',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="manager-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
