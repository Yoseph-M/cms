import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tracker } from '@tremor/react';
import { RiCheckboxCircleFill } from '@remixicon/react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { Button } from '../ui/Button';
import { AlertCircle } from 'lucide-react';
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

/** Selectable look-back windows for the status tracker. */
const RANGE_OPTIONS = [7, 14, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

/** Logged status → Tremor tracker colour. */
const COLOR_MAPPING: Record<AttendanceStatus, string> = {
  PRESENT: 'emerald-500',
  ABSENT: 'red-500',
  HALF_DAY: 'amber-500',
  LEAVE: 'cyan-500',
  HOLIDAY: 'gray-400',
};

/** No record logged on a working day. */
const COLOR_MISSING = 'gray-300';
/** Weekend with no record — lightest, so the working week reads first. */
const COLOR_WEEKEND = 'gray-100';

interface AttendanceHistoryProps {
  isOwner?: boolean;
}

/**
 * Attendance at a glance — one tracker row per staff member, one block per day,
 * modelled on the Tremor uptime-tracker pattern: green present, red absent,
 * grey for days with nothing logged.
 */
export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({ isOwner = false }) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [rangeDays, setRangeDays] = useState<RangeDays>(90);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (rangeDays - 1));
    const iso = (d: Date) => d.toISOString().split('T')[0];
    return { from: iso(from), to: iso(to) };
  }, [rangeDays]);

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
      setHasLoaded(true);
    }
  }, [isOwner, dateRange.from, dateRange.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const days = useMemo(() => {
    const list: string[] = [];
    const start = new Date(dateRange.from);
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d.toISOString().split('T')[0]);
    }
    return list;
  }, [dateRange.from, rangeDays]);

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
          const color = status
            ? COLOR_MAPPING[status]
            : isWeekend
              ? COLOR_WEEKEND
              : COLOR_MISSING;
          return {
            key: date,
            color,
            tooltip: `${date}${status ? ` — ${status.replace('_', ' ')}` : ' — No record'}`,
          };
        });
        const present = attendance.filter((a) => a.userId === s.id && a.status === 'PRESENT').length;
        const rate = rangeDays > 0 ? Math.round((present / rangeDays) * 100) : 0;
        return { ...s, blocks, present, rate };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [staff, attendance, days, rangeDays]);

  const counts = useMemo(() => {
    const present = staffHistory.reduce((acc, s) => acc + s.present, 0);
    const total = staffHistory.length * rangeDays;
    const overall = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, total, overall };
  }, [staffHistory, rangeDays]);

  const overallTone =
    counts.overall >= 90 ? 'bg-emerald-500' : counts.overall >= 75 ? 'bg-amber-500' : 'bg-red-500';

  // Narrow screens show a shorter tail of the same window, like the reference.
  const smDays = Math.min(rangeDays, 60);
  const mobileDays = Math.min(rangeDays, 30);
  const tail = (blocks: { key: string; color: string; tooltip: string }[], count: number) =>
    count >= rangeDays ? blocks : blocks.slice(rangeDays - count);

  // Keep the previous strip visible while a new range loads — a full skeleton
  // on every filter click is jarring.
  const showSkeleton = isLoading && !hasLoaded;

  return (
    <div className="space-y-4">
      {/* Tremor's own Card surface keeps the flat, hairline-ringed look. */}
      <Card className="dark:bg-card dark:ring-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-tremor-title font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
            Attendance history
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
              {RANGE_OPTIONS.map((daysOption) => (
                <button
                  key={daysOption}
                  type="button"
                  onClick={() => setRangeDays(daysOption)}
                  aria-pressed={rangeDays === daysOption}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    rangeDays === daysOption
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {daysOption}d
                </button>
              ))}
            </div>
            <span className="inline-flex items-center gap-2 rounded-tremor-full px-3 py-1 text-tremor-default text-tremor-content-emphasis ring-1 ring-inset ring-tremor-ring dark:text-dark-tremor-content-emphasis dark:ring-dark-tremor-ring">
              <span className={cn('-ml-0.5 size-2 rounded-tremor-full', overallTone)} aria-hidden={true} />
              {counts.overall}% present
            </span>
          </div>
        </div>

        {showSkeleton ? (
          <div className="mt-8 h-64 rounded-xl bg-secondary/40 animate-pulse" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : staffHistory.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No staff to display.</div>
        ) : (
          <div
            aria-busy={isLoading}
            className={cn('transition-opacity', isLoading && 'opacity-60')}
          >
            {staffHistory.map((s) => (
              <div key={s.id} className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center space-x-2">
                    <RiCheckboxCircleFill
                      className="size-5 shrink-0 text-emerald-500"
                      aria-hidden={true}
                    />
                    <p className="truncate text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                      {s.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                    {s.rate}% present
                  </p>
                </div>
                <Tracker data={s.blocks} className="mt-4 hidden w-full lg:flex" />
                <Tracker
                  data={tail(s.blocks, smDays)}
                  className="mt-3 hidden w-full sm:flex lg:hidden"
                />
                <Tracker data={tail(s.blocks, mobileDays)} className="mt-3 flex w-full sm:hidden" />
                <div className="mt-3 flex items-center justify-between text-tremor-default text-tremor-content dark:text-dark-tremor-content">
                  <span className="hidden lg:block">{rangeDays} days ago</span>
                  <span className="hidden sm:block lg:hidden">{smDays} days ago</span>
                  <span className="sm:hidden">{mobileDays} days ago</span>
                  <span>Today</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
