import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, ChevronRight, FileText, Printer, ShieldCheck, Users, XCircle } from 'lucide-react';
import { OwnerStaff } from './OwnerStaff';
import { OwnerAudit } from './OwnerAudit';
import { OwnerLoginHistory } from './OwnerLoginHistory';
import { OwnerPrinters } from './OwnerPrinters';
import { OwnerPrintAgents } from './OwnerPrintAgents';
import { useSettingsStore } from '../../store/settingsStore';
import { cn } from '../../lib/utils';

type TabId = 'staff' | 'audit' | 'logins' | 'printers';

const TAB_IDS: readonly TabId[] = ['staff', 'audit', 'logins', 'printers'] as const;

export const SystemAdminPage: React.FC = () => {
  const { t } = useTranslation('owner');
  const { settings } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabFromUrl && TAB_IDS.includes(tabFromUrl) ? tabFromUrl : 'staff',
  );

  const systemAdminEnabled = settings['systemAdministrationEnabled'] !== 'false';

  useEffect(() => {
    if (searchParams.get('tab') !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const tabs = [
    { id: 'staff' as const, label: 'Staff', description: 'Roles & access', icon: Users },
    { id: 'audit' as const, label: 'Audit trail', description: 'System activity', icon: FileText },
    { id: 'logins' as const, label: 'Login history', description: 'Account security', icon: ShieldCheck },
    { id: 'printers' as const, label: 'Printing', description: 'Devices & agents', icon: Printer },
  ] as const;

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab)!;

  // Show access denied message if feature is disabled
  if (!systemAdminEnabled) {
    return (
      <div className="max-w-7xl mx-auto animate-fade-in">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="rounded-2xl bg-white border border-slate-200/70 px-8 py-10 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10)] text-center max-w-md">
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">System Administration Disabled</h2>
            <p className="text-muted-foreground">
              The System Administration area is currently disabled. Enable it from System Settings to access staff management, audit logs, and printer configuration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    /*
     * Island architecture — three discrete cards with visible gaps:
     *  1. Header island  (title + subtitle)
     *  2. Tab bar island (the tab strip itself)
     *  3. Content island (the active tab's panel)
     * No more single monolithic box.
     */
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header className="relative overflow-hidden rounded-2xl bg-slate-950 px-6 py-6 text-white shadow-[0_16px_40px_-22px_rgba(15,23,42,0.75)] sm:px-7 sm:py-7">
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">System administration</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-300">Manage access, review accountability, and keep the restaurant’s connected hardware dependable.</p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20 sm:self-auto">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Administration enabled
          </div>
        </div>
      </header>

      <section aria-label="Administration sections" className="rounded-2xl border border-border/50 bg-card p-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.22)]">
        <div role="tablist" aria-label="Administration sections" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={isActive}
                aria-controls={`admin-panel-${tab.id}`}
                className={cn(
                  'group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-brand'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                )}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-white/15' : 'bg-secondary text-primary')}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{tab.label}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', isActive ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{tab.description}</span>
                </span>
                <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', isActive ? 'translate-x-0.5 text-primary-foreground/80' : 'opacity-0 group-hover:opacity-70')} />
              </button>
            );
          })}
        </div>
      </section>

      <section id={`admin-panel-${activeTab}`} role="tabpanel" aria-label={activeTabMeta.label} className="rounded-2xl border border-border/50 bg-card p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span>
          <div>
            <h2 className="font-semibold text-foreground">{activeTabMeta.label}</h2>
            <p className="text-xs text-muted-foreground">{activeTabMeta.description}</p>
          </div>
        </div>
        {activeTab === 'staff' && <OwnerStaff />}
        {activeTab === 'audit' && <OwnerAudit />}
        {activeTab === 'logins' && <OwnerLoginHistory />}
        {activeTab === 'printers' && (
          <>
            <OwnerPrinters />
            <OwnerPrintAgents />
          </>
        )}
      </section>
    </div>
  );
};
