import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useSocketStore } from './store/socketStore';
import { useOfflineSyncStore } from './store/offlineSyncStore';

import { ToastContainer } from './components/common/ToastContainer';
import { OrientationPrompt } from './components/common/OrientationPrompt';

import { OwnerLayout } from './components/layout/OwnerLayout';
import { ManagerLayout } from './components/layout/ManagerLayout';
import { CashierLayout } from './components/layout/CashierLayout';

import { LoginPage } from './pages/login/LoginPage';
import { OwnerDashboard } from './pages/owner/OwnerDashboard';
import { OwnerStaff } from './pages/owner/OwnerStaff';
import { OwnerPayroll } from './pages/owner/OwnerPayroll';
import { OwnerAudit } from './pages/owner/OwnerAudit';
import { OwnerPrinters } from './pages/owner/OwnerPrinters';
import { OwnerFinance } from './pages/owner/OwnerFinance';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { ManagerPayroll } from './pages/manager/ManagerPayroll';
import { CashierDashboard } from './pages/cashier/CashierDashboard';
import { MenuCatalog } from './components/common/MenuCatalog';
import { AttendanceCalendar } from './components/common/AttendanceCalendar';
import { NotFoundPage } from './pages/error/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RoleGuard: React.FC<{ children: React.ReactNode; allowedRole: string }> = ({
  children,
  allowedRole,
}) => {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Strict explicit single-role boundary
  if (user.role !== allowedRole) {
    if (user.role === 'OWNER') return <Navigate to="/owner" replace />;
    if (user.role === 'MANAGER') return <Navigate to="/manager" replace />;
    if (user.role === 'CASHIER') return <Navigate to="/cashier" replace />;
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {user.role !== 'OWNER' && <OrientationPrompt />}
      {children}
    </>
  );
};

export const App: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { connect, disconnect } = useSocketStore();
  const { initListeners } = useOfflineSyncStore();

  useEffect(() => {
    initListeners();
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
  }, [isAuthenticated, connect, disconnect, initListeners]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ToastContainer />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Owner Protected Routes */}
          <Route
            path="/owner"
            element={
              <RoleGuard allowedRole="OWNER">
                <OwnerLayout />
              </RoleGuard>
            }
          >
            {/* The index route renders the overview dashboard */}
            <Route index element={<OwnerDashboard />} />
            <Route path="staff" element={<OwnerStaff />} />
            <Route path="menu" element={<MenuCatalog />} />
            <Route path="finance" element={<OwnerFinance />} />
            <Route path="attendance" element={<AttendanceCalendar isOwner={true} />} />
            <Route path="payroll" element={<OwnerPayroll />} />
            <Route path="audit" element={<OwnerAudit />} />
            <Route path="printers" element={<OwnerPrinters />} />
            <Route path="*" element={<Navigate to="/owner" replace />} />
          </Route>

          {/* Manager Protected Routes */}
          <Route
            path="/manager"
            element={
              <RoleGuard allowedRole="MANAGER">
                <ManagerLayout />
              </RoleGuard>
            }
          >
            <Route index element={<Navigate to="people" replace />} />
            <Route path="people" element={<ManagerDashboard />} />
            <Route path="menu" element={<MenuCatalog />} />
            <Route path="attendance" element={<AttendanceCalendar isOwner={false} />} />
            <Route path="payroll" element={<ManagerPayroll />} />
            <Route path="*" element={<Navigate to="/manager/people" replace />} />
          </Route>

          {/* Cashier Protected Routes */}
          <Route
            path="/cashier"
            element={
              <RoleGuard allowedRole="CASHIER">
                <CashierLayout />
              </RoleGuard>
            }
          >
            <Route index element={<CashierDashboard />} />
            <Route path="*" element={<Navigate to="/cashier" replace />} />
          </Route>

          {/* Root Fallback */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
};
