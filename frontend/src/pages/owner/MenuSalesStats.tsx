import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpDown,
  ChartBar,
  Search,
  UtensilsCrossed,
  Coffee,
  CakeSlice,
  Sparkles,
  LayoutGrid,
  Receipt,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/Dropdown';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useHeaderStore } from '../../store/headerStore';
import { useMenuQuery } from '../../hooks/useCachedQueries';
import { axiosClient } from '../../api/axiosClient';
import { cn } from '../../lib/utils';

/**
 * Menu Item Sales Statistics
 *
 * Which menu items are actually being sold, how many times each has been sold,
 * and the revenue each has produced — one row per item, searchable and
 * sortable. Data comes from the analytics `top-items` aggregation (server
 * calculated from PAID-order line items, never the client), joined with the
 * menu catalog so items with zero sales still appear.
 */

interface SalesRow {
  name: string;
  totalQty: number;
  totalRevenue: number;
  imageUrl?: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  nameAmharic?: string | null;
  category: 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

type CategoryKey = 'ALL' | 'FOOD' | 'DRINK' | 'DESSERT' | 'OTHER';
type RangeKey = '7d' | '30d' | '90d' | 'all';
type SortKey = 'qty-desc' | 'qty-asc' | 'revenue-desc' | 'name-asc';

const CATEGORY_META: Record<CategoryKey, { icon: LucideIcon; label: string; badge: 'success' | 'default' | 'warning' | 'neutral' }> = {
  ALL: { icon: LayoutGrid, label: 'All', badge: 'neutral' },
  FOOD: { icon: UtensilsCrossed, label: 'Food', badge: 'success' },
  DRINK: { icon: Coffee, label: 'Drinks', badge: 'default' },
  DESSERT: { icon: CakeSlice, label: 'Desserts', badge: 'warning' },
  OTHER: { icon: Sparkles, label: 'Other', badge: 'neutral' },
};

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '7d', label: 'Last 7 days', days: 6 },
  { key: '30d', label: 'Last 30 days', days: 29 },
  { key: '90d', label: 'Last 90 days', days: 89 },
  { key: 'all', label: 'All time', days: 0 },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'qty-desc', label: 'Most sold' },
  { key: 'qty-asc', label: 'Least sold' },
  { key: 'revenue-desc', label: 'Highest revenue' },
  { key: 'name-asc', label: 'Name (A–Z)' },
];

const CATEGORIES: CategoryKey[] = ['ALL', 'FOOD', 'DRINK', 'DESSERT', 'OTHER'];

function rangeToParams(range: RangeKey): Record<string, string> {
  if (range === 'all') return {};
  const days = RANGE_OPTIONS.find((r) => r.key === range)?.days ?? 29;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Menu category for an order-line name, matched against the live catalog. */
function categoryForName(
  name: string,
  catalogByName: Map<string, MenuItem>,
): CategoryKey {
  const direct = catalogByName.get(name);
  if (direct) return direct.category;
  // Bilingual snapshots look like "አማርኛ (English)" — try the English tail.
  const m = name.match(/\(([^)]+)\)\s*$/);
  if (m) {
    const inner = catalogByName.get(m[1]);
    if (inner) return inner.category;
    const prefix = catalogByName.get(name.replace(/\s*\([^)]+\)\s*$/, ''));
    if (prefix) return prefix.category;
  }
  return 'OTHER';
}

export const MenuSalesStats: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({
      title: 'Item Sales',
      subtitle: 'Which items are selling, and how often',
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const [range, setRange] = useState<RangeKey>('30d');
  const [category, setCategory] = useState<CategoryKey>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('qty-desc');
  const [search, setSearch] = useState('');

  const menuQuery = useMenuQuery();
  const menuItems: MenuItem[] = Array.isArray(menuQuery.data) ? menuQuery.data : [];

  const catalogByName = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menuItems) {
      if (item.name) map.set(item.name, item);
      if (item.nameAmharic) map.set(item.nameAmharic, item);
    }
    return map;
  }, [menuItems]);

  const rangeParams = useMemo(() => rangeToParams(range), [range]);

  // Server-side aggregation over PAID orders' line items — never a client calc.
  const salesQuery = useQuery<SalesRow[]>({
    queryKey: ['analytics', 'top-items', 'sales-stats', range],
    queryFn: async () => {
      const qs = new URLSearchParams({ ...rangeParams, limit: '200' }).toString();
      const res = await axiosClient.get(`/analytics/top-items?${qs}`);
      return res.data as SalesRow[];
    },
    staleTime: 90_000,
  });

  const sales: SalesRow[] = Array.isArray(salesQuery.data) ? salesQuery.data : [];

  const rows = useMemo(() => {
    const byName = new Map<string, { name: string; totalQty: number; totalRevenue: number; imageUrl?: string | null }>();
    for (const row of sales) {
      byName.set(row.name, row);
    }
    // Every catalog item appears — zero-sale items show as 0 sold.
    const merged: Array<{
      name: string;
      totalQty: number;
      totalRevenue: number;
      imageUrl?: string | null;
      category: CategoryKey;
    }> = [];
    for (const item of menuItems) {
      const label = item.nameAmharic || item.name;
      const stat =
        byName.get(item.name) ??
        byName.get(item.nameAmharic ?? '') ??
        null;
      if (stat) byName.delete(item.name);
      if (stat) byName.delete(item.nameAmharic ?? '');
      merged.push({
        name: label,
        totalQty: stat?.totalQty ?? 0,
        totalRevenue: stat?.totalRevenue ?? 0,
        imageUrl: item.imageUrl ?? stat?.imageUrl ?? null,
        category: item.category,
      });
    }
    // Order lines whose menu item was renamed/deleted still count as sales.
    for (const stat of byName.values()) {
      if (!stat.name) continue;
      merged.push({
        name: stat.name,
        totalQty: stat.totalQty,
        totalRevenue: stat.totalRevenue,
        imageUrl: stat.imageUrl ?? null,
        category: categoryForName(stat.name, catalogByName),
      });
    }

    const q = search.trim().toLowerCase();
    const filtered = merged.filter((row) => {
      const matchesCategory = category === 'ALL' || row.category === category;
      const matchesSearch = !q || row.name.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'qty-asc':
        sorted.sort((a, b) => a.totalQty - b.totalQty || a.name.localeCompare(b.name));
        break;
      case 'revenue-desc':
        sorted.sort((a, b) => b.totalRevenue - a.totalRevenue || a.name.localeCompare(b.name));
        break;
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        sorted.sort((a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name));
    }
    return sorted;
  }, [sales, menuItems, category, sortBy, search, catalogByName]);

  const totals = useMemo(
    () => ({
      units: rows.reduce((sum, r) => sum + r.totalQty, 0),
      revenue: rows.reduce((sum, r) => sum + r.totalRevenue, 0),
      sold: rows.filter((r) => r.totalQty > 0).length,
    }),
    [rows],
  );

  const maxQty = Math.max(1, ...rows.map((r) => r.totalQty));
  const activeRangeLabel = RANGE_OPTIONS.find((r) => r.key === range)?.label ?? 'All time';
  const activeSortLabel = SORT_OPTIONS.find((s) => s.key === sortBy)?.label ?? 'Most sold';

  const isLoading = salesQuery.isLoading || menuQuery.isLoading;
  const error = salesQuery.error
    ? extractErrorMessage(salesQuery.error, 'Failed to load sales statistics.')
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Units sold</p>
              <p className="font-display text-xl font-bold tabular-nums text-foreground">{totals.units}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <ChartBar className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Item revenue</p>
              <p className="font-display text-xl font-bold tabular-nums text-foreground">{formatCurrency(totals.revenue)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Items sold</p>
              <p className="font-display text-xl font-bold tabular-nums text-foreground">
                {totals.sold}
                <span className="text-sm font-medium text-muted-foreground"> / {menuItems.length}</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="pl-9"
              aria-label="Search sold items"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by category" className="shrink-0 h-10">
              {React.createElement(CATEGORY_META[category].icon, {
                className: 'w-4 h-4 text-muted-foreground',
              })}
              <span>{CATEGORY_META[category].label}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {CATEGORIES.map((cat) => {
                const Icon = CATEGORY_META[cat].icon;
                return (
                  <DropdownMenuItem
                    key={cat}
                    selected={category === cat}
                    onSelect={() => setCategory(cat)}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{CATEGORY_META[cat].label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Filter by period" className="shrink-0 h-10">
              <span className="hidden sm:inline">{activeRangeLabel}</span>
              <span className="sm:hidden">Period</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {RANGE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  selected={range === opt.key}
                  onSelect={() => setRange(opt.key)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Sort items" className="shrink-0 h-10">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="hidden sm:inline">{activeSortLabel}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  selected={sortBy === opt.key}
                  onSelect={() => setSortBy(opt.key)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <LoadingState message="Crunching sales…" />
      ) : error ? (
        <EmptyState
          icon={<ChartBar className="w-8 h-8 text-muted-foreground" />}
          title="Couldn't load sales"
          message={error}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="w-8 h-8 text-muted-foreground" />}
          title="No menu items"
          message="Add items to the menu to start tracking how often they sell."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 hidden sm:table-cell">Category</th>
                    <th className="px-4 py-3 text-right">Times sold</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <motion.tr
                      key={`${row.name}-${i}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.2), duration: 0.2 }}
                      className={cn(
                        'border-b border-border/40 last:border-0 hover:bg-secondary/20 transition-colors',
                        row.totalQty === 0 && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-secondary/50">
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                {React.createElement(CATEGORY_META[row.category].icon, {
                                  className: 'h-4 w-4 text-muted-foreground/50',
                                })}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{row.name}</p>
                            {/* Popularity bar — width relative to the best seller */}
                            <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-secondary sm:w-32">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50"
                                style={{ width: `${Math.max(3, Math.round((row.totalQty / maxQty) * 100))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant={CATEGORY_META[row.category].badge} className="text-[10px]">
                          {CATEGORY_META[row.category].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-foreground">
                        {row.totalQty}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground hidden md:table-cell">
                        {formatCurrency(row.totalRevenue)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MenuSalesStats;
