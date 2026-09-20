import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useSocketStore } from './store/socketStore';
import { useOfflineSyncStore } from './store/offlineSyncStore';
import { useSettingsStore } from './store/settingsStore';
import { useThemeStore } from './store/themeStore';
import { useHardwarePrinter } from './hooks/useHardwarePrinter';
import { useIdleLogout } from './hooks/useIdleLogout';

import { ToastContainer } from './components/common/ToastContainer';

import { PageSkeleton } from './components/common/PageSkeleton';

import { OwnerLayout } from './components/layout/OwnerLayout';
import { ManagerLayout } from './components/layout/ManagerLayout';
import { CashierLayout } from './components/layout/CashierLayout';


import { LoginPage } from './pages/login/LoginPage';
import { NotFoundPage } from './pages/error/NotFoundPage';

const OwnerDashboard = lazy(() =>
  import('./pages/owner/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard }))
);
const MenuSalesStats = lazy(() =>
  import('./pages/owner/MenuSalesStats').then((m) => ({ default: m.MenuSalesStats }))
);
const OwnerFinance = lazy(() =>
  import('./pages/owner/OwnerFinance').then((m) => ({ default: m.OwnerFinance }))
);
const OwnerPayroll = lazy(() =>
  import('./pages/owner/OwnerPayroll').then((m) => ({ default: m.OwnerPayroll }))
);
const OwnerExpenses = lazy(() =>
  import('./pages/owner/OwnerExpenses').then((m) => ({ default: m.OwnerExpenses }))
);
const SystemAdminPage = lazy(() =>
  import('./pages/owner/SystemAdminPage').then((m) => ({ default: m.SystemAdminPage }))
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
const ManagerStaff = lazy(() =>
  import('./pages/manager/ManagerStaff').then((m) => ({ default: m.ManagerStaff }))
);
const ManagerAttendance = lazy(() =>
  import('./pages/manager/ManagerAttendance').then((m) => ({ default: m.ManagerAttendance }))
);
const ManagerPayroll = lazy(() =>
  import('./pages/manager/ManagerPayroll').then((m) => ({ default: m.ManagerPayroll }))
);
const ManagerExpenses = lazy(() =>
  import('./pages/manager/ManagerExpenses').then((m) => ({ default: m.ManagerExpenses }))
);
const ManagerPrinters = lazy(() =>
  import('./pages/manager/ManagerPrinters').then((m) => ({ default: m.ManagerPrinters }))
);
const CashierPrinters = lazy(() =>
  import('./pages/cashier/CashierPrinters').then((m) => ({ default: m.CashierPrinters }))
);
const CashierEndOfDay = lazy(() =>
  import('./pages/cashier/CashierEndOfDay').then((m) => ({ default: m.CashierEndOfDay }))
);
const OperationalReconciliation = lazy(() =>
  import('./pages/manager/OperationalReconciliation').then((m) => ({ default: m.OperationalReconciliation }))
);
const CashierDashboard = lazy(() =>
  import('./pages/cashier/CashierDashboard').then((m) => ({ default: m.CashierDashboard }))
);
const CashierTicketsPage = lazy(() =>
  import('./pages/cashier/CashierTicketsPage').then((m) => ({ default: m.CashierTicketsPage }))
);
const MenuCatalog = lazy(() =>
  import('./components/common/MenuCatalog').then((m) => ({ default: m.MenuCatalog }))
);
const AttendanceCalendar = lazy(() =>
  import('./components/common/AttendanceCalendar').then((m) => ({ default: m.AttendanceCalendar }))
);
const ProfilePage = lazy(() =>
  import('./pages/shared/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const GlobalSettlementHistory = lazy(() =>
  import('./pages/shared/GlobalSettlementHistory').then((m) => ({ default: m.GlobalSettlementHistory }))
);


const Lazy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Long default staleTime: cached data survives page/tab switches, so
      // navigating back renders instantly. Queries that need fresher data
      // (e.g. live orders) override this per-hook with a shorter staleTime.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    },
  },
});

const ROLE_HOME: Record<string, string> = {
  OWNER: '/owner',
  MANAGER: '/manager',
  CASHIER: '/cashier',
};

const RoleGuard: React.FC<{ children: React.ReactNode; allowedRole: string }> = ({
  children,
  allowedRole,
}) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  // Do not mount protected pages until session restoration has finished.  A
  // cached user has no in-memory access token after a hard reload; mounting
  // their page early starts protected requests that inevitably produce 401s
  // before the refresh cookie can restore that token.
  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== allowedRole) {
    const home = ROLE_HOME[user.role];
    return home ? <Navigate to={home} replace /> : <Navigate to="/login" replace />;
  }

  return (
    <>{children}</>
  );
};

/**
 * Login entry point (used by both `/` and `/login`).
 *
 * On a hard refresh the access token lives only in memory, so the app must
 * silently restore the session from the HttpOnly refresh cookie. While that
 * bootstrap is in flight we must NOT render the login form — otherwise the user
 * sees a jarring "logged out" flash followed by an automatic sign-in. Instead:
 *
 *  - if a session is already restored → bounce straight to the role home;
 *  - if a cached user exists but bootstrap is still running → show the skeleton;
 *  - only when we are certain there is no session → show the login form.
 */
const LoginRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  // Never render the login form while the initial session bootstrap is still
  // running — on a hard refresh the access token is memory-only and the app is
  // restoring the session from the HttpOnly refresh cookie. Showing the form
  // here would flash a false "logged out" screen right before the auto sign-in.
  if (isLoading) {
    return <PageSkeleton />;
  }

  if (isAuthenticated && user) {
    const home = ROLE_HOME[user.role];
    if (home) return <Navigate to={home} replace />;
  }

  return <LoginPage />;
};

/** Router-free app shell — use with MemoryRouter in tests, BrowserRouter in production. */
export const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading, bootstrapSession, user } = useAuthStore();
  const { connect, disconnect } = useSocketStore();
  const { initListeners } = useOfflineSyncStore();
  const { settings, fetchSettings } = useSettingsStore();

  /**
   * Owner–manager consolidation: when the owner turns the Manager Dashboard
   * feature OFF, the owner absorbs every tool the manager role had — the
   * manager pages mount inside the owner shell (the backend gates them to
   * OWNER+MANAGER, so the owner is already authorized). When the feature is
   * on, the owner keeps their regular overview only.
   */
  const managerConsolidated = settings['managerDashboardEnabled'] === 'false';

  useHardwarePrinter();

  // End the session after 30 minutes without interaction. This is what stops a
  // tab left open on the counter from staying signed in indefinitely.
  useIdleLogout();

  // Bootstrap session on app load - uses HttpOnly refresh cookie
  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  // Proactive access-token rotation: the access token expires after 2h, and a
  // request sent with an expired token gets a browser-logged 401 before the
  // axios interceptor can silently refresh + retry. Refresh every 20 min —
  // background tabs throttle timers, so a long interval can be skipped
  // entirely and each skipped rotation guarantees a 401 later; the
  // visibilitychange catch-up covers the gaps (e.g. a tablet that slept).
  // Errors are swallowed: a failed proactive refresh must not log the user
  // out — the on-demand 401 flow in axiosClient remains the source of truth.
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastRotation = Date.now();
    const rotate = () => {
      lastRotation = Date.now();
      void useAuthStore.getState().refreshSession(true).catch(() => {});
    };
    const interval = setInterval(rotate, 20 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRotation >= 20 * 60 * 1000) {
        rotate();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
    }
  }, [isAuthenticated, fetchSettings]);

  // Appearance is sandboxed per account: every signed-in user (and the login
  // screen) keeps its own persisted theme, so a cashier switching to dark mode
  // never repaints the owner's or manager's workspace.
  useEffect(() => {
    useThemeStore.getState().syncScopeToUser(user?.id ?? null);
  }, [user?.id]);

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
        <Route path="/" element={<LoginRoute />} />
        <Route path="/login" element={<LoginRoute />} />

        <Route
          path="/owner"
          element={
            <RoleGuard allowedRole="OWNER">
              <OwnerLayout />
            </RoleGuard>
          }
        >
          <Route index element={<OwnerDashboard />} />
          {/* Menu editing is opt-in for the owner role (see Settings). */}
          <Route
            path="menu"
            element={<MenuCatalog canEdit={settings['ownerMenuEditEnabled'] === 'true'} />}
          />
          {/* Sales statistics per menu item — how often each item sells. */}
          <Route path="menu/sales" element={<MenuSalesStats />} />
          <Route path="finance" element={<OwnerFinance />} />
          <Route path="expenses" element={<OwnerExpenses />} />
          <Route path="attendance" element={<AttendanceCalendar isOwner={managerConsolidated ? false : true} />} />
          <Route path="payroll" element={<OwnerPayroll />} />
          <Route path="admin" element={<SystemAdminPage />} />

          {managerConsolidated && (
            /* Consolidation is surgical: End of Day is the only tool that
               exists for managers but not for the owner, so it is the only
               route absorbed. Staff/Payroll/Expenses/Printers already live in
               this shell (same backend, OWNER-allowed), so duplicates would
               just confuse navigation. */
            <Route path="manager-end-of-day" element={<Lazy><OperationalReconciliation /></Lazy>} />
          )}

          <Route path="settings" element={<OwnerSettings />} />
          <Route path="settlements" element={<GlobalSettlementHistory />} />
          <Route path="profile" element={<ProfilePage />} />
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
          <Route index element={<Lazy><ManagerDashboard /></Lazy>} />
          <Route path="dashboard" element={<Lazy><ManagerDashboard /></Lazy>} />
          <Route path="staff" element={<Lazy><ManagerStaff /></Lazy>} />
          <Route path="attendance" element={<Lazy><ManagerAttendance /></Lazy>} />
          <Route path="reconciliation" element={<Lazy><OperationalReconciliation /></Lazy>} />
          <Route
            path="menu"
            element={<Lazy><MenuCatalog canEdit={settings['managerMenuEditEnabled'] === 'true'} /></Lazy>}
          />
          <Route path="payroll" element={<Lazy><ManagerPayroll /></Lazy>} />
          <Route path="expenses" element={<Lazy><ManagerExpenses /></Lazy>} />
          <Route path="printers" element={<Lazy><ManagerPrinters /></Lazy>} />
          <Route path="settings" element={<Lazy><ManagerSettings /></Lazy>} />
          <Route path="settlements" element={<Lazy><GlobalSettlementHistory /></Lazy>} />
          <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
          <Route path="*" element={<Navigate to="/manager" replace />} />
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
          <Route path="tickets" element={<Lazy><CashierTicketsPage /></Lazy>} />
          <Route path="menu" element={<Lazy><MenuCatalog canEdit={true} /></Lazy>} />
          <Route path="settlements" element={<Lazy><GlobalSettlementHistory /></Lazy>} />
          <Route path="printers" element={<Lazy><CashierPrinters /></Lazy>} />
          <Route path="end-of-day" element={<Lazy><CashierEndOfDay /></Lazy>} />
          <Route path="settings" element={<Lazy><CashierSettings /></Lazy>} />
          <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
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
