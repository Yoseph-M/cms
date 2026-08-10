import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Header } from '../common/Header';
import { SidebarProfile } from './SidebarProfile';
import { Users, UtensilsCrossed, CalendarCheck, DollarSign, Wallet, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const MANAGER_NAV = [
  { to: '/manager/people', label: 'People', icon: Users, end: false },
  { to: '/manager/menu', label: 'Menu Catalog', icon: UtensilsCrossed, end: false },
  { to: '/manager/attendance', label: 'Attendance', icon: CalendarCheck, end: false },
  { to: '/manager/payroll', label: 'Payroll', icon: DollarSign, end: false },
  { to: '/manager/expenses', label: 'Expenses', icon: Wallet, end: false },
  { to: '/manager/settings', label: 'Settings', icon: Settings, end: false },
];

export const ManagerLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col">
          <div className="px-5 py-4 border-b border-border">
            <h1 className="text-base font-display font-semibold text-foreground leading-tight">
              CMS
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              Manager Workbench
            </p>
          </div>

          <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-0.5">
            {MANAGER_NAV.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="manager-nav-active"
                          className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      {isActive && (
                        <motion.span
                          layoutId="manager-nav-pill"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      <Icon
                        className={`relative w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-foreground'
                        }`}
                      />
                      <span className="relative truncate">{link.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <SidebarProfile />
        </aside>

        <main className="flex-1 bg-background overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
