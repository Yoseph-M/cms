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
import { useTranslation } from 'react-i18next';

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

/**
 * Month names for the window selector. English three-letter names are the
 * fallback; the Amharic names below match the Ethiopic-month spellings used
 * across the calendar views, indexed 0–11 for January–December.
 */
const SHORT_MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const SHORT_MONTHS_AM = [
  'ጃንዩ', 'ፌብሩ', 'ማርች', 'ኤፕሪ', 'ሜይ', 'ጁን',
  'ጁላይ', 'ኦገስ', 'ሴፕቴ', 'ኦክቶ', 'ኖቬ', 'ዲሴ',
];

/** Localised short month name for a 1-based month index. */
const useShortMonth = (): ((month1to12: number) => string) => {
  const { i18n } = useTranslation();
  const months = i18n.language?.startsWith('am') ? SHORT_MONTHS_AM : SHORT_MONTHS_EN;
  return (month1to12: number) => months[(month1to12 - 1) % 12] ?? SHORT_MONTHS_EN[month1to12 - 1];
};

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

/**
 * Localised labels. Status names come from the common namespace (already
 * translated); month labels use the runtime locale so an Amharic UI shows
 * Amharic month names like "መስከረም 2026".
 */
const useStatusLabels = (): Record<AttendanceStatus, string> => {
  const { t } = useTranslation('common');
  return {
    PRESENT: t('status.present', { defaultValue: 'Present' }),
    ABSENT: t('status.absent', { defaultValue: 'Absent' }),
    HALF_DAY: t('status.halfDay', { defaultValue: 'Half day' }),
    LEAVE: t('status.leave', { defaultValue: 'Leave' }),
    HOLIDAY: t('status.holiday', { defaultValue: 'Holiday' }),
  };
};

const LEGEND_COLORS = {
  present: COLOR_MAPPING.PRESENT,
  absent: COLOR_MAPPING.ABSENT,
  halfDay: COLOR_MAPPING.HALF_DAY,
  leave: COLOR_MAPPING.LEAVE,
  holiday: COLOR_MAPPING.HOLIDAY,
  missing: COLOR_MISSING,
};

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

const StatusPill: React.FC<{ status: AttendanceStatus }> = ({ status }) => {
  const labels = useStatusLabels();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground">
      <ColorDot color={COLOR_MAPPING[status]} label={labels[status]} className="h-2 w-2" />
      {labels[status]}
    </span>
  );
};

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
  const { t } = useTranslation('attendance');
  const statusLabels = useStatusLabels();
  const shortMonth = useShortMonth();
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
      return { offset: i, label: `${shortMonth(date.getMonth() + 1)} ${date.getFullYear()}` };
    });
    // shortMonth follows the active language; re-derive when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortMonth]);

  const selectedMonth = controlled
    ? `${shortMonth(controlledMonth!)} ${controlledYear}`
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
            {t('history.title')}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {!controlled && (
              <DropdownSelect
                ariaLabel={t('history.filterByMonth')}
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
                {t('history.useArrowsAbove')}
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-tremor-full px-3 py-1 text-tremor-default text-tremor-content-emphasis ring-1 ring-inset ring-tremor-ring dark:text-dark-tremor-content-emphasis dark:ring-dark-tremor-ring">
              <span className={cn('-ml-0.5 size-2 rounded-tremor-full', overallTone)} aria-hidden={true} />
              {t('history.daysPresent', { count: counts.present })}
            </span>
          </div>
        </div>

        {showSkeleton ? (
          <div className="mt-6 h-48 rounded-xl bg-secondary/40 animate-pulse" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>{t('history.retry')}</Button>
          </div>
        ) : staffHistory.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">{t('history.noStaff')}</div>
        ) : (
          <div aria-busy={isLoading} className={cn('transition-opacity', isLoading && 'opacity-60')}>
            {/* Legend and window axis are stated once, so each row can stay a
                bare tracker instead of repeating labels 90 times over. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              {(
                [
                  ['present', statusLabels.PRESENT],
                  ['absent', statusLabels.ABSENT],
                  ['halfDay', statusLabels.HALF_DAY],
                  ['leave', statusLabels.LEAVE],
                  ['holiday', statusLabels.HOLIDAY],
                  ['missing', t('history.noRecord')],
                ] as Array<[keyof typeof LEGEND_COLORS, string]>
              ).map(([colorKey, label]) => (
                <span key={colorKey} className="inline-flex items-center gap-1.5">
                  <ColorDot color={LEGEND_COLORS[colorKey]} label={label} className="rounded-sm" />
                  {label}
                </span>
              ))}
            </div>

            <ul className="mt-2 divide-y divide-border/60">
              {staffHistory.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStaffId(s.id)}
                    aria-label={t('history.rowAria', { name: s.name })}
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
                          {t('history.daysPresent', { count: s.present })}
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
        title={selectedStaff?.name ?? t('history.title')}
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
                    {statusLabels[status]}
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-foreground">
                    {selectedStaff.counts[status]}
                  </p>
                </div>
              ))}
              <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3">
                <p className="text-[11px] font-medium text-muted-foreground">{t('history.noRecord')}</p>
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
                {t('history.daysLogged')}
              </p>
              {selectedStaff.records.length === 0 ? (
                <p className="rounded-xl border border-border bg-secondary/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('history.nothingLogged')}
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
                          {record.source === 'SYSTEM_LOGIN' ? t('history.autoLogin') : t('history.manual')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="neutral" className="text-[10px]">
                {t('history.loggedCount', { count: selectedStaff.records.length })}
              </Badge>
              <span>·</span>
              <span>{t('history.daysPresent', { count: selectedStaff.present })}</span>
              <span>·</span>
              <span>{t('history.workingDaysUnmarked', { count: selectedStaff.missing })}</span>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
