import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
import { cn } from '../../lib/utils';

const OwnerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { openWizard } = useOnboardingStore();
  const { t } = useTranslation('owner');
  const location = useLocation();
  const isDashboard = location.pathname === '/owner' || location.pathname === '/owner/';

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
    <div
      className={cn(
        'min-h-screen flex flex-col text-slate-800',
        isDashboard ? 'bg-gradient-to-br from-[#ffad66] to-[#ffecd2] p-4 sm:p-8' : 'bg-[#fdfaf6]',
      )}
    >
      <OnboardingWizard />

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
          'flex flex-1 overflow-hidden transition-all',
          isDashboard ? 'bg-white rounded-[32px] shadow-2xl max-w-[1600px] mx-auto w-full' : ''
        )}
      >
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 80 : 260 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={cn(
            'shrink-0 flex flex-col z-10 sticky top-0 bg-white h-full border-r border-[#ece6dd]',
          )}
        >
          <div
            className={cn(
              'h-[88px] px-6 flex items-center',
              collapsed ? 'justify-center' : 'justify-start gap-3',
            )}
          >
            {/* Orange N logo from image */}
            <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-xl leading-none">
              N
            </div>
            {!collapsed && (
              <span className="font-display font-bold text-[22px] text-slate-900 tracking-tight">
                Nexus
              </span>
            )}
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
        </motion.aside>

        <main className={cn(
          "flex-1 overflow-y-auto",
          isDashboard ? "bg-[#fdfaf6] rounded-tl-3xl border-l border-t border-[#ece6dd]" : "bg-[#fdfaf6]"
        )}>
          {isDashboard ? (
            <Outlet />
          ) : (
            <div className="max-w-6xl mx-auto p-8">
              <Outlet />
            </div>
          )}
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
