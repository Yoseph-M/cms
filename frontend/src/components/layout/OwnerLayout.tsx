import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from '../common/Header';
import { SidebarProfile } from './SidebarProfile';
import { SidebarProvider, useSidebar } from '../../store/SidebarContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  DollarSign,
  Wallet,
  CalendarCheck,
  Printer,
  FileText,
  Settings,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';

const GROUP_ORDER: string[] = ['core', 'ops', 'people', 'system'];

import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';

const OwnerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { openWizard } = useOnboardingStore();
  const { t } = useTranslation('owner');

  const OWNER_NAV = [
    { to: '/owner', label: t('nav.overview', { defaultValue: 'Overview' }), icon: LayoutDashboard, end: true, group: 'core' },
    { to: '/owner/staff', label: t('nav.staff', { defaultValue: 'Staff Directory' }), icon: Users, group: 'people' },
    { to: '/owner/menu', label: t('nav.menu', { defaultValue: 'Menu Config' }), icon: UtensilsCrossed, group: 'ops' },
    { to: '/owner/finance', label: t('nav.finance', { defaultValue: 'Finance' }), icon: DollarSign, group: 'ops' },
    { to: '/owner/expenses', label: t('nav.expenses', { defaultValue: 'Expenses' }), icon: Wallet, group: 'ops' },
    { to: '/owner/attendance', label: t('nav.attendance', { defaultValue: 'Attendance' }), icon: CalendarCheck, group: 'people' },
    { to: '/owner/payroll', label: t('nav.payroll', { defaultValue: 'Payroll' }), icon: DollarSign, group: 'people' },
    { to: '/owner/audit', label: t('nav.audit', { defaultValue: 'Audit Logs' }), icon: FileText, group: 'system' },
    { to: '/owner/printers', label: t('nav.printers', { defaultValue: 'LAN Printers' }), icon: Printer, group: 'system' },
    { to: '/owner/settings', label: t('nav.settings', { defaultValue: 'Settings' }), icon: Settings, group: 'system' },
  ] as const;

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
    <div className="min-h-screen bg-app-gradient text-foreground flex flex-col">
      <OnboardingWizard />
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
                  {t('nav.consoleSubtitle', { defaultValue: 'Owner Console' })}
                </p>
              </div>
            )}
            <Tooltip label={collapsed ? t('nav.openSidebar', { defaultValue: 'Open sidebar' }) : t('nav.closeSidebar', { defaultValue: 'Close sidebar' })} side="right">
              <button
                onClick={toggle}
                aria-label={collapsed ? t('nav.openSidebar', { defaultValue: 'Open sidebar' }) : t('nav.closeSidebar', { defaultValue: 'Close sidebar' })}
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition-colors shrink-0"
              >
                <PanelLeftRounded className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6 overflow-x-hidden">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                {!collapsed ? (
                  <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.14em] whitespace-nowrap">
                    {GROUP_LABELS[group]}
                  </p>
                ) : (
                  <div className="h-px bg-border my-4 mx-2" />
                )}

                <div className="space-y-1">
                  {items.map((link) => {
                    const Icon = link.icon;
                    const navLink = (
                      <NavLink
                        to={link.to}
                        end={'end' in link ? link.end : false}
                        className={({ isActive }) =>
                          `group relative flex items-center ${collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'} rounded-lg text-sm font-medium transition-colors ${isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId="owner-nav-active"
                                className="absolute inset-0 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border border-primary/25 rounded-lg shadow-brand"
                                initial={false}
                                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                              />
                            )}
                            {isActive && (
                              <motion.span
                                layoutId="owner-nav-pill"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-brand-gradient"
                                initial={false}
                                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                              />
                            )}
                            <Icon
                              className={`relative w-4 h-4 shrink-0 transition-colors ${isActive
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
                </div>
              </div>
            ))}
          </nav>

          <SidebarProfile />
        </motion.aside>

        <main className="flex-1 bg-background overflow-y-auto h-[calc(100vh-3rem)]">
          <div className="max-w-6xl mx-auto p-8">
            <Outlet />
          </div>
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

