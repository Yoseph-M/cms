import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  ReceiptText,
  Search,
  SearchX,
  Users,
  UtensilsCrossed,
  X,
  Ban,
  CheckCircle2,
  Clock,
  Wallet,
  Coins,
  CreditCard,
  Printer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/currency';
import { cn } from '../../lib/utils';

type RawResults = {
  staff: any[];
  menuItems: any[];
  orders: any[];
  expenses: any[];
  payroll: any[];
  settlements: any[];
  printers: any[];
};
const EMPTY: RawResults = {
  staff: [],
  menuItems: [],
  orders: [],
  expenses: [],
  payroll: [],
  settlements: [],
  printers: [],
};

type GroupKey =
  | 'Staff'
  | 'Menu items'
  | 'Orders'
  | 'Expenses'
  | 'Payroll'
  | 'Settlements'
  | 'Printers';

interface FlatResult {
  key: string;
  group: GroupKey;
  label: string;
  detail?: string;
  path: string;
  state?: Record<string, unknown>;
}

const GROUP_ICONS: Record<GroupKey, React.FC<{ className?: string }>> = {
  Staff: Users,
  'Menu items': UtensilsCrossed,
  Orders: ReceiptText,
  Expenses: Wallet,
  Payroll: Coins,
  Settlements: CreditCard,
  Printers: Printer,
};

const GROUP_LABEL_KEYS: Record<GroupKey, string> = {
  Staff: 'palette.staff',
  'Menu items': 'palette.menuItems',
  Orders: 'palette.orders',
  Expenses: 'palette.expenses',
  Payroll: 'palette.payroll',
  Settlements: 'palette.settlements',
  Printers: 'palette.printers',
};

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const monthLabel = (month?: number, year?: number): string => {
  const name = MONTH_SHORT[(Number(month) || 1) - 1] ?? '';
  return `${name} ${year ?? ''}`.trim();
};

const shortDate = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_META: Record<string, { labelKey: string; className: string; icon: React.ReactNode }> = {
  SUBMITTED: { labelKey: 'app.statusNew', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', icon: <Clock className="h-3 w-3" /> },
  IN_KITCHEN: { labelKey: 'orderStatus.inKitchen', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: <Clock className="h-3 w-3" /> },
  SERVED: { labelKey: 'orderStatus.served', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  PAID: { labelKey: 'status.paid', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> },
  CANCELLED: { labelKey: 'status.cancelled', className: 'bg-destructive/10 text-destructive', icon: <Ban className="h-3 w-3" /> },
};

/**
 * Header search with an inline results dropdown.
 *
 * Every signed-in role gets it — Owner/Manager search staff, menu, orders,
 * expenses, settlements, payroll and printers, while a Cashier searches the
 * menu and live orders, then lands straight in the order builder (pre-filtered
 * to the item) or on the matching ticket. Multi-word
 * queries act as filters ("table 3 cancelled", "beef 25"). The dropdown closes
 * on outside click, Escape, or navigation.
 */
export const GlobalSearch: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RawResults>(EMPTY);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSearch = Boolean(user);
  const isCashier = user?.role === 'CASHIER';
  const ownerOnly = user?.role === 'OWNER';
  const role = user?.role === 'MANAGER' ? 'manager' : 'owner';

  const trimmed = query.trim();

  // Debounced fetch — results land in the header dropdown, not a modal.
  useEffect(() => {
    if (!canSearch) return;
    if (trimmed.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await axiosClient.get(`/search?q=${encodeURIComponent(trimmed)}`);
        setResults(res.data ?? EMPTY);
        setActiveIndex(0);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [trimmed, canSearch]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Ctrl/Cmd+K focuses the header search directly.
  useEffect(() => {
    if (!canSearch) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSearch]);

  const staffPath = (id: string) =>
    user?.role === 'OWNER'
      ? `/owner/admin?tab=staff&highlight=${id}`
      : `/manager/staff?highlight=${id}`;

  const flat = useMemo<FlatResult[]>(() => {
    const items: FlatResult[] = [];
    results.staff.forEach((item) =>
      items.push({
        key: `staff-${item.id}`,
        group: 'Staff',
        label: item.name,
        detail: [item.role, item.phone].filter(Boolean).join(' · '),
        path: staffPath(item.id),
      }),
    );
    results.menuItems.forEach((item) =>
      items.push({
        key: `menu-${item.id}`,
        group: 'Menu items',
        label: item.name,
        detail: `${formatCurrency(item.price)}${item.isAvailable === false ? ` · ${t('menu.unavailable')}` : ''}`,
        // A cashier lands in the order builder with the item already filtered.
        path: isCashier ? '/cashier/tickets' : `/${role}/menu?highlight=${item.id}`,
        state: isCashier ? { newOrderItemSearch: item.name } : undefined,
      }),
    );
    results.orders.forEach((item) => {
      items.push({
        key: `order-${item.id}`,
        group: 'Orders',
        label: `Table ${item.tableNumber ?? '—'}`,
        detail: `#${String(item.clientOrderId ?? '').slice(0, 8)} · ${formatCurrency(item.totalAmount)}${(item.items ?? []).length ? ` · ${(item.items ?? []).length} items` : ''}`,
        path: isCashier ? '/cashier/tickets' : `/${role}/settlements`,
        state: isCashier && item.tableNumber ? { queueSearch: String(item.tableNumber) } : { orderFilter: item.id },
      });
    });
    (results.expenses ?? []).forEach((item) =>
      items.push({
        key: `expense-${item.id}`,
        group: 'Expenses',
        label: item.description || String(item.category ?? 'Expense'),
        detail: `${formatCurrency(item.amount)} · ${String(item.category ?? '').toLowerCase()}${item.recordedBy?.name ? ` · by ${item.recordedBy.name}` : ''}${shortDate(item.date) ? ` · ${shortDate(item.date)}` : ''}`,
        path: `/${role}/expenses`,
      }),
    );
    (results.payroll ?? []).forEach((item) =>
      items.push({
        key: `payroll-${item.id}`,
        group: 'Payroll',
        label: `${item.user?.name ?? 'Payroll'} — ${monthLabel(item.periodMonth, item.periodYear)}`,
        detail: `${formatCurrency(item.paidAmount)} ${t('globalSearch.paidWord')}${item.note ? ` · ${item.note}` : ''}`,
        path: `/${role}/payroll`,
      }),
    );
    (results.settlements ?? []).forEach((item) =>
      items.push({
        key: `settlement-${item.id}`,
        group: 'Settlements',
        label: `${t('globalSearch.tableWord')} ${item.order?.tableNumber ?? '—'} · ${formatCurrency(item.amountMinor)}`,
        detail: `${String(item.method ?? '').toLowerCase()}${item.order?.clientOrderId ? ` · #${String(item.order.clientOrderId).slice(0, 8)}` : ''}${shortDate(item.createdAt) ? ` · ${shortDate(item.createdAt)}` : ''}`,
        path: `/${role}/settlements`,
        state: item.orderId ? { orderFilter: item.orderId } : undefined,
      }),
    );
    if (ownerOnly) {
      (results.printers ?? []).forEach((item) =>
        items.push({
          key: `printer-${item.id}`,
          group: 'Printers',
          label: item.station === 'kitchen' ? t('globalSearch.ticketPrinter') : String(item.station ?? t('palette.printers')),
          detail: [item.transport, item.ip, item.macAddress].filter(Boolean).join(' · '),
          path: '/owner/admin?tab=printers',
        }),
      );
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, role, user?.role, isCashier, ownerOnly, t]);

  // Module-level map would leak between renders; a plain Map recreated per
  // render is fine at this size.
  const statusByKey = useMemo(() => {
    const map = new Map<string, { labelKey: string; className: string; icon: React.ReactNode }>();
    results.orders.forEach((item) => {
      map.set(`order-${item.id}`, STATUS_META[item.status] ?? { labelKey: '', className: 'bg-secondary/60 text-muted-foreground', icon: null });
    });
    return map;
  }, [results.orders]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const go = (target: FlatResult) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(target.path, target.state ? { state: target.state } : undefined);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (open) close();
      else inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flat[activeIndex];
      if (target) go(target);
    }
  };

  if (!canSearch) return null;

  const showDropdown = open && trimmed.length >= 2;
  const groupOrder: GroupKey[] = isCashier
    ? ['Menu items', 'Orders']
    : [
        'Staff',
        'Menu items',
        'Orders',
        'Expenses',
        'Settlements',
        'Payroll',
        ...(ownerOnly ? (['Printers'] as GroupKey[]) : []),
      ];

  return (
    <div className="relative block" ref={rootRef}>
      <Search
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
          open ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={isCashier ? t('globalSearch.placeholderCashier') : t('globalSearch.placeholder')}
        aria-label={t('globalSearch.searchAria')}
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
        className={cn(
          'h-9 w-44 sm:w-64 lg:w-80 rounded-lg border border-input bg-card pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground shadow-sm outline-none transition-all',
          'focus:border-primary/50 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.10)]',
        )}
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setResults(EMPTY);
            inputRef.current?.focus();
          }}
          aria-label={t('a11y.clearSearch')}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground sm:inline-flex"
        >
          ⌘K
        </kbd>
      )}

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 top-full mt-2 z-50 w-[22rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>{t('globalSearch.results')}</span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {flat.length === 0 && !loading ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
                <SearchX className="h-6 w-6" />
                {t('globalSearch.noResults', { query: trimmed })}
              </div>
            ) : (
              groupOrder.map((group) => {
                const items = flat.filter((item) => item.group === group);
                if (items.length === 0) return null;
                const Icon = GROUP_ICONS[group];
                return (
                  <div key={group} className="mb-1 last:mb-0">
                    <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t(GROUP_LABEL_KEYS[group])}
                    </p>
                    {items.map((item) => {
                      const index = flat.indexOf(item);
                      const isActive = index === activeIndex;
                      const status = statusByKey.get(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => go(item)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                            isActive ? 'bg-secondary text-foreground' : 'text-foreground hover:bg-secondary/60',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{item.label}</span>
                            {item.detail && (
                              <span className="block truncate text-[11px] text-muted-foreground">{item.detail}</span>
                            )}
                          </span>
                          {status && (
                            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', status.className)}>
                              {status.icon}
                              {status.labelKey && t(status.labelKey)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
