import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { RefreshCw, Shield, CheckCircle, XCircle, Lock, User, Clock, Monitor } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';

interface LoginRecord {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'LOCKED';
  createdAt: string;
  user: {
    id: string;
    name: string;
    role: string;
    email: string | null;
    phone: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface LoginStats {
  todayLogins: number;
  totalLogins: number;
  failedToday: number;
  lockedToday: number;
}

const OUTCOME_ICONS: Record<string, React.ReactNode> = {
  SUCCESS: <CheckCircle className="w-4 h-4 text-green-600" />,
  FAILURE: <XCircle className="w-4 h-4 text-red-600" />,
  LOCKED: <Lock className="w-4 h-4 text-orange-600" />,
};

const OUTCOME_LABELS: Record<string, string> = {
  SUCCESS: 'Success',
  FAILURE: 'Failed',
  LOCKED: 'Locked',
};

const OUTCOME_COLORS: Record<string, string> = {
  SUCCESS: 'text-green-600 bg-green-50',
  FAILURE: 'text-red-600 bg-red-50',
  LOCKED: 'text-orange-600 bg-orange-50',
};

export const LoginHistory: React.FC = () => {
  const [loginRecords, setLoginRecords] = useState<LoginRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [stats, setStats] = useState<LoginStats | null>(null);

  const fetchLoginHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (outcomeFilter) params.outcome = outcomeFilter;

      const res = await axiosClient.get('/login-history', { params });
      setLoginRecords(res.data.data);
      setPagination(res.data.pagination);
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axiosClient.get('/login-history/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch login stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchLoginHistory(1);
    fetchStats();
  }, [fetchLoginHistory, fetchStats]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString();
  };

  const getBrowserFromUserAgent = (userAgent: string | null) => {
    if (!userAgent) return 'Unknown';
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    
    return 'Other';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Login History & Security Monitoring
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track all login attempts and security events across the system.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchLoginHistory(pagination.page); fetchStats(); }} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </header>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Filter by outcome:</label>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground"
            >
              <option value="">All Outcomes</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILURE">Failed</option>
              <option value="LOCKED">Locked</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Login Records Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : loginRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="w-10 h-10 mb-3 opacity-40" />
              <p className="font-medium">No login records found</p>
              <p className="text-sm mt-1">Login history will appear here once users log in.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Outcome</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">IP Address</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Browser</th>
                  </tr>
                </thead>
                <tbody>
                  {loginRecords.map((record) => (
                    <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {formatDate(record.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {record.user?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {record.user?.role || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_COLORS[record.outcome]}`}>
                          {OUTCOME_ICONS[record.outcome]}
                          {OUTCOME_LABELS[record.outcome]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {record.ip || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="w-3 h-3" />
                          {getBrowserFromUserAgent(record.userAgent)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total records)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => fetchLoginHistory(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchLoginHistory(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
