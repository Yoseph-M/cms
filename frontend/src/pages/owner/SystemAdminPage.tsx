import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users, FileText, Printer, XCircle } from 'lucide-react';
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
    { id: 'staff' as const, label: 'Staff Management', icon: Users },
    { id: 'audit' as const, label: 'Audit Logs', icon: FileText },
    { id: 'logins' as const, label: 'Login History', icon: ShieldCheck },
    { id: 'printers' as const, label: 'LAN Printers', icon: Printer },
  ] as const;

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
      {/* Island 1 — Header */}
      <header className="rounded-2xl bg-white border border-slate-200/70 px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)]">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          System Administration
        </h2>
        <p className="text-muted-foreground mt-1">
          Owner-exclusive area for managing core system configurations, staff roles, and audit trails.
        </p>
      </header>

      {/* Island 2 — Tabs */}
      <div className="rounded-2xl bg-white border border-slate-200/70 px-3 sm:px-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)]">
        <div className="flex items-center gap-1 border-b border-slate-200 pb-px overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-slate-200'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Island 3 — Content (the active tab's panel) */}
      <div className="rounded-2xl bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-14px_rgba(15,23,42,0.10),0_4px_12px_-8px_rgba(249,115,22,0.08)] p-4 sm:p-6">
        {activeTab === 'staff' && <OwnerStaff />}
        {activeTab === 'audit' && <OwnerAudit />}
        {activeTab === 'logins' && <OwnerLoginHistory />}
        {activeTab === 'printers' && (
          <>
            <OwnerPrinters />
            <OwnerPrintAgents />
          </>
        )}
      </div>
    </div>
  );
};
