import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, ClipboardList, Plus, Truck } from 'lucide-react';
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

type Supplier = { id: string; name: string; contactName: string; phone: string; email: string; address: string; notes: string; isActive: boolean };
type InventoryItem = { id: string; name: string; sku?: string | null; cost?: number | null; stockQuantity?: number | null };
type PurchaseLine = { menuItemId: string; name: string; quantityOrdered: number; quantityReceived: number; unitCost: number };
type PurchaseOrder = { id: string; purchaseNumber: string; supplierId: string; supplier: Pick<Supplier, 'id' | 'name' | 'phone'>; items: PurchaseLine[]; status: 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'; subtotal: number; notes: string; createdAt: string; receivedAt?: string | null; createdBy: { name: string } };
type DraftLine = { menuItemId: string; quantityOrdered: string; unitCost: string };

const EMPTY_SUPPLIER = { name: '', contactName: '', phone: '', email: '', address: '', notes: '' };

export const OwnerPurchases: React.FC = () => {
  const { t } = useTranslation();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const addToast = useToastStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [supplierEditing, setSupplierEditing] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ menuItemId: '', quantityOrdered: '1', unitCost: '0' }]);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    setPageTitle({ title: t('purchases.title'), subtitle: t('purchases.subtitle') });
    setShowDateRange(false);
    return () => { setPageTitle({ title: 'Overview', subtitle: '' }); setShowDateRange(false); };
  }, [setPageTitle, setShowDateRange, t]);

  const suppliersQuery = useQuery({ queryKey: ['purchases', 'suppliers'], queryFn: async () => (await axiosClient.get<Supplier[]>('/purchases/suppliers')).data });
  const ordersQuery = useQuery({ queryKey: ['purchases', 'orders'], queryFn: async () => (await axiosClient.get<PurchaseOrder[]>('/purchases/orders')).data });
  const inventoryQuery = useQuery({ queryKey: ['inventory', 'items'], queryFn: async () => (await axiosClient.get<InventoryItem[]>('/inventory')).data });
  const suppliers = suppliersQuery.data ?? [];
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);
  const inventory = inventoryQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const openOrders = orders.filter((order) => ['OPEN', 'PARTIALLY_RECEIVED'].includes(order.status));
  const totalOutstanding = openOrders.reduce((sum, order) => sum + order.items.reduce((orderSum, item) => orderSum + (item.quantityOrdered - item.quantityReceived) * item.unitCost, 0), 0);

  useEffect(() => {
    if (!supplierId && activeSuppliers[0]) setSupplierId(activeSuppliers[0].id);
  }, [supplierId, activeSuppliers]);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['purchases'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['menu'] }),
  ]);
  const supplierMutation = useMutation({
    mutationFn: async () => supplierEditing
      ? axiosClient.patch(`/purchases/suppliers/${supplierEditing}`, supplierForm)
      : axiosClient.post('/purchases/suppliers', supplierForm),
    onSuccess: async () => { await refresh(); setSupplierOpen(false); setSupplierEditing(null); setSupplierForm(EMPTY_SUPPLIER); addToast({ type: 'success', title: t(supplierEditing ? 'purchases.supplierUpdated' : 'purchases.supplierCreated') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('purchases.saveFailed'), message: error?.response?.data?.error }),
  });
  const purchaseMutation = useMutation({
    mutationFn: async () => axiosClient.post('/purchases/orders', {
      supplierId, notes: purchaseNotes,
      items: draftLines.map((line) => ({ menuItemId: line.menuItemId, quantityOrdered: Number(line.quantityOrdered), unitCost: Number(line.unitCost) })),
    }),
    onSuccess: async () => { await refresh(); setPurchaseOpen(false); setPurchaseNotes(''); setDraftLines([{ menuItemId: '', quantityOrdered: '1', unitCost: '0' }]); addToast({ type: 'success', title: t('purchases.purchaseCreated') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('purchases.saveFailed'), message: error?.response?.data?.error }),
  });
  const archiveMutation = useMutation({
    mutationFn: async (supplier: Supplier) => axiosClient.patch(`/purchases/suppliers/${supplier.id}`, { isActive: !supplier.isActive }),
    onSuccess: async () => { await refresh(); addToast({ type: 'success', title: t('purchases.supplierUpdated') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('purchases.saveFailed'), message: error?.response?.data?.error }),
  });
  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!receiving) throw new Error('Select a purchase order.');
      const items = receiving.items.map((line) => ({ menuItemId: line.menuItemId, quantity: Number(receivedQuantities[line.menuItemId] || 0) })).filter((line) => line.quantity > 0);
      if (!items.length) throw new Error(t('purchases.enterReceivedQuantity'));
      return axiosClient.post(`/purchases/orders/${receiving.id}/receive`, { items });
    },
    onSuccess: async () => { await refresh(); setReceiving(null); addToast({ type: 'success', title: t('purchases.deliveryReceived') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('purchases.receiveFailed'), message: error?.response?.data?.error || error?.message }),
  });
  const cancelMutation = useMutation({
    mutationFn: async (order: PurchaseOrder) => axiosClient.post(`/purchases/orders/${order.id}/cancel`),
    onSuccess: async () => { await refresh(); addToast({ type: 'success', title: t('purchases.purchaseCancelled') }); },
    onError: (error: any) => addToast({ type: 'error', title: t('purchases.saveFailed'), message: error?.response?.data?.error }),
  });

  const draftTotal = useMemo(() => draftLines.reduce((sum, line) => sum + Number(line.quantityOrdered || 0) * Number(line.unitCost || 0), 0), [draftLines]);
  const openSupplierCreate = () => { setSupplierEditing(null); setSupplierForm(EMPTY_SUPPLIER); setSupplierOpen(true); };
  const openSupplierEdit = (supplier: Supplier) => {
    setSupplierEditing(supplier.id);
    setSupplierForm({ name: supplier.name, contactName: supplier.contactName, phone: supplier.phone, email: supplier.email, address: supplier.address, notes: supplier.notes });
  };
  const openReceiving = (order: PurchaseOrder) => {
    setReceiving(order);
    setReceivedQuantities(Object.fromEntries(order.items.map((item) => [item.menuItemId, String(item.quantityOrdered - item.quantityReceived)])));
  };

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{t('purchases.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('purchases.subtitle')}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setSupplierOpen(true)}><Truck className="mr-2 h-4 w-4" />{t('purchases.suppliers')}</Button><Button onClick={() => setPurchaseOpen(true)} disabled={!activeSuppliers.length || !inventory.length}><Plus className="mr-2 h-4 w-4" />{t('purchases.newPurchase')}</Button></div>
    </header>

    <div className="grid gap-3 tablet-portrait:grid-cols-3">
      <Metric icon={<ClipboardList className="h-5 w-5" />} value={String(orders.length)} label={t('purchases.purchaseOrders')} />
      <Metric icon={<Truck className="h-5 w-5" />} value={String(openOrders.length)} label={t('purchases.awaitingDelivery')} accent />
      <Metric icon={<Archive className="h-5 w-5" />} value={formatCurrency(totalOutstanding)} label={t('purchases.stockOnOrder')} />
    </div>

    {(!activeSuppliers.length || !inventory.length) && <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-primary/5 p-4">
      <div><p className="font-semibold">{!inventory.length ? t('purchases.noTrackedProducts') : t('purchases.addSupplierFirst')}</p><p className="mt-1 text-sm text-muted-foreground">{!inventory.length ? t('purchases.enableTrackingHint') : t('purchases.supplierHint')}</p></div>
      {!activeSuppliers.length && <Button size="sm" onClick={openSupplierCreate}>{t('purchases.addSupplier')}</Button>}
    </Card>}

    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t('purchases.recentPurchases')}</h2><span className="text-xs text-muted-foreground">{t('purchases.showingOrders', { count: orders.length })}</span></div>
      {ordersQuery.isLoading ? <Card className="p-6 text-sm text-muted-foreground">{t('loading')}</Card> : !orders.length ? <Card className="p-10 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" /><p className="font-semibold">{t('purchases.noPurchases')}</p><p className="mt-1 text-sm text-muted-foreground">{t('purchases.noPurchasesHint')}</p></Card> : <div className="grid gap-3 desktop:grid-cols-2">{orders.map((order) => <PurchaseCard key={order.id} order={order} busy={receiveMutation.isPending || cancelMutation.isPending} onReceive={() => openReceiving(order)} onCancel={() => cancelMutation.mutate(order)} />)}</div>}
    </section>

    <Sheet open={supplierOpen} onClose={() => { setSupplierOpen(false); setSupplierEditing(null); }} title={t('purchases.suppliers')} description={t('purchases.supplierHint')}>
      <div className="space-y-5">
        <Card className="space-y-3 p-4"><h3 className="font-semibold">{t(supplierEditing ? 'purchases.editSupplier' : 'purchases.addSupplier')}</h3>
          <Input placeholder={t('purchases.supplierName')} value={supplierForm.name} onChange={(event) => setSupplierForm((form) => ({ ...form, name: event.target.value }))} />
          <Input placeholder={t('purchases.contactName')} value={supplierForm.contactName} onChange={(event) => setSupplierForm((form) => ({ ...form, contactName: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2"><Input placeholder={t('purchases.phone')} value={supplierForm.phone} onChange={(event) => setSupplierForm((form) => ({ ...form, phone: event.target.value }))} /><Input type="email" placeholder={t('purchases.email')} value={supplierForm.email} onChange={(event) => setSupplierForm((form) => ({ ...form, email: event.target.value }))} /></div>
          <Input placeholder={t('purchases.address')} value={supplierForm.address} onChange={(event) => setSupplierForm((form) => ({ ...form, address: event.target.value }))} />
          <Input placeholder={t('purchases.notes')} value={supplierForm.notes} onChange={(event) => setSupplierForm((form) => ({ ...form, notes: event.target.value }))} />
          <div className="flex gap-2"><Button disabled={supplierMutation.isPending || supplierForm.name.trim().length < 2} onClick={() => supplierMutation.mutate()}>{t('buttons.save')}</Button>{supplierEditing && <Button variant="outline" onClick={() => { setSupplierEditing(null); setSupplierForm(EMPTY_SUPPLIER); }}>{t('buttons.cancel')}</Button>}</div>
        </Card>
        <div className="space-y-2">{suppliers.map((supplier) => <Card key={supplier.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-semibold">{supplier.name}</p><p className="text-xs text-muted-foreground">{supplier.contactName || supplier.phone || supplier.email || t('purchases.noContact')}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant={supplier.isActive ? 'success' : 'neutral'}>{t(supplier.isActive ? 'purchases.active' : 'purchases.archived')}</Badge><Button size="sm" variant="outline" onClick={() => openSupplierEdit(supplier)}>{t('customers.edit')}</Button><Button size="sm" variant="ghost" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate(supplier)}>{t(supplier.isActive ? 'purchases.archive' : 'purchases.restore')}</Button></div></Card>)}</div>
      </div>
    </Sheet>

    <Sheet open={purchaseOpen} onClose={() => setPurchaseOpen(false)} title={t('purchases.newPurchase')} description={t('purchases.purchaseHint')} footer={<div className="flex w-full items-center justify-between gap-3"><span className="font-semibold">{t('purchases.estimatedTotal')}: {formatCurrency(draftTotal)}</span><Button disabled={purchaseMutation.isPending || !supplierId || draftLines.some((line) => !line.menuItemId || Number(line.quantityOrdered) < 1)} onClick={() => purchaseMutation.mutate()}>{purchaseMutation.isPending ? t('buttons.working') : t('purchases.createPurchase')}</Button></div>}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">{t('purchases.supplier')}<Select className="mt-1.5" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">{t('purchases.chooseSupplier')}</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></label>
        <div className="space-y-3">{draftLines.map((line, index) => <Card key={index} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_90px_120px_auto]"><Select value={line.menuItemId} onChange={(event) => { const item = inventory.find((candidate) => candidate.id === event.target.value); setDraftLines((current) => current.map((row, i) => i === index ? { ...row, menuItemId: event.target.value, unitCost: String(item?.cost ?? 0) } : row)); }}><option value="">{t('purchases.chooseProduct')}</option>{inventory.map((item) => <option key={item.id} value={item.id} disabled={draftLines.some((row, i) => i !== index && row.menuItemId === item.id)}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</option>)}</Select><Input aria-label={t('purchases.quantity')} type="number" min="1" value={line.quantityOrdered} onChange={(event) => setDraftLines((current) => current.map((row, i) => i === index ? { ...row, quantityOrdered: event.target.value } : row))} /><Input aria-label={t('purchases.unitCost')} type="number" min="0" value={line.unitCost} onChange={(event) => setDraftLines((current) => current.map((row, i) => i === index ? { ...row, unitCost: event.target.value } : row))} /><Button size="sm" variant="ghost" disabled={draftLines.length === 1} onClick={() => setDraftLines((current) => current.filter((_, i) => i !== index))}>{t('buttons.remove')}</Button></Card>)}</div>
        <Button variant="outline" size="sm" onClick={() => setDraftLines((current) => [...current, { menuItemId: '', quantityOrdered: '1', unitCost: '0' }])}><Plus className="mr-1 h-4 w-4" />{t('purchases.addProduct')}</Button>
        <Input placeholder={t('purchases.notes')} value={purchaseNotes} onChange={(event) => setPurchaseNotes(event.target.value)} />
      </div>
    </Sheet>

    <Sheet open={Boolean(receiving)} onClose={() => setReceiving(null)} title={t('purchases.receiveDelivery')} description={receiving?.purchaseNumber} footer={<div className="flex w-full justify-end"><Button disabled={receiveMutation.isPending} onClick={() => receiveMutation.mutate()}>{receiveMutation.isPending ? t('buttons.working') : t('purchases.confirmReceived')}</Button></div>}>
      <div className="space-y-3">{receiving?.items.map((line) => { const remaining = line.quantityOrdered - line.quantityReceived; return <Card key={line.menuItemId} className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_130px]"><div><p className="font-semibold">{line.name}</p><p className="text-xs text-muted-foreground">{t('purchases.remainingQuantity', { remaining, ordered: line.quantityOrdered, received: line.quantityReceived })}</p></div><Input aria-label={`${line.name} ${t('purchases.receivedQuantity')}`} type="number" min="0" max={remaining} value={receivedQuantities[line.menuItemId] ?? '0'} onChange={(event) => setReceivedQuantities((current) => ({ ...current, [line.menuItemId]: event.target.value }))} /></Card>; })}</div>
    </Sheet>
  </div>;
};

function Metric({ icon, value, label, accent = false }: { icon: React.ReactNode; value: string; label: string; accent?: boolean }) {
  return <Card className="flex items-center gap-4 p-5"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>{icon}</span><div className="min-w-0"><p className="truncate text-2xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></Card>;
}

function PurchaseCard({ order, busy, onReceive, onCancel }: { order: PurchaseOrder; busy: boolean; onReceive: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const receivedValue = order.items.reduce((sum, line) => sum + line.quantityReceived * line.unitCost, 0);
  const pending = ['OPEN', 'PARTIALLY_RECEIVED'].includes(order.status);
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{order.purchaseNumber}</h3><Badge variant={order.status === 'RECEIVED' ? 'success' : order.status === 'CANCELLED' ? 'neutral' : order.status === 'PARTIALLY_RECEIVED' ? 'warning' : 'default'}>{t(`purchases.statuses.${order.status}`)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{order.supplier.name} · {new Date(order.createdAt).toLocaleDateString()}</p></div><p className="text-lg font-bold">{formatCurrency(order.subtotal)}</p></div>
    <div className="space-y-2 p-4">{order.items.map((line) => <div key={line.menuItemId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{line.name}</span><span className="text-muted-foreground">{line.quantityReceived}/{line.quantityOrdered} · {formatCurrency(line.unitCost)} {t('purchases.each')}</span></div>)}{order.notes && <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">{order.notes}</p>}
      {order.status !== 'OPEN' && <p className="text-xs text-muted-foreground">{t('purchases.receivedValue')}: {formatCurrency(receivedValue)}</p>}
      {pending && <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3"><Button size="sm" onClick={onReceive} disabled={busy}><Truck className="mr-1.5 h-4 w-4" />{t('purchases.receiveDelivery')}</Button>{order.status === 'OPEN' && !order.items.some((line) => line.quantityReceived > 0) && <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>{t('purchases.cancelPurchase')}</Button>}</div>}
    </div>
  </Card>;
}

export default OwnerPurchases;
