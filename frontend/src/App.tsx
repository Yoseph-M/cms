import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useSocketStore } from './store/socketStore';
import { useOfflineSyncStore } from './store/offlineSyncStore';

import { ToastContainer } from './components/common/ToastContainer';
import { OrientationPrompt } from './components/common/OrientationPrompt';
import { PageSkeleton } from './components/common/PageSkeleton';

import { OwnerLayout } from './components/layout/OwnerLayout';
import { ManagerLayout } from './components/layout/ManagerLayout';
import { CashierLayout } from './components/layout/CashierLayout';

import { LoginPage } from './pages/login/LoginPage';
import { NotFoundPage } from './pages/error/NotFoundPage';

const OwnerDashboard = lazy(() =>
  import('./pages/owner/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard }))
);
const OwnerFinance = lazy(() =>
  import('./pages/owner/OwnerFinance').then((m) => ({ default: m.OwnerFinance }))
);
const OwnerStaff = lazy(() =>
  import('./pages/owner/OwnerStaff').then((m) => ({ default: m.OwnerStaff }))
);
const OwnerPayroll = lazy(() =>
  import('./pages/owner/OwnerPayroll').then((m) => ({ default: m.OwnerPayroll }))
);
const OwnerExpenses = lazy(() =>
  import('./pages/owner/OwnerExpenses').then((m) => ({ default: m.OwnerExpenses }))
);
const OwnerAudit = lazy(() =>
  import('./pages/owner/OwnerAudit').then((m) => ({ default: m.OwnerAudit }))
);
const OwnerPrinters = lazy(() =>
  import('./pages/owner/OwnerPrinters').then((m) => ({ default: m.OwnerPrinters }))
);
const OwnerSettings = lazy(() =>
  import('./pages/settings/OwnerSettings').then((m) => ({ default: m.OwnerSettings }))
);
const ManagerSettings = lazy(() =>
  import('./pages/settings/ManagerSettings').then((m) => ({ default: m.ManagerSettings }))
);
const CashierSettings = lazy(() =>
  import('./pages/settings/CashierSettings').then((m) => ({ default: m.CashierSettings }))
);
const CashierOrderingPanel = lazy(() =>
  import('./components/cashier/CashierOrderingPanel').then((m) => ({
    default: m.CashierOrderingPanel,
  }))
);
const ManagerDashboard = lazy(() =>
  import('./pages/manager/ManagerDashboard').then((m) => ({ default: m.ManagerDashboard }))
);
const ManagerPayroll = lazy(() =>
  import('./pages/manager/ManagerPayroll').then((m) => ({ default: m.ManagerPayroll }))
);
const ManagerExpenses = lazy(() =>
  import('./pages/manager/ManagerExpenses').then((m) => ({ default: m.ManagerExpenses }))
);
const CashierDashboard = lazy(() =>
  import('./pages/cashier/CashierDashboard').then((m) => ({ default: m.CashierDashboard }))
);
const MenuCatalog = lazy(() =>
  import('./components/common/MenuCatalog').then((m) => ({ default: m.MenuCatalog }))
);
const AttendanceCalendar = lazy(() =>
  import('./components/common/AttendanceCalendar').then((m) => ({ default: m.AttendanceCalendar }))
);

const Lazy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
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

/** Router-free app shell — use with MemoryRouter in tests, BrowserRouter in production. */
export const AppRoutes: React.FC = () => {
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
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/owner"
          element={
            <RoleGuard allowedRole="OWNER">
              <OwnerLayout />
            </RoleGuard>
          }
        >
          <Route index element={<Lazy><OwnerDashboard /></Lazy>} />
          <Route path="staff" element={<Lazy><OwnerStaff /></Lazy>} />
          <Route path="menu" element={<Lazy><MenuCatalog /></Lazy>} />
          <Route path="finance" element={<Lazy><OwnerFinance /></Lazy>} />
          <Route path="expenses" element={<Lazy><OwnerExpenses /></Lazy>} />
          <Route path="attendance" element={<Lazy><AttendanceCalendar isOwner /></Lazy>} />
          <Route path="payroll" element={<Lazy><OwnerPayroll /></Lazy>} />
          <Route path="audit" element={<Lazy><OwnerAudit /></Lazy>} />
          <Route path="printers" element={<Lazy><OwnerPrinters /></Lazy>} />
          <Route path="settings" element={<Lazy><OwnerSettings /></Lazy>} />
          <Route path="*" element={<Navigate to="/owner" replace />} />
        </Route>

        <Route
          path="/manager"
          element={
            <RoleGuard allowedRole="MANAGER">
              <ManagerLayout />
            </RoleGuard>
          }
        >
          <Route index element={<Navigate to="people" replace />} />
          <Route path="people" element={<Lazy><ManagerDashboard /></Lazy>} />
          <Route path="menu" element={<Lazy><MenuCatalog canEdit /></Lazy>} />
          <Route path="attendance" element={<Lazy><AttendanceCalendar isOwner={false} /></Lazy>} />
          <Route path="payroll" element={<Lazy><ManagerPayroll /></Lazy>} />
          <Route path="expenses" element={<Lazy><ManagerExpenses /></Lazy>} />
          <Route path="settings" element={<Lazy><ManagerSettings /></Lazy>} />
          <Route path="*" element={<Navigate to="/manager/people" replace />} />
        </Route>

        <Route
          path="/cashier"
          element={
            <RoleGuard allowedRole="CASHIER">
              <CashierLayout />
            </RoleGuard>
          }
        >
          <Route index element={<Lazy><CashierDashboard /></Lazy>} />
          <Route path="settings" element={<Lazy><CashierSettings /></Lazy>} />
          <Route path="*" element={<Navigate to="/cashier" replace />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </QueryClientProvider>
  );
};

export const App: React.FC = () => (
  <Router>
    <AppRoutes />
  </Router>
);
