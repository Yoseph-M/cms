import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Users, UserCheck, UserX, UserMinus, TrendingUp, DollarSign } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { User, Role } from '../../types';
import { extractErrorMessage } from '../../utils/errorHandler';
import { formatCurrency } from '../../utils/currency';
import { useUsersQuery, useStaffPerformanceQuery, useApiQuery } from '../../hooks/useCachedQueries';

// Use the owner dashboard components to match the UI perfectly
import { KpiCard } from '../../components/owner/dashboard/KpiCards';
import { SectionCard } from '../../components/owner/dashboard/SectionCard';
import { RevenueLineChart } from '../../components/owner/dashboard/RevenueLineChart';
import { RevenueDonut } from '../../components/owner/dashboard/RevenueDonut';

interface WaiterPerfRow {
  waiterId: string;
  name: string;
  role: string;
  orderCount: number;
  totalSales: number;
}

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  activeStaff: number;
}

export const ManagerDashboard: React.FC = () => {
  const { addToast } = useToastStore();
  const { t } = useTranslation('manager');
  const { dateRange: headerDateRange, setDateRange: setHeaderDateRange, setShowDateRange, setPageTitle } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Dashboard', subtitle: 'Overview of operations and team performance' });
    return () => setPageTitle({ title: 'Overview', subtitle: '' });
  }, [setPageTitle]);

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

  /* ── Data (React Query — cached across navigations) ── */
  const fromIso = useMemo(() => new Date(dateRange.from).toISOString(), [dateRange.from]);
  const toIso = useMemo(() => new Date(`${dateRange.to}T23:59:59.999`).toISOString(), [dateRange.to]);

  const usersQuery = useUsersQuery();
  const waiterPerfQuery = useStaffPerformanceQuery({ from: fromIso, to: toIso, role: 'WAITER' });
  const ordersQuery = useApiQuery<unknown[]>(
    ['orders', 'range', fromIso, toIso],
    '/orders',
    { from: fromIso, to: toIso }
  );

  const allUsers: User[] = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  // Filter out OWNER and MANAGER roles for manager view
  const staffList: User[] = allUsers.filter((user: User) => user.role !== 'OWNER' && user.role !== 'MANAGER');
  const isLoadingStaff = usersQuery.isLoading;
  const waiterPerf: WaiterPerfRow[] = Array.isArray(waiterPerfQuery.data) ? waiterPerfQuery.data : [];
  const isLoadingWaiterPerf = waiterPerfQuery.isLoading;

  const orders = Array.isArray(ordersQuery.data) ? ordersQuery.data : [];
  const dashboardStats = {
    totalOrders: orders.length,
    totalRevenue: orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0),
    activeStaff: allUsers.filter(
      (u: User) => u.isActive && u.role !== 'OWNER' && u.role !== 'MANAGER'
    ).length,
  };

  // Derive KPIs from actual data
  const kpis = useMemo(() => {
    const totalStaff = staffList.length;
    // Mock attendance data - in production this would come from an attendance API
    const present = Math.round(totalStaff * 0.75);
    const absent = Math.round(totalStaff * 0.1);
    const onLeave = totalStaff - present - absent;
    
    return {
      totalStaff,
      present,
      absent,
      onLeave,
    };
  }, [staffList]);

  // Derive Donut Chart Data (Staff by Role) - EXCLUDE OWNER from the chart
  const donutSegments = useMemo(() => {
    // Filter out OWNER role before aggregating
    const filteredStaff = staffList.filter(staff => staff.role !== 'OWNER');
    
    const roles = filteredStaff.reduce((acc, staff) => {
      acc[staff.role] = (acc[staff.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = ['hsl(24 60% 35%)', 'hsl(142 71% 45%)', 'hsl(30 80% 75%)', 'hsl(200 80% 60%)', 'hsl(280 65% 60%)'];
    return Object.entries(roles).map(([role, count], i) => ({
      label: role,
      value: count,
      color: colors[i % colors.length],
    }));
  }, [staffList]);

  // Mock Line Chart Data (Attendance Trend) - based on staff count
  const lineData = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const staffCount = staffList.length;
    const present = labels.map(() => Math.round(staffCount * (0.7 + Math.random() * 0.2)));
    const absent = labels.map((_, i) => Math.max(0, Math.round(staffCount * 0.1) + Math.floor(Math.random() * 3)));
    return { labels, present, absent };
  }, [staffList.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full space-y-5 sm:space-y-6">
        {/* KPI cards - Top row with 4 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          <KpiCard 
            label="Total Orders" 
            value={dashboardStats.totalOrders} 
            kind="number" 
            icon={TrendingUp} 
            tone="cream" 
            trendDots={{ active: 3, total: 3, tone: 'green' }} 
          />
          <KpiCard 
            label="Revenue" 
            value={dashboardStats.totalRevenue} 
            kind="currency" 
            icon={DollarSign} 
            tone="mint" 
            trendDots={{ active: 3, total: 3, tone: 'green' }} 
          />
          <KpiCard 
            label="Active Staff" 
            value={dashboardStats.activeStaff} 
            kind="number" 
            icon={UserCheck} 
            tone="blush" 
            trendDots={{ active: 3, total: 3, tone: 'green' }} 
          />
          <KpiCard 
            label="Present Today" 
            value={kpis.present} 
            kind="number" 
            icon={Users} 
            tone="rose" 
            trendDots={{ active: 2, total: 3, tone: 'green' }} 
          />
        </div>

        {/* Second row - Attendance metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
          <KpiCard 
            label="Total Staff" 
            value={kpis.totalStaff} 
            kind="number" 
            icon={Users} 
            tone="cream"
          />
          <KpiCard 
            label="Absent Today" 
            value={kpis.absent} 
            kind="number" 
            icon={UserX} 
            tone="blush"
          />
          <KpiCard 
            label="On Leave" 
            value={kpis.onLeave} 
            kind="number" 
            icon={UserMinus} 
            tone="rose"
          />
        </div>

        {/* Chart row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
          <SectionCard
            title="Attendance Trend"
            filter={{ label: 'This Week', options: ['This Week', 'This Month'] }}
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
            description="Distribution of your team (excluding owners)"
            filter={{ label: 'All Roles', options: ['All Roles'] }}
          >
            <RevenueDonut
              segments={donutSegments}
            />
          </SectionCard>
        </div>

        {/* Bottom row - Waiter Performance */}
        <div className="grid grid-cols-1 gap-5 sm:gap-6">
          <SectionCard
            title="Waiter performance"
            description="Orders and revenue per waiter in the selected period"
            flush
          >
            {isLoadingWaiterPerf ? (
              <p className="text-center text-[11px] text-muted-foreground py-4">Loading…</p>
            ) : waiterPerf.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No waiter data for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="font-medium px-5 py-3">#</th>
                      <th className="font-medium px-5 py-3">Waiter</th>
                      <th className="font-medium px-5 py-3 text-right">Orders</th>
                      <th className="font-medium px-5 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {waiterPerf.map((w, i) => {
                      const maxOrders = waiterPerf[0]?.orderCount || 1;
                      return (
                        <tr key={w.waiterId} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                          <td className="px-5 py-3">
                            <div>
                              <p className="font-medium text-foreground">{w.name}</p>
                              <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden" style={{ width: 80 }}>
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.round((w.orderCount / maxOrders) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">{w.orderCount}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-primary">{formatCurrency(w.totalSales)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </motion.div>
  );
};

export default ManagerDashboard;