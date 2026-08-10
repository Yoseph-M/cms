import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Minus, Trash2, X, ShoppingCart, UtensilsCrossed, CheckCircle2, ImageIcon } from 'lucide-react';
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
}

const CATEGORIES: Array<{ key: 'ALL' | 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'FOOD', label: 'Food' },
  { key: 'DRINK', label: 'Drinks' },
  { key: 'DESSERT', label: 'Desserts' },
  { key: 'OTHER', label: 'Other' },
];

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
export const CashierOrderingPanel: React.FC<CashierOrderingPanelProps> = ({ onOrderCreated, initialTableNumber = '' }) => {
  const { addToast } = useToastStore();
  const menuQuery = useMenuQuery();
  const items: MenuItem[] = menuQuery.data ?? [];

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'ALL' | 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER'>('ALL');
  const [tableNumber, setTableNumber] = useState(initialTableNumber);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (!i.isAvailable) return false;
      if (category !== 'ALL' && i.category !== category) return false;
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, category, search]);

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
      addToast({ type: 'error', title: 'Table required', message: 'Enter a table number before placing the order.' });
      return;
    }
    if (cart.length === 0) {
      addToast({ type: 'error', title: 'Empty cart', message: 'Add at least one item to the order.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const clientOrderId = crypto.randomUUID();
      const res = await axiosClient.post('/orders', {
        clientOrderId,
        tableNumber: tableNumber.trim(),
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
        title: 'Order placed',
        message: `Table ${tableNumber} — ${totalQty} item${totalQty === 1 ? '' : 's'} sent to kitchen.`,
      });
      setCart([]);
      setTableNumber('');
      setJustSubmitted(true);
      onOrderCreated?.(res.data?.order ?? res.data);
      setTimeout(() => setJustSubmitted(false), 1800);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Order failed',
        message: err.response?.data?.error || 'Could not place the order. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex bg-background text-foreground overflow-hidden">
      {/* Menu column */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        <div className="px-6 py-4 border-b border-border bg-card/40 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg w-fit border border-border/50">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  category === c.key
                    ? 'bg-background text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {menuQuery.isLoading ? (
            <LoadingState message="Loading menu..." />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="w-8 h-8 text-muted-foreground" />}
              title="No items to show"
              message={
                items.length === 0
                  ? 'No menu items have been added yet. Ask an Owner or Manager to set up the menu.'
                  : 'No items match your filter.'
              }
            />
          ) : (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4"
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
      </div>

      {/* Cart column */}
      <div className="w-96 shrink-0 bg-card flex flex-col">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              New Order
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              {cart.length} line{cart.length === 1 ? '' : 's'}
            </span>
          </div>
          <label htmlFor="order-table" className="text-xs text-muted-foreground mb-1 block">
            Table number
          </label>
          <Input
            id="order-table"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="e.g. 12 or Takeout"
            className="font-mono"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
              <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Tap menu items to add them here.</p>
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
                        {formatCurrency(line.unitPrice)} ea
                      </p>
                    </div>
                    <button
                      onClick={() => removeLine(line.menuItemId)}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Remove line"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <div className="flex items-center gap-1 bg-background border border-border rounded-md">
                      <button
                        onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                        className="p-1.5 hover:text-primary transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                        className="p-1.5 hover:text-primary transition-colors"
                        aria-label="Increase quantity"
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
                    placeholder="Notes (optional)"
                    className="mt-2 h-8 text-xs"
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        <div className="border-t border-border p-5 space-y-3 bg-card">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items</span>
            <span className="font-mono tabular-nums">{totalQty}</span>
          </div>
          <div className="flex justify-between items-center text-lg font-display font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums text-primary">{formatCurrency(total)}</span>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || justSubmitted || cart.length === 0 || !tableNumber.trim()}
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
                Placing order…
              </motion.span>
            ) : justSubmitted ? (
              <motion.span
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Sent to kitchen
              </motion.span>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Place Order
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
              Clear cart
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
