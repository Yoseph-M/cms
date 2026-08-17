import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Users, UserCheck, UserX, UserMinus } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { User, Role } from '../../types';
import { extractErrorMessage } from '../../utils/errorHandler';

// Use the owner dashboard components to match the UI perfectly
import { KpiCards, KpiCard } from '../../components/owner/dashboard/KpiCards';
import { SectionCard } from '../../components/owner/dashboard/SectionCard';
import { RevenueLineChart } from '../../components/owner/dashboard/RevenueLineChart';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/ToggleGroup';
import { Avatar, AvatarFallback } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

const ROLE_TONE: Record<Role, 'default' | 'secondary' | 'success' | 'outline'> = {
  OWNER: 'default',
  MANAGER: 'secondary',
  CASHIER: 'success',
  WAITER: 'outline',
  COOKER: 'outline',
  BARISTA: 'outline',
};

export const ManagerDashboard: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('manager');
  const { dateRange: headerDateRange, setDateRange: setHeaderDateRange, setShowDateRange } = useHeaderStore();

  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  const defaultRange = React.useMemo(
    () => ({
      from: monthAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!headerDateRange.from || !headerDateRange.to) {
      setHeaderDateRange(defaultRange);
    }
  }, [headerDateRange.from, headerDateRange.to, defaultRange, setHeaderDateRange]);

  const dateRange = {
    from: headerDateRange.from || defaultRange.from,
    to: headerDateRange.to || defaultRange.to,
  };
  const setDateRange = setHeaderDateRange;

  useEffect(() => {
    setShowDateRange(true);
    return () => setShowDateRange(false);
  }, [setShowDateRange]);

  const [staffList, setStaffList] = useState<User[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    try {
      const res = await axiosClient.get('/users');
      setStaffList(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleLogAttendance = async (userId: string, status: string) => {
    if (!status) return;
    try {
      await axiosClient.post('/attendance/log', {
        userId,
        status,
        date: dateRange.to, // Using the "to" date as the selected day for logging
      });
      addToast({ type: 'success', title: t('toasts.attendanceLogged', { defaultValue: 'Attendance logged' }) });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: t('toasts.attendanceFailed', { defaultValue: 'Failed to log attendance' }),
        message: extractErrorMessage(err),
      });
    }
  };

  // Derive KPIs (mocking the attendance counts since we don't have an endpoint for today's aggregated attendance yet)
  const kpis = useMemo(() => {
    return {
      total: staffList.length,
      present: Math.round(staffList.length * 0.75), // Mock for visual
      absent: Math.round(staffList.length * 0.1),
      onLeave: Math.round(staffList.length * 0.15),
    };
  }, [staffList]);

  // Derive Donut Chart Data (Staff by Role)
  const donutSegments = useMemo(() => {
    const roles = staffList.reduce((acc, staff) => {
      acc[staff.role] = (acc[staff.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = ['hsl(20 95% 53%)', 'hsl(24 60% 35%)', 'hsl(30 80% 75%)', 'hsl(32 100% 90%)', 'hsl(200 80% 60%)'];
    return Object.entries(roles).map(([role, count], i) => ({
      label: role,
      value: count,
      color: colors[i % colors.length],
    }));
  }, [staffList]);

  // Mock Line Chart Data (Attendance Trend)
  const lineData = useMemo(() => {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const present = labels.map(() => Math.round(staffList.length * (0.7 + Math.random() * 0.2)));
    const absent = labels.map((_, i) => staffList.length - present[i]);
    return { labels, present, absent };
  }, [staffList.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 sm:space-y-6">
        {/* KPI cards - Matching the 4-card layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
          <KpiCard label="Total Staff" value={kpis.total} kind="number" icon={Users} tone="cream" trendDots={{ active: 3, total: 3, tone: 'green' }} />
          <KpiCard label="Present Today" value={kpis.present} kind="number" icon={UserCheck} tone="mint" trendDots={{ active: 3, total: 3, tone: 'green' }} />
          <KpiCard label="Absent Today" value={kpis.absent} kind="number" icon={UserX} tone="blush" trendDots={{ active: 1, total: 3, tone: 'orange' }} />
          <KpiCard label="On Leave" value={kpis.onLeave} kind="number" icon={UserMinus} tone="rose" trendDots={{ active: 2, total: 3, tone: 'orange' }} />
        </div>

        {/* Chart row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            title="Attendance Trend"
            filter={{ label: 'This Year', options: ['This Year', 'This Month'] }}
            className="lg:col-span-2"
          >
            <RevenueLineChart
              labels={lineData.labels}
              series={[
                { key: 'present', label: 'Present', values: lineData.present, color: 'hsl(142 71% 45%)', fill: true },
                { key: 'absent', label: 'Absent', values: lineData.absent, color: 'hsl(346 87% 60%)', fill: false },
              ]}
              yFormat={(v) => `${v}`}
            />
          </SectionCard>

          <SectionCard
            title="Staff by Role"
            filter={{ label: 'All Roles', options: ['All Roles'] }}
          >
            <RevenueDonut
              segments={donutSegments}
              size={200}
              thickness={26}
              centerLabel="Total"
              centerPercent={100}
            />
          </SectionCard>
        </div>

        {/* Bottom row - Roster Table replacing Recent Orders */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6">
          <SectionCard
            title={t('dashboard.markAttendance', { defaultValue: 'Log Attendance' })}
            filter={{ label: 'Today', options: ['Today', 'Yesterday'] }}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="font-medium px-5 py-3">Staff Member</th>
                    <th className="font-medium px-5 py-3">Role</th>
                    <th className="font-medium px-5 py-3">Contact</th>
                    <th className="font-medium px-5 py-3 text-right">Log Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {staffList.map((staff) => {
                    const initials = staff.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
                    return (
                      <tr key={staff.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8 ring-1 ring-border">
                              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">{staff.name}</p>
                              <p className="text-[11px] text-muted-foreground">{staff.isActive ? 'Active' : 'Inactive'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={ROLE_TONE[staff.role] || 'outline'}>{staff.role}</Badge>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {staff.email || staff.phone || '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <ToggleGroup
                            type="single"
                            onValueChange={(val) => handleLogAttendance(staff.id, val)}
                            className="inline-flex h-8"
                          >
                            <ToggleGroupItem value="PRESENT" aria-label="Present" className="w-10 text-[10px] font-bold data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-600">P</ToggleGroupItem>
                            <ToggleGroupItem value="ABSENT" aria-label="Absent" className="w-10 text-[10px] font-bold data-[state=on]:bg-rose-500/15 data-[state=on]:text-rose-600">A</ToggleGroupItem>
                            <ToggleGroupItem value="HALF_DAY" aria-label="Half Day" className="w-10 text-[10px] font-bold data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-600">HD</ToggleGroupItem>
                            <ToggleGroupItem value="LEAVE" aria-label="Leave" className="w-10 text-[10px] font-bold data-[state=on]:bg-cyan-500/15 data-[state=on]:text-cyan-600">L</ToggleGroupItem>
                          </ToggleGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isLoadingStaff && <p className="text-center text-[11px] text-muted-foreground py-4">Refreshing…</p>}
          </SectionCard>
        </div>
      </div>
    </motion.div>
  );
};

export default ManagerDashboard;
