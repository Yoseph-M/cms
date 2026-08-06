import { create } from 'zustand';
import { User } from '../types';
import { axiosClient } from '../api/axiosClient';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const SAVED_USER = localStorage.getItem('pos_user');
const SAVED_ACCESS = localStorage.getItem('pos_access_token');
const SAVED_REFRESH = localStorage.getItem('pos_refresh_token');

function clearLocalAuth(set: (partial: Partial<AuthState>) => void) {
  localStorage.removeItem('pos_user');
  localStorage.removeItem('pos_access_token');
  localStorage.removeItem('pos_refresh_token');
  set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: SAVED_USER ? JSON.parse(SAVED_USER) : null,
  accessToken: SAVED_ACCESS || null,
  refreshToken: SAVED_REFRESH || null,
  isAuthenticated: !!SAVED_ACCESS,

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('pos_user', JSON.stringify(user));
    localStorage.setItem('pos_access_token', accessToken);
    localStorage.setItem('pos_refresh_token', refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('pos_access_token', accessToken);
    localStorage.setItem('pos_refresh_token', refreshToken);
    set({ accessToken, refreshToken, isAuthenticated: true });
  },

  logout: () => {
    const refreshToken = get().refreshToken;
    // Fire-and-forget server revoke so the refresh token cannot be reused
    if (refreshToken) {
      void axiosClient.post('/auth/logout', { refreshToken }).catch(() => {
        /* still clear local session */
      });
    }
    clearLocalAuth(set);
  },
}));
