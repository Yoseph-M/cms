import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
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

const OWNER_NAV = [
  { to: '/owner', label: 'Overview', icon: LayoutDashboard, end: true, group: 'core' },
  { to: '/owner/staff', label: 'Staff Directory', icon: Users, group: 'people' },
  { to: '/owner/menu', label: 'Menu Config', icon: UtensilsCrossed, group: 'ops' },
  { to: '/owner/finance', label: 'Finance', icon: DollarSign, group: 'ops' },
  { to: '/owner/expenses', label: 'Expenses', icon: Wallet, group: 'ops' },
  { to: '/owner/attendance', label: 'Attendance', icon: CalendarCheck, group: 'people' },
  { to: '/owner/payroll', label: 'Payroll', icon: DollarSign, group: 'people' },
  { to: '/owner/audit', label: 'Audit Logs', icon: FileText, group: 'system' },
  { to: '/owner/printers', label: 'LAN Printers', icon: Printer, group: 'system' },
  { to: '/owner/settings', label: 'Settings', icon: Settings, group: 'system' },
] as const;

const GROUP_LABELS: Record<string, string> = {
  core: 'Insights',
  people: 'People & HR',
  ops: 'Operations',
  system: 'System',
};

const GROUP_ORDER: string[] = ['core', 'ops', 'people', 'system'];

import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';

const OwnerLayoutInner: React.FC = () => {
  const { collapsed, toggle } = useSidebar();
  const { openWizard } = useOnboardingStore();

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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <OnboardingWizard />
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 72 : 256 }}
          className="shrink-0 border-r border-border bg-sidebar flex flex-col z-10 sticky top-0 h-[calc(100vh-3rem)]"
        >
          <div className={`px-4 py-4 border-b border-border flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-base font-display font-semibold text-foreground leading-tight">
                  CMS
                </h1>
                <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
                  Owner Console
                </p>
              </div>
            )}
            <Tooltip label={collapsed ? 'Open sidebar' : 'Close sidebar'} side="right">
              <button
                onClick={toggle}
                aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
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
                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={'end' in link ? link.end : false}
                        title={collapsed ? link.label : undefined}
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
                                className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg"
                                initial={false}
                                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                              />
                            )}
                            {isActive && (
                              <motion.span
                                layoutId="owner-nav-pill"
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary"
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

