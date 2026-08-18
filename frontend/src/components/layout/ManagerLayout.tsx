import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from '../common/Header';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { Users, UtensilsCrossed, CalendarCheck, DollarSign, Wallet, Settings, XCircle, ClipboardCheck, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';
import { cn } from '../../lib/utils';

const MANAGER_NAV = [
  { to: '/manager/people', label: 'People', icon: Users, end: false },
  { to: '/manager/cancellations', label: 'Cancellations', icon: XCircle, end: false },
  { to: '/manager/reconciliation', label: 'End of Day', icon: ClipboardCheck, end: false },
  { to: '/manager/settlements', label: 'Settlements', icon: Receipt, end: false },
  { to: '/manager/menu', label: 'Menu Catalog', icon: UtensilsCrossed, end: false },
  { to: '/manager/attendance', label: 'Attendance', icon: CalendarCheck, end: false },
  { to: '/manager/payroll', label: 'Payroll', icon: DollarSign, end: false },
  { to: '/manager/expenses', label: 'Expenses', icon: Wallet, end: false },
  { to: '/manager/settings', label: 'Settings', icon: Settings, end: false },
];

import { useSettingsStore } from '../../store/settingsStore';

const ManagerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { settings } = useSettingsStore();
  const location = useLocation();
  const isDashboard = location.pathname === '/manager' || location.pathname === '/manager/';

  const isEnabled = settings['managerDashboardEnabled'] !== 'false'; // defaults to true

  if (!isEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground flex-col gap-4">
        <XCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-xl font-semibold">Manager Dashboard Disabled</h1>
        <p className="text-muted-foreground text-sm">Please contact the owner for access.</p>
      </div>
    );
  }

  return (
    /*
     * Dual-pane layout — same as OwnerLayout:
     *  - Outer h-screen, no page scroll.
     *  - Sticky full-height sidebar.
     *  - Right column with header + independently scrolling main.
     */
    <div className="h-screen w-screen flex bg-[#F1F5F9] overflow-hidden text-foreground relative">
      {/* Subtle cool radial glow so white cards visibly pop as islands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(148,163,184,0.18),transparent_55%),radial-gradient(100%_70%_at_100%_100%,rgba(203,213,225,0.35),transparent_60%)]"
      />

      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 80 : 240 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'shrink-0 sticky top-0 h-screen flex flex-col z-20',
          'bg-white border-r border-[#ece6dd]',
        )}
      >
        <div
          className={cn(
            'h-[72px] sm:h-[88px] px-4 flex items-center shrink-0',
            collapsed ? 'justify-center' : 'justify-end',
          )}
        >
          <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <PanelLeftRounded className="w-5 h-5" />
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
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />

        {/* Main canvas — give non-dashboard pages breathing room around their
            floating cards so the island metaphor reads. */}
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            isDashboard ? '' : 'p-4 sm:p-6 lg:p-8',
          )}
        >
          <Outlet />
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
