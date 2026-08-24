import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { exportRowsCSV } from '../../utils/csvExport';
import { extractErrorMessage } from '../../utils/errorHandler';
import { Filter, Download, AlertCircle, ChevronDown, ScrollText } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actor: { name: string; role: string };
  actionType: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

const ACTION_COLORS: Record<string, 'success' | 'error' | 'default' | 'neutral' | 'warning' | 'outline'> = {
  ORDER_CREATED: 'success',
  ORDER_CANCELLED: 'error',
  PAYMENT_RECEIVED: 'default',
  ATTENDANCE_LOGGED: 'neutral',
  PAYROLL_PROCESSED: 'warning',
  STATUS_TRANSITION: 'neutral',
  USER_UPDATED: 'warning',
  MENU_UPDATED: 'neutral',
};

const ROW_HEIGHT = 52;
const LIST_HEIGHT = 480;

const AuditRow = React.memo<{
  log: AuditLog;
  isSelected: boolean;
  onSelect: (log: AuditLog) => void;
}>(({ log, isSelected, onSelect }) => (
  <div
    role="row"
    className={`flex items-center border-b border-border/50 cursor-pointer transition-colors px-4 ${
      isSelected ? 'bg-secondary/40' : 'hover:bg-secondary/20'
    }`}
    style={{ height: ROW_HEIGHT }}
    onClick={() => onSelect(log)}
  >
    <div className="w-[22%] text-xs font-mono text-muted-foreground truncate pr-2">
      {new Date(log.timestamp).toLocaleString()}
    </div>
    <div className="w-[18%] hidden sm:block pr-2">
      <div className="text-xs font-medium truncate">{log.actor?.name || log.actorId.slice(0, 8)}</div>
      <div className="text-[10px] text-muted-foreground">{log.actor?.role}</div>
    </div>
    <div className="w-[22%]">
      <Badge variant={ACTION_COLORS[log.actionType] || 'outline'} className="text-[10px]">
        {log.actionType}
      </Badge>
    </div>
    <div className="flex-1 hidden md:block text-xs text-muted-foreground truncate">
      {log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ''}
    </div>
    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
  </div>
));
AuditRow.displayName = 'AuditRow';

export const OwnerAudit: React.FC = () => {
  const { addToast } = useToastStore();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedLog, setExpandedLog] = useState<AuditLog | null>(null);
  const listRef = useRef<FixedSizeList>(null);

  const buildQuery = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    if (actionFilter) params.set('actionType', actionFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [actionFilter, dateFrom, dateTo]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLogs([]);
    setNextCursor(null);
    setExpandedLog(null);
    try {
      const res = await axiosClient.get(`/audit?${buildQuery()}`);
      const data = res.data;
      if (Array.isArray(data)) {
        setLogs(data);
        setHasMore(false);
      } else {
        setLogs(data.logs || []);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to load audit logs.'));
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await axiosClient.get(`/audit?${buildQuery(nextCursor)}`);
      const data = res.data;
      if (Array.isArray(data)) {
        setLogs((prev) => [...prev, ...data]);
        setHasMore(false);
      } else {
        setLogs((prev) => [...prev, ...(data.logs || [])]);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to load more logs' });
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isFetchingMore, buildQuery, addToast]);

  const handleSelect = useCallback((log: AuditLog) => {
    setExpandedLog((prev) => (prev?.id === log.id ? null : log));
  }, []);

  const exportCSV = useCallback(() => {
    exportRowsCSV(
      ['Timestamp', 'Actor', 'Role', 'Action', 'Target Type', 'Target ID', 'Details'],
      logs.map((l) => [
        new Date(l.timestamp).toISOString(),
        l.actor?.name || l.actorId,
        l.actor?.role || '',
        l.actionType,
        l.targetType,
        l.targetId || '',
        JSON.stringify(l.details || {}),
      ]),
      'audit-log',
      { title: 'Audit Log', meta: [`Generated: ${new Date().toLocaleString()}`] }
    );
  }, [logs]);

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const log = logs[index];
      if (!log) return null;
      if (index === logs.length - 1 && hasMore && !isFetchingMore) {
        loadMore();
      }
      return (
        <div style={style}>
          <AuditRow log={log} isSelected={expandedLog?.id === log.id} onSelect={handleSelect} />
        </div>
      );
    },
    [logs, expandedLog, handleSelect, hasMore, isFetchingMore, loadMore]
  );

  const detailJson = useMemo(
    () => (expandedLog?.details ? JSON.stringify(expandedLog.details, null, 2) : null),
    [expandedLog]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action Type</label>
              <Input
                id="audit-action-filter"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="e.g. ORDER_CANCELLED"
                className="h-9"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
              <Input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
              <Input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <Filter className="w-3.5 h-3.5 mr-1.5" />Apply
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" />CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchLogs}>Retry</Button>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="Nothing to report yet"
              message={actionFilter || dateFrom || dateTo ? 'No events match the current filters. Try broadening your search.' : "It's quiet for now. System activity will appear here once staff begin taking actions."}
              icon={<ScrollText className="w-7 h-7" />}
            />
          ) : (
            <>
              <div className="flex items-center border-b border-border bg-secondary/30 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                <div className="w-[22%]">Timestamp</div>
                <div className="w-[18%] hidden sm:block">Actor</div>
                <div className="w-[22%]">Action</div>
                <div className="flex-1 hidden md:block">Target</div>
                <div className="w-4" />
              </div>
              <FixedSizeList
                ref={listRef}
                height={LIST_HEIGHT}
                itemCount={logs.length}
                itemSize={ROW_HEIGHT}
                width="100%"
                className="scrollbar-thin"
              >
                {Row}
              </FixedSizeList>
              {expandedLog && (
                <div className="border-t border-border bg-secondary/20 px-6 py-4">
                  <p className="font-semibold text-xs text-muted-foreground mb-2">Event Details — {expandedLog.actionType}</p>
                  {detailJson ? (
                    <pre className="bg-background border border-border rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48">
                      {detailJson}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">No additional context stored.</p>
                  )}
                </div>
              )}
              <div className="py-3 text-center text-xs text-muted-foreground border-t border-border">
                {isFetchingMore ? 'Loading more…' : `Showing ${logs.length} events${hasMore ? ' — scroll for more' : ''}`}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
