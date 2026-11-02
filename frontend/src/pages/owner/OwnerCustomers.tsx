import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, UsersRound } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useHeaderStore } from '../../store/headerStore';
import { useToastStore } from '../../store/toastStore';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { formatCurrency } from '../../utils/currency';

type Customer = { id: string; name: string; phone: string; email: string; notes: string; discountPercent: number };
type CustomerOrder = { id: string; tableNumber: string; status: string; totalAmount: number; createdAt: string; items: Array<{ name: string; quantity: number }> };
type CustomerDetail = Customer & { orders: CustomerOrder[] };
const EMPTY_FORM = { name: '', phone: '', email: '', notes: '', discountPercent: '0' };

export const OwnerCustomers: React.FC = () => {
  const { t } = useTranslation();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    setPageTitle({ title: t('customers.title'), subtitle: t('customers.subtitle') });
    setShowDateRange(false);
    return () => { setPageTitle({ title: 'Overview', subtitle: '' }); setShowDateRange(false); };
  }, [setPageTitle, setShowDateRange, t]);

  const listQuery = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => (await axiosClient.get('/customers', { params: { search: search || undefined, limit: 100 } })).data.data as Customer[],
  });
  const detailQuery = useQuery({
    queryKey: ['customer-detail', selectedId],
    queryFn: async () => (await axiosClient.get<CustomerDetail>(`/customers/${selectedId}`)).data,
    enabled: Boolean(selectedId),
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim(), discountPercent: Number(form.discountPercent) };
      return editing
        ? axiosClient.patch(`/customers/${editing.id}`, payload)
        : axiosClient.post('/customers', payload);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-detail', response.data.id] });
      setSelectedId(response.data.id); setIsOpen(false);
      addToast({ type: 'success', title: t(editing ? 'customers.updated' : 'customers.created') });
    },
    onError: () => addToast({ type: 'error', title: t('customers.saveFailed') }),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setIsOpen(true); };
  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({ name: customer.name, phone: customer.phone, email: customer.email, notes: customer.notes, discountPercent: String(customer.discountPercent) });
    setIsOpen(true);
  };
  const customerOrders = Array.isArray(detailQuery.data?.orders) ? detailQuery.data.orders : [];

  return <div className="grid gap-5 desktop:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-border/60 p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{t('customers.directory')}</h2><Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />{t('customers.add')}</Button></div>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('customers.search')} leftIcon={<Search className="h-4 w-4" />} />
      </div>
      <div className="max-h-[70vh] divide-y divide-border/50 overflow-y-auto">
        {(listQuery.data ?? []).map((customer) => <button key={customer.id} type="button" onClick={() => setSelectedId(customer.id)} className={`block w-full p-4 text-left hover:bg-secondary/50 ${selectedId === customer.id ? 'bg-primary/5' : ''}`}>
          <span className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{customer.name}</span>{customer.discountPercent > 0 && <Badge variant="default">{customer.discountPercent}%</Badge>}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{customer.phone || customer.email || t('customers.noContact')}</span>
        </button>)}
        {!listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{t('customers.empty')}</p>}
      </div>
    </Card>

    <Card className="min-h-[360px] overflow-hidden">
      {detailQuery.data ? <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-5">
          <div><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">{detailQuery.data.name}</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">{[detailQuery.data.phone, detailQuery.data.email].filter(Boolean).join(' · ') || t('customers.noContact')}</p>
            {detailQuery.data.discountPercent > 0 && <p className="mt-2 text-sm font-semibold text-primary">{t('customers.discount', { percent: detailQuery.data.discountPercent })}</p>}
            {detailQuery.data.notes && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{detailQuery.data.notes}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => openEdit(detailQuery.data!)}>{t('customers.edit')}</Button>
        </div>
        <div className="p-5">
          <h3 className="mb-3 font-semibold">{t('customers.purchaseHistory')}</h3>
          {customerOrders.length ? <div className="divide-y divide-border/50">
            {customerOrders.map((order) => <div key={order.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="font-medium">{t('customers.tableOrder', { table: order.tableNumber })}</p><p className="truncate text-xs text-muted-foreground">{(Array.isArray(order.items) ? order.items : []).map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p></div>
              <Badge variant={order.status === 'CANCELLED' ? 'neutral' : 'success'}>{t(`status.${order.status.toLowerCase()}`, { defaultValue: order.status })}</Badge>
              <time className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</time>
              <span className="font-semibold tabular-nums">{formatCurrency(order.totalAmount)}</span>
            </div>)}
          </div> : <p className="py-8 text-center text-sm text-muted-foreground">{t('customers.noPurchases')}</p>}
        </div>
      </> : <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-8 text-center text-muted-foreground"><UsersRound className="mb-3 h-9 w-9 opacity-40" /><p>{t('customers.selectHint')}</p></div>}
    </Card>

    <Sheet open={isOpen} onClose={() => setIsOpen(false)} title={t(editing ? 'customers.editTitle' : 'customers.addTitle')} description={t('customers.formHint')} footer={<div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>{t('buttons.cancel')}</Button><Button className="flex-1" disabled={saveMutation.isPending || !form.name.trim()} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? t('buttons.working') : t('buttons.save')}</Button></div>}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">{t('customers.name')}<Input className="mt-1.5" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="block text-sm font-medium">{t('customers.phone')}<Input className="mt-1.5" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label className="block text-sm font-medium">{t('customers.email')}<Input className="mt-1.5" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
        <label className="block text-sm font-medium">{t('customers.discountPercent')}<Input className="mt-1.5" type="number" min="0" max="99" step="1" value={form.discountPercent} onChange={(event) => setForm((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
        <label className="block text-sm font-medium">{t('customers.notes')}<textarea className="mt-1.5 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
      </div>
    </Sheet>
  </div>;
};

export default OwnerCustomers;
