import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { useHeaderStore } from '../../store/headerStore';
import { axiosClient } from '../../api/axiosClient';
import { formatCurrency } from '../../utils/currency';

type Business = { id: string; name: string; slug: string; category: string; description: string; address: string; phone: string; email: string; memberRole: 'OWNER' | 'MANAGER' };
type Product = { id: string; name: string; category: string; description: string; sku: string; barcode: string; price: number; cost: number; stockQuantity: number; lowStockAt: number; imageUrl?: string | null; isActive: boolean; variants: Array<{ id: string; name: string; sku: string; price: number; stockQuantity: number; isActive: boolean }> };
type Zone = { id: string; name: string; deliveryFee: number; minimumOrderAmount: number; estimatedMinutes: number; isActive: boolean };
type MarketOrder = { id: string; customerName: string; customerPhone: string; customerEmail: string; deliveryAddress: string; note: string; items: Array<{ name: string; variantName: string; quantity: number; unitPrice: number }>; subtotal: number; deliveryFee: number; totalAmount: number; status: string; paymentStatus: string; createdAt: string; deliveryZone?: { name: string; estimatedMinutes: number } | null };
type Member = { id: string; role: string; user: { id: string; name: string; username?: string | null; role: string } };
type StockMovement = { id: string; delta: number; reason: string; createdAt: string; product: { name: string }; variant?: { name: string } | null };
type Action = { method: 'post' | 'patch' | 'delete'; path: string; data?: unknown; success: string };

const EMPTY_STORE = { name: '', slug: '', category: '', description: '', address: '', phone: '', email: '' };
const EMPTY_PRODUCT = { name: '', category: '', description: '', sku: '', barcode: '', price: '', cost: '0', stockQuantity: '0', lowStockAt: '3', imageUrl: '', isActive: true };
const EMPTY_ZONE = { name: '', deliveryFee: '0', minimumOrderAmount: '0', estimatedMinutes: '45' };
const availableStock = (product: Product) => product.variants.length
  ? product.variants.filter((variant) => variant.isActive).reduce((total, variant) => total + variant.stockQuantity, 0)
  : product.stockQuantity;

export const MarketplaceManagePage: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthStore((state) => state.user?.role);
  const addToast = useToastStore((state) => state.addToast);
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const queryClient = useQueryClient();
  const [businessId, setBusinessId] = useState('');
  const [tab, setTab] = useState<'products' | 'orders' | 'delivery' | 'team'>('orders');
  const [storeForm, setStoreForm] = useState(EMPTY_STORE);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  const [variantProductId, setVariantProductId] = useState('');
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', price: '', stockQuantity: '0' });
  const [memberForm, setMemberForm] = useState({ username: '', role: 'MANAGER' });

  useEffect(() => {
    setPageTitle({ title: t('marketplace.manageTitle'), subtitle: t('marketplace.manageSubtitle') });
    setShowDateRange(false);
    return () => { setPageTitle({ title: 'Overview', subtitle: '' }); setShowDateRange(false); };
  }, [setPageTitle, setShowDateRange, t]);

  const businessQuery = useQuery({
    queryKey: ['marketplace', 'managed-businesses'],
    queryFn: async () => (await axiosClient.get<Business[]>('/marketplace/manage/businesses')).data,
  });
  const businesses = businessQuery.data ?? [];
  const activeBusiness = businesses.find((business) => business.id === businessId) ?? businesses[0];
  const base = activeBusiness ? `/marketplace/manage/businesses/${activeBusiness.id}` : '';

  useEffect(() => {
    if (!businessId && businesses[0]) setBusinessId(businesses[0].id);
    if (activeBusiness) setStoreForm({ name: activeBusiness.name, slug: activeBusiness.slug, category: activeBusiness.category, description: activeBusiness.description, address: activeBusiness.address, phone: activeBusiness.phone, email: activeBusiness.email });
  }, [businessId, businesses, activeBusiness]);

  const productsQuery = useQuery({ queryKey: ['marketplace', 'managed-products', businessId], queryFn: async () => (await axiosClient.get<Product[]>(`${base}/products`)).data, enabled: Boolean(base) });
  const ordersQuery = useQuery({ queryKey: ['marketplace', 'managed-orders', businessId], queryFn: async () => (await axiosClient.get<MarketOrder[]>(`${base}/orders`)).data, enabled: Boolean(base) });
  const zonesQuery = useQuery({ queryKey: ['marketplace', 'managed-zones', businessId], queryFn: async () => (await axiosClient.get<Zone[]>(`${base}/delivery-zones`)).data, enabled: Boolean(base) });
  const membersQuery = useQuery({ queryKey: ['marketplace', 'managed-members', businessId], queryFn: async () => (await axiosClient.get<Member[]>(`${base}/members`)).data, enabled: Boolean(base) });
  const movementQuery = useQuery({ queryKey: ['marketplace', 'managed-stock-movements', businessId], queryFn: async () => (await axiosClient.get<StockMovement[]>(`${base}/stock-movements`)).data, enabled: Boolean(base) });

  const actionMutation = useMutation({
    mutationFn: async ({ method, path, data }: Action) => {
      if (method === 'post') return axiosClient.post(path, data);
      if (method === 'patch') return axiosClient.patch(path, data);
      return axiosClient.delete(path);
    },
    onSuccess: async (_result, action) => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      addToast({ type: 'success', title: t(action.success) });
    },
    onError: (error: any) => addToast({ type: 'error', title: t('marketplace.saveFailed'), message: error?.response?.data?.error || t('marketplace.saveFailed') }),
  });
  const busy = actionMutation.isPending;
  const currencyField = (value: string) => Number(value || 0);

  const createStore = () => actionMutation.mutate({ method: 'post', path: '/marketplace/manage/businesses', data: storeForm, success: 'marketplace.storeCreated' });
  const saveStore = () => actionMutation.mutate({ method: 'patch', path: base, data: { name: storeForm.name, category: storeForm.category, description: storeForm.description, address: storeForm.address, phone: storeForm.phone, email: storeForm.email }, success: 'marketplace.saved' });
  const saveProduct = () => {
    const hasVariants = productsQuery.data?.find((product) => product.id === editingProduct)?.variants.length;
    const payload: Record<string, unknown> = { ...productForm, price: currencyField(productForm.price), cost: currencyField(productForm.cost), stockQuantity: currencyField(productForm.stockQuantity), lowStockAt: currencyField(productForm.lowStockAt), imageUrl: productForm.imageUrl || null };
    if (hasVariants) delete payload.stockQuantity;
    actionMutation.mutate({ method: editingProduct ? 'patch' : 'post', path: editingProduct ? `${base}/products/${editingProduct}` : `${base}/products`, data: payload, success: 'marketplace.productSaved' });
    setProductForm(EMPTY_PRODUCT); setEditingProduct(null);
  };
  const addZone = () => {
    actionMutation.mutate({ method: 'post', path: `${base}/delivery-zones`, data: { name: zoneForm.name, deliveryFee: currencyField(zoneForm.deliveryFee), minimumOrderAmount: currencyField(zoneForm.minimumOrderAmount), estimatedMinutes: currencyField(zoneForm.estimatedMinutes) }, success: 'marketplace.zoneSaved' });
    setZoneForm(EMPTY_ZONE);
  };
  const addVariant = () => {
    actionMutation.mutate({ method: 'post', path: `${base}/products/${variantProductId}/variants`, data: { ...variantForm, price: currencyField(variantForm.price), stockQuantity: currencyField(variantForm.stockQuantity) }, success: 'marketplace.variantSaved' });
    setVariantProductId(''); setVariantForm({ name: '', sku: '', price: '', stockQuantity: '0' });
  };
  const counts = useMemo(() => ({
    newOrders: (ordersQuery.data ?? []).filter((order) => order.status === 'PLACED').length,
    lowStock: (productsQuery.data ?? []).filter((product) => availableStock(product) <= product.lowStockAt).length,
  }), [ordersQuery.data, productsQuery.data]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{t('marketplace.manageTitle')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('marketplace.manageSubtitle')}</p></div>{businesses.length > 0 && <Select className="max-w-xs" value={activeBusiness?.id ?? ''} onChange={(event) => setBusinessId(event.target.value)}>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</Select>}</header>

    {businessQuery.isLoading ? <Card className="p-8 text-muted-foreground">{t('loading')}</Card> : !activeBusiness ? role === 'OWNER' ? <Card className="mx-auto max-w-3xl p-6">
      <h2 className="text-xl font-bold">{t('marketplace.newStore')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('marketplace.manageSubtitle')}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Input placeholder={t('marketplace.storeName')} value={storeForm.name} onChange={(event) => setStoreForm((form) => ({ ...form, name: event.target.value, slug: form.slug || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }))} />
        <Input placeholder={t('marketplace.slug')} value={storeForm.slug} onChange={(event) => setStoreForm((form) => ({ ...form, slug: event.target.value.toLowerCase() }))} />
        <Input placeholder={t('marketplace.category')} value={storeForm.category} onChange={(event) => setStoreForm((form) => ({ ...form, category: event.target.value }))} />
        <Input placeholder={t('marketplace.phone')} value={storeForm.phone} onChange={(event) => setStoreForm((form) => ({ ...form, phone: event.target.value }))} />
        <Input placeholder={t('marketplace.email')} value={storeForm.email} onChange={(event) => setStoreForm((form) => ({ ...form, email: event.target.value }))} />
        <Input placeholder={t('marketplace.address')} value={storeForm.address} onChange={(event) => setStoreForm((form) => ({ ...form, address: event.target.value }))} />
        <Input className="sm:col-span-2" placeholder={t('marketplace.description')} value={storeForm.description} onChange={(event) => setStoreForm((form) => ({ ...form, description: event.target.value }))} />
      </div><Button className="mt-4" disabled={busy || !storeForm.name || !storeForm.slug || !storeForm.category || !storeForm.phone} onClick={createStore}>{t('marketplace.createStore')}</Button>
    </Card> : <Card className="p-8 text-center"><h2 className="font-bold">{t('marketplace.noManagedStores')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('marketplace.managerNeedsInvite')}</p></Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 desktop:grid-cols-3"><Metric label={t('marketplace.tabs.orders')} value={ordersQuery.data?.length ?? 0} /><Metric label={t('marketplace.newOrders')} value={counts.newOrders} /><Metric label={t('marketplace.lowStock')} value={counts.lowStock} /></div>
      <div className="flex flex-wrap gap-2">{(['orders', 'products', 'delivery', 'team'] as const).map((value) => <Button key={value} size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>{t(`marketplace.tabs.${value}`)}</Button>)}</div>
      {tab === 'orders' && <OrdersPanel orders={ordersQuery.data ?? []} busy={busy} onUpdate={(order, status, paymentStatus) => actionMutation.mutate({ method: 'patch', path: `${base}/orders/${order.id}`, data: { status, paymentStatus }, success: 'marketplace.orderUpdated' })} />}
      {tab === 'products' && <ProductsPanel products={productsQuery.data ?? []} movements={movementQuery.data ?? []} form={productForm} setForm={setProductForm} editingProduct={editingProduct} setEditingProduct={setEditingProduct} onSave={saveProduct} onVariant={(id) => setVariantProductId(variantProductId === id ? '' : id)} onUpdateVariant={(product, variant, data) => actionMutation.mutate({ method: 'patch', path: `${base}/products/${product.id}/variants/${variant.id}`, data, success: 'marketplace.saved' })} variantProductId={variantProductId} variantForm={variantForm} setVariantForm={setVariantForm} onAddVariant={addVariant} busy={busy} />}
      {tab === 'delivery' && <DeliveryPanel zones={zonesQuery.data ?? []} form={zoneForm} setForm={setZoneForm} onAdd={addZone} onToggle={(zone) => actionMutation.mutate({ method: 'patch', path: `${base}/delivery-zones/${zone.id}`, data: { isActive: !zone.isActive }, success: 'marketplace.saved' })} busy={busy} />}
      {tab === 'team' && <TeamPanel members={membersQuery.data ?? []} form={memberForm} setForm={setMemberForm} owner={activeBusiness.memberRole === 'OWNER'} onAdd={() => actionMutation.mutate({ method: 'post', path: `${base}/members`, data: memberForm, success: 'marketplace.memberAdded' })} onRemove={(member) => actionMutation.mutate({ method: 'delete', path: `${base}/members/${member.user.id}`, success: 'marketplace.memberRemoved' })} busy={busy} />}
      <Card className="p-5"><h2 className="mb-3 font-semibold">{t('marketplace.storeName')}</h2><div className="grid gap-3 sm:grid-cols-2"><Input placeholder={t('marketplace.storeName')} value={storeForm.name} onChange={(event) => setStoreForm((form) => ({ ...form, name: event.target.value }))} /><Input placeholder={t('marketplace.category')} value={storeForm.category} onChange={(event) => setStoreForm((form) => ({ ...form, category: event.target.value }))} /><Input placeholder={t('marketplace.phone')} value={storeForm.phone} onChange={(event) => setStoreForm((form) => ({ ...form, phone: event.target.value }))} /><Input placeholder={t('marketplace.address')} value={storeForm.address} onChange={(event) => setStoreForm((form) => ({ ...form, address: event.target.value }))} /><Input placeholder={t('marketplace.description')} value={storeForm.description} onChange={(event) => setStoreForm((form) => ({ ...form, description: event.target.value }))} /><Input placeholder={t('marketplace.email')} value={storeForm.email} onChange={(event) => setStoreForm((form) => ({ ...form, email: event.target.value }))} /></div><Button className="mt-3" size="sm" disabled={busy} onClick={saveStore}>{t('marketplace.saveStore')}</Button></Card>
    </>}
  </div>;
};

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-4"><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card>; }

function OrdersPanel({ orders, busy, onUpdate }: { orders: MarketOrder[]; busy: boolean; onUpdate: (order: MarketOrder, status: string, paymentStatus: string) => void }) {
  const { t } = useTranslation();
  if (!orders.length) return <Card className="p-8 text-center text-sm text-muted-foreground">{t('marketplace.noOrders')}</Card>;
  const nextStatuses: Record<string, string[]> = { PLACED: ['ACCEPTED', 'CANCELLED'], ACCEPTED: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'], READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'], OUT_FOR_DELIVERY: ['COMPLETED'], COMPLETED: [], CANCELLED: [] };
  return <div className="space-y-3">{orders.map((order) => <Card key={order.id} className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{t('marketplace.orderNumber', { id: order.id.slice(-6).toUpperCase() })}</h3><Badge variant={order.status === 'CANCELLED' ? 'neutral' : order.status === 'PLACED' ? 'warning' : 'success'}>{t(`marketplace.statuses.${order.status}`)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()} · {order.deliveryZone?.name}</p></div><p className="text-lg font-bold">{formatCurrency(order.totalAmount)}</p></div>
    <div className="mt-4 grid gap-3 text-sm desktop:grid-cols-2"><div><p className="font-semibold">{order.customerName} · {order.customerPhone}</p><p className="text-xs text-muted-foreground">{order.customerEmail}</p><p className="mt-1 text-muted-foreground">{order.deliveryAddress}</p>{order.note && <p className="mt-2 text-xs italic text-muted-foreground">{order.note}</p>}</div><div className="space-y-1">{order.items.map((item, index) => <p key={`${item.name}-${index}`} className="flex justify-between gap-2"><span>{item.quantity} × {item.name}{item.variantName ? ` · ${item.variantName}` : ''}</span><span>{formatCurrency(item.unitPrice * item.quantity)}</span></p>)}<p className="border-t border-border/50 pt-1 text-xs text-muted-foreground">{t('marketplace.paymentStatus')}: {t(`marketplace.paymentStatuses.${order.paymentStatus}`)}</p></div></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><Select className="max-w-xs" defaultValue="" onChange={(event) => { if (event.target.value) onUpdate(order, event.target.value, order.paymentStatus); }} disabled={busy || !nextStatuses[order.status]?.length}><option value="">{t('marketplace.updateOrder')}</option>{(nextStatuses[order.status] ?? []).map((status) => <option key={status} value={status}>{t(`marketplace.statuses.${status}`)}</option>)}</Select><Button size="sm" variant="outline" disabled={busy || order.paymentStatus === 'PAID' || order.status === 'CANCELLED'} onClick={() => onUpdate(order, order.status, 'PAID')}>{t('marketplace.markPaid')}</Button></div>
  </Card>)}</div>;
}

function ProductsPanel({ products, movements, form, setForm, editingProduct, setEditingProduct, onSave, onVariant, onUpdateVariant, variantProductId, variantForm, setVariantForm, onAddVariant, busy }: {
  products: Product[]; movements: StockMovement[]; form: typeof EMPTY_PRODUCT; setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_PRODUCT>>; editingProduct: string | null; setEditingProduct: (id: string | null) => void; onSave: () => void; onVariant: (id: string) => void; onUpdateVariant: (product: Product, variant: Product['variants'][number], data: { isActive?: boolean; price?: number; stockQuantity?: number }) => void; variantProductId: string; variantForm: { name: string; sku: string; price: string; stockQuantity: string }; setVariantForm: React.Dispatch<React.SetStateAction<typeof variantForm>>; onAddVariant: () => void; busy: boolean;
}) {
  const { t } = useTranslation();
  const [variantEdits, setVariantEdits] = useState<Record<string, { price: string; stockQuantity: string }>>({});
  const hasVariants = Boolean(products.find((product) => product.id === editingProduct)?.variants.length);
  const field = (key: Exclude<keyof typeof EMPTY_PRODUCT, 'isActive'>, label: string, type = 'text', disabled = false) => <Input key={key} type={type} placeholder={label} value={form[key]} disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />;
  return <div className="space-y-4">
    <Card className="p-5"><h2 className="mb-3 font-semibold">{t(editingProduct ? 'marketplace.editProduct' : 'marketplace.addProduct')}</h2><div className="grid gap-3 sm:grid-cols-2 desktop:grid-cols-3">
      {field('name', t('marketplace.productName'))}{field('category', t('marketplace.productCategory'))}{field('sku', t('marketplace.sku'))}{field('barcode', t('marketplace.barcode'))}{field('price', t('marketplace.price'), 'number')}{field('cost', t('marketplace.cost'), 'number')}{field('stockQuantity', t('marketplace.stock'), 'number', hasVariants)}{field('lowStockAt', t('marketplace.lowStock'), 'number')}{field('imageUrl', t('marketplace.imageUrl'))}{field('description', t('marketplace.productDescription'))}
    </div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />{t('marketplace.activeListing')}</label><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !form.name || !form.category || !form.price} onClick={onSave}>{t('marketplace.saveProduct')}</Button>{editingProduct && <Button size="sm" variant="outline" onClick={() => { setEditingProduct(null); setForm(EMPTY_PRODUCT); }}>{t('buttons.cancel')}</Button>}</div></Card>
    {products.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">{t('marketplace.noProductsManaged')}</Card> : <div className="grid gap-3 desktop:grid-cols-2">{products.map((product) => <Card key={product.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold">{product.name}</h3><p className="text-xs text-muted-foreground">{product.category} · {product.sku || product.barcode || '—'}</p></div><Badge variant={availableStock(product) <= product.lowStockAt ? 'warning' : product.isActive ? 'success' : 'neutral'}>{availableStock(product) <= product.lowStockAt ? t('marketplace.stockWarning') : product.isActive ? t('marketplace.activeListing') : t('marketplace.inactive')}</Badge></div><p className="mt-2 text-sm font-bold text-primary">{formatCurrency(product.price)} · {t('inventory.units', { count: availableStock(product) })}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingProduct(product.id); setForm({ name: product.name, category: product.category, description: product.description, sku: product.sku, barcode: product.barcode, price: String(product.price), cost: String(product.cost), stockQuantity: String(product.stockQuantity), lowStockAt: String(product.lowStockAt), imageUrl: product.imageUrl || '', isActive: product.isActive }); }}>{t('customers.edit')}</Button><Button size="sm" variant="ghost" onClick={() => onVariant(product.id)}>{t('marketplace.variants')}</Button></div>{variantProductId === product.id && <div className="mt-3 space-y-3 rounded-lg bg-secondary/40 p-3"><div className="space-y-3">{product.variants.map((variant) => { const edit = variantEdits[variant.id] ?? { price: String(variant.price), stockQuantity: String(variant.stockQuantity) }; return <div key={variant.id} className="grid gap-2 rounded-lg bg-background p-3 sm:grid-cols-[1fr_100px_100px_auto]"><div className="flex items-center gap-2 text-sm"><span className="font-medium">{variant.name}</span><Badge variant={variant.isActive ? 'success' : 'neutral'}>{t(variant.isActive ? 'marketplace.activeListing' : 'marketplace.inactive')}</Badge></div><Input aria-label={`${variant.name} price`} type="number" value={edit.price} onChange={(event) => setVariantEdits((current) => ({ ...current, [variant.id]: { ...edit, price: event.target.value } }))} /><Input aria-label={`${variant.name} stock`} type="number" value={edit.stockQuantity} onChange={(event) => setVariantEdits((current) => ({ ...current, [variant.id]: { ...edit, stockQuantity: event.target.value } }))} /><div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy || !edit.price} onClick={() => onUpdateVariant(product, variant, { price: Number(edit.price), stockQuantity: Number(edit.stockQuantity) })}>{t('buttons.save')}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdateVariant(product, variant, { isActive: !variant.isActive })}>{t(variant.isActive ? 'marketplace.inactive' : 'marketplace.activeListing')}</Button></div></div>; })}</div><div className="grid gap-2 rounded-lg bg-background p-3 sm:grid-cols-2"><h4 className="text-sm font-semibold sm:col-span-2">{t('marketplace.addVariant')}</h4><Input placeholder={t('marketplace.variantName')} value={variantForm.name} onChange={(event) => setVariantForm((current) => ({ ...current, name: event.target.value }))} /><Input placeholder={t('marketplace.variantSku')} value={variantForm.sku} onChange={(event) => setVariantForm((current) => ({ ...current, sku: event.target.value }))} /><Input type="number" placeholder={t('marketplace.variantPrice')} value={variantForm.price} onChange={(event) => setVariantForm((current) => ({ ...current, price: event.target.value }))} /><Input type="number" placeholder={t('marketplace.variantStock')} value={variantForm.stockQuantity} onChange={(event) => setVariantForm((current) => ({ ...current, stockQuantity: event.target.value }))} /><Button className="sm:col-span-2" size="sm" disabled={busy || !variantForm.name || !variantForm.price} onClick={onAddVariant}>{t('marketplace.addVariant')}</Button></div></div>}</Card>)}</div>}
    <Card className="overflow-hidden"><div className="border-b border-border/60 p-4"><h3 className="font-semibold">{t('inventory.recentMovements')}</h3></div>{movements.length ? <div className="divide-y divide-border/50">{movements.slice(0, 20).map((movement) => <div key={movement.id} className="flex items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1 truncate">{movement.product.name}{movement.variant ? ` · ${movement.variant.name}` : ''}</span><Badge variant={movement.delta > 0 ? 'success' : 'neutral'}>{movement.delta > 0 ? '+' : ''}{movement.delta}</Badge><span className="text-xs text-muted-foreground">{t(`marketplace.stockReasons.${movement.reason}`, { defaultValue: movement.reason })}</span><time className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleDateString()}</time></div>)}</div> : <p className="p-4 text-sm text-muted-foreground">{t('inventory.noMovements')}</p>}</Card>
  </div>;
}

function DeliveryPanel({ zones, form, setForm, onAdd, onToggle, busy }: { zones: Zone[]; form: typeof EMPTY_ZONE; setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_ZONE>>; onAdd: () => void; onToggle: (zone: Zone) => void; busy: boolean }) {
  const { t } = useTranslation();
  return <div className="space-y-4"><Card className="p-5"><h2 className="mb-3 font-semibold">{t('marketplace.addZone')}</h2><div className="grid gap-3 sm:grid-cols-2 desktop:grid-cols-4"><Input placeholder={t('marketplace.zoneName')} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><Input type="number" placeholder={t('marketplace.deliveryFee')} value={form.deliveryFee} onChange={(event) => setForm((current) => ({ ...current, deliveryFee: event.target.value }))} /><Input type="number" placeholder={t('marketplace.minimumOrderAmount')} value={form.minimumOrderAmount} onChange={(event) => setForm((current) => ({ ...current, minimumOrderAmount: event.target.value }))} /><Input type="number" placeholder={t('marketplace.estimatedMinutes')} value={form.estimatedMinutes} onChange={(event) => setForm((current) => ({ ...current, estimatedMinutes: event.target.value }))} /></div><Button className="mt-3" size="sm" disabled={busy || !form.name} onClick={onAdd}>{t('marketplace.saveZone')}</Button></Card>
    {zones.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">{t('marketplace.noZones')}</Card> : <div className="grid gap-3 sm:grid-cols-2">{zones.map((zone) => <Card key={zone.id} className="flex items-start justify-between gap-3 p-4"><div><h3 className="font-semibold">{zone.name}</h3><p className="mt-1 text-sm text-muted-foreground">{t('marketplace.deliveryFee')}: {formatCurrency(zone.deliveryFee)} · {t('marketplace.minimumOrderAmount')}: {formatCurrency(zone.minimumOrderAmount)}</p><p className="text-xs text-muted-foreground">{zone.estimatedMinutes} min · {zone.isActive ? t('status.active') : t('status.inactive')}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => onToggle(zone)}>{t(zone.isActive ? 'status.inactive' : 'status.active')}</Button></Card>)}</div>}
  </div>;
}

function TeamPanel({ members, form, setForm, owner, onAdd, onRemove, busy }: { members: Member[]; form: { username: string; role: string }; setForm: React.Dispatch<React.SetStateAction<typeof form>>; owner: boolean; onAdd: () => void; onRemove: (member: Member) => void; busy: boolean }) {
  const { t } = useTranslation();
  return <div className="space-y-4"><Card className="p-5"><h2 className="mb-3 font-semibold">{t('marketplace.team')}</h2>{owner ? <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"><Input placeholder={t('marketplace.username')} value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /><Select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option value="MANAGER">{t('marketplace.memberManager')}</option><option value="OWNER">{t('marketplace.memberOwner')}</option></Select><Button disabled={busy || !form.username} onClick={onAdd}>{t('marketplace.addMember')}</Button></div> : <p className="text-sm text-muted-foreground">{t('marketplace.ownerOnly')}</p>}</Card>
    {members.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">{t('marketplace.noMembers')}</Card> : <Card className="divide-y divide-border/50">{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-semibold">{member.user.name}</p><p className="text-xs text-muted-foreground">{member.user.username}</p></div><div className="flex items-center gap-2"><Badge variant={member.role === 'OWNER' ? 'default' : 'neutral'}>{t(member.role === 'OWNER' ? 'marketplace.memberOwner' : 'marketplace.memberManager')}</Badge>{owner && member.role !== 'OWNER' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onRemove(member)}>{t('marketplace.removeMember')}</Button>}</div></div>)}</Card>}
  </div>;
}

export default MarketplaceManagePage;
