import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Banknote, CircleDollarSign, History, Plus } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { useHeaderStore } from '../../store/headerStore';
import { useToastStore } from '../../store/toastStore';
import { formatCurrency } from '../../utils/currency';

type EntryType = 'OPENING_FLOAT' | 'CASH_IN' | 'CASH_OUT' | 'PETTY_CASH' | 'ADJUSTMENT';
type DrawerEntry = { id: string; type: EntryType; amount: number; description: string; reference: string; createdAt: string; createdBy: { name: string } };
type DrawerSnapshot = { businessDate: string; openingFloat: number; cashSales: number; cashIn: number; cashOut: number; pettyCash: number; adjustments: number; expectedBalance: number; entries: DrawerEntry[] };

const localDateString = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const TYPES: EntryType[] = ['OPENING_FLOAT', 'CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'ADJUSTMENT'];

export const CashDrawerPage: React.FC = () => {
  const { t } = useTranslation();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const addToast = useToastStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const [businessDate, setBusinessDate] = useState(localDateString());
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<EntryType>('CASH_OUT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    setPageTitle({ title: t('cashDrawer.title'), subtitle: t('cashDrawer.subtitle') });
    setShowDateRange(false);
    return () => { setPageTitle({ title: 'Overview', subtitle: '' }); setShowDateRange(false); };
  }, [setPageTitle, setShowDateRange, t]);

  const bounds = useMemo(() => {
    const start = new Date(`${businessDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [businessDate]);
  const snapshotQuery = useQuery({
    queryKey: ['cash-drawer', businessDate],
    queryFn: async () => (await axiosClient.get<DrawerSnapshot>('/cash-drawer', { params: { date: businessDate, ...bounds } })).data,
  });
  const snapshot = snapshotQuery.data;
  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(amount);
      if (!Number.isInteger(parsed) || (type === 'ADJUSTMENT' ? parsed === 0 : parsed < 0 || (type !== 'OPENING_FLOAT' && parsed === 0))) throw new Error(t('cashDrawer.invalidAmount'));
      return axiosClient.post('/cash-drawer', { businessDate, type, amount: parsed, description, reference, idempotencyKey: crypto.randomUUID() });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['cash-drawer', businessDate] }); setIsOpen(false); setAmount(''); setDescription(''); setReference(''); addToast({ type: 'success', title: t('cashDrawer.saved') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('cashDrawer.saveFailed'), message: error?.response?.data?.error || error?.message }),
  });

  const openEntry = (entryType: EntryType) => { setType(entryType); setAmount(entryType === 'OPENING_FLOAT' ? '0' : ''); setDescription(''); setReference(''); setIsOpen(true); };

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">{t('cashDrawer.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('cashDrawer.subtitle')}</p></div><label className="text-sm font-medium">{t('cashDrawer.businessDate')}<Input className="mt-1 h-10" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} /></label></header>

    <Card className="flex flex-wrap items-center justify-between gap-5 bg-primary p-5 text-primary-foreground sm:p-6"><div className="flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15"><Banknote className="h-6 w-6" /></span><div><p className="text-sm font-medium text-primary-foreground/75">{t('cashDrawer.expectedBalance')}</p><p className="mt-1 text-3xl font-bold tabular-nums">{formatCurrency(snapshot?.expectedBalance ?? 0)}</p></div></div><div className="text-sm"><p className="text-primary-foreground/75">{t('cashDrawer.cashSales')}</p><p className="mt-1 font-semibold tabular-nums">{formatCurrency(snapshot?.cashSales ?? 0)}</p></div></Card>

    <div className="grid gap-3 tablet-portrait:grid-cols-3 desktop:grid-cols-5">
      <Summary label={t('cashDrawer.openingFloat')} value={snapshot?.openingFloat ?? 0} />
      <Summary label={t('cashDrawer.cashIn')} value={snapshot?.cashIn ?? 0} positive />
      <Summary label={t('cashDrawer.cashOut')} value={snapshot?.cashOut ?? 0} />
      <Summary label={t('cashDrawer.pettyCash')} value={snapshot?.pettyCash ?? 0} />
      <Summary label={t('cashDrawer.adjustments')} value={snapshot?.adjustments ?? 0} positive />
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4 sm:px-5"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t('cashDrawer.drawerActivity')}</h2></div><div className="flex flex-wrap gap-2">{TYPES.map((entryType) => <Button key={entryType} size="sm" variant={entryType === 'CASH_IN' || entryType === 'OPENING_FLOAT' ? 'outline' : 'ghost'} onClick={() => openEntry(entryType)}><Plus className="mr-1 h-3.5 w-3.5" />{t(`cashDrawer.types.${entryType}`)}</Button>)}</div></div>
      {snapshotQuery.isLoading ? <p className="p-6 text-sm text-muted-foreground">{t('loading')}</p> : !snapshot?.entries.length ? <div className="p-10 text-center"><CircleDollarSign className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" /><p className="font-semibold">{t('cashDrawer.noEntries')}</p><p className="mt-1 text-sm text-muted-foreground">{t('cashDrawer.noEntriesHint')}</p></div> : <div className="divide-y divide-border/50">{snapshot.entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.type === 'CASH_IN' || entry.type === 'OPENING_FLOAT' ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>{entry.type === 'CASH_IN' || entry.type === 'OPENING_FLOAT' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="font-medium">{t(`cashDrawer.types.${entry.type}`)}{entry.description ? ` · ${entry.description}` : ''}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.createdBy.name}{entry.reference ? ` · ${entry.reference}` : ''} · {new Date(entry.createdAt).toLocaleTimeString()}</p></div><Badge variant={entry.type === 'CASH_IN' || entry.type === 'OPENING_FLOAT' || (entry.type === 'ADJUSTMENT' && entry.amount > 0) ? 'success' : 'neutral'}>{entry.type === 'CASH_OUT' || entry.type === 'PETTY_CASH' ? '−' : entry.type === 'CASH_IN' || entry.type === 'OPENING_FLOAT' || entry.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(entry.amount))}</Badge></div>)}</div>}
    </Card>

    <Sheet open={isOpen} onClose={() => setIsOpen(false)} title={t(`cashDrawer.types.${type}`)} description={t('cashDrawer.entryHint')} footer={<div className="flex w-full justify-end"><Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? t('buttons.working') : t('cashDrawer.saveEntry')}</Button></div>}>
      <div className="space-y-4"><label className="block text-sm font-medium">{t('cashDrawer.entryType')}<Select className="mt-1.5" value={type} onChange={(event) => setType(event.target.value as EntryType)}>{TYPES.map((entryType) => <option key={entryType} value={entryType}>{t(`cashDrawer.types.${entryType}`)}</option>)}</Select></label>
        <label className="block text-sm font-medium">{t('cashDrawer.amount')}<Input className="mt-1.5" type="number" min={type === 'ADJUSTMENT' ? undefined : 0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={type === 'ADJUSTMENT' ? '+50 or -20' : '0'} /></label>
        <label className="block text-sm font-medium">{t('cashDrawer.description')}<Input className="mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('cashDrawer.descriptionHint')} /></label>
        <label className="block text-sm font-medium">{t('cashDrawer.reference')}<Input className="mt-1.5" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t('cashDrawer.referenceHint')} /></label>
      </div>
    </Sheet>
  </div>;
};

function Summary({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-lg font-bold tabular-nums ${positive ? 'text-success' : ''}`}>{formatCurrency(value)}</p></Card>;
}

export default CashDrawerPage;
