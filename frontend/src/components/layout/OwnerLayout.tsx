import React, { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  ClipboardCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { PanelLeftRounded } from '../ui/PanelLeftRounded';
import { PageSkeleton } from '../common/PageSkeleton';

const GROUP_ORDER: string[] = ['core', 'ops', 'people', 'system', 'manager'];

import { OnboardingWizard } from '../onboarding/OnboardingWizard';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useSettingsStore } from '../../store/settingsStore';
import { cn } from '../../lib/utils';

const OwnerLayoutInner: React.FC = () => {
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();
  const { openWizard } = useOnboardingStore();
  const { t } = useTranslation('owner');
  const location = useLocation();
  const isDashboardPage =
    location.pathname === '/owner' ||
    location.pathname === '/owner/';
  const sidebarCollapsed = collapsed && !mobileOpen;

  const { settings } = useSettingsStore();

  const systemAdminEnabled = settings['systemAdministrationEnabled'] !== 'false';

  /**
   * Owner–manager consolidation. When the owner disables the Manager
   * Dashboard feature, the owner absorbs only the manager tools they don't
   * already have. Staff, Payroll, Expenses, and Printers exist on both sides
   * (the owner's own pages hit the same backend endpoints), so the sole
   * manager-exclusive tool is **End of Day** — the only thing that moves
   * into the owner's sidebar, under "Manager Tools".
   */
  const managerConsolidated = settings['managerDashboardEnabled'] === 'false';

  const MANAGER_TOOLS_NAV = managerConsolidated
    ? [
      {
        to: '/owner/manager-end-of-day',
        label: t('nav.endOfDay', { defaultValue: 'End of Day' }),
        icon: ClipboardCheck,
        group: 'manager',
      },
    ]
    : [];

  const OWNER_NAV = [
    { to: '/owner', label: t('nav.overview', { defaultValue: 'Overview' }), icon: LayoutDashboard, end: true, group: 'core' },
    // `end` keeps the Menu Lists row from lighting up while you are on its
    // Item Sales sibling (/owner/menu/sales), which has its own nav row.
    { to: '/owner/menu', label: t('nav.menu', { defaultValue: 'Menu Lists' }), icon: UtensilsCrossed, group: 'ops', end: true },
    { to: '/owner/menu/sales', label: t('nav.itemSales', { defaultValue: 'Item Sales' }), icon: TrendingUp, group: 'ops' },
    { to: '/owner/finance', label: t('nav.finance', { defaultValue: 'Finance' }), icon: DollarSign, group: 'ops' },
    { to: '/owner/expenses', label: t('nav.expenses', { defaultValue: 'Expenses' }), icon: Wallet, group: 'ops' },
    { to: '/owner/settlements', label: t('nav.settlements', { defaultValue: 'Settlements' }), icon: Receipt, group: 'ops' },
    { to: '/owner/attendance', label: t('nav.attendance', { defaultValue: 'Attendance' }), icon: CalendarCheck, group: 'people' },
    { to: '/owner/payroll', label: t('nav.payroll', { defaultValue: 'Payroll' }), icon: DollarSign, group: 'people' },
    ...(systemAdminEnabled ? [
      { to: '/owner/admin', label: t('nav.systemAdmin', { defaultValue: 'System Admin' }), icon: ShieldCheck, group: 'system' },
    ] : []),
  ] as const;

  const SYSTEM_SETTINGS = {
    to: '/owner/settings',
    label: t('nav.systemSettings', { defaultValue: 'System Settings' }),
    icon: Settings
  };

  const GROUP_LABELS: Record<string, string> = {
    core: t('nav.groups.core', { defaultValue: 'Insights' }),
    people: t('nav.groups.people', { defaultValue: 'People & HR' }),
    ops: t('nav.groups.ops', { defaultValue: 'Operations' }),
    system: t('nav.groups.system', { defaultValue: 'System' }),
    manager: t('nav.groups.manager', { defaultValue: 'Manager Tools' }),
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
    // Manager Tools is a separate conditional list — merged here so the
    // rendered nav contains both the owner links and (when consolidated)
    // the absorbed manager links.
    items: [...OWNER_NAV, ...MANAGER_TOOLS_NAV].filter((n) => n.group === g),
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
        'h-screen max-[767px]:h-[100dvh] w-screen flex overflow-hidden text-foreground relative',
        isDashboardPage ? 'bg-[hsl(var(--canvas-warm))]' : 'bg-[hsl(var(--canvas-cool))]',
      )}
    >
      {/* Subtle radial glow — warm on dashboard, cool elsewhere */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0',
          isDashboardPage
            ? 'bg-[radial-gradient(120%_80%_at_0%_0%,hsl(var(--dash-accent-400)/0.10),transparent_55%),radial-gradient(100%_70%_at_100%_100%,hsl(var(--dash-accent-200)/0.35),transparent_60%)]'
            : 'bg-[radial-gradient(120%_80%_at_0%_0%,hsl(var(--primary)/0.08),transparent_55%),radial-gradient(100%_70%_at_100%_100%,hsl(var(--accent)/0.10),transparent_60%)]',
        )}
      />

      <OnboardingWizard />

      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          className="hidden max-[767px]:block fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        style={{ width: sidebarCollapsed ? 80 : 260 }}
        className={cn(
          'shrink-0 h-screen max-[767px]:h-[100dvh] flex flex-col z-50 transition-transform duration-300',
          'bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--shell-border))]',
          'sticky top-0 max-[767px]:fixed max-[767px]:inset-y-0 max-[767px]:left-0',
          mobileOpen ? 'max-[767px]:translate-x-0' : 'max-[767px]:-translate-x-full'
        )}
      >
        <div
          className={cn(
            'h-[72px] sm:h-[88px] px-6 max-[767px]:px-5 flex items-center shrink-0',
            sidebarCollapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!sidebarCollapsed && (
            <div className="flex items-center flex-1 mr-auto max-[767px]:hidden overflow-hidden">
              <span className="font-bold text-xl tracking-tight truncate text-foreground">
                MELEኛ<span className="text-primary">POS</span>
              </span>
            </div>
          )}
          <span className="hidden max-[767px]:block mr-auto text-sm font-semibold tracking-tight text-foreground">
            {t('common:chrome.navigation')}
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="hidden max-[767px]:inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t('common:a11y.closeSidebar')}
          >
            <X className="h-5 w-5" />
          </button>
          <Tooltip label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right" className="max-[767px]:hidden">
            <button
              onClick={toggle}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="group relative hover:bg-secondary text-muted-foreground transition-colors flex items-center justify-center w-9 h-9 shrink-0 rounded-xl overflow-hidden"
            >
              {sidebarCollapsed ? (
                <>
                  <img src="/logo.png" alt="Logo" className="absolute inset-0 w-full h-full object-cover scale-110 transition-opacity duration-200 group-hover:opacity-0" />
                  <PanelLeftRounded className="w-5 h-5 absolute opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </>
              ) : (
                <PanelLeftRounded className="w-5 h-5" />
              )}
            </button>
          </Tooltip>
        </div>

        <nav className="flex-1 px-4 py-6 max-[767px]:py-5 overflow-y-auto space-y-6 max-[767px]:space-y-5 overflow-x-hidden">
          {grouped.map(({ group, items }) =>
            // An empty group (e.g. Manager Tools when the manager dashboard is
            // enabled) renders nothing at all — no header, no gap.
            items.length === 0 ? null : (
              <div key={group}>
                {!sidebarCollapsed && GROUP_LABELS[group] !== 'Insights' && (
                  <p className="px-4 mb-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {GROUP_LABELS[group]}
                  </p>
                )}

                <div className="space-y-1.5">
                  {items.map((link) => {
                    const Icon = link.icon;
                    const navLink = (
                      <NavLink
                        to={link.to}
                        onClick={() => setMobileOpen(false)}
                        end={'end' in link ? link.end : false} className={({ isActive }) =>
                          `group relative flex items-center ${sidebarCollapsed ? 'justify-center w-12 h-12 mx-auto' : 'gap-4 px-4 h-12'} rounded-2xl text-[15px] font-medium transition-colors ${isActive
                            ? 'text-[hsl(201_96%_40%)] bg-[hsl(201_96%_50%/0.12)]'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className={`relative w-5 h-5 shrink-0 transition-colors ${isActive
                                ? 'text-[hsl(201_96%_45%)]'
                                : 'text-muted-foreground/70 group-hover:text-muted-foreground'
                                }`}
                              strokeWidth={2.5}
                            />
                            {!sidebarCollapsed && (
                              <span className="relative truncate whitespace-nowrap">
                                {link.label}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                    return sidebarCollapsed ? (
                      <Tooltip key={link.to} label={link.label} side="right" className="block w-full">
                        {navLink}
                      </Tooltip>
                    ) : (
                      <React.Fragment key={link.to}>{navLink}</React.Fragment>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </nav>

        {/* System Settings — pinned to the bottom of the sidebar */}
        <div
          className={cn(
            'shrink-0 border-t border-[hsl(var(--shell-border))] p-3',
            sidebarCollapsed ? 'flex justify-center' : '',
          )}
        >
          <NavLink
            to={SYSTEM_SETTINGS.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center rounded-2xl text-[14px] font-medium transition-colors',
                sidebarCollapsed
                  ? 'justify-center w-12 h-12 mx-auto'
                  : 'gap-3 px-4 h-11 w-full',
                isActive
                  ? 'text-[hsl(201_96%_40%)] bg-[hsl(201_96%_50%/0.12)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70',
              )
            }
          >
            {({ isActive }) => (
              <>
                <SYSTEM_SETTINGS.icon
                  className={cn(
                    'shrink-0 w-[18px] h-[18px]',
                    isActive ? 'text-[hsl(201_96%_45%)]' : 'text-muted-foreground/70 group-hover:text-muted-foreground',
                  )}
                  strokeWidth={2.25}
                />
                {!sidebarCollapsed && (
                  <span className="truncate whitespace-nowrap">
                    {SYSTEM_SETTINGS.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen max-[767px]:h-[100dvh] overflow-hidden">
        <Header />

        {/* Main canvas — give non-dashboard pages breathing room around their
            floating cards so the island metaphor reads. */}
        <main
          className={cn(
            'flex-1 overflow-y-auto',
            isDashboardPage ? '' : 'p-4 sm:p-6 lg:p-8',
          )}
        >
          {/* Owner routes are React.lazy() — wrap the Outlet in a Suspense
              boundary so a fresh chunk load (e.g. navigating to /owner/finance
              for the first time) shows the page skeleton instead of replacing
              the whole UI with a loading indicator. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
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
