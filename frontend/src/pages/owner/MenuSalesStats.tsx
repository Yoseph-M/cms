import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpDown,
  ChartBar,
  Clock,
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
import { ChartToggle } from '../../components/ui/TremorWidgets';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useHeaderStore } from '../../store/headerStore';
import { useMenuQuery } from '../../hooks/useCachedQueries';
import {
  displayItemName as displayName,
  findItemBySnapshot,
  indexItemsByName,
  isAmharicLanguage,
  normalizeItemName as normName,
} from '../../utils/itemName';
import { useTranslation } from 'react-i18next';
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

const RANGE_OPTIONS: Array<{ key: RangeKey; labelKey: string; days: number }> = [
  { key: '7d', labelKey: 'last7Days', days: 6 },
  { key: '30d', labelKey: 'last30Days', days: 29 },
  { key: '90d', labelKey: 'last90Days', days: 89 },
  { key: 'all', labelKey: 'allTime', days: 0 },
];

const SORT_OPTIONS: Array<{ key: SortKey; labelKey: string }> = [
  { key: 'qty-desc', labelKey: 'mostSold' },
  { key: 'qty-asc', labelKey: 'leastSold' },
  { key: 'revenue-desc', labelKey: 'highestRevenue' },
  { key: 'name-asc', labelKey: 'nameAZ' },
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

/* Item labels and snapshot keys come from `utils/itemName`, which the dashboards
   share: catalogue rows carry both names, order lines only carry the snapshot,
   and an English user must never see an Amharic-only label (or the reverse). */

/** Menu category for an order-line name, matched against the live catalog. */
function categoryForName(
  name: string,
  catalogByName: Map<string, MenuItem>,
): CategoryKey {
  return findItemBySnapshot(catalogByName, name)?.category ?? 'OTHER';
}

export const MenuSalesStats: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t, i18n } = useTranslation('owner');

  useEffect(() => {
    setPageTitle({
      title: t('nav.itemSales', { defaultValue: 'Item Sales' }),
      subtitle: t('itemSales.subtitle', { defaultValue: 'Which items are selling, and how often' }),
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPageTitle, setShowDateRange]);

  const [range, setRange] = useState<RangeKey>('30d');
  const [category, setCategory] = useState<CategoryKey>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('qty-desc');
  const [search, setSearch] = useState('');

  // Menu rows carry both names; the table must speak the language the user
  // picked instead of always showing Amharic.
  const preferAmharic = isAmharicLanguage(i18n.resolvedLanguage || i18n.language);

  const menuQuery = useMenuQuery();
  const menuItems: MenuItem[] = Array.isArray(menuQuery.data) ? menuQuery.data : [];

  // Indexed by both names (and their normalised forms) so a bilingual snapshot
  // resolves to the same catalogue row as the plain one.
  const catalogByName = useMemo(() => indexItemsByName(menuItems), [menuItems]);

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

  // Units per item per hour — the same aggregation that feeds the peak-hours
  // heatmap, read item-first so each row can name the hour it sells best in.
  const hourlyQuery = useQuery<Array<{ hour: number; name: string; qty: number }>>({
    queryKey: ['analytics', 'items-by-hour', 'sales-stats', range],
    queryFn: async () => {
      const qs = new URLSearchParams(rangeParams).toString();
      const res = await axiosClient.get(`/analytics/items-by-hour${qs ? `?${qs}` : ''}`);
      return res.data as Array<{ hour: number; name: string; qty: number }>;
    },
    staleTime: 90_000,
  });

  /**
   * Best hour for each item. Order lines snapshot bilingual names
   * ("የበሬ ጥብስ (Beef Tibs)") while the catalog row is a single language, so both
   * halves of a snapshot are indexed and lookups are normalised.
   */
  const bestHourByName = useMemo(() => {
    const map = new Map<string, { hour: number; qty: number }>();
    const remember = (key: string, value: { hour: number; qty: number }) => {
      if (!key) return;
      const current = map.get(key);
      if (!current || value.qty > current.qty) map.set(key, value);
    };
    for (const row of Array.isArray(hourlyQuery.data) ? hourlyQuery.data : []) {
      const hour = Number(row?.hour);
      const qty = Number(row?.qty) || 0;
      const name = String(row?.name ?? '');
      if (!name || !Number.isFinite(hour) || qty <= 0) continue;
      remember(normName(name), { hour, qty });
      const tail = name.match(/\(([^)]+)\)\s*$/);
      if (tail) remember(normName(tail[1]), { hour, qty });
    }
    return map;
  }, [hourlyQuery.data]);

  const bestHourFor = (name: string) => bestHourByName.get(normName(name)) ?? null;

  const rows = useMemo(() => {
    const byName = new Map<string, { name: string; totalQty: number; totalRevenue: number; imageUrl?: string | null }>();
    for (const row of sales) {
      byName.set(row.name, row);
    }
    // Every catalog item appears — zero-sale items show as 0 sold.
    const merged: Array<{
      name: string;
      /** DB name of the order line, kept for best-hour lookups when the display
       *  label is a different language than the snapshot. */
      lookupName?: string;
      totalQty: number;
      totalRevenue: number;
      imageUrl?: string | null;
      category: CategoryKey;
    }> = [];
    for (const item of menuItems) {
      const label = displayName(item.name, item.nameAmharic, preferAmharic);
      const stat =
        byName.get(item.name) ??
        byName.get(item.nameAmharic ?? '') ??
        null;
      if (stat) byName.delete(item.name);
      if (stat) byName.delete(item.nameAmharic ?? '');
      merged.push({
        name: label,
        lookupName: stat?.name ?? item.name,
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
        name: displayName(stat.name, null, preferAmharic),
        lookupName: stat.name,
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
  }, [sales, menuItems, category, sortBy, search, catalogByName, preferAmharic]);

  const totals = useMemo(
    () => ({
      units: rows.reduce((sum, r) => sum + r.totalQty, 0),
      revenue: rows.reduce((sum, r) => sum + r.totalRevenue, 0),
    }),
    [rows],
  );

  const maxQty = Math.max(1, ...rows.map((r) => r.totalQty));

  /* Which yardstick "top seller" uses — kept in lock-step with the active sort
     so the headline and the top table row can never name different items. */
  const metric: 'units' | 'revenue' = sortBy.startsWith('revenue') ? 'revenue' : 'units';
  const setMetric = (value: string) => setSortBy(value === 'revenue' ? 'revenue-desc' : 'qty-desc');

  /** Best-selling item in the current view — the item-first headline. */
  const topSeller = useMemo(
    () =>
      rows.reduce<{ name: string; totalQty: number; totalRevenue: number } | null>(
        (best, r) => {
          if (best === null) return r;
          const current = metric === 'units' ? r.totalQty : r.totalRevenue;
          const leader = metric === 'units' ? best.totalQty : best.totalRevenue;
          return current > leader ? r : best;
        },
        null,
      ),
    [rows, metric],
  );
  const activeRangeLabel = RANGE_OPTIONS.find((r) => r.key === range)
    ? t(`itemSales.${RANGE_OPTIONS.find((r) => r.key === range)!.labelKey}`)
    : t('itemSales.allTime');
  const activeSortLabel = SORT_OPTIONS.find((s) => s.key === sortBy)
    ? t(`itemSales.${SORT_OPTIONS.find((s) => s.key === sortBy)!.labelKey}`)
    : t('itemSales.mostSold');

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
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('itemSales.unitsSold')}</p>
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t('itemSales.itemRevenue')}</p>
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('itemSales.topSeller')} ·{' '}
                {t(metric === 'units' ? 'itemSales.metricUnits' : 'itemSales.metricRevenue')}
              </p>
              <p
                className="truncate font-display text-base font-bold text-foreground"
                title={topSeller?.name ?? undefined}
              >
                {topSeller && topSeller.totalQty > 0 ? topSeller.name : '—'}
              </p>
              {/* Both numbers, always — the leader by units and the leader by
                  revenue need not be the same item, so showing only one of
                  them made the card look wrong next to Best sellers. */}
              <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {topSeller && topSeller.totalQty > 0
                  ? `${t('itemSales.soldCount', { count: topSeller.totalQty })} · ${formatCurrency(topSeller.totalRevenue)}`
                  : t('itemSales.noSalesYet')}
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
              placeholder={t('itemSales.searchPlaceholder')}
              className="pl-9"
              aria-label={t('itemSales.searchPlaceholder')}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t('itemSales.filterCategory')} className="shrink-0 h-10">
              {React.createElement(CATEGORY_META[category].icon, {
                className: 'w-4 h-4 text-muted-foreground',
              })}
              <span>{t(`itemSales.cat_${category.toLowerCase()}`)}</span>
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
                    <span>{t(`itemSales.cat_${cat.toLowerCase()}`)}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t('itemSales.filterPeriod')} className="shrink-0 h-10">
              <span className="hidden sm:inline">{activeRangeLabel}</span>
              <span className="sm:hidden">{t('itemSales.period')}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {RANGE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  selected={range === opt.key}
                  onSelect={() => setRange(opt.key)}
                >
                  {t(`itemSales.${opt.labelKey}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Metric quick-switch: units or revenue. It writes through to the
              sort order below, so the headline card, the bars and the table
              all rank by the same number. */}
          <ChartToggle
            options={[
              { value: 'units', label: t('itemSales.metricUnits') },
              { value: 'revenue', label: t('itemSales.metricRevenue') },
            ]}
            value={metric}
            onChange={setMetric}
          />

          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t('itemSales.sortItems')} className="shrink-0 h-10">
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
                  {t(`itemSales.${opt.labelKey}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      {/* Table — the item-first report. Best sellers live on the dashboards
          (owner and manager); this page answers "how often does each item
          sell, and when". */}
      {isLoading ? (
        <LoadingState message={t('itemSales.crunching')} />
      ) : error ? (
        <EmptyState
          icon={<ChartBar className="w-8 h-8 text-muted-foreground" />}
          title={t('itemSales.loadFailedTitle')}
          message={error}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="w-8 h-8 text-muted-foreground" />}
          title={t('itemSales.noMenuItems')}
          message={t('itemSales.noMenuItemsMsg')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">{t('itemSales.col_item')}</th>
                    <th className="px-4 py-3 hidden sm:table-cell">{t('itemSales.col_category')}</th>
                    <th className="px-4 py-3 text-right">{t('itemSales.col_timesSold')}</th>
                    <th className="px-4 py-3 hidden md:table-cell">{t('itemSales.col_busiestHour')}</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">{t('itemSales.col_revenue')}</th>
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
                          {t(`itemSales.cat_${row.category.toLowerCase()}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-foreground">
                        {row.totalQty}
                      </td>
                      {/* Which hour this item sells best in — the "when" behind
                          the peak-hours heatmap, read per item. */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {(() => {
                          const best =
                            bestHourFor(row.name) ??
                            (row.lookupName && row.lookupName !== row.name
                              ? bestHourFor(row.lookupName)
                              : null);
                          if (!best) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {String(best.hour).padStart(2, '0')}:00
                              </span>
                              <span className="tabular-nums">· {t('itemSales.soldCount', { count: best.qty })}</span>
                            </span>
                          );
                        })()}
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
