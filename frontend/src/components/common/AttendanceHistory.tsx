import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Tracker } from '@tremor/react';
import { axiosClient } from '../../api/axiosClient';
import { extractErrorMessage } from '../../utils/errorHandler';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DropdownSelect } from '../ui/DropdownSelect';
import { Sheet } from '../ui/Sheet';
import { AlertCircle, CalendarDays, ChevronRight, UserRound } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatBusinessDate } from '../../utils/calendar';

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

/** Three-letter month names for the window selector ("Sep", "Jan", …). */
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** How many months back the filter offers, including the current one. */
const MONTH_WINDOW = 12;

/**
 * Logged status → Tremor tracker colour.
 *
 * Leave and Holiday used to sit at cyan-500 and gray-400, where Leave read as
 * "some kind of present" and Holiday was indistinguishable from the gray-300
 * "no record" block. They now use blue and violet: clearly apart from each
 * other, from the emerald/red/amber working states, and from the gray gaps.
 */
const COLOR_MAPPING: Record<AttendanceStatus, string> = {
  PRESENT: 'emerald-500',
  ABSENT: 'red-500',
  HALF_DAY: 'amber-500',
  LEAVE: 'blue-500',
  HOLIDAY: 'violet-500',
};

/** Build a local `YYYY-MM-DD` key — `toISOString()` would shift the day in UTC-negative zones. */
const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** No record logged on a working day. */
const COLOR_MISSING = 'gray-300';
/** Weekend with no record — the SAME gray as weekday no-record. Weekend gaps
 *  used to render at gray-100, which reads as white against the card and made
 *  "No record" look like two different states; the tracker now speaks one
 *  gray for every unlogged day. */
const COLOR_WEEKEND = 'gray-300';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
};

const LEGEND: Array<{ color: string; label: string }> = [
  { color: COLOR_MAPPING.PRESENT, label: 'Present' },
  { color: COLOR_MAPPING.ABSENT, label: 'Absent' },
  { color: COLOR_MAPPING.HALF_DAY, label: 'Half day' },
  { color: COLOR_MAPPING.LEAVE, label: 'Leave' },
  { color: COLOR_MAPPING.HOLIDAY, label: 'Holiday' },
  { color: COLOR_MISSING, label: 'No record' },
];

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'];

/**
 * A single Tremor block. Rendering the dot through Tremor is the only way to
 * guarantee the legend and the day list use the exact same colour as the
 * tracker, without hand-copying hex values around the file.
 */
const ColorDot: React.FC<{ color: string; label: string; className?: string }> = ({
  color,
  label,
  className,
}) => (
  <Tracker
    data={[{ color, tooltip: label }]}
    aria-hidden={true}
    className={cn('h-2.5 w-2.5 shrink-0', className)}
  />
);

const StatusPill: React.FC<{ status: AttendanceStatus }> = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
    <ColorDot color={COLOR_MAPPING[status]} label={STATUS_LABEL[status]} className="h-2 w-2" />
    {STATUS_LABEL[status]}
  </span>
);

interface AttendanceHistoryProps {
  isOwner?: boolean;
  /**
   * Controlled month, driven by the calendar's `< Month Year >` chevrons at
   * the top of the Attendance page. When provided, this card hides its own
   * month Select — the top controls are the single filter.
   */
  year?: number;
  month?: number;
}

interface StaffRow {
  id: string;
  name: string;
  role: string;
  blocks: { key: string; color: string; tooltip: string }[];
  present: number;
  missing: number;
  counts: Record<AttendanceStatus, number>;
  /** Logged days only, newest first — the sheet's day-by-day list. */
  records: AttendanceRecord[];
}

/**
 * Attendance at a glance — one tracker per staff member, so the card stays a
 * scannable strip rather than a wall of rows. Everything else (counts, notes,
 * who marked what) lives one click away in the staff sheet.
 */
export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({ isOwner = false, year: controlledYear, month: controlledMonth }) => {
  const controlled = typeof controlledYear === 'number' && typeof controlledMonth === 'number';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  // 0 = the current month; each step back is one month further into the past.
  const [monthOffset, setMonthOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  /**
   * Month choices, newest first — "Sep 2026", "Aug 2026", … (only used when
   * the card is uncontrolled; the embedded view is driven by the calendar's
   * chevrons instead).
   */
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTH_WINDOW }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { offset: i, label: `${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}` };
    });
  }, []);

  const selectedMonth = controlled
    ? `${SHORT_MONTHS[controlledMonth! - 1]} ${controlledYear}`
    : monthOptions[monthOffset]?.label ?? monthOptions[0].label;

  const dateRange = useMemo(() => {
    if (controlled) {
      const start = new Date(controlledYear!, controlledMonth! - 1, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }, [controlled, controlledYear, controlledMonth, monthOffset]);

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

  /** Every day in the selected month, in order. */
  const days = useMemo(() => {
    const list: string[] = [];
    const start = new Date(`${dateRange.from}T00:00:00`);
    const count = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let i = 0; i < count; i++) {
      list.push(toIsoDate(new Date(start.getFullYear(), start.getMonth(), i + 1)));
    }
    return list;
  }, [dateRange.from]);

  /** Days in the selected month — the window length the tracker scales to. */
  const windowDays = days.length;

  const staffHistory = useMemo<StaffRow[]>(() => {
    return staff
      .map((s) => {
        const own = attendance.filter((a) => a.userId === s.id);
        const recordsByDate = new Map(own.map((a) => [a.date, a]));
        let missing = 0;
        const blocks = days.map((date) => {
          const rec = recordsByDate.get(date);
          const status = rec ? rec.status : null;
          const weekday = new Date(`${date}T00:00:00`).getDay();
          const isWeekend = weekday === 0 || weekday === 6;
          if (!status && !isWeekend) missing += 1;
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

        const counts = STATUS_ORDER.reduce(
          (acc, status) => ({ ...acc, [status]: own.filter((a) => a.status === status).length }),
          {} as Record<AttendanceStatus, number>,
        );

        return {
          id: s.id,
          name: s.name,
          role: s.role,
          blocks,
          present: counts.PRESENT,
          missing,
          counts,
          records: [...own].sort((a, b) => (a.date < b.date ? 1 : -1)),
        };
      })
      .sort((a, b) => b.present - a.present);
  }, [staff, attendance, days]);

  const counts = useMemo(() => {
    const present = staffHistory.reduce((acc, s) => acc + s.present, 0);
    const total = staffHistory.length * windowDays;
    const overall = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, total, overall };
  }, [staffHistory, windowDays]);

  const overallTone =
    counts.overall >= 90
      ? 'bg-[hsl(var(--success))]'
      : counts.overall >= 75
        ? 'bg-[hsl(var(--warning))]'
        : 'bg-destructive';

  /**
   * Every row renders the WHOLE month, on every screen width — the strip is
   * scaled by CSS instead of being trimmed to a shorter tail. Trimming used to
   * drop the leading days on anything under `lg` (a 31-day month showed 30
   * blocks, so the axis started on the 2nd), which made the same month look
   * like it began on a different date depending on the window size.
   */
  const windowStart = formatBusinessDate(days[0] ?? '');
  const windowEnd = formatBusinessDate(days[days.length - 1] ?? '');

  const selectedStaff = staffHistory.find((s) => s.id === selectedStaffId) ?? null;

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
            {!controlled && (
              <DropdownSelect
                ariaLabel="Filter attendance by month"
                size="sm"
                icon={CalendarDays}
                value={String(monthOffset)}
                onChange={(v) => setMonthOffset(Number(v))}
                options={monthOptions.map((option) => ({
                  value: String(option.offset),
                  label: option.label,
                }))}
                contentClassName="w-36"
              />
            )}
            {controlled && (
              <span className="text-xs font-medium text-muted-foreground">
                Use the arrows above to change the month
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-tremor-full px-3 py-1 text-tremor-default text-tremor-content-emphasis ring-1 ring-inset ring-tremor-ring dark:text-dark-tremor-content-emphasis dark:ring-dark-tremor-ring">
              <span className={cn('-ml-0.5 size-2 rounded-tremor-full', overallTone)} aria-hidden={true} />
              {counts.present} days present
            </span>
          </div>
        </div>

        {showSkeleton ? (
          <div className="mt-6 h-48 rounded-xl bg-secondary/40 animate-pulse" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
          </div>
        ) : staffHistory.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No staff to display.</div>
        ) : (
          <div aria-busy={isLoading} className={cn('transition-opacity', isLoading && 'opacity-60')}>
            {/* Legend and window axis are stated once, so each row can stay a
                bare tracker instead of repeating labels 90 times over. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              {LEGEND.map((entry) => (
                <span key={entry.label} className="inline-flex items-center gap-1.5">
                  <ColorDot color={entry.color} label={entry.label} className="rounded-sm" />
                  {entry.label}
                </span>
              ))}
            </div>

            <ul className="mt-2 divide-y divide-border/60">
              {staffHistory.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStaffId(s.id)}
                    aria-label={`${s.name} attendance details`}
                    className="group w-full rounded-lg px-2 py-3 text-left transition-colors hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden={true} />
                        <p className="truncate text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                          {s.name}
                        </p>
                        <span className="hidden shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground sm:inline">
                          {s.role.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
                          {s.present} days present
                        </p>
                        <ChevronRight
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden={true}
                        />
                      </div>
                    </div>

                    <Tracker data={s.blocks} className="mt-2.5 flex h-6 w-full" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-muted-foreground">
              <span>{windowStart}</span>
              <span>{windowEnd}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Everything the tracker can't show lives here, one click away. */}
      <Sheet
        open={Boolean(selectedStaff)}
        onClose={() => setSelectedStaffId(null)}
        title={selectedStaff?.name ?? 'Attendance'}
        description={
          selectedStaff
            ? `${selectedStaff.role.toLowerCase()} · ${selectedMonth}`
            : undefined
        }
      >
        {selectedStaff && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {STATUS_LABEL[status]}
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-foreground">
                    {selectedStaff.counts[status]}
                  </p>
                </div>
              ))}
              <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3">
                <p className="text-[11px] font-medium text-muted-foreground">No record</p>
                <p className="mt-1 font-mono text-xl font-bold text-muted-foreground">
                  {selectedStaff.missing}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {selectedMonth}
              </p>
              <Tracker data={selectedStaff.blocks} className="h-6 w-full" />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{formatBusinessDate(selectedStaff.blocks[0]?.key ?? '')}</span>
                <span>{formatBusinessDate(selectedStaff.blocks.at(-1)?.key ?? '')}</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Days logged
              </p>
              {selectedStaff.records.length === 0 ? (
                <p className="rounded-xl border border-border bg-secondary/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing logged in this window.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
                  {selectedStaff.records.map((record) => (
                    <li key={record.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {formatBusinessDate(record.date)}
                        </p>
                        {record.note ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{record.note}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill status={record.status} />
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {record.source === 'SYSTEM_LOGIN' ? 'Auto · login' : 'Manual'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="neutral" className="text-[10px]">
                {selectedStaff.records.length} logged
              </Badge>
              <span>·</span>
              <span>{selectedStaff.present} days present</span>
              <span>·</span>
              <span>{selectedStaff.missing} working days unmarked</span>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
