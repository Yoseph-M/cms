import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Header } from '../common/Header';
import { SidebarProfile } from './SidebarProfile';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { Users, UtensilsCrossed, CalendarCheck, DollarSign, Wallet, Settings, XCircle, ClipboardCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';

const MANAGER_NAV = [
  { to: '/manager/people', label: 'People', icon: Users, end: false },
  { to: '/manager/cancellations', label: 'Cancellations', icon: XCircle, end: false },
  { to: '/manager/reconciliation', label: 'End of Day', icon: ClipboardCheck, end: false },
  { to: '/manager/menu', label: 'Menu Catalog', icon: UtensilsCrossed, end: false },
  { to: '/manager/attendance', label: 'Attendance', icon: CalendarCheck, end: false },
  { to: '/manager/payroll', label: 'Payroll', icon: DollarSign, end: false },
  { to: '/manager/expenses', label: 'Expenses', icon: Wallet, end: false },
  { to: '/manager/settings', label: 'Settings', icon: Settings, end: false },
];

const ManagerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();

  return (
    <div className="min-h-screen bg-app-gradient text-foreground flex flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 72 : 256 }}
          className="shrink-0 border-r border-border bg-sidebar/95 backdrop-blur-sm flex flex-col z-10 sticky top-0 h-[calc(100vh-3rem)]"
        >
          <div className={`px-4 py-4 border-b border-border flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-base font-display font-semibold text-foreground leading-tight">
                  CMS
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                  Manager Workbench
                </p>
              </div>
            )}
            <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
              <button
                onClick={toggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors shrink-0"
              >
                <PanelLeftRounded className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-1 overflow-x-hidden">
            {MANAGER_NAV.map((link) => {
              const Icon = link.icon;
              const navLink = (
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `group relative flex items-center ${collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'} rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="manager-nav-active"
                          className="absolute inset-0 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border border-primary/25 rounded-lg shadow-brand"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      {isActive && (
                        <motion.span
                          layoutId="manager-nav-pill"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-brand-gradient"
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
                      {!collapsed && (
                        <span className="relative truncate whitespace-nowrap">
                          {link.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={link.to} label={link.label} side="right" className="block w-full">
                  {navLink}
                </Tooltip>
              ) : (
                <React.Fragment key={link.to}>{navLink}</React.Fragment>
              );
            })}
          </nav>

          <SidebarProfile />
        </motion.aside>

        <main className="flex-1 bg-background overflow-y-auto h-[calc(100vh-3rem)]">
          <div className="max-w-7xl mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export const ManagerLayout: React.FC = () => (
  <SidebarProvider>
    <ManagerLayoutInner />
  </SidebarProvider>
);

