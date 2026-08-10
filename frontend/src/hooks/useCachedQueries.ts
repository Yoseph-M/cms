import { useQuery } from '@tanstack/react-query';
import { axiosClient } from '../api/axiosClient';

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

/** Analytics widgets — 90s stale */
export function useAnalyticsQuery<T = unknown>(endpoint: string, deps: Record<string, string> = {}) {
  const qs = new URLSearchParams(deps).toString();
  return useQuery<T>({
    queryKey: ['analytics', endpoint, deps],
    queryFn: async () => {
      const res = await axiosClient.get(`${endpoint}${qs ? `?${qs}` : ''}`);
      return res.data as T;
    },
    staleTime: 90_000,
  });
}

/** System setting by key — 30s stale, refetch on window focus for toggles */
export function useSystemSettingQuery(key: string, enabled = true) {
  return useQuery({
    queryKey: ['systemSetting', key],
    queryFn: async () => {
      const res = await axiosClient.get(`/settings/system/${key}`);
      return res.data as { key: string; value: string; updatedAt: string };
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
