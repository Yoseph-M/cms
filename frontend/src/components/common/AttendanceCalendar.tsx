import { extractErrorMessage } from "../../utils/errorHandler";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, ChevronLeft, ChevronRight, CheckSquare, AlertCircle, BarChart3, Info, Grid3X3, History } from 'lucide-react';
import { AttendanceHistory } from './AttendanceHistory';

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

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; color: string; bg: string }> = {
  PRESENT:  { label: 'Present',  short: 'P',  color: 'text-[hsl(var(--success))]',   bg: 'bg-[hsl(var(--success))]/20 border-[hsl(var(--success))]/40 hover:bg-[hsl(var(--success))]/30' },
  ABSENT:   { label: 'Absent',   short: 'A',  color: 'text-destructive',             bg: 'bg-destructive/20 border-destructive/40 hover:bg-destructive/30' },
  HALF_DAY: { label: 'Half Day', short: 'HD', color: 'text-[hsl(var(--warning))]',   bg: 'bg-[hsl(var(--warning))]/20 border-[hsl(var(--warning))]/40 hover:bg-[hsl(var(--warning))]/30' },
  LEAVE:    { label: 'Leave',    short: 'L',  color: 'text-primary',                 bg: 'bg-primary/20 border-primary/40 hover:bg-primary/30' },
  HOLIDAY:  { label: 'Holiday',  short: 'HO', color: 'text-accent',                  bg: 'bg-accent/20 border-accent/40 hover:bg-accent/30' },
};

interface AttendanceCalendarProps {
  isOwner?: boolean; // Owners see all staff + require notes for edits; managers see scoped roster
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ isOwner = false }) => {
  const { addToast } = useToastStore();
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({
      title: 'Attendance',
      subtitle: isOwner ? 'All staff attendance' : 'Team attendance and shift log',
    });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, isOwner]);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [staffFilter, setStaffFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(
    (today.getFullYear() === year && today.getMonth() + 1 === month) ? today.getDate() : 1
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [view, setView] = useState<'grid' | 'history'>('grid');
  
  const todayLocal = today.toISOString().split('T')[0];

  const ownerCanEditSetting = useSystemSettingQuery('ownerCanEditAttendance');
  const ownerCanEdit = ownerCanEditSetting.data?.value === 'true';

  const workOnSundaysSetting = useSystemSettingQuery('workOnSundays');
  const workOnSundays = workOnSundaysSetting.data?.value === 'true';

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Popover state
  const [popover, setPopover] = useState<{ staffId: string; date: string; existing: AttendanceRecord | null } | null>(null);
  const [popStatus, setPopStatus] = useState<AttendanceStatus>('PRESENT');
  const [popNote, setPopNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [staffRes, attRes] = await Promise.all([
        axiosClient.get('/users'),
        axiosClient.get(`/attendance?month=${month}&year=${year}`),
      ]);
      let staffData: StaffMember[] = staffRes.data;
      // Always exclude owners from attendance roster
      staffData = staffData.filter(s => s.role !== 'OWNER');
      
      if (!isOwner) {
        staffData = staffData.filter(s => s.role !== 'MANAGER');
      }
      setStaff(staffData);
      setAttendance(attRes.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load attendance data.'));
    } finally {
      setIsLoading(false);
    }
  }, [month, year, isOwner]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getRecord = (staffId: string, day: number): AttendanceRecord | null => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return attendance.find(r => r.userId === staffId && r.date === dateStr) || null;
  };

  const openPopover = (staffId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = getRecord(staffId, day);
    setPopover({ staffId, date: dateStr, existing });
    setPopStatus(existing?.status || 'PRESENT');
    setPopNote(existing?.note || '');
  };

  const handleSave = async () => {
    if (!popover) return;
    if (isOwner && popover.existing && !popNote.trim()) {
      addToast({ type: 'error', title: 'Note required', message: 'A reason is required when overriding an existing entry.' });
      return;
    }
    setIsSaving(true);
    try {
      if (popover.existing) {
        await axiosClient.patch(`/attendance/${popover.existing.id}`, { status: popStatus, note: popNote });
        setAttendance(prev => prev.map(r => r.id === popover.existing!.id ? { ...r, status: popStatus, note: popNote } : r));
      } else {
        const res = await axiosClient.post('/attendance', {
          userId: popover.staffId,
          date: popover.date,
          status: popStatus,
          note: popNote,
        });
        setAttendance(prev => [...prev, res.data]);
      }
      addToast({ type: 'success', title: 'Attendance saved' });
      setPopover(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to save', message: extractErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStaff = staffFilter
    ? staff.filter(s => s.name.toLowerCase().includes(staffFilter.toLowerCase()))
    : staff;

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  const selectedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

  const handleMarkAllPresent = async () => {
    if (filteredStaff.length === 0) return;
    setMarkingAll(true);
    const date = selectedDateStr;
    let successCount = 0;
    const newRecords: AttendanceRecord[] = [];
    const updatedIds: Record<string, AttendanceRecord> = {};
    try {
      await Promise.all(
        filteredStaff.map(async (s) => {
          const existing = getRecord(s.id, selectedDay);
          if (existing) {
            if (existing.status === 'PRESENT') {
              successCount++;
              return;
            }
            try {
              const res = await axiosClient.patch(`/attendance/${existing.id}`, {
                status: 'PRESENT',
                note: existing.note || 'Bulk mark all present',
              });
              updatedIds[existing.id] = res.data;
              successCount++;
            } catch {
              /* ignore individual failures */
            }
          } else {
            try {
              const res = await axiosClient.post('/attendance', {
                userId: s.id,
                date,
                status: 'PRESENT',
                note: 'Bulk mark all present',
              });
              newRecords.push(res.data);
              successCount++;
            } catch {
              /* ignore individual failures */
            }
          }
        })
      );
      setAttendance(prev => {
        let next = prev.map(r => updatedIds[r.id] ?? r);
        const existingKeys = new Set(next.map(r => `${r.userId}|${r.date}`));
        newRecords.forEach(r => {
          const k = `${r.userId}|${r.date}`;
          if (!existingKeys.has(k)) next.push(r);
        });
        return next;
      });
      addToast({
        type: 'success',
        title: 'Marked all present',
        message: `${successCount}/${filteredStaff.length} staff marked Present for ${date}. Individual cells remain overridable.`,
      });
    } finally {
      setMarkingAll(false);
    }
  };

  // ── Analytics summary for the current month ──
  const analyticsSummary = React.useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, HOLIDAY: 0,
    };
    const staffIds = new Set(filteredStaff.map(s => s.id));
    for (const rec of attendance) {
      if (staffIds.has(rec.userId) && counts[rec.status] !== undefined) {
        counts[rec.status]++;
      }
    }
    const totalPossible = filteredStaff.length * daysInMonth;
    const totalRecorded = Object.values(counts).reduce((a, b) => a + b, 0);
    const attendanceRate = totalPossible > 0 ? Math.round((counts.PRESENT / totalPossible) * 1000) / 10 : 0;
    return { counts, totalPossible, totalRecorded, attendanceRate };
  }, [attendance, filteredStaff, daysInMonth]);

  const isReadOnlyOwner = isOwner && !ownerCanEdit;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (month === 1) { setMonth(12); setYear(y => y-1); setSelectedDay(Math.min(selectedDay, 31)); } else setMonth(m => m-1); }}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-base w-36 text-center">{monthName} {year}</span>
          <button
            onClick={() => { if (month === 12) { setMonth(1); setYear(y => y+1); setSelectedDay(1); } else setMonth(m => m+1); }}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
            <button
              onClick={() => setView('grid')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Grid3X3 className="w-3.5 h-3.5" /> Grid
            </button>
            <button
              onClick={() => setView('history')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <History className="w-3.5 h-3.5" /> History
            </button>
          </div>
          {!isReadOnlyOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                size="sm" 
                onClick={handleMarkAllPresent} 
                disabled={markingAll || staff.length === 0 || (isOwner && !ownerCanEdit) || (!isOwner && selectedDateStr !== todayLocal)}
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                {markingAll ? 'Marking...' : 'Mark all Present'}
              </Button>
            </div>
          )}
        </div>
      </div>



      {isLoading ? (
        <div className="h-64 rounded-xl bg-secondary/40 animate-pulse" />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </div>
      ) : view === 'history' ? (
        <AttendanceHistory isOwner={isOwner} />
      ) : filteredStaff.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No staff to display.</div>
      ) : (
        <>
        {/* Analytics Summary (always shown, but prominent when read-only) */}
        {isReadOnlyOwner && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                {monthName} {year} — Attendance Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
                  <div key={key} className={`rounded-lg border p-3 ${cfg.bg}`}>
                    <div className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</div>
                    <div className={`text-2xl font-bold font-mono mt-1 ${cfg.color}`}>
                      {analyticsSummary.counts[key]}
                    </div>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="text-[11px] font-semibold text-primary">Attendance Rate</div>
                  <div className="text-2xl font-bold font-mono mt-1 text-primary">
                    {analyticsSummary.attendanceRate}%
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {analyticsSummary.totalRecorded}/{analyticsSummary.totalPossible} logged
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Legend Popover Toggle - Moved Below KPI */}
        <div className="relative mb-4">
          <Button variant="outline" size="sm" onClick={() => setShowLegend(!showLegend)}>
            <Info className="w-3.5 h-3.5 mr-1.5" />
          </Button>
          <AnimatePresence>
            {showLegend && (
              <motion.div
                initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                className="absolute left-0 top-full mt-2 z-30 bg-card border border-border p-3 rounded-xl shadow-lg w-64 flex flex-col gap-1.5"
              >
                {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
                  <div key={key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                    <div className="w-5 text-center bg-background/50 rounded">{cfg.short}</div>
                    {cfg.label}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-secondary/50">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground sticky left-0 bg-background z-20 min-w-[160px] border-r border-b border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Staff
                </th>
                {dayNumbers.map(d => {
                  const date = new Date(year, month - 1, d);
                  const isWeekend = date.getDay() === 0 && !workOnSundays;
                  const isSelected = d === selectedDay;
                  return (
                    <th
                      key={d}
                      onClick={() => setSelectedDay(d)}
                      className={`px-1 py-2 text-center font-medium w-10 min-w-[2.5rem] cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/20 text-primary border-b-2 border-b-primary'
                          : isWeekend
                            ? 'text-muted-foreground/50 hover:bg-secondary/30'
                            : 'text-muted-foreground hover:bg-secondary/30'
                      }`}
                    >
                      <div className="font-bold">{d}</div>
                      <div className="text-[9px]">{date.toLocaleString('default', { weekday: 'narrow' })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((s, idx) => (
                <tr key={s.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}>
                  <td className={`px-4 py-2 sticky left-0 z-10 border-r border-border font-medium bg-card shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                    <div className="truncate max-w-[140px]">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">{s.role}</div>
                  </td>
                  {dayNumbers.map(d => {
                    const rec = getRecord(s.id, d);
                    const cfg = rec ? STATUS_CONFIG[rec.status] : null;
                    const isSelected = d === selectedDay;
                    
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    let canEdit = true;
                    if (rec?.source === 'SYSTEM_LOGIN') canEdit = false;
                    else if (isOwner) canEdit = ownerCanEdit;
                    else canEdit = dateStr === todayLocal;

                    return (
                      <td
                        key={d}
                        className={`p-0.5 text-center ${isSelected ? 'bg-primary/5' : ''}`}
                      >
                        <button
                          onClick={() => canEdit && openPopover(s.id, d)}
                          disabled={!canEdit}
                          title={!canEdit ? 'Editing restricted' : cfg?.label || 'Log attendance'}
                          className={`w-8 h-7 rounded-md border text-[10px] font-bold transition-all ${
                            isSelected ? 'ring-1 ring-primary/50 ring-offset-1' : ''
                          } ${
                            cfg ? `${cfg.bg} ${cfg.color}` : 'border-transparent text-muted-foreground/40 hover:border-border hover:text-muted-foreground hover:bg-secondary/50'
                          } ${!canEdit ? 'cursor-default' : ''}`}
                        >
                          {cfg?.short || '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              </tbody>
          </table>
        </div>
        </>
      )}

      {/* Cell Popover */}
      <AnimatePresence>
        {popover && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
              onClick={() => setPopover(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-xs w-full pointer-events-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-bold text-sm">{staff.find(s => s.id === popover.staffId)?.name}</p>
                    <p className="text-xs text-muted-foreground">{popover.date}</p>
                  </div>
                  <button onClick={() => setPopover(null)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setPopStatus(key)}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                        popStatus === key ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-primary` : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>

                <div className="mb-4">
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Note {isOwner && popover.existing && <span className="text-destructive">* (required for override)</span>}
                  </label>
                  <Input
                    id="att-note"
                    value={popNote}
                    onChange={e => setPopNote(e.target.value)}
                    placeholder="Optional reason..."
                    className="text-xs"
                  />
                </div>

                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  <CheckSquare className="w-3.5 h-3.5 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
