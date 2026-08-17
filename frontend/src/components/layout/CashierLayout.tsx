import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from '../common/Header';
import { SidebarProfile } from './SidebarProfile';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { ShoppingCart, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';
import { cn } from '../../lib/utils';

const CASHIER_NAV = [
  { to: '/cashier', label: 'POS', icon: ShoppingCart, end: true },
  { to: '/cashier/settings', label: 'Settings', icon: Settings, end: false },
];

const CashierLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const location = useLocation();
  const isDashboard = location.pathname === '/cashier' || location.pathname === '/cashier/';

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col text-foreground',
        isDashboard ? 'bg-owner-frame' : 'bg-app-gradient',
      )}
    >
      <AnimatePresence>
        {!isDashboard && (
          <motion.div
            key="global-header"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Header />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'flex flex-1 overflow-hidden',
          isDashboard && 'p-3 sm:p-6',
        )}
      >
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 64 : 240 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={cn(
            'shrink-0 flex flex-col z-10 sticky top-0',
            isDashboard
              ? 'rounded-2xl bg-card/85 backdrop-blur-sm border border-white/40 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04)] ml-0 mb-0'
              : 'border-r border-border bg-sidebar/95 backdrop-blur-sm h-[calc(100vh-3rem)]',
          )}
        >
          <div
            className={cn(
              'px-4 py-4 border-b border-border flex items-center',
              collapsed ? 'justify-center' : 'justify-between',
            )}
          >
            {!collapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-base font-display font-semibold text-foreground leading-tight">
                  CMS
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                  Cashier POS
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
            {CASHIER_NAV.map((link) => {
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
                          layoutId="cashier-nav-active"
                          className="absolute inset-0 bg-gradient-to-r from-emerald-500/15 via-emerald-500/8 to-transparent border border-emerald-500/30 rounded-lg shadow-sm"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      {isActive && (
                        <motion.span
                          layoutId="cashier-nav-pill"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-emerald-500"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      <Icon
                        className={`relative w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-emerald-600'
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

        <main
          className={cn(
            'flex-1 overflow-y-auto relative',
            isDashboard
              ? 'ml-3 sm:ml-5 rounded-2xl bg-card border border-white/40 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.18),0_2px_8px_-2px_rgba(15,23,42,0.06)] overflow-hidden'
              : 'bg-background h-[calc(100vh-3rem)]',
          )}
        >
          {isDashboard ? (
            <Outlet />
          ) : (
            <div className="max-w-7xl mx-auto p-6">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export const CashierLayout: React.FC = () => (
  <SidebarProvider>
    <CashierLayoutInner />
  </SidebarProvider>
);
