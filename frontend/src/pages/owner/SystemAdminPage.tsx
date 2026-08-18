import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users, FileText, Printer, Settings as SettingsIcon } from 'lucide-react';
import { OwnerStaff } from './OwnerStaff';
import { OwnerAudit } from './OwnerAudit';
import { OwnerPrinters } from './OwnerPrinters';
import { OwnerPrintAgents } from './OwnerPrintAgents';
import { OwnerSettings } from '../settings/OwnerSettings';
import { cn } from '../../lib/utils';

type TabId = 'staff' | 'audit' | 'printers' | 'settings';

const TAB_IDS: readonly TabId[] = ['staff', 'audit', 'printers', 'settings'] as const;

export const SystemAdminPage: React.FC = () => {
  const { t } = useTranslation('owner');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabFromUrl && TAB_IDS.includes(tabFromUrl) ? tabFromUrl : 'staff',
  );

  // Keep the URL in sync with the active tab so the bottom-of-sidebar
  // "System Settings" link (`/owner/admin?tab=settings`) can deep-link in.
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
    { id: 'printers' as const, label: 'LAN Printers', icon: Printer },
    { id: 'settings' as const, label: 'System Settings', icon: SettingsIcon },
  ] as const;

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
        {activeTab === 'printers' && (
          <>
            <OwnerPrinters />
            <OwnerPrintAgents />
          </>
        )}
        {activeTab === 'settings' && <OwnerSettings />}
      </div>
    </div>
  );
};
