import { create } from 'zustand';
import { User } from '../types';

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

export const useAuthStore = create<AuthState>((set) => ({
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
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_access_token');
    localStorage.removeItem('pos_refresh_token');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },
}));
