import { create } from 'zustand';
import { User } from '../types';
import { axiosClient } from '../api/axiosClient';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  bootstrapSession: () => Promise<void>;
}

// Only persist user for UI display (NOT for auth decisions)
// Access token is NEVER persisted - memory only
const CACHED_USER = localStorage.getItem('pos_user');

function clearLocalAuth(set: (partial: Partial<AuthState>) => void) {
  localStorage.removeItem('pos_user');
  set({ user: null, accessToken: null, isAuthenticated: false });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: CACHED_USER ? JSON.parse(CACHED_USER) : null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, accessToken) => {
    // Cache user for display only (never for auth decisions)
    localStorage.setItem('pos_user', JSON.stringify(user));
    // Access token is memory-only - never persist to localStorage
    set({ user, accessToken, isAuthenticated: true, isLoading: false });
  },

  setAccessToken: (accessToken) => {
    set({ accessToken, isAuthenticated: true });
  },

  setUser: (user) => {
    localStorage.setItem('pos_user', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    // Fire-and-forget server revoke so the refresh token cannot be reused
    void axiosClient.post('/auth/logout', {}, { withCredentials: true }).catch(() => {
      /* still clear local session */
    });
    clearLocalAuth(set);
  },

  /**
   * Bootstrap session on app mount:
   * 1. Try to refresh access token using HttpOnly cookie
   * 2. Get authoritative user data from /users/me
   * 3. Populate memory state
   */
  bootstrapSession: async () => {
    try {
      set({ isLoading: true });
      
      // Attempt to refresh access token using HttpOnly cookie
      const response = await axiosClient.post('/auth/refresh', {}, { 
        withCredentials: true 
      });
      
      const { accessToken, user: serverUser } = response.data;
      
      if (accessToken && serverUser) {
        // Update cached user from server (authoritative)
        localStorage.setItem('pos_user', JSON.stringify(serverUser));
        set({ 
          user: serverUser, 
          accessToken, 
          isAuthenticated: true, 
          isLoading: false 
        });
      } else {
        // No valid session
        set({ isLoading: false, isAuthenticated: false });
      }
    } catch {
      // No valid session - clear any stale state
      localStorage.removeItem('pos_user');
      set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
