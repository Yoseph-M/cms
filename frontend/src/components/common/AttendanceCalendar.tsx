import React, { useState, useEffect, useCallback, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X, ChevronLeft, ChevronRight, CheckSquare, AlertCircle } from 'lucide-react';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY';

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: AttendanceStatus;
  note: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; short: string; color: string; bg: string }> = {
  PRESENT:  { label: 'Present',  short: 'P',  color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30' },
  ABSENT:   { label: 'Absent',   short: 'A',  color: 'text-red-700 dark:text-red-400',         bg: 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30' },
  HALF_DAY: { label: 'Half Day', short: 'HD', color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30' },
  LEAVE:    { label: 'Leave',    short: 'L',  color: 'text-sky-700 dark:text-sky-400',         bg: 'bg-sky-500/20 border-sky-500/40 hover:bg-sky-500/30' },
  HOLIDAY:  { label: 'Holiday',  short: 'HO', color: 'text-purple-700 dark:text-purple-400',   bg: 'bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30' },
};

const EXCLUDED_ROLES_FOR_MANAGER = ['OWNER', 'MANAGER'];

interface AttendanceCalendarProps {
  isOwner?: boolean; // Owners see all staff + require notes for edits; managers see scoped roster
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ isOwner = false }) => {
  const { addToast } = useToastStore();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [staffFilter, setStaffFilter] = useState('');

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
      if (!isOwner) {
        staffData = staffData.filter(s => !EXCLUDED_ROLES_FOR_MANAGER.includes(s.role));
      }
      setStaff(staffData);
      setAttendance(attRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load attendance data.');
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
        const res = await axiosClient.post('/attendance/log', {
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
      addToast({ type: 'error', title: 'Failed to save', message: err.response?.data?.error });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStaff = staffFilter
    ? staff.filter(s => s.name.toLowerCase().includes(staffFilter.toLowerCase()))
    : staff;

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  const exportCSV = () => {
    const rows = [['Staff', 'Role', ...dayNumbers.map(d => `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`)]];
    filteredStaff.forEach(s => {
      const row = [s.name, s.role, ...dayNumbers.map(d => getRecord(s.id, d)?.status || '-')];
      rows.push(row);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${year}-${month}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (month === 1) { setMonth(12); setYear(y => y-1); } else setMonth(m => m-1); }}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-base w-36 text-center">{monthName} {year}</span>
          <button
            onClick={() => { if (month === 12) { setMonth(1); setYear(y => y+1); } else setMonth(m => m+1); }}
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="staff-filter"
            placeholder="Filter staff..."
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="sm" onClick={exportCSV}>Export CSV</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([key, cfg]) => (
          <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="h-64 rounded-xl bg-secondary/40 animate-pulse" />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No staff to display.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-secondary/50">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground sticky left-0 bg-secondary/50 z-10 min-w-[160px] border-r border-border">
                  Staff
                </th>
                {dayNumbers.map(d => {
                  const date = new Date(year, month - 1, d);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th key={d} className={`px-1 py-2 text-center font-medium w-10 min-w-[2.5rem] ${isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                      <div>{d}</div>
                      <div className="text-[9px]">{date.toLocaleString('default', { weekday: 'narrow' })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((s, idx) => (
                <tr key={s.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}>
                  <td className={`px-4 py-2 sticky left-0 z-10 border-r border-border font-medium ${idx % 2 === 0 ? 'bg-background' : 'bg-secondary/20'}`}>
                    <div className="truncate max-w-[140px]">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">{s.role}</div>
                  </td>
                  {dayNumbers.map(d => {
                    const rec = getRecord(s.id, d);
                    const cfg = rec ? STATUS_CONFIG[rec.status] : null;
                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button
                          onClick={() => openPopover(s.id, d)}
                          title={cfg?.label || 'Log attendance'}
                          className={`w-8 h-7 rounded-md border text-[10px] font-bold transition-all ${
                            cfg ? `${cfg.bg} ${cfg.color}` : 'border-transparent text-muted-foreground/40 hover:border-border hover:text-muted-foreground hover:bg-secondary/50'
                          }`}
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
