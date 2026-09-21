import { extractErrorMessage } from "../../utils/errorHandler";
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  ShoppingCart,
  UtensilsCrossed,
  CheckCircle2,
  ImageIcon,
  UserRound,
  ArrowUpDown,
  LayoutGrid,
  Coffee,
  CakeSlice,
  Sparkles,
  FilterX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/Dropdown';
import { DropdownSelect } from '../ui/DropdownSelect';
import { cn } from '../../lib/utils';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useMenuQuery } from '../../hooks/useCachedQueries';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { LoadingState } from '../common/LoadingState';
import { EmptyState } from '../common/EmptyState';
import { formatCurrency } from '../../utils/currency';
import { MenuItem } from '../../types';
import { useTranslation } from 'react-i18next';

interface CartLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

interface CashierOrderingPanelProps {
  /** Called after a successful order submission — parent can refresh its queue. */
  onOrderCreated?: (order: unknown) => void;
  initialTableNumber?: string;
  /** Menu search to open with (used when a global search hit is clicked). */
  initialSearch?: string;
}

/* Category presentation — mirrors the menu list page filter bar. */
const CATEGORY_META: Record<'ALL' | 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER', { icon: LucideIcon; label: string }> = {
  ALL: { icon: LayoutGrid, label: 'All' },
  FOOD: { icon: UtensilsCrossed, label: 'Food' },
  DRINK: { icon: Coffee, label: 'Drinks' },
  DESSERT: { icon: CakeSlice, label: 'Desserts' },
  OTHER: { icon: Sparkles, label: 'Other' },
};

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'price-asc', label: 'Price (Low → High)' },
  { value: 'price-desc', label: 'Price (High → Low)' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

const CATEGORY_BADGE: Record<string, 'success' | 'default' | 'warning' | 'neutral'> = {
  FOOD: 'success',
  DRINK: 'default',
  DESSERT: 'warning',
  OTHER: 'neutral',
};

/**
 * CashierOrderingPanel — Phase 14, §1.3.
 *
 * Replaces the cashier's "queue + payment" surface with a menu + cart flow when
 * the system setting `cashierOrderingEnabled === "true"`. The component is
 * lazily code-split (see App.tsx) so a Cashier session where ordering is
 * disabled never even downloads it.
 *
 * The order is submitted via POST /orders with a UUID v4 `clientOrderId`,
 * matching the external mobile app's contract exactly. The server is
 * idempotent on `clientOrderId`, so a retry (e.g. flaky network) returns the
 * existing order rather than creating a duplicate.
 */
export const CashierOrderingPanel: React.FC<CashierOrderingPanelProps> = ({ onOrderCreated, initialTableNumber = '', initialSearch = '' }) => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('cashier');
  const menuQuery = useMenuQuery();
  const items: MenuItem[] = menuQuery.data ?? [];

  type CategoryKey = 'ALL' | 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';

  // Icons come from the menu-list presentation, labels stay localised.
  const CATEGORY_LABELS: Record<CategoryKey, string> = {
    ALL: t('ordering.categories.all'),
    FOOD: t('ordering.categories.food'),
    DRINK: t('ordering.categories.drinks'),
    DESSERT: t('ordering.categories.desserts'),
    OTHER: t('ordering.categories.other'),
  };

  const CATEGORIES: Array<{ key: CategoryKey; label: string; count: number }> = (
    ['ALL', 'FOOD', 'DRINK', 'DESSERT', 'OTHER'] as CategoryKey[]
  ).map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    count:
      key === 'ALL'
        ? items.filter((i) => i.isAvailable).length
        : items.filter((i) => i.isAvailable && i.category === key).length,
  }));

  const [search, setSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<SortValue>('name-asc');
  const [category, setCategory] = useState<CategoryKey>('ALL');
  const [tableNumber, setTableNumber] = useState(initialTableNumber);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  // Waiter selection
  const [waiters, setWaiters] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedWaiterId, setSelectedWaiterId] = useState('');

  useEffect(() => {
    axiosClient
      .get('/users', { params: { role: 'WAITER', isActive: 'true' } })
      .then((res) => setWaiters(res.data || []))
      .catch(() => {/* silent — cashier can still try to submit */});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (!i.isAvailable) return false;
      if (category !== 'ALL' && i.category !== category) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [items, category, search, sortBy]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = { ALL: 0, FOOD: 0, DRINK: 0, DESSERT: 0, OTHER: 0 };
    for (const item of items) {
      if (!item.isAvailable) continue;
      counts.ALL += 1;
      counts[item.category as CategoryKey] = (counts[item.category as CategoryKey] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart]
  );
  const totalQty = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const addToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1 },
      ];
    });
  }, []);

  const setQuantity = useCallback((menuItemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: qty } : l))
    );
  }, []);

  const removeLine = useCallback((menuItemId: string) => {
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const setLineNotes = useCallback((menuItemId: string, notes: string) => {
    setCart((prev) =>
      prev.map((l) => (l.menuItemId === menuItemId ? { ...l, notes } : l))
    );
  }, []);

  const handleSubmit = async () => {
    if (!tableNumber.trim()) {
      addToast({ type: 'error', title: t('ordering.toasts.tableRequired'), message: t('ordering.toasts.tableRequiredMsg') });
      return;
    }
    if (!selectedWaiterId) {
      addToast({ type: 'error', title: 'Waiter required', message: 'Please select the waiter serving this table.' });
      return;
    }
    if (cart.length === 0) {
      addToast({ type: 'error', title: t('ordering.toasts.emptyCart'), message: t('ordering.toasts.emptyCartMsg') });
      return;
    }

    setIsSubmitting(true);
    try {
      const clientOrderId = crypto.randomUUID();
      const res = await axiosClient.post('/orders', {
        clientOrderId,
        tableNumber: tableNumber.trim(),
        waiterId: selectedWaiterId || undefined,
        items: cart.map((l) => ({
          menuItemId: l.menuItemId,
          name: l.name,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          notes: l.notes || '',
        })),
      });
      addToast({
        type: 'success',
        title: t('ordering.toasts.orderPlaced'),
        message: t(totalQty === 1 ? 'ordering.toasts.orderPlacedMsg' : 'ordering.toasts.orderPlacedMsg_other', {
          table: tableNumber,
          count: totalQty,
        }),
      });

      // The order is saved either way — but the kitchen ticket must never fail
      // silently. Tell the cashier straight away if it never reached the printer.
      const printWarning: string | null = res.data?.printWarning ?? null;
      if (printWarning) {
        addToast({
          type: 'warning',
          title: 'Ticket not printed',
          message: `${printWarning} The order is on the Tickets page — reprint it from there once the printer is back.`,
        });
      }
      setCart([]);
      setTableNumber('');
      setSelectedWaiterId('');
      setJustSubmitted(true);
      setShowMobileCart(false);
      onOrderCreated?.(res.data?.order ?? res.data);
      setTimeout(() => setJustSubmitted(false), 1800);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: t('ordering.toasts.orderFailed'),
        message: extractErrorMessage(err) || t('ordering.toasts.orderFailedMsg'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex-1 flex bg-background text-foreground overflow-hidden relative">
      {/* Menu column */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-r border-border max-[767px]:pb-16 relative">
        {/* Filter bar — same shape as the menu list page: search, sort, category. */}
        <div className="px-5 py-3 border-b border-border bg-card/40 space-y-3 shrink-0 max-[767px]:px-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap lg:flex-nowrap">
            <div className="relative flex-1 min-w-[180px] max-[419px]:min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('ordering.searchPlaceholder')}
                className="h-10 pl-9 max-[767px]:h-10"
                aria-label={t('a11y.searchMenu')}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger aria-label={t('a11y.sortMenu')} className="shrink-0 h-10 w-[168px] max-[419px]:w-full">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    selected={sortBy === opt.value}
                    onSelect={() => setSortBy(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger aria-label={t('a11y.filterCategory')} className="shrink-0 h-10 max-[419px]:w-full">
                {React.createElement(CATEGORY_META[category].icon, {
                  className: 'w-4 h-4 text-muted-foreground',
                })}
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="text-[10px] font-bold rounded-md bg-background px-1.5 py-0.5 border border-border/60">
                  {categoryCounts[category] ?? 0}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_META[cat.key].icon;
                  return (
                    <DropdownMenuItem
                      key={cat.key}
                      selected={category === cat.key}
                      onSelect={() => setCategory(cat.key)}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{cat.label}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-mono">
                        {categoryCounts[cat.key] ?? 0}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground font-medium">
              {t('ordering.showingCount', {
                shown: filtered.length,
                total: items.filter((i) => i.isAvailable).length,
              })}
            </p>
            {(search.trim() || category !== 'ALL' || sortBy !== 'name-asc') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCategory('ALL');
                  setSortBy('name-asc');
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground',
                  'transition-colors hover:border-primary/40 hover:text-foreground',
                )}
              >
                <FilterX className="w-3 h-3" />
                {t('ordering.clearFilters')}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 max-[767px]:p-4">
          {menuQuery.isLoading ? (
            <LoadingState message={t('ordering.loadingMenu')} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="w-8 h-8 text-muted-foreground" />}
              title={t('ordering.noItems')}
              message={
                items.length === 0
                  ? t('ordering.noItemsMenu')
                  : t('ordering.noItemsFilter')
              }
            />
          ) : (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 max-[767px]:gap-3"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.04 } } }}
            >
              {filtered.map((item) => (
                <motion.button
                  key={item.id}
                  variants={{
                    hidden: { opacity: 0, y: 10, scale: 0.97 },
                    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
                  }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => addToCart(item)}
                  className="text-left"
                >
                  <Card className="overflow-hidden flex flex-col hover:border-primary/50 hover:shadow-md transition-all h-full">
                    <div className="w-full h-24 bg-secondary/40 flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-7 h-7 text-muted-foreground/40" />
                      )}
                    </div>
                    <CardContent className="p-3 flex flex-col gap-1.5 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{item.name}</p>
                      <p className="text-base font-mono font-bold text-primary">{formatCurrency(item.price)}</p>
                      <Badge variant={CATEGORY_BADGE[item.category] ?? 'neutral'} className="w-fit text-[10px]">
                        {item.category}
                      </Badge>
                    </CardContent>
                  </Card>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Floating action bar on mobile */}
        <div className="hidden max-[767px]:block absolute bottom-0 inset-x-0 p-3 bg-card border-t border-border shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)] z-10">
          <Button onClick={() => setShowMobileCart(true)} className="w-full h-12 text-base font-bold shadow-lg bg-brand-gradient text-white">
             <ShoppingCart className="w-5 h-5 mr-2" />
             {t('ordering.cart.title')} ({totalQty}) <span className="ml-2 font-mono text-white/90">{formatCurrency(total)}</span>
          </Button>
        </div>
      </div>

      {/* Backdrop for cart on mobile */}
      {showMobileCart && (
        <div 
           className="hidden max-[767px]:block fixed inset-0 z-40 bg-black/60 transition-opacity"
           onClick={() => setShowMobileCart(false)} 
        />
      )}

      {/* Cart column — pinned footer pattern:
       *  - h-full + min-h-0 lock the column to the panel's height
       *  - header (title + table input) stays at the top
       *  - the items area is the only thing that scrolls (min-h-0 lets the
       *    shrink kick in so the footer never gets pushed down)
       *  - the "Place Order" footer is fixed at the bottom regardless of
       *    how many items the cashier adds */}
      <div className={`w-96 shrink-0 h-full min-h-0 bg-card flex flex-col max-[767px]:w-[85vw] max-[767px]:max-w-sm max-[767px]:absolute max-[767px]:right-0 max-[767px]:top-0 max-[767px]:bottom-0 max-[767px]:z-50 max-[767px]:shadow-2xl max-[767px]:transition-transform max-[767px]:duration-300 ${showMobileCart ? 'max-[767px]:translate-x-0' : 'max-[767px]:translate-x-full'}`}>
        <div className="px-5 py-4 border-b border-border shrink-0 relative">
          <button 
            onClick={() => setShowMobileCart(false)} 
            className="hidden max-[767px]:block absolute top-4 right-4 p-1.5 rounded-full bg-secondary/80 text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              {t('ordering.cart.title')}
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              {t('ordering.cart.line', { count: cart.length })}
            </span>
          </div>

          {/* Waiter selector — house dropdown; the trigger keeps the
              destructive border while no waiter is chosen. */}
          <div className="bg-secondary/30 rounded-lg p-4 border border-border/50 mb-3">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
              <UserRound className="inline w-3 h-3 mr-1" />
              {t('ordering.waiterLabel')}
            </label>
            <div className={selectedWaiterId ? '' : '[&>button]:border-destructive/60'}>
              <DropdownSelect
                ariaLabel={t('ordering.waiterLabel')}
                className="w-full justify-between"
                contentClassName="max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
                value={selectedWaiterId}
                onChange={setSelectedWaiterId}
                placeholder="— Select a waiter —"
                options={waiters.map((w) => ({ value: w.id, label: w.name }))}
              />
            </div>
          </div>

          <label htmlFor="order-table" className="text-xs text-muted-foreground mb-1 block">
            {t('ordering.cart.tableNumber')}
          </label>
          <Input
            id="order-table"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder={t('ordering.cart.tablePlaceholder')}
            className="font-mono"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
              <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{t('ordering.cart.emptyCart')}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {cart.map((line) => (
                <motion.div
                  key={line.menuItemId}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 50, transition: { duration: 0.15 } }}
                  className="bg-secondary/30 border border-border rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{line.name}</p>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        {formatCurrency(line.unitPrice)} {t('ordering.cart.each')}
                      </p>
                    </div>
                    <button
                      onClick={() => removeLine(line.menuItemId)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={t('ordering.cart.remove')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <div className="flex items-center gap-1 bg-background border border-border rounded-md">
                      <button
                        onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                        className="p-1.5 hover:text-primary transition-colors"
                        aria-label={t('ordering.cart.decreaseQty')}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                        className="p-1.5 hover:text-primary transition-colors"
                        aria-label={t('ordering.cart.increaseQty')}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-mono font-semibold text-sm text-foreground tabular-nums">
                      {formatCurrency(line.unitPrice * line.quantity)}
                    </span>
                  </div>
                  <Input
                    value={line.notes ?? ''}
                    onChange={(e) => setLineNotes(line.menuItemId, e.target.value)}
                    placeholder={t('ordering.cart.notesPlaceholder')}
                    className="mt-2 h-8 text-xs"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-5 space-y-3 bg-card">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('ordering.cart.items')}</span>
            <span className="font-mono tabular-nums">{totalQty}</span>
          </div>
          <div className="flex justify-between items-center text-lg font-display font-semibold">
            <span>{t('ordering.cart.total')}</span>
            <span className="font-mono tabular-nums text-primary">{formatCurrency(total)}</span>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || justSubmitted || cart.length === 0 || !tableNumber.trim() || !selectedWaiterId}
            className="w-full h-12"
            size="lg"
          >
            {isSubmitting ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                />
                {t('ordering.cart.placingOrder')}
              </motion.span>
            ) : justSubmitted ? (
              <motion.span
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('ordering.cart.sentToKitchen')}
              </motion.span>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                {t('ordering.cart.placeOrder')}
              </>
            )}
          </Button>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCart([])}
              className="w-full text-muted-foreground"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              {t('ordering.cart.clearCart')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
