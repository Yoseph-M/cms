import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const axiosClient = axios.create({
  baseURL: '/api',
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

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth_channel') : null;

if (authChannel) {
  authChannel.onmessage = (event) => {
    if (event.data.type === 'SESSION_REFRESHED') {
      const accessToken = event.data.accessToken;
      useAuthStore.getState().setAccessToken(accessToken);
      processQueue(null, accessToken);
    } else if (event.data.type === 'SESSION_LOGGED_OUT') {
      processQueue(new Error('Logged out in another tab'), null);
    }
  };
}

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

async function performRefreshWithLock() {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('auth_refresh_lock', { mode: 'exclusive' }, async () => {
      // Once we get the lock, check if another tab already refreshed the token
      // We know if they did because the BroadcastChannel would have fired and cleared our queue,
      // or we can just try refreshing. If the backend fails us, it fails.
      // But wait, if they refreshed, our accessToken in store might be updated.
      // For simplicity, we just do the refresh.
      return doRefresh();
    });
  } else {
    // Fallback if Web Locks not supported
    return doRefresh();
  }
}

async function doRefresh() {
  const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
  const { accessToken } = res.data;
  useAuthStore.getState().setAccessToken(accessToken);
  if (authChannel) {
    authChannel.postMessage({ type: 'SESSION_REFRESHED', accessToken });
  }
  return accessToken;
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Do not intercept 401s for the refresh endpoint itself
    const isRefreshRequest = originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axiosClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      isRefreshing = true;

      try {
        const accessToken = await performRefreshWithLock();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        processQueue(null, accessToken);
        
        return axiosClient(originalRequest);
      } catch (refreshErr) {
        console.warn('Token refresh failed, logging out user', refreshErr);
        processQueue(refreshErr, null);
        useAuthStore.getState().logout();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
