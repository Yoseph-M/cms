import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import { axiosClient } from '../api/axiosClient';
import type { User } from '../types';

type ParamMap = Record<string, string | number | undefined>;

function compactParams(params?: ParamMap) {
  if (!params) return undefined;
  const next: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

export function useApiQuery<T>(queryKey: QueryKey, path: string, params?: ParamMap) {
  const compact = compactParams(params);
  return useQuery<T>({
    queryKey: compact ? [...queryKey, compact] : queryKey,
    queryFn: async () => {
      const res = await axiosClient.get(path, { params: compact });
      return res.data as T;
    },
    placeholderData: keepPreviousData,
  });
}
/** Menu catalog — rarely changes; 5 min stale */
export function useMenuQuery(params?: { category?: string; isAvailable?: string }) {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.isAvailable) qs.set('isAvailable', params.isAvailable);
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['menu', params?.category ?? 'all', params?.isAvailable ?? 'all'],
    queryFn: async () => {
      const res = await axiosClient.get(`/menu${suffix}`);
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Printer registry — rarely changes; 5 min stale */
export function usePrintersQuery() {
  return useQuery({
    queryKey: ['printers'],
    queryFn: async () => {
      const res = await axiosClient.get('/settings/printers');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Analytics widgets — 90s stale; keep previous range visible while a new one loads */
export function useAnalyticsQuery<T = unknown>(endpoint: string, deps: Record<string, string> = {}) {
  const qs = new URLSearchParams(deps).toString();
  return useQuery<T>({
    queryKey: ['analytics', endpoint, deps],
    queryFn: async () => {
      const res = await axiosClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      return res.data as T;
    },
    staleTime: 90_000,
    placeholderData: keepPreviousData,
  });
}

/** System setting by key — 30s stale, refetch on window focus for toggles */
export function useSystemSettingQuery(key: string, enabled = true) {
  return useQuery({
    queryKey: ['systemSetting', key],
    queryFn: async () => {
      try {
        const res = await axiosClient.get(`/settings/system/${key}`);
        return res.data as { key: string; value: string; updatedAt: string };
      } catch (err: any) {
        if (err.response?.status === 404) {
          return { key, value: null, updatedAt: new Date().toISOString() };
        }
        throw err;
      }
    },
    staleTime: 30_000,
    enabled,
  });
}

/** Current user profile */
export function useMeQuery() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await axiosClient.get('/users/me');
      return res.data;
    },
    staleTime: 60_000,
  });
}

/** ────────────────────────────────────────────────────────────────────────
 *  Shared page-level query hooks — keep data cached across navigations.
 *  Every hook below uses React Query so the cache survives component
 *  unmounts when the user switches between tabs / routes.
 * ──────────────────────────────────────────────────────────────────────── */

/** User list — shared by OwnerStaff, ManagerDashboard, payroll pages */
export function useUsersQuery() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axiosClient.get('/users');
      return res.data as User[];
    },
    staleTime: 2 * 60_000, // 2 minutes
  });
}

/** Orders list — shared by CashierDashboard, OwnerDashboard, etc. */
export function useOrdersQuery(params?: { limit?: number; sort?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['orders', params?.limit ?? 'all', params?.sort ?? '', params?.status ?? ''],
    queryFn: async () => {
      const res = await axiosClient.get(`/orders${suffix}`);
      return res.data;
    },
    staleTime: 30_000, // 30s — orders change frequently
  });
}

/** Payroll list — shared by OwnerPayroll, ManagerPayroll */
export function usePayrollQuery(scope?: string) {
  return useQuery({
    queryKey: ['payroll', scope ?? 'owner'],
    queryFn: async () => {
      const qs = scope ? `?scope=${scope}` : '';
      const res = await axiosClient.get(`/payroll${qs}`);
      return res.data;
    },
    staleTime: 2 * 60_000,
  });
}

/** Staff performance analytics */
export function useStaffPerformanceQuery(params: { from: string; to: string; role?: string }) {
  const qs = new URLSearchParams();
  qs.set('from', params.from);
  qs.set('to', params.to);
  if (params.role) qs.set('role', params.role);

  return useQuery({
    queryKey: ['analytics', 'staff-performance', params],
    queryFn: async () => {
      const res = await axiosClient.get(`/analytics/staff-performance?${qs}`);
      return res.data;
    },
    staleTime: 90_000,
  });
}

/** Daily sales analytics */
export function useDailySalesQuery() {
  return useQuery({
    queryKey: ['analytics', 'sales', 'daily'],
    queryFn: async () => {
      const res = await axiosClient.get('/analytics/sales/daily');
      return res.data;
    },
    staleTime: 60_000,
  });
}

/** Monthly sales analytics */
export function useMonthlySalesQuery() {
  return useQuery({
    queryKey: ['analytics', 'sales', 'monthly'],
    queryFn: async () => {
      const res = await axiosClient.get('/analytics/sales/monthly');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Total sales analytics */
export function useTotalSalesQuery() {
  return useQuery({
    queryKey: ['analytics', 'sales', 'total'],
    queryFn: async () => {
      const res = await axiosClient.get('/analytics/sales/total');
      return res.data;
    },
    staleTime: 60_000,
  });
}

/** Profit & loss analytics */
export function useProfitLossQuery() {
  return useQuery({
    queryKey: ['analytics', 'profit-loss'],
    queryFn: async () => {
      const res = await axiosClient.get('/analytics/profit-loss');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Settlements list */
export function useSettlementsQuery(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';

  return useQuery({
    queryKey: ['settlements', params?.page ?? 1, params?.limit ?? 20],
    queryFn: async () => {
      const res = await axiosClient.get(`/settlements${suffix}`);
      return res.data;
    },
    staleTime: 2 * 60_000,
  });
}

export function useRecentOrdersQuery(limit = 8) {
  return useQuery({
    queryKey: ['orders', 'recent', limit],
    queryFn: async () => {
      const res = await axiosClient.get('/orders', { params: { limit, sort: 'createdAt:desc' } });
      const list = res.data?.data || res.data || [];
      return (Array.isArray(list) ? list : []) as unknown[];
    },
    staleTime: 30_000,
  });
}
