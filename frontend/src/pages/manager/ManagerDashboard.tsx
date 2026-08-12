import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { User, Role } from '../../types';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar, AvatarFallback } from '../../components/ui/Avatar';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/ToggleGroup';
import { LoadingState } from '../../components/common/LoadingState';
import { ErrorState } from '../../components/common/ErrorState';
import { EmptyState } from '../../components/common/EmptyState';
import { motion } from 'framer-motion';
import { Calendar, Phone, Mail, Users } from 'lucide-react';
import { PageHeading } from '../../components/ui/Typography';
import { cn } from '../../lib/utils';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 26 },
  },
};

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

  const [staffList, setStaffList] = useState<User[]>([]);
  const [attendanceDate, setAttendanceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    setStaffError(null);
    try {
      const res = await axiosClient.get('/users');
      setStaffList(res.data);
    } catch (err: any) {
      setStaffError(err.response?.data?.error || t('toasts.fetchStaffError', { defaultValue: 'Failed to fetch staff list' }));
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleLogAttendance = async (userId: string, status: string) => {
    if (!status) return; // Prevent deselecting
    try {
      await axiosClient.post('/attendance/log', {
        userId,
        status,
        date: attendanceDate,
      });
      addToast({ type: 'success', title: t('toasts.attendanceLogged', { defaultValue: 'Attendance logged' }) });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: t('toasts.attendanceFailed', { defaultValue: 'Failed to log attendance' }),
        message: err.response?.data?.error,
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {t('dashboard.subtitle', { defaultValue: 'Manager' })}
          </p>
          <PageHeading className="mt-1">
            {t('dashboard.title', { defaultValue: 'Staff Roster' })}
          </PageHeading>
          <p className="text-sm text-muted-foreground mt-1">
            {t('dashboard.description', { defaultValue: 'Log attendance for today or past dates.' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card/40 border border-border rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('dashboard.date', { defaultValue: 'Date' })}
          </span>
          <input
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            className="bg-transparent text-foreground text-sm focus:outline-none tabular-nums"
          />
        </div>
      </div>

      {isLoadingStaff ? (
        <LoadingState message={t('dashboard.loading', { defaultValue: 'Loading staff roster…' })} />
      ) : staffError ? (
        <ErrorState message={staffError} onRetry={fetchStaff} />
      ) : staffList.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyTitle', { defaultValue: "It's just you for now" })}
          message={t('dashboard.emptyMsg', { defaultValue: "Once the Owner adds your team, you'll see everyone here to log daily attendance." })}
          icon={<Users className="w-7 h-7" />}
        />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {staffList.map((staff) => {
            const initials = staff.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase();
            return (
              <motion.div key={staff.id} variants={itemVariants}>
                <Card className="flex flex-col h-full card-lift">
                  <CardContent className="pt-5 flex flex-col gap-4">
                    {/* Identity row */}
                    <div className="flex items-start gap-3">
                      <Avatar className="w-11 h-11 ring-2 ring-border">
                        <AvatarFallback className="bg-primary/15 text-primary font-bold text-sm">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate leading-tight">
                          {staff.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={ROLE_TONE[staff.role] || 'outline'}>
                            {staff.role}
                          </Badge>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-semibold',
                              staff.isActive
                                ? 'text-[hsl(var(--success))]'
                                : 'text-muted-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                staff.isActive
                                  ? 'bg-[hsl(var(--success))]'
                                  : 'bg-muted-foreground/50'
                              )}
                            />
                            {staff.isActive ? t('dashboard.active', { defaultValue: 'Active' }) : t('dashboard.inactive', { defaultValue: 'Inactive' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1 text-[11px] text-muted-foreground">
                      {staff.email && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{staff.email}</span>
                        </div>
                      )}
                      {staff.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span className="tabular-nums">{staff.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="hairline" />

                    {/* Attendance toggle */}
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.14em] mb-2">
                        {t('dashboard.markAttendance', { defaultValue: 'Mark Attendance' })}
                      </p>
                      <ToggleGroup
                        type="single"
                        onValueChange={(val) => handleLogAttendance(staff.id, val)}
                        className="w-full"
                      >
                        <ToggleGroupItem
                          value="PRESENT"
                          aria-label="Present"
                          className="flex-1 text-[11px] h-8 font-semibold data-[state=on]:bg-[hsl(var(--success))]/15 data-[state=on]:text-[hsl(var(--success))] data-[state=on]:border data-[state=on]:border-[hsl(var(--success))]/40"
                        >
                          {t('dashboard.attendance.present', { defaultValue: 'P' })}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="ABSENT"
                          aria-label="Absent"
                          className="flex-1 text-[11px] h-8 font-semibold data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive data-[state=on]:border data-[state=on]:border-destructive/40"
                        >
                          {t('dashboard.attendance.absent', { defaultValue: 'A' })}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="HALF_DAY"
                          aria-label="Half Day"
                          className="flex-1 text-[11px] h-8 font-semibold data-[state=on]:bg-warning/15 data-[state=on]:text-[hsl(var(--warning))] data-[state=on]:border data-[state=on]:border-warning/40"
                        >
                          {t('dashboard.attendance.halfDay', { defaultValue: 'HD' })}
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="LEAVE"
                          aria-label="Leave"
                          className="flex-1 text-[11px] h-8 font-semibold data-[state=on]:bg-accent/15 data-[state=on]:text-accent data-[state=on]:border data-[state=on]:border-accent/40"
                        >
                          {t('dashboard.attendance.leave', { defaultValue: 'L' })}
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};
