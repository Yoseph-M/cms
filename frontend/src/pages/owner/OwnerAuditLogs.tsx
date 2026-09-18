import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, Search, ScrollText, X } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { getBrowserFromUserAgent } from '../../utils/browserName';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, type BadgeProps } from '../../components/ui/Badge';
import { EmptyState } from '../../components/common/EmptyState';

/**
 * One accountability screen.
 *
 * Staff activity (`AuditLog`) and account security (`LoginHistory`) used to live
 * in two tabs, which meant answering "what happened at 22:14?" required reading
 * the same minute twice. The server merges both collections into a single
 * time-ordered stream (`GET /audit/feed`) and this page renders it as one table:
 * logins land between the order and menu events that followed them.
 */

interface FeedActor {
  id: string;
  name: string;
  role: string;
  subtitle: string;
}

interface AuditFeedRow {
  id: string;
  kind: 'ACTIVITY' | 'LOGIN';
  timestamp: string;
  action: string;
  entity: string;
  description: string;
  actor: FeedActor | null;
  targetId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  outcome?: string | null;
  payload?: Record<string, unknown> | null;
}

interface AuditFeedResponse {
  rows: AuditFeedRow[];
  nextCursor: string | null;
  total: number;
  facets: { actions: string[]; entities: string[] };
}

const EMPTY_FACETS = { actions: [] as string[], entities: [] as string[] };

const ROW_HEIGHT = 64;
const LIST_HEIGHT = 520;

const ACTION_VARIANTS: Record<string, BadgeProps['variant']> = {
  LOGIN: 'success',
  LOGIN_FAILED: 'error',
  LOGIN_LOCKED: 'warning',
  ORDER_PAID: 'success',
  ORDER_SETTLED: 'success',
  ORDER_CANCELLED: 'error',
  EXPENSE_CREATED: 'warning',
  EXPENSE_DELETED: 'error',
  INTEGRITY_CHECK_FAILED: 'error',
  DAILY_CLOSE_WITH_WARNINGS: 'warning',
  USER_DEACTIVATED: 'warning',
  BACKUP_RESTORED: 'warning',
};

/** Colour by meaning: money in and things created are good, losses are not. */
export function actionVariant(action: string): BadgeProps['variant'] {
  const known = ACTION_VARIANTS[action];
  if (known) return known;
  if (/CANCELLED|DELETED|FAILED|REVOKE/.test(action)) return 'error';
  if (/CREATED|PAID|SETTLED|REGISTER|COMPLETED|LOGGED/.test(action)) return 'success';
  if (/UPDATED|CHANGED|OVERRIDE|ADJUSTMENT|RETRY/.test(action)) return 'neutral';
  return 'outline';
}

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
};

const FeedRow = React.memo<{
  row: AuditFeedRow;
  isSelected: boolean;
  onSelect: (row: AuditFeedRow) => void;
}>(({ row, isSelected, onSelect }) => (
  <div
    role="row"
    className={`flex items-center border-b border-border/50 px-4 transition-colors ${
      isSelected ? 'bg-secondary/50' : 'hover:bg-secondary/25'
    }`}
    style={{ height: ROW_HEIGHT }}
  >
    <div className="w-[17%] pr-3 text-xs text-muted-foreground">
      {formatTimestamp(row.timestamp)}
    </div>
    <div className="w-[20%] min-w-0 pr-3">
      <div className="truncate text-sm font-medium">{row.actor?.name ?? 'Unknown user'}</div>
      <div className="truncate text-xs text-muted-foreground">{row.actor?.subtitle ?? '—'}</div>
    </div>
    <div className="w-[16%] pr-3">
      <Badge variant={actionVariant(row.action)} className="max-w-full truncate text-[10px] tracking-wide">
        {row.action}
      </Badge>
    </div>
    <div className="hidden w-[11%] pr-3 sm:block">
      <span className="inline-flex max-w-full items-center truncate rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
        {row.entity}
      </span>
    </div>
    <div className="min-w-0 flex-1 truncate pr-3 text-sm text-muted-foreground">{row.description}</div>
    <div className="w-[86px] shrink-0 text-right">
      <button
        type="button"
        onClick={() => onSelect(row)}
        aria-label={`View details for ${row.description}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
    </div>
  </div>
));
FeedRow.displayName = 'FeedRow';

export const OwnerAuditLogs: React.FC = () => {
  // Rows appended by infinite scroll past the cached first page.
  const [appendedRows, setAppendedRows] = useState<AuditFeedRow[]>([]);
  const [appendCursor, setAppendCursor] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');

  const [selected, setSelected] = useState<AuditFeedRow | null>(null);
  const listRef = useRef<FixedSizeList>(null);

  // Held in state rather than read off the current response: while a new filter
  // set is loading the response has no data yet, and emptying the dropdowns
  // under the operator's cursor is both jarring and unclickable. The server
  // always sends the full catalogue, so the last one stays valid.
  const [facets, setFacets] = useState(EMPTY_FACETS);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (action) params.set('action', action);
      if (entity) params.set('entity', entity);
      if (order === 'oldest') params.set('order', 'oldest');
      if (cursor) params.set('cursor', cursor);
      return params.toString();
    },
    [search, action, entity, order],
  );

  // First page is cached per filter set, so revisiting the tab renders instantly.
  const {
    data: firstPage,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<AuditFeedResponse>({
    queryKey: ['auditFeed', search, action, entity, order],
    queryFn: async () => {
      const res = await axiosClient.get(`/audit/feed?${buildQuery()}`);
      return res.data;
    },
    staleTime: 60_000,
  });

  const error = queryError ? extractErrorMessage(queryError, 'Failed to load audit logs.') : null;
  const cursor = appendCursor ?? firstPage?.nextCursor ?? null;
  const hasMore = cursor !== null;
  const rows = useMemo<AuditFeedRow[]>(
    () => [...(firstPage?.rows ?? []), ...appendedRows],
    [firstPage, appendedRows],
  );

  // Filter change → back to a fresh first page (drop appended rows).
  useEffect(() => {
    setAppendedRows([]);
    setAppendCursor(null);
    setSelected(null);
  }, [search, action, entity, order]);

  useEffect(() => {
    if (firstPage?.facets) setFacets(firstPage.facets);
  }, [firstPage]);

  const loadMore = useCallback(async () => {
    if (!cursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await axiosClient.get(`/audit/feed?${buildQuery(cursor)}`);
      setAppendedRows((prev) => [...prev, ...((res.data.rows ?? []) as AuditFeedRow[])]);
      setAppendCursor(res.data.nextCursor ?? null);
    } catch {
      // The footer keeps the retry affordance, so a toast would only duplicate it.
      setAppendCursor(null);
    } finally {
      setIsFetchingMore(false);
    }
  }, [cursor, isFetchingMore, buildQuery]);

  const applySearch = useCallback(() => {
    setSearch(searchDraft.trim());
    setAppendedRows([]);
    setAppendCursor(null);
  }, [searchDraft]);

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = rows[index];
      if (!row) return null;
      if (index === rows.length - 1 && hasMore && !isFetchingMore) {
        void loadMore();
      }
      return (
        <div style={style}>
          <FeedRow row={row} isSelected={selected?.id === row.id} onSelect={setSelected} />
        </div>
      );
    },
    [rows, selected, hasMore, isFetchingMore, loadMore],
  );

  const detailFields = useMemo(() => {
    if (!selected) return [] as Array<[string, string]>;
    const fields: Array<[string, string]> = [
      ['Time', formatTimestamp(selected.timestamp)],
      ['Action', selected.action],
      ['Entity', selected.entity],
      ['Staff', selected.actor?.name ?? 'Unknown user'],
    ];
    if (selected.actor?.role) fields.push(['Role', selected.actor.role]);
    if (selected.targetId) fields.push(['Record ID', selected.targetId]);
    if (selected.outcome) fields.push(['Outcome', selected.outcome]);
    if (selected.ip) fields.push(['IP address', selected.ip]);
    if (selected.userAgent) {
      fields.push(['Browser', getBrowserFromUserAgent(selected.userAgent)]);
      fields.push(['User agent', selected.userAgent]);
    }
    return fields;
  }, [selected]);

  const isFiltered = Boolean(search || action || entity);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {firstPage ? (
          <>
            <span className="font-semibold text-foreground">{firstPage.total}</span> system activities recorded
            {isFiltered ? ' matching the current filters' : ''}
          </>
        ) : (
          'Loading system activity…'
        )}
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="audit-search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applySearch();
                  }}
                  placeholder="Search logs by action or description…"
                  aria-label="Search logs by action or description"
                  className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button variant="secondary" onClick={applySearch} className="shrink-0">
                Search
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}
                aria-label="Sort order"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                aria-label="Filter by action"
                className="h-10 max-w-[190px] rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">All Actions</option>
                {facets.actions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                aria-label="Filter by entity"
                className="h-10 max-w-[170px] rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">All Entities</option>
                {facets.entities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/40" />
              ))}
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing to report yet"
              message={
                isFiltered
                  ? 'No events match the current filters. Try broadening your search.'
                  : "It's quiet for now. Logins and system activity will appear here as staff work."
              }
              icon={<ScrollText className="h-7 w-7" />}
            />
          ) : (
            <>
              <div className="flex items-center border-b border-border bg-secondary/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div className="w-[17%]">Timestamp</div>
                <div className="w-[20%]">User</div>
                <div className="w-[16%]">Action</div>
                <div className="hidden w-[11%] sm:block">Entity</div>
                <div className="flex-1">Description</div>
                <div className="w-[86px] shrink-0 text-right">Details</div>
              </div>
              <FixedSizeList
                ref={listRef}
                height={LIST_HEIGHT}
                itemCount={rows.length}
                itemSize={ROW_HEIGHT}
                width="100%"
                className="scrollbar-thin"
              >
                {Row}
              </FixedSizeList>
              <div className="border-t border-border py-3 text-center text-xs text-muted-foreground">
                {isFetchingMore
                  ? 'Loading more…'
                  : `Showing ${rows.length} events${hasMore ? ' — scroll for more' : ''}`}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Details — a floating card so the table layout never shifts. */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Audit event details"
                className="pointer-events-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border p-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">Event details</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.actor?.name ?? 'Unknown user'} · {formatTimestamp(selected.timestamp)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 border-b border-border bg-secondary/20 px-5 py-3">
                  <Badge variant={actionVariant(selected.action)}>{selected.action}</Badge>
                  <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                    {selected.entity}
                  </span>
                </div>

                <div className="space-y-3 overflow-y-auto p-5 text-xs">
                  <p className="text-sm text-foreground">{selected.description}</p>
                  {detailFields.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-[7rem_1fr] gap-3 border-b border-border/50 pb-2 last:border-0"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="break-all font-mono text-foreground">{value}</span>
                    </div>
                  ))}
                  {selected.payload && (
                    <div className="pt-1">
                      <p className="mb-2 font-semibold text-muted-foreground">Stored context</p>
                      <pre className="max-h-48 overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs">
                        {JSON.stringify(selected.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="border-t border-border p-4">
                  <Button variant="outline" onClick={() => setSelected(null)} className="w-full">
                    Close
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
