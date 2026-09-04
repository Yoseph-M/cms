import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { User, Role } from '../../types';
import { extractErrorMessage } from '../../utils/errorHandler';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/ToggleGroup';
import { Avatar, AvatarFallback } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { SectionCard } from '../../components/owner/dashboard/SectionCard';

const ROLE_TONE: Record<Role, 'default' | 'secondary' | 'success' | 'outline'> = {
  OWNER: 'default',
  MANAGER: 'secondary',
  CASHIER: 'success',
  WAITER: 'outline',
  COOKER: 'outline',
  BARISTA: 'outline',
};

export const ManagerStaff: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('manager');
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Staff', subtitle: 'Manage your team members' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const [staffList, setStaffList] = useState<User[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    try {
      const res = await axiosClient.get('/users');
      // Filter to show only staff below manager level (exclude OWNER and MANAGER)
      const filteredStaff = res.data.filter(
        (user: User) => user.role !== 'OWNER' && user.role !== 'MANAGER'
      );
      setStaffList(filteredStaff);
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Failed to load staff',
        message: extractErrorMessage(err),
      });
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleLogAttendance = async (userId: string, status: string) => {
    if (!status) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      await axiosClient.post('/attendance/log', {
        userId,
        status,
        date: today,
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full space-y-5 sm:space-y-6">
        {/* Staff Roster Table */}
        <SectionCard
          title={t('staff.title', { defaultValue: 'Staff Members' })}
          description={t('staff.description', { defaultValue: 'View and manage your team roster' })}
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="font-medium px-5 py-3">Staff Member</th>
                  <th className="font-medium px-5 py-3">Role</th>
                  <th className="font-medium px-5 py-3">Contact</th>
                  <th className="font-medium px-5 py-3">Status</th>
                  <th className="font-medium px-5 py-3 text-right">Quick Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {isLoadingStaff ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-xs">
                      Loading staff...
                    </td>
                  </tr>
                ) : staffList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">
                      No staff members found
                    </td>
                  </tr>
                ) : (
                  staffList.map((staff) => {
                    const initials = staff.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase();
                    return (
                      <tr key={staff.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8 ring-1 ring-border">
                              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">{staff.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                ID: {staff.id.substring(0, 8)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={ROLE_TONE[staff.role] || 'outline'}>{staff.role}</Badge>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          <div>
                            {staff.phone && <div>📞 {staff.phone}</div>}
                            {staff.username && <div>👤 {staff.username}</div>}
                            {!staff.phone && !staff.username && '—'}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={staff.isActive ? 'success' : 'outline'}>
                            {staff.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <ToggleGroup
                            type="single"
                            onValueChange={(val) => handleLogAttendance(staff.id, val)}
                            className="inline-flex h-8"
                          >
                            <ToggleGroupItem
                              value="PRESENT"
                              aria-label="Present"
                              className="w-10 text-[10px] font-bold data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-600"
                            >
                              P
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="ABSENT"
                              aria-label="Absent"
                              className="w-10 text-[10px] font-bold data-[state=on]:bg-rose-500/15 data-[state=on]:text-rose-600"
                            >
                              A
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="HALF_DAY"
                              aria-label="Half Day"
                              className="w-10 text-[10px] font-bold data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-600"
                            >
                              HD
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="LEAVE"
                              aria-label="Leave"
                              className="w-10 text-[10px] font-bold data-[state=on]:bg-cyan-500/15 data-[state=on]:text-cyan-600"
                            >
                              L
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Staff Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <SectionCard title="Total Staff" flush>
            <div className="px-5 py-4">
              <div className="text-3xl font-bold text-primary">{staffList.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Staff members under your management</p>
            </div>
          </SectionCard>

          <SectionCard title="Active Staff" flush>
            <div className="px-5 py-4">
              <div className="text-3xl font-bold text-emerald-600">
                {staffList.filter((s) => s.isActive).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Currently active staff</p>
            </div>
          </SectionCard>

          <SectionCard title="Inactive Staff" flush>
            <div className="px-5 py-4">
              <div className="text-3xl font-bold text-muted-foreground">
                {staffList.filter((s) => !s.isActive).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Inactive or on leave</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </motion.div>
  );
};

export default ManagerStaff;
