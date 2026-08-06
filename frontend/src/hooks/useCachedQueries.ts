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
