import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Tracker } from '@tremor/react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { Button } from '../ui/Button';
import { Avatar, AvatarFallback } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { AlertCircle, BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: AttendanceStatus;
  source: 'MANUAL' | 'SYSTEM_LOGIN';
  note: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const DAYS = 90;

const TRACKER_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: 'emerald-500',
  ABSENT: 'red-500',
  HALF_DAY: 'amber-500',
  LEAVE: 'cyan-500',
  HOLIDAY: 'slate-300',
};

const LEGEND_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500',
  ABSENT: 'bg-red-500',
  HALF_DAY: 'bg-amber-500',
  LEAVE: 'bg-cyan-500',
  HOLIDAY: 'bg-slate-300',
};

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500/15 text-emerald-600',
  ABSENT: 'bg-red-500/15 text-red-600',
  HALF_DAY: 'bg-amber-500/15 text-amber-600',
  LEAVE: 'bg-cyan-500/15 text-cyan-600',
  HOLIDAY: 'bg-slate-400/15 text-slate-500',
};

interface AttendanceHistoryProps {
  isOwner?: boolean;
}

export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({ isOwner = false }) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (DAYS - 1));
    const iso = (d: Date) => d.toISOString().split('T')[0];
    return { from: iso(from), to: iso(to) };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [staffRes, attRes] = await Promise.all([
        axiosClient.get('/users'),
        axiosClient.get(`/attendance?startDate=${dateRange.from}&endDate=${dateRange.to}`),
      ]);
      let staffData: StaffMember[] = staffRes.data;
      staffData = staffData.filter((s) => s.role !== 'OWNER');
      if (!isOwner) {
        staffData = staffData.filter((s) => s.role !== 'MANAGER');
      }
      setStaff(staffData);
      setAttendance(attRes.data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to load attendance history.'));
    } finally {
      setIsLoading(false);
    }
  }, [isOwner, dateRange.from, dateRange.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const days = useMemo(() => {
    const list: string[] = [];
    const start = new Date(dateRange.from);
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d.toISOString().split('T')[0]);
    }
    return list;
  }, [dateRange.from]);

  const staffHistory = useMemo(() => {
    return staff
      .map((s) => {
        const recordsByDate = new Map(
          attendance.filter((a) => a.userId === s.id).map((a) => [a.date, a]),
        );
        const blocks = days.map((date) => {
          const rec = recordsByDate.get(date);
          const status = rec ? rec.status : null;
          const weekday = new Date(`${date}T00:00:00`).getDay();
          const isWeekend = weekday === 0 || weekday === 6;
          return {
            color: status
              ? TRACKER_COLOR[status]
              : isWeekend
                ? 'slate-200'
                : 'slate-100',
            tooltip: `${date}${status ? ` — ${status.replace('_', ' ')}` : ' — No record'}`,
          };
        });
        const present = attendance.filter((a) => a.userId === s.id && a.status === 'PRESENT').length;
        const rate = DAYS > 0 ? Math.round((present / DAYS) * 100) : 0;
        const initials = s.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        return { ...s, blocks, present, rate, initials };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [staff, attendance, days]);

  const counts = useMemo(() => {
    const present = staffHistory.reduce((acc, s) => acc + s.present, 0);
    const total = staffHistory.length * DAYS;
    const overall = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, total, overall };
  }, [staffHistory]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">Attendance history — last {DAYS} days</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {counts.present}/{counts.total} present · <span className="font-semibold text-foreground">{counts.overall}%</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            {(Object.keys(TRACKER_COLOR) as AttendanceStatus[]).map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <span className={cn('size-2 rounded-full', LEGEND_COLOR[status])} aria-hidden />
                {status.replace('_', ' ')}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-slate-200" aria-hidden />
              Weekend
            </span>
          </div>

          {isLoading ? (
            <div className="h-64 rounded-xl bg-secondary/40 animate-pulse" />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
              <p className="text-destructive font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
            </div>
          ) : staffHistory.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No staff to display.</div>
          ) : (
            <div className="space-y-5">
              {staffHistory.map((s) => (
                <div key={s.id} className="rounded-xl border border-border p-3 sm:p-4 bg-card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="w-8 h-8 ring-1 ring-border shrink-0">
                        <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">{s.initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{s.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.role}</Badge>
                          <span className="text-[10px] text-muted-foreground">{s.present}/{DAYS} days</span>
                        </div>
                      </div>
                    </div>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_BADGE.PRESENT)}>
                      {s.rate}%
                    </span>
                  </div>
                  <Tracker data={s.blocks} className="hidden w-full sm:flex" />
                  <Tracker data={s.blocks.slice(30, 90)} className="mt-2 hidden w-full md:flex lg:hidden" />
                  <Tracker data={s.blocks.slice(60, 90)} className="mt-2 flex w-full md:hidden" />
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="hidden md:inline">{DAYS} days ago</span>
                    <span className="hidden md:hidden">30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
