import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Users, UtensilsCrossed, ReceiptText, Zap, Wallet, Coins, CreditCard, Printer } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatCurrency } from '../../utils/currency';

type Results = {
  staff: any[];
  menuItems: any[];
  orders: any[];
  expenses: any[];
  payroll: any[];
  settlements: any[];
  printers: any[];
};
const emptyResults: Results = {
  staff: [],
  menuItems: [],
  orders: [],
  expenses: [],
  payroll: [],
  settlements: [],
  printers: [],
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (month?: number, year?: number) =>
  `${MONTH_SHORT[(Number(month) || 1) - 1] ?? ''} ${year ?? ''}`.trim();

export const CommandPalette: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(emptyResults);
  const role = user?.role === 'MANAGER' ? 'manager' : 'owner';
  
  const systemAdminEnabled = settings['systemAdministrationEnabled'] !== 'false';

  useEffect(() => {
    if (user?.role !== 'OWNER' && user?.role !== 'MANAGER') return;
    const openPalette = (event: Event) => {
      const detail = (event as CustomEvent<{ q?: string }>).detail;
      if (detail?.q) setQuery(detail.q);
      setOpen(true);
    };
    window.addEventListener('cafeflow:open-command-palette', openPalette);
    return () => window.removeEventListener('cafeflow:open-command-palette', openPalette);
  }, [user?.role]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(emptyResults);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await axiosClient.get(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(response.data);
      } catch {
        setResults(emptyResults);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (user?.role !== 'OWNER' && user?.role !== 'MANAGER') return null;
  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path); };
  
  // Build navigation pages array, conditionally including Settings for OWNER
  const ownerPages: [string, string][] = [
    ['palette.dashboard', '/owner'],
    ['palette.staff', '/owner/admin?tab=staff'],
    ['palette.menu', '/owner/menu'],
    ['palette.attendance', '/owner/attendance'],
    ['palette.payroll', '/owner/payroll'],
    ['palette.expenses', '/owner/expenses'],
    ['palette.finance', '/owner/finance'],
    ['palette.auditLogs', '/owner/admin?tab=audit'],
    ['palette.printers', '/owner/admin?tab=printers'],
    ['palette.backup', '/owner/admin?tab=backup'],
    ['palette.settings', '/owner/settings'],
  ];

  const pages = user.role === 'OWNER'
    ? ownerPages
    : [['palette.dashboard', '/manager'], ['palette.staff', '/manager/staff'], ['palette.menu', '/manager/menu'], ['palette.attendance', '/manager/attendance'], ['palette.payroll', '/manager/payroll'], ['palette.endOfDay', '/manager/reconciliation'], ['palette.expenses', '/manager/expenses'], ['palette.settings', '/manager/settings']];

  return <Command.Dialog open={open} onOpenChange={setOpen} label={t('palette.dialogLabel')} className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Command.Input value={query} onValueChange={setQuery} placeholder={t('palette.searchPlaceholder')} className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
      </div>
      <Command.List className="max-h-[55vh] overflow-y-auto p-2 text-sm">
        <Command.Empty className="px-3 py-8 text-center text-muted-foreground">{t('palette.noMatches')}</Command.Empty>
        {!query && <>
          <Command.Group heading={t('palette.quickActions')} className="px-2 py-2 text-xs text-muted-foreground">
            <PaletteItem label={t('palette.addMenuItem')} icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/menu?action=add`)} />
            <PaletteItem label={t('palette.recordPayroll')} icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/payroll?action=add`)} />
            <PaletteItem label={t('palette.addExpense')} icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/expenses?action=add`)} />
            <PaletteItem label={t('palette.markAttendance')} icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/attendance?action=mark`)} />
          </Command.Group>
          <Command.Group heading={t('palette.navigation')} className="px-2 py-2 text-xs text-muted-foreground">
            {pages.map(([labelKey, path]) => <PaletteItem key={path} label={t(labelKey)} onSelect={() => go(path)} />)}
          </Command.Group>
        </>}
        {query && <>
          <ResultGroup heading={t('palette.staff')} items={results.staff} icon={<Users className="h-4 w-4" />} render={(item) => `${item.name} · ${item.role}`} onSelect={(item) => go(role === 'owner' ? `/owner/admin?tab=staff&highlight=${item.id}` : `/manager/staff?highlight=${item.id}`)} />
          <ResultGroup heading={t('palette.menuItems')} items={results.menuItems} icon={<UtensilsCrossed className="h-4 w-4" />} render={(item) => `${item.name} · ${formatCurrency(item.price)}`} onSelect={(item) => go(`/${role}/menu?highlight=${item.id}`)} />
          <ResultGroup heading={t('palette.recentOrders')} items={results.orders} icon={<ReceiptText className="h-4 w-4" />} render={(item) => `${t('cashier:queue.table')} ${item.tableNumber} · #${item.clientOrderId.slice(0, 8)} · ${item.status}`} onSelect={() => go(`/${role}`)} />
          <ResultGroup heading={t('palette.expenses')} items={results.expenses ?? []} icon={<Wallet className="h-4 w-4" />} render={(item) => `${item.description} · ${formatCurrency(item.amount)}`} onSelect={() => go(`/${role}/expenses`)} />
          <ResultGroup heading={t('palette.payroll')} items={results.payroll ?? []} icon={<Coins className="h-4 w-4" />} render={(item) => `${item.user?.name ?? t('palette.payroll')} · ${monthLabel(item.periodMonth, item.periodYear)} · ${formatCurrency(item.paidAmount)}`} onSelect={() => go(`/${role}/payroll`)} />
          <ResultGroup heading={t('palette.settlements')} items={results.settlements ?? []} icon={<CreditCard className="h-4 w-4" />} render={(item) => `${t('cashier:queue.table')} ${item.order?.tableNumber ?? '—'} · ${item.method} · ${formatCurrency(item.amountMinor)}`} onSelect={() => go(`/${role}/settlements`)} />
          <ResultGroup heading={t('palette.printers')} items={results.printers ?? []} icon={<Printer className="h-4 w-4" />} render={(item) => `${item.station} · ${item.transport}`} onSelect={() => go('/owner/admin?tab=printers')} />
        </>}
      </Command.List>
    </div>
  </Command.Dialog>;
};

const PaletteItem: React.FC<{ label: string; icon?: React.ReactNode; onSelect: () => void }> = ({ label, icon, onSelect }) => <Command.Item value={label} onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 data-[selected=true]:bg-secondary data-[selected=true]:text-foreground"><span className="text-primary">{icon}</span>{label}</Command.Item>;
const ResultGroup: React.FC<{ heading: string; items: any[]; icon: React.ReactNode; render: (item: any) => string; onSelect: (item: any) => void }> = ({ heading, items, icon, render, onSelect }) => items.length ? <Command.Group heading={heading} className="px-2 py-2 text-xs text-muted-foreground">{items.map(item => <Command.Item key={item.id} value={render(item)} onSelect={() => onSelect(item)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-secondary"><span className="text-primary">{icon}</span>{render(item)}</Command.Item>)}</Command.Group> : null;
