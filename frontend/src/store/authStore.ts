import { create } from 'zustand';
import { User } from '../types';
import { axiosClient } from '../api/axiosClient';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  logout: () => void;
}

const SAVED_USER = localStorage.getItem('pos_user');
const SAVED_ACCESS = localStorage.getItem('pos_access_token');

function clearLocalAuth(set: (partial: Partial<AuthState>) => void) {
  localStorage.removeItem('pos_user');
  localStorage.removeItem('pos_access_token');
  set({ user: null, accessToken: null, isAuthenticated: false });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: SAVED_USER ? JSON.parse(SAVED_USER) : null,
  accessToken: SAVED_ACCESS || null,
  isAuthenticated: !!SAVED_ACCESS,

  setAuth: (user, accessToken) => {
    localStorage.setItem('pos_user', JSON.stringify(user));
    localStorage.setItem('pos_access_token', accessToken);
    set({ user, accessToken, isAuthenticated: true });
  },

  setAccessToken: (accessToken) => {
    localStorage.setItem('pos_access_token', accessToken);
    set({ accessToken, isAuthenticated: true });
  },

  logout: () => {
    // Fire-and-forget server revoke so the refresh token cannot be reused
    void axiosClient.post('/auth/logout', {}, { withCredentials: true }).catch(() => {
      /* still clear local session */
    });
    clearLocalAuth(set);
  },
}));
