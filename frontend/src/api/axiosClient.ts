import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const axiosClient = axios.create({
  baseURL: '/api',
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

// Response Interceptor handling token refresh or 401 unauth
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      if (refreshToken) {
        try {
          const res = await axios.post('/api/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data;
          useAuthStore.getState().setTokens(accessToken, newRefresh);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return axiosClient(originalRequest);
        } catch (refreshErr) {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
