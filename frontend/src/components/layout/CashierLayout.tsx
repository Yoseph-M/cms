import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Header } from '../common/Header';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { Calculator, UtensilsCrossed, Receipt, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';
import { cn } from '../../lib/utils';

import { useSettingsStore } from '../../store/settingsStore';

/**
 * CashierLayout — mirrors Owner/Manager dual-pane structure:
 *  - Outer h-screen so the page itself never scrolls.
 *  - Sticky full-height sidebar on the left.
 *  - Right column hosts the global Header + a scrollable <main>.
 *  - The dashboard (live POS) keeps a soft warm frame so the cashier's
 *    "island" cards still pop, matching the Owner's dashboard rhythm.
 */
const CashierLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { settings } = useSettingsStore();
  const location = useLocation();
  const isDashboard = location.pathname === '/cashier' || location.pathname === '/cashier/';

  const CASHIER_NAV = [
    { to: '/cashier', label: 'POS', icon: Calculator, end: true },
    ...(settings['cashierMenuManagementEnabled'] === 'true'
      ? [{ to: '/cashier/menu', label: 'Menu Catalog', icon: UtensilsCrossed, end: false }]
      : []),
    { to: '/cashier/settlements', label: 'Settlements', icon: Receipt, end: false },
    { to: '/cashier/settings', label: 'Settings', icon: Settings, end: false },
  ];

  return (
    <div
      className={cn(
        'h-screen w-screen flex overflow-hidden text-foreground relative',
        // Warm cream for the live POS dashboard, cool slate for everything else —
        // same convention as the Owner layout.
        isDashboard ? 'bg-[#fdfaf6]' : 'bg-[#F1F5F9]',
      )}
    >
      {/* Subtle radial glow — warm on dashboard, cool elsewhere */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          isDashboard
            ? 'bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,173,102,0.10),transparent_55%),radial-gradient(100%_70%_at_100%_100%,rgba(255,236,210,0.55),transparent_60%)]'
            : 'bg-[radial-gradient(120%_80%_at_0%_0%,rgba(148,163,184,0.18),transparent_55%),radial-gradient(100%_70%_at_100%_100%,rgba(203,213,225,0.35),transparent_60%)]',
        )}
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

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />

        {/* Main canvas — give non-dashboard pages breathing room around their
            floating cards so the island metaphor reads (matches Owner/Manager). */}
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

export const CashierLayout: React.FC = () => (
  <SidebarProvider>
    <CashierLayoutInner />
  </SidebarProvider>
);
