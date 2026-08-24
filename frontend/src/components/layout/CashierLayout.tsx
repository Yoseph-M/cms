import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '../common/Header';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { Calculator, UtensilsCrossed, Receipt, Settings, Ticket } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';
import { cn } from '../../lib/utils';

import { useSettingsStore } from '../../store/settingsStore';

const GROUP_ORDER: string[] = ['core', 'ops'];

/**
 * CashierLayout — mirrors the OwnerLayout dual-pane structure and sidebar
 * visuals:
 *  - Outer h-screen so the page itself never scrolls.
 *  - Sticky full-height sidebar on the left, matching rounded-2xl items,
 *    orange active state, group labels, and a pinned System Settings row.
 *  - Right column hosts the global Header + a scrollable <main>.
 *  - The dashboard (live POS) keeps a soft warm frame so the cashier's
 *    "island" cards still pop, matching the Owner's dashboard rhythm.
 */
const CashierLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { settings } = useSettingsStore();
  const { t } = useTranslation('cashier');
  const location = useLocation();
  const isDashboard = location.pathname === '/cashier' || location.pathname === '/cashier/' || location.pathname === '/cashier/tickets';

  const CASHIER_NAV = [
    { to: '/cashier', label: t('nav.dashboard', { defaultValue: 'Dashboard' }), icon: Calculator, end: true, group: 'core' },
    { to: '/cashier/tickets', label: t('nav.tickets', { defaultValue: 'Tickets' }), icon: Ticket, end: true, group: 'core' },
    ...(settings['cashierMenuManagementEnabled'] === 'true'
      ? [{ to: '/cashier/menu', label: t('nav.menu', { defaultValue: 'Menu Catalog' }), icon: UtensilsCrossed, end: false, group: 'ops' as const }]
      : []),
    { to: '/cashier/settlements', label: t('nav.settlements', { defaultValue: 'Settlements' }), icon: Receipt, end: false, group: 'ops' as const },
  ] as const;

  const SYSTEM_SETTINGS = {
    to: '/cashier/settings',
    label: t('nav.systemSettings', { defaultValue: 'System Settings' }),
    icon: Settings,
  };

  const GROUP_LABELS: Record<string, string> = {
    core: t('nav.groups.core', { defaultValue: 'Insights' }),
    ops: t('nav.groups.ops', { defaultValue: 'Operations' }),
  };

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: CASHIER_NAV.filter((n) => n.group === g),
  }));

  return (
    <div
      className={cn(
        'h-screen w-screen flex overflow-hidden text-slate-800 relative',
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
        animate={{ width: collapsed ? 80 : 260 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className={cn(
          'shrink-0 sticky top-0 h-screen flex flex-col z-20',
          'bg-white border-r border-[#ece6dd]',
        )}
      >
        <div
          className={cn(
            'h-[72px] sm:h-[88px] px-6 flex items-center shrink-0',
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

        <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-6 overflow-x-hidden">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              {!collapsed && GROUP_LABELS[group] !== 'Insights' && (
                <p className="px-4 mb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {GROUP_LABELS[group]}
                </p>
              )}

              <div className="space-y-1.5">
                {items.map((link) => {
                  const Icon = link.icon;
                  const navLink = (
                    <NavLink
                      to={link.to}
                      end={'end' in link ? link.end : false}
                      className={({ isActive }) =>
                        `group relative flex items-center ${collapsed ? 'justify-center w-12 h-12 mx-auto' : 'gap-4 px-4 h-12'} rounded-2xl text-[15px] font-medium transition-colors ${isActive
                          ? 'text-orange-600 bg-[#fff5eb]'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`relative w-5 h-5 shrink-0 transition-colors ${isActive
                              ? 'text-orange-500'
                              : 'text-slate-400 group-hover:text-slate-600'
                              }`}
                            strokeWidth={2.5}
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
              </div>
            </div>
          ))}
        </nav>

        {/* System Settings — pinned to the bottom of the sidebar */}
        <div
          className={cn(
            'shrink-0 border-t border-[#ece6dd] p-3',
            collapsed ? 'flex justify-center' : '',
          )}
        >
          <NavLink
            to={SYSTEM_SETTINGS.to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center rounded-2xl text-[14px] font-medium transition-colors',
                collapsed
                  ? 'justify-center w-12 h-12 mx-auto'
                  : 'gap-3 px-4 h-11 w-full',
                isActive
                  ? 'text-orange-600 bg-[#fff5eb]'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
              )
            }
          >
            {({ isActive }) => (
              <>
                <SYSTEM_SETTINGS.icon
                  className={cn(
                    'shrink-0 w-[18px] h-[18px]',
                    isActive ? 'text-orange-500' : 'text-slate-400 group-hover:text-slate-600',
                  )}
                  strokeWidth={2.25}
                />
                {!collapsed && (
                  <span className="truncate whitespace-nowrap">
                    {SYSTEM_SETTINGS.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />

        {/* Main canvas — give non-dashboard pages breathing room around their
            floating cards so the island metaphor reads (matches Owner/Manager). */}
        <main
          className={cn(
            // `min-h-0` keeps the outlet inside the available viewport height.
            // Individual cashier panels then control their own scrolling.
            'flex-1 min-h-0',
            // The POS owns its own scroll regions (ticket queue and long order
            // contents). Keeping this canvas locked prevents the side inspector
            // from travelling off-screen with the page.
            isDashboard ? 'overflow-hidden' : 'overflow-y-auto p-4 sm:p-6 lg:p-8',
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
