import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Header } from '../common/Header';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  DollarSign,
  Wallet,
  CalendarCheck,
  Printer,
  FileText,
  ShieldCheck,
  Server,
} from 'lucide-react';

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
] as const;

const GROUP_LABELS: Record<string, string> = {
  core: 'Insights',
  people: 'People & HR',
  ops: 'Operations',
  system: 'System',
};

const GROUP_ORDER: string[] = ['core', 'ops', 'people', 'system'];

export const OwnerLayout: React.FC = () => {
  const { user } = useAuthStore();

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: OWNER_NAV.filter((n) => n.group === g),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col">
          <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <p className="px-3 mb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.14em]">
                  {GROUP_LABELS[group]}
                </p>
                <div className="space-y-0.5">
                  {items.map((link) => {
                    const Icon = link.icon;
                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={'end' in link ? link.end : false}
                        className={({ isActive }) =>
                          `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
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
                              className={`relative w-4 h-4 shrink-0 transition-colors ${
                                isActive
                                  ? 'text-primary'
                                  : 'text-muted-foreground group-hover:text-foreground'
                              }`}
                            />
                            <span className="relative truncate">{link.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <div className="rounded-xl bg-secondary/40 border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-primary" />
                <p className="text-[11px] font-semibold text-foreground">System Status</p>
              </div>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>CMS</span>
                  <span className="font-mono">v1.0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Signed in as</span>
                  <span className="font-medium text-foreground truncate ml-2 max-w-[7rem]">
                    {user?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Role</span>
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    <ShieldCheck className="w-3 h-3" />
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-background overflow-y-auto">
          <div className="max-w-6xl mx-auto p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
