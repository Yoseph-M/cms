import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Search, ShoppingBag, Store, Truck } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { formatCurrency } from '../../utils/currency';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

type StoreSummary = { id: string; name: string; slug: string; category: string; description: string; address: string; logoUrl?: string | null };
type ProductVariant = { id: string; name: string; price: number; inStock: boolean };
type Product = { id: string; businessId: string; name: string; description: string; category: string; price: number; inStock: boolean; hasVariants: boolean; imageUrl?: string | null; variants: ProductVariant[]; business?: StoreSummary };
type DeliveryZone = { id: string; name: string; deliveryFee: number; minimumOrderAmount: number; estimatedMinutes: number };
type StoreDetail = StoreSummary & { phone: string; email: string; products: Product[]; deliveryZones: DeliveryZone[] };
type CartLine = { productId: string; variantId?: string; product: Product; variant?: ProductVariant; quantity: number };

export const MarketplacePage: React.FC = () => {
  const { slug } = useParams();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const businessesQuery = useQuery({
    queryKey: ['marketplace', 'businesses'],
    queryFn: async () => (await axiosClient.get('/marketplace/businesses')).data.data as StoreSummary[],
    enabled: !slug,
  });
  const productsQuery = useQuery({
    queryKey: ['marketplace', 'products', search],
    queryFn: async () => (await axiosClient.get('/marketplace/products', { params: { search: search || undefined, limit: 60 } })).data.data as Product[],
    enabled: !slug,
  });
  const storeQuery = useQuery({
    queryKey: ['marketplace', 'store', slug],
    queryFn: async () => (await axiosClient.get<StoreDetail>(`/marketplace/businesses/${slug}`)).data,
    enabled: Boolean(slug),
  });

  return <div className="min-h-screen bg-[hsl(var(--canvas-cool))] text-foreground">
    <header className="border-b border-border/70 bg-card/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Link to="/marketplace" className="flex items-center gap-2 font-display text-xl font-bold"><Store className="h-5 w-5 text-primary" />{t('marketplace.title')}</Link>
        <Link to="/login" className="text-sm font-semibold text-muted-foreground hover:text-foreground">{t('marketplace.merchantSignIn')}</Link>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-10 px-5 py-8 sm:py-12">
      {slug ? <Storefront business={storeQuery.data} loading={storeQuery.isLoading} /> : <>
        <section className="grid gap-8 rounded-3xl border border-border/60 bg-card p-7 shadow-sm tablet-landscape:grid-cols-[1.2fr_0.8fr] tablet-landscape:p-10">
          <div className="flex flex-col justify-center">
            <Badge variant="default" className="mb-4 w-fit">{t('marketplace.localMarketplace')}</Badge>
            <h1 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">{t('marketplace.heroTitle')}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">{t('marketplace.heroSubtitle')}</p>
            <label className="relative mt-6 block max-w-xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-12 pl-10" placeholder={t('marketplace.searchPlaceholder')} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 self-center">
            <Card className="p-4"><Store className="mb-4 h-5 w-5 text-primary" /><p className="text-2xl font-bold">{businessesQuery.data?.length ?? 0}</p><p className="text-xs text-muted-foreground">{t('marketplace.localStores')}</p></Card>
            <Card className="p-4"><ShoppingBag className="mb-4 h-5 w-5 text-primary" /><p className="text-2xl font-bold">{productsQuery.data?.length ?? 0}</p><p className="text-xs text-muted-foreground">{t('marketplace.products')}</p></Card>
            <div className="col-span-2 flex items-center gap-3 rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground"><Truck className="h-5 w-5 shrink-0 text-primary" />{t('marketplace.deliveryHint')}</div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{t('marketplace.discover')}</p><h2 className="mt-1 text-2xl font-bold">{t('marketplace.nearbyStores')}</h2></div></div>
          {businessesQuery.isLoading ? <p className="py-8 text-sm text-muted-foreground">{t('loading')}</p> : <div className="grid gap-4 sm:grid-cols-2 desktop:grid-cols-3">
            {(businessesQuery.data ?? []).map((business) => <Link key={business.id} to={`/marketplace/${business.slug}`}>
              <Card className="group flex h-full gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <StoreLogo business={business} />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{business.name}</p><p className="mt-1 text-xs text-primary">{business.category}</p><p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{business.description || business.address}</p></div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </Card>
            </Link>)}
          </div>}
          {!businessesQuery.isLoading && (businessesQuery.data?.length ?? 0) === 0 && <p className="py-8 text-sm text-muted-foreground">{t('marketplace.noStores')}</p>}
        </section>

        <section>
          <div className="mb-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">{t('marketplace.browse')}</p><h2 className="mt-1 text-2xl font-bold">{t('marketplace.productsFromStores')}</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 tablet-landscape:grid-cols-3 desktop:grid-cols-4">
            {(productsQuery.data ?? []).map((product) => <Link key={product.id} to={`/marketplace/${product.business?.slug}`}>
              <ProductCard product={product} />
            </Link>)}
          </div>
          {!productsQuery.isLoading && (productsQuery.data?.length ?? 0) === 0 && <p className="py-8 text-sm text-muted-foreground">{t('marketplace.noProducts')}</p>}
        </section>
      </>}
    </main>
    <footer className="border-t border-border/60 bg-card px-5 py-8 text-center text-xs text-muted-foreground">{t('marketplace.footer')}</footer>
  </div>;
};

const Storefront: React.FC<{ business?: StoreDetail; loading: boolean }> = ({ business, loading }) => {
  const { t } = useTranslation();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantByProduct, setVariantByProduct] = useState<Record<string, string>>({});
  const [zoneId, setZoneId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH_ON_DELIVERY' | 'PAY_AT_STORE'>('CASH_ON_DELIVERY');
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError] = useState('');

  const zone = business?.deliveryZones.find((candidate) => candidate.id === zoneId);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + (line.variant?.price ?? line.product.price) * line.quantity, 0), [cart]);
  const total = subtotal + (zone?.deliveryFee ?? 0);

  const addToCart = (product: Product) => {
    const variantId = variantByProduct[product.id];
    const variant = product.variants.find((candidate) => candidate.id === variantId);
    if (product.hasVariants && !variant) { setError(t('marketplace.chooseOption', { name: product.name })); return; }
    if (!(variant ? variant.inStock : product.inStock)) { setError(t('marketplace.soldOut')); return; }
    setError('');
    setCart((current) => {
      const index = current.findIndex((line) => line.productId === product.id && line.variantId === variantId);
      if (index < 0) return [...current, { productId: product.id, variantId, product, variant, quantity: 1 }];
      return current.map((line, i) => i === index ? { ...line, quantity: line.quantity + 1 } : line);
    });
  };

  const submitOrder = async () => {
    if (!business || !zone || !customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim() || cart.length === 0) {
      setError(t('marketplace.completeCheckout')); return;
    }
    if (subtotal < zone.minimumOrderAmount) { setError(t('marketplace.minimumOrder', { amount: formatCurrency(zone.minimumOrderAmount) })); return; }
    setSubmitting(true); setError('');
    try {
      const response = await axiosClient.post('/marketplace/orders', {
        clientOrderId: crypto.randomUUID(), businessId: business.id, deliveryZoneId: zone.id,
        customerName, customerPhone, customerEmail, deliveryAddress, note, paymentMethod,
        items: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
      });
      setOrderNumber(response.data.order.id);
      setCart([]);
    } catch (err: any) {
      setError(err?.response?.data?.error || t('marketplace.orderFailed'));
    } finally { setSubmitting(false); }
  };

  if (loading) return <p className="py-20 text-center text-muted-foreground">{t('loading')}</p>;
  if (!business) return <Card className="p-10 text-center"><h1 className="text-xl font-bold">{t('marketplace.storeNotFound')}</h1><Link className="mt-4 inline-flex text-sm font-semibold text-primary" to="/marketplace"><ArrowLeft className="mr-2 h-4 w-4" />{t('marketplace.backToStores')}</Link></Card>;
  if (orderNumber) return <Card className="mx-auto max-w-xl p-10 text-center"><Badge variant="success">{t('marketplace.orderPlaced')}</Badge><h1 className="mt-4 text-2xl font-bold">{t('marketplace.thankYou', { name: customerName })}</h1><p className="mt-2 text-sm text-muted-foreground">{t('marketplace.orderConfirmation', { order: orderNumber.slice(-6).toUpperCase() })}</p><Link to="/marketplace" className="mt-6 inline-flex items-center font-semibold text-primary"><ArrowLeft className="mr-2 h-4 w-4" />{t('marketplace.backToStores')}</Link></Card>;

  return <>
    <Link to="/marketplace" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t('marketplace.backToStores')}</Link>
    <section className="mb-7 flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <StoreLogo business={business} large />
      <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-primary">{business.category}</p><h1 className="mt-1 text-3xl font-bold">{business.name}</h1><p className="mt-1 text-sm text-muted-foreground">{business.description || business.address}</p></div>
      <Badge variant="neutral">{t('marketplace.deliveryAvailable', { count: business.deliveryZones.length })}</Badge>
    </section>
    <div className="grid items-start gap-6 desktop:grid-cols-[minmax(0,1fr)_380px]">
      <section><h2 className="mb-4 text-xl font-bold">{t('marketplace.storeProducts')}</h2><div className="grid gap-4 sm:grid-cols-2 tablet-landscape:grid-cols-3">
        {business.products.map((product) => <div key={product.id}>
          <ProductCard product={product} />
          {product.hasVariants && <Select className="mt-2" value={variantByProduct[product.id] ?? ''} onChange={(event) => setVariantByProduct((current) => ({ ...current, [product.id]: event.target.value }))}>
            <option value="">{t('marketplace.chooseOptionLabel')}</option>{product.variants.map((variant) => <option key={variant.id} value={variant.id} disabled={!variant.inStock}>{variant.name} · {formatCurrency(variant.price)}</option>)}
          </Select>}
          <Button className="mt-2 w-full" size="sm" disabled={!product.inStock} onClick={() => addToCart(product)}>{t('marketplace.addToCart')}</Button>
        </div>)}
      </div></section>
      <Card className="sticky top-4 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><ShoppingBag className="h-5 w-5 text-primary" />{t('marketplace.yourOrder')}</h2>
        {cart.length === 0 ? <p className="mb-4 text-sm text-muted-foreground">{t('marketplace.cartEmpty')}</p> : <div className="mb-4 max-h-48 space-y-2 overflow-y-auto">{cart.map((line) => <div key={`${line.productId}-${line.variantId || ''}`} className="flex justify-between gap-3 text-sm"><span>{line.quantity} × {line.product.name}{line.variant ? ` · ${line.variant.name}` : ''}</span><b>{formatCurrency((line.variant?.price ?? line.product.price) * line.quantity)}</b></div>)}</div>}
        <div className="space-y-3 border-t border-border/60 pt-4">
          <Select value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="">{t('marketplace.chooseDeliveryArea')}</option>{business.deliveryZones.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {formatCurrency(candidate.deliveryFee)} · {candidate.estimatedMinutes} min</option>)}</Select>
          <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t('marketplace.customerName')} />
          <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t('marketplace.customerPhone')} />
          <Input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder={t('marketplace.customerEmail')} />
          <Input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder={t('marketplace.deliveryAddress')} />
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('marketplace.orderNote')} />
          <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="CASH_ON_DELIVERY">{t('marketplace.cashOnDelivery')}</option><option value="PAY_AT_STORE">{t('marketplace.payAtStore')}</option></Select>
          <div className="space-y-1 border-t border-border/60 pt-3 text-sm"><div className="flex justify-between"><span>{t('marketplace.subtotal')}</span><span>{formatCurrency(subtotal)}</span></div><div className="flex justify-between"><span>{t('marketplace.delivery')}</span><span>{formatCurrency(zone?.deliveryFee ?? 0)}</span></div><div className="flex justify-between pt-1 text-base font-bold"><span>{t('marketplace.total')}</span><span>{formatCurrency(total)}</span></div></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" disabled={submitting || cart.length === 0 || !zone} onClick={submitOrder}>{submitting ? t('buttons.working') : t('marketplace.placeOrder')}</Button>
        </div>
      </Card>
    </div>
  </>;
};

const StoreLogo: React.FC<{ business: Pick<StoreSummary, 'name' | 'logoUrl'>; large?: boolean }> = ({ business, large = false }) => (
  <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-primary ${large ? 'h-16 w-16' : 'h-14 w-14'}`}>
    {business.logoUrl ? <img src={business.logoUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xl font-bold">{business.name.slice(0, 1).toUpperCase()}</span>}
  </div>
);

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { t } = useTranslation();
  const available = product.inStock;
  return <Card className="overflow-hidden transition-shadow hover:shadow-md">
    <div className="aspect-[4/3] bg-secondary/40">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ShoppingBag className="h-10 w-10 text-muted-foreground/30" /></div>}</div>
    <div className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.business?.name || product.category}</p></div>{!available && <Badge variant="neutral">{t('marketplace.soldOut')}</Badge>}</div><p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{product.description}</p><p className="text-lg font-bold text-primary">{formatCurrency(product.price)}</p></div>
  </Card>;
};

export default MarketplacePage;
