import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor attaching Bearer token
axiosClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * 401 handling for protected API requests:
 *
 *  1. Never intercept /auth/* endpoints (login, logout, refresh) — a 401 there
 *     is the endpoint's own answer, not a stale access token.
 *  2. Attempt ONE refresh (deduplicated in the store via `activeRefreshPromise`
 *     + `navigator.locks`, so concurrent 401s share a single /auth/refresh),
 *     then retry the original request with the new Bearer token.
 *  3. If refresh fails definitively, clear the local session (no server-side
 *     family revocation) and land on /login.
 *
 * Cross-tab sync (SESSION_REFRESHED / SESSION_LOGGED_OUT) is handled entirely
 * by authStore via the shared authChannel module — this file never applies
 * auth state, so there is exactly one source of truth.
 */
axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    // Malformed axios errors (e.g. network failure with no config) — nothing to retry.
    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Do not intercept 401s from auth endpoints themselves.
    const url = typeof originalRequest.url === 'string' ? originalRequest.url : '';
    const isAuthEndpoint = url.includes('/auth/');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const accessToken = await useAuthStore.getState().refreshSession();
        if (!accessToken) {
          throw error;
        }
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axiosClient(originalRequest);
      } catch (refreshErr) {
        // Local-only clear — do NOT call logout() here: logout() revokes the
        // server-side token family, which would sign the same user out on every
        // other tab/device. A failed refresh (expired cookie, network blip)
        // should only end the session in this tab.
        useAuthStore.getState().clearSession();
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.assign('/login');
        }
        return Promise.reject(refreshErr instanceof Error ? refreshErr : error);
      }
    }
    return Promise.reject(error);
  }
);
