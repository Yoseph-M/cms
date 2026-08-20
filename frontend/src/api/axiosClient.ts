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

let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth_channel') : null;

if (authChannel) {
  authChannel.onmessage = (event) => {
    if (event.data.type === 'SESSION_REFRESHED') {
      const { accessToken, user } = event.data;
      if (user) {
        useAuthStore.getState().setAuth(user, accessToken);
      } else {
        useAuthStore.getState().setAccessToken(accessToken);
      }
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

// Listen for local refresh events to clear the queue
if (typeof window !== 'undefined') {
  window.addEventListener('auth:refreshed' as any, (e: any) => {
    processQueue(null, e.detail.accessToken);
  });
  window.addEventListener('auth:login_failed' as any, (e: any) => {
    processQueue(e.detail.error, null);
  });
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Do not intercept 401s for the refresh endpoint itself
    const isRefreshRequest = originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;

      const { isRefreshing, refreshSession } = useAuthStore.getState();

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

      try {
        const accessToken = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        
        processQueue(null, accessToken);
        
        return axiosClient(originalRequest);
      } catch (refreshErr) {
        console.warn('Token refresh failed, logging out user', refreshErr);
        processQueue(refreshErr, null);
        // refreshSession already calls logout/clearLocalAuth on failure
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
