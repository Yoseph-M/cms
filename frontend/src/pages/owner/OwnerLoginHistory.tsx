import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { exportRowsCSV } from '../../utils/csvExport';
import { Filter, Download, AlertCircle, ChevronDown, LogIn, CheckCircle, XCircle, Lock, User, Clock, Monitor } from 'lucide-react';

interface LoginHistoryRecord {
  id: string;
  createdAt: string;
  userId: string;
  user: { name: string; role: string; username: string | null };
  ip: string | null;
  userAgent: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'LOCKED';
}

interface LoginStats {
  todayLogins: number;
  totalLogins: number;
  failedToday: number;
  lockedToday: number;
}

const OUTCOME_COLORS: Record<string, 'success' | 'error' | 'warning' | 'neutral' | 'default' | 'outline'> = {
  SUCCESS: 'success',
  FAILURE: 'error',
  LOCKED: 'warning',
};

const ROW_HEIGHT = 52;
const LIST_HEIGHT = 480;

const getBrowserFromUserAgent = (userAgent: string | null) => {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Other';
};

const LoginRow = React.memo<{
  record: LoginHistoryRecord;
  isSelected: boolean;
  onSelect: (record: LoginHistoryRecord) => void;
}>(({ record, isSelected, onSelect }) => (
  <div
    role="row"
    className={`flex items-center border-b border-border/50 cursor-pointer transition-colors px-4 ${
      isSelected ? 'bg-secondary/40' : 'hover:bg-secondary/20'
    }`}
    style={{ height: ROW_HEIGHT }}
    onClick={() => onSelect(record)}
  >
    <div className="w-[20%] text-xs font-mono text-muted-foreground truncate pr-2">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        {new Date(record.createdAt).toLocaleString()}
      </div>
    </div>
    <div className="w-[22%] pr-2">
      <div className="text-xs font-medium truncate">{record.user?.name || record.userId.slice(0, 8)}</div>
      <div className="text-[10px] text-muted-foreground">{record.user?.username || 'No username'}</div>
    </div>
    <div className="w-[12%] pr-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
        {record.user?.role || 'N/A'}
      </span>
    </div>
    <div className="w-[12%] pr-2">
      <Badge variant={OUTCOME_COLORS[record.outcome] || 'outline'} className="text-[10px]">
        {record.outcome}
      </Badge>
    </div>
    <div className="w-[16%] hidden md:block text-xs text-muted-foreground truncate font-mono pr-2">
      {record.ip || '—'}
    </div>
    <div className="w-[14%] hidden md:block text-xs text-muted-foreground pr-2">
      <div className="flex items-center gap-1.5">
        <Monitor className="w-3 h-3" />
        {getBrowserFromUserAgent(record.userAgent)}
      </div>
    </div>
    <div className="w-4 shrink-0" />
  </div>
));
LoginRow.displayName = 'LoginRow';

export const OwnerLoginHistory: React.FC = () => {
  const { addToast } = useToastStore();

  const [logs, setLogs] = useState<LoginHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedLog, setExpandedLog] = useState<LoginHistoryRecord | null>(null);
  const [stats, setStats] = useState<LoginStats | null>(null);
  const listRef = useRef<FixedSizeList>(null);

  const buildQuery = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    if (outcomeFilter) params.set('outcome', outcomeFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [outcomeFilter, dateFrom, dateTo]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLogs([]);
    setNextCursor(null);
    setExpandedLog(null);
    try {
      const res = await axiosClient.get(`/audit/login-history?${buildQuery()}`);
      const data = res.data;
      setLogs(data.logs || []);
      setNextCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load login history.'));
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axiosClient.get('/login-history/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch login stats:', error);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await axiosClient.get(`/audit/login-history?${buildQuery(nextCursor)}`);
      const data = res.data;
      setLogs((prev) => [...prev, ...(data.logs || [])]);
      setNextCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
    } catch {
      addToast({ type: 'error', title: 'Failed to load more logs' });
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isFetchingMore, buildQuery, addToast]);

  const handleSelect = useCallback((record: LoginHistoryRecord) => {
    setExpandedLog((prev) => (prev?.id === record.id ? null : record));
  }, []);

  const exportCSV = useCallback(() => {
    exportRowsCSV(
      ['Timestamp', 'User', 'Role', 'Username', 'Outcome', 'IP', 'User Agent'],
      logs.map((l) => [
        new Date(l.createdAt).toISOString(),
        l.user?.name || l.userId,
        l.user?.role || '',
        l.user?.username || '',
        l.outcome,
        l.ip || '',
        l.userAgent || '',
      ]),
      'login-history',
      { title: 'Login History', meta: [`Generated: ${new Date().toLocaleString()}`] }
    );
  }, [logs]);

  const Row = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const record = logs[index];
      if (!record) return null;
      if (index === logs.length - 1 && hasMore && !isFetchingMore) {
        loadMore();
      }
      return (
        <div style={style}>
          <LoginRow record={record} isSelected={expandedLog?.id === record.id} onSelect={handleSelect} />
        </div>
      );
    },
    [logs, expandedLog, handleSelect, hasMore, isFetchingMore, loadMore]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Today's Logins</p>
                  <p className="text-2xl font-bold">{stats.todayLogins}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Logins</p>
                  <p className="text-2xl font-bold">{stats.totalLogins}</p>
                </div>
                <User className="w-8 h-8 text-blue-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Failed Today</p>
                  <p className="text-2xl font-bold">{stats.failedToday}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Locked Today</p>
                  <p className="text-2xl font-bold">{stats.lockedToday}</p>
                </div>
                <Lock className="w-8 h-8 text-orange-600 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Outcome</label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="">All Outcomes</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILURE">Failure</option>
                <option value="LOCKED">Locked</option>
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Date</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Date</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => { fetchLogs(); fetchStats(); }}>
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
              title="No login records"
              message={outcomeFilter || dateFrom || dateTo ? 'No login attempts match the current filters.' : "No login attempts have been recorded yet."}
              icon={<LogIn className="w-7 h-7" />}
            />
          ) : (
            <>
              <div className="flex items-center border-b border-border bg-secondary/30 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                <div className="w-[20%]">Timestamp</div>
                <div className="w-[22%]">User</div>
                <div className="w-[12%]">Role</div>
                <div className="w-[12%]">Outcome</div>
                <div className="w-[16%] hidden md:block">IP Address</div>
                <div className="w-[14%] hidden md:block">Browser</div>
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
                  <p className="font-semibold text-xs text-muted-foreground mb-2">Login Details</p>
                  <div className="space-y-2 text-xs font-mono bg-background border border-border rounded-lg p-3">
                    <p><span className="text-muted-foreground">User Agent:</span> {expandedLog.userAgent || 'Unknown'}</p>
                    <p><span className="text-muted-foreground">IP Address:</span> {expandedLog.ip || 'Unknown'}</p>
                    <p><span className="text-muted-foreground">User ID:</span> {expandedLog.userId}</p>
                  </div>
                </div>
              )}
              <div className="py-3 text-center text-xs text-muted-foreground border-t border-border">
                {isFetchingMore ? 'Loading more…' : `Showing ${logs.length} records${hasMore ? ' — scroll for more' : ''}`}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
