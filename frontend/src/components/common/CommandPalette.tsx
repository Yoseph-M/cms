import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { Search, Users, UtensilsCrossed, ReceiptText, Zap } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/currency';

type Results = { staff: any[]; menuItems: any[]; orders: any[] };
const emptyResults: Results = { staff: [], menuItems: [], orders: [] };

export const CommandPalette: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(emptyResults);
  const role = user?.role === 'MANAGER' ? 'manager' : 'owner';

  useEffect(() => {
    if (user?.role !== 'OWNER' && user?.role !== 'MANAGER') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const openPalette = () => setOpen(true);
    window.addEventListener('cafeflow:open-command-palette', openPalette);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('cafeflow:open-command-palette', openPalette);
    };
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
  const pages = user.role === 'OWNER'
    ? [['Dashboard', '/owner'], ['Staff', '/owner/staff'], ['Menu', '/owner/menu'], ['Attendance', '/owner/attendance'], ['Payroll', '/owner/payroll'], ['Expenses', '/owner/expenses'], ['Finance', '/owner/finance'], ['Audit log', '/owner/audit'], ['Printers', '/owner/printers'], ['Settings', '/owner/settings']]
    : [['Dashboard', '/manager'], ['People', '/manager/people'], ['Menu', '/manager/menu'], ['Attendance', '/manager/attendance'], ['Payroll', '/manager/payroll'], ['Expenses', '/manager/expenses'], ['Settings', '/manager/settings']];

  return <Command.Dialog open={open} onOpenChange={setOpen} label="Global command palette" className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Command.Input value={query} onValueChange={setQuery} placeholder="Search staff, menu items, and orders…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
      </div>
      <Command.List className="max-h-[55vh] overflow-y-auto p-2 text-sm">
        <Command.Empty className="px-3 py-8 text-center text-muted-foreground">No matching commands or records.</Command.Empty>
        {!query && <>
          <Command.Group heading="Quick actions" className="px-2 py-2 text-xs text-muted-foreground">
            <PaletteItem label="Add Menu Item" icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/menu?action=add`)} />
            <PaletteItem label="Record Payroll Entry" icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/payroll?action=add`)} />
            <PaletteItem label="Add Expense" icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/expenses?action=add`)} />
            <PaletteItem label="Mark Attendance" icon={<Zap className="h-4 w-4" />} onSelect={() => go(`/${role}/attendance?action=mark`)} />
          </Command.Group>
          <Command.Group heading="Navigation" className="px-2 py-2 text-xs text-muted-foreground">
            {pages.map(([label, path]) => <PaletteItem key={path} label={label} onSelect={() => go(path)} />)}
          </Command.Group>
        </>}
        {query && <>
          <ResultGroup heading="Staff" items={results.staff} icon={<Users className="h-4 w-4" />} render={(item) => `${item.name} · ${item.role}`} onSelect={(item) => go(`/${role}/staff?highlight=${item.id}`)} />
          <ResultGroup heading="Menu items" items={results.menuItems} icon={<UtensilsCrossed className="h-4 w-4" />} render={(item) => `${item.name} · ${formatCurrency(item.price)}`} onSelect={(item) => go(`/${role}/menu?highlight=${item.id}`)} />
          <ResultGroup heading="Recent orders" items={results.orders} icon={<ReceiptText className="h-4 w-4" />} render={(item) => `Table ${item.tableNumber} · #${item.clientOrderId.slice(0, 8)} · ${item.status}`} onSelect={() => go(`/${role}`)} />
        </>}
      </Command.List>
    </div>
  </Command.Dialog>;
};

const PaletteItem: React.FC<{ label: string; icon?: React.ReactNode; onSelect: () => void }> = ({ label, icon, onSelect }) => <Command.Item value={label} onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 data-[selected=true]:bg-secondary data-[selected=true]:text-foreground"><span className="text-primary">{icon}</span>{label}</Command.Item>;
const ResultGroup: React.FC<{ heading: string; items: any[]; icon: React.ReactNode; render: (item: any) => string; onSelect: (item: any) => void }> = ({ heading, items, icon, render, onSelect }) => items.length ? <Command.Group heading={heading} className="px-2 py-2 text-xs text-muted-foreground">{items.map(item => <Command.Item key={item.id} value={render(item)} onSelect={() => onSelect(item)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-secondary"><span className="text-primary">{icon}</span>{render(item)}</Command.Item>)}</Command.Group> : null;
