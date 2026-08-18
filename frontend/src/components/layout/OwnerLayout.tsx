import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Header } from '../common/Header';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import {
  LayoutDashboard,
  UtensilsCrossed,
  DollarSign,
  Wallet,
  CalendarCheck,
  Receipt,
ShieldCheck,
  Settings,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';

const GROUP_ORDER: string[] = ['core', 'ops', 'people', 'system'];

import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSettingsStore } from '../../store/settingsStore';
import { cn } from '../../lib/utils';

const OwnerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { openWizard } = useOnboardingStore();
  const { t } = useTranslation('owner');
  const location = useLocation();
  const isDashboardPage = location.pathname === '/owner' || location.pathname === '/owner/';

  const { settings } = useSettingsStore();

  const systemAdminEnabled = settings['systemAdministrationEnabled'] !== 'false';

  const OWNER_NAV = [
    { to: '/owner', label: t('nav.overview', { defaultValue: 'Overview' }), icon: LayoutDashboard, end: true, group: 'core' },
    { to: '/owner/menu', label: t('nav.menu', { defaultValue: 'Menu Config' }), icon: UtensilsCrossed, group: 'ops' },
    { to: '/owner/finance', label: t('nav.finance', { defaultValue: 'Finance' }), icon: DollarSign, group: 'ops' },
    { to: '/owner/expenses', label: t('nav.expenses', { defaultValue: 'Expenses' }), icon: Wallet, group: 'ops' },
    { to: '/owner/settlements', label: t('nav.settlements', { defaultValue: 'Settlements' }), icon: Receipt, group: 'ops' },
    { to: '/owner/attendance', label: t('nav.attendance', { defaultValue: 'Attendance' }), icon: CalendarCheck, group: 'people' },
    { to: '/owner/payroll', label: t('nav.payroll', { defaultValue: 'Payroll' }), icon: DollarSign, group: 'people' },
    ...(systemAdminEnabled ? [
      { to: '/owner/admin', label: t('nav.systemAdmin', { defaultValue: 'System Admin' }), icon: ShieldCheck, group: 'system' },
    ] : []),
  ] as const;

  // "System Settings" is a sub-page of System Admin — give it its own
  // quick-access link pinned to the bottom of the sidebar.
  const SYSTEM_SETTINGS = systemAdminEnabled
    ? { to: '/owner/admin?tab=settings', label: t('nav.systemSettings', { defaultValue: 'System Settings' }), icon: Settings }
    : null;

  const GROUP_LABELS: Record<string, string> = {
    core: t('nav.groups.core', { defaultValue: 'Insights' }),
    people: t('nav.groups.people', { defaultValue: 'People & HR' }),
    ops: t('nav.groups.ops', { defaultValue: 'Operations' }),
    system: t('nav.groups.system', { defaultValue: 'System' }),
  };

  const completedQuery = useSystemSettingQuery('onboardingCompleted');
  const stepQuery = useSystemSettingQuery('onboardingStep');

  React.useEffect(() => {
    if (!completedQuery.isLoading && !stepQuery.isLoading) {
      if (completedQuery.data?.value !== 'true' && completedQuery.data?.value !== 'dismissed') {
        const step = parseInt(stepQuery.data?.value || '0', 10);
        openWizard(step);
      }
    }
  }, [completedQuery.isLoading, completedQuery.data, stepQuery.isLoading, stepQuery.data, openWizard]);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: OWNER_NAV.filter((n) => n.group === g),
  }));

  return (
    /*
     * Dual-pane layout:
     *  - Outer is exactly h-screen so the page itself never scrolls.
     *  - Sidebar is sticky + h-screen → "persistent navigation" /
     *    "full-height sidebar" that stays in view no matter what.
     *  - Right column hosts the header + a scrollable <main>, so the
     *    sidebar and the content area scroll independently.
     *
     * Canvas background is route-aware:
     *  - Dashboard keeps the warm cream + subtle glow (existing feel).
     *  - Every other page uses a cool, high-contrast slate canvas
     *    (#F1F5F9) so pure-white cards visibly pop as islands.
     */
    <div
      className={cn(
        'h-screen w-screen flex overflow-hidden text-slate-800 relative',
        isDashboardPage ? 'bg-[#fdfaf6]' : 'bg-[#F1F5F9]',
      )}
    >
      {/* Subtle radial glow — warm on dashboard, cool elsewhere */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          isDashboardPage
            ? 'bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,173,102,0.10),transparent_55%),radial-gradient(100%_70%_at_100%_100%,rgba(255,236,210,0.55),transparent_60%)]'
            : 'bg-[radial-gradient(120%_80%_at_0%_0%,rgba(148,163,184,0.18),transparent_55%),radial-gradient(100%_70%_at_100%_100%,rgba(203,213,225,0.35),transparent_60%)]',
        )}
      />

      <OnboardingWizard />

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
        {SYSTEM_SETTINGS && (
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
        )}
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header />

        {/* Main canvas — give non-dashboard pages breathing room around their
            floating cards so the island metaphor reads. */}
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            isDashboardPage ? '' : 'p-4 sm:p-6 lg:p-8',
          )}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export const OwnerLayout: React.FC = () => (
  <SidebarProvider>
    <OwnerLayoutInner />
  </SidebarProvider>
);
