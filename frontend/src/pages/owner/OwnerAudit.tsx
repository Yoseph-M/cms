import React, { useState, useEffect, useCallback, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Search, Filter, Download, ChevronRight, AlertCircle, X, ChevronDown
} from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actor: { name: string; role: string };
  actionType: string;
  targetType: string;
  targetId?: string;
  details?: any;
}

const ACTION_COLORS: Record<string, any> = {
  ORDER_CREATED: 'success',
  ORDER_CANCELLED: 'error',
  PAYMENT_RECEIVED: 'default',
  ATTENDANCE_LOGGED: 'neutral',
  PAYROLL_PROCESSED: 'warning',
  STATUS_TRANSITION: 'neutral',
  USER_UPDATED: 'warning',
  MENU_UPDATED: 'neutral',
};

export const OwnerAudit: React.FC = () => {
  const { addToast } = useToastStore();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedLog, setExpandedLog] = useState<AuditLog | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const buildQuery = (cursor?: string) => {
    const params = new URLSearchParams();
    if (actorFilter) params.set('actorId', actorFilter);
    if (actionFilter) params.set('actionType', actionFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  };

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLogs([]);
    setNextCursor(null);
    try {
      const res = await axiosClient.get(`/analytics/audit-logs?${buildQuery()}`);
      const data = res.data;
      // Support both cursor-paginated and simple array responses
      if (Array.isArray(data)) {
        setLogs(data);
        setHasMore(false);
      } else {
        setLogs(data.logs || []);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [actorFilter, actionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await axiosClient.get(`/analytics/audit-logs?${buildQuery(nextCursor)}`);
      const data = res.data;
      if (Array.isArray(data)) {
        setLogs(prev => [...prev, ...data]);
        setHasMore(false);
      } else {
        setLogs(prev => [...prev, ...(data.logs || [])]);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load more logs' });
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isFetchingMore]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
        loadMore();
      }
    }, { threshold: 0.1 });
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, loadMore]);

  const exportCSV = () => {
    const rows = [['Timestamp', 'Actor', 'Role', 'Action', 'Target Type', 'Target ID', 'Details']];
    logs.forEach(l => {
      rows.push([
        new Date(l.timestamp).toISOString(),
        l.actor?.name || l.actorId,
        l.actor?.role || '',
        l.actionType,
        l.targetType,
        l.targetId || '',
        JSON.stringify(l.details || {}),
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-log.csv'; a.click();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Action Type</label>
              <Input
                id="audit-action-filter"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                placeholder="e.g. ORDER_CANCELLED"
                className="h-9"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
              <Input id="audit-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
              <Input id="audit-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
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

      {/* Log Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
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
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No matching events for the current filter.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Timestamp</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs hidden sm:table-cell">Actor</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Action</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs hidden md:table-cell">Target</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className="border-b border-border/50 last:border-0 hover:bg-secondary/20 cursor-pointer transition-colors"
                        onClick={() => setExpandedLog(expandedLog?.id === log.id ? null : log)}
                      >
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="text-xs font-medium">{log.actor?.name || log.actorId.slice(0,8)}</div>
                          <div className="text-[10px] text-muted-foreground">{log.actor?.role}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ACTION_COLORS[log.actionType] || 'outline'} className="text-[10px]">
                            {log.actionType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                          {log.targetType}{log.targetId ? ` · ${log.targetId.slice(0,8)}` : ''}
                        </td>
                        <td className="px-4 py-3 pr-4 text-right">
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedLog?.id === log.id ? 'rotate-180' : ''}`} />
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedLog?.id === log.id && (
                          <motion.tr
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="bg-secondary/20"
                          >
                            <td colSpan={5} className="px-6 py-4">
                              <div className="text-xs space-y-1">
                                <p className="font-semibold text-muted-foreground mb-2">Event Details</p>
                                {log.details ? (
                                  <pre className="bg-background border border-border rounded-lg p-3 text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="text-muted-foreground italic">No additional context stored.</p>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {/* Infinite scroll trigger */}
              <div ref={bottomRef} className="py-4 flex justify-center">
                {isFetchingMore && (
                  <div className="text-sm text-muted-foreground animate-pulse">Loading more...</div>
                )}
                {!hasMore && logs.length > 0 && (
                  <p className="text-xs text-muted-foreground">All events loaded ({logs.length} total)</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
