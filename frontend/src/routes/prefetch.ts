/** Warm the JS chunk for a sidebar route so the next click does not wait on download. */
export function prefetchRoute(path: string) {
  const loaders: Record<string, () => Promise<unknown>> = {
    '/owner': () => import('../pages/owner/OwnerDashboard'),
    '/owner/menu': () => import('../components/common/MenuCatalog'),
    '/owner/finance': () => import('../pages/owner/OwnerFinance'),
    '/owner/expenses': () => import('../pages/owner/OwnerExpenses'),
    '/owner/settlements': () => import('../pages/shared/GlobalSettlementHistory'),
    '/owner/attendance': () => import('../components/common/AttendanceCalendar'),
    '/owner/payroll': () => import('../pages/owner/OwnerPayroll'),
    '/owner/admin': () => import('../pages/owner/SystemAdminPage'),
    '/owner/settings': () => import('../pages/settings/OwnerSettings'),
    '/owner/profile': () => import('../pages/shared/ProfilePage'),
    '/manager/people': () => import('../pages/manager/ManagerDashboard'),
    '/manager/attendance': () => import('../pages/manager/ManagerDashboard'),
    '/manager/reconciliation': () => import('../pages/manager/OperationalReconciliation'),
    '/manager/menu': () => import('../components/common/MenuCatalog'),
    '/manager/payroll': () => import('../pages/manager/ManagerPayroll'),
    '/manager/expenses': () => import('../pages/manager/ManagerExpenses'),
    '/manager/settings': () => import('../pages/settings/ManagerSettings'),
    '/manager/settlements': () => import('../pages/shared/GlobalSettlementHistory'),
    '/manager/profile': () => import('../pages/shared/ProfilePage'),
    '/cashier': () => import('../pages/cashier/CashierDashboard'),
    '/cashier/tickets': () => import('../pages/cashier/CashierTicketsPage'),
    '/cashier/menu': () => import('../components/common/MenuCatalog'),
    '/cashier/settlements': () => import('../pages/shared/GlobalSettlementHistory'),
    '/cashier/settings': () => import('../pages/settings/CashierSettings'),
    '/cashier/profile': () => import('../pages/shared/ProfilePage'),
  };
  void loaders[path]?.();
}
