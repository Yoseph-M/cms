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

// Setup BroadcastChannel for cross-tab synchronization
const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth_channel') : null;

export const useAuthStore = create<AuthState>((set, get) => {
  // Listen for cross-tab auth events
  if (authChannel) {
    authChannel.onmessage = (event) => {
      if (event.data.type === 'SESSION_LOGGED_OUT') {
        clearLocalAuth(set);
      }
    };
  }

  return {
    user: CACHED_USER ? JSON.parse(CACHED_USER) : null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,

    setAuth: (user, accessToken) => {
      localStorage.setItem('pos_user', JSON.stringify(user));
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
      // Broadcast logout to other tabs BEFORE clearing local
      if (authChannel) {
        authChannel.postMessage({ type: 'SESSION_LOGGED_OUT' });
      }

      void axiosClient.post('/auth/logout', {}, { withCredentials: true }).catch(() => {
        /* still clear local session */
      });
      clearLocalAuth(set);
    },

    bootstrapSession: async () => {
      try {
        set({ isLoading: true });
        
        const response = await axiosClient.post('/auth/refresh', {}, { 
          withCredentials: true 
        });
        
        const { accessToken, user: serverUser } = response.data;
        
        if (accessToken && serverUser) {
          localStorage.setItem('pos_user', JSON.stringify(serverUser));
          set({ 
            user: serverUser, 
            accessToken, 
            isAuthenticated: true, 
            isLoading: false 
          });
        } else {
          set({ isLoading: false, isAuthenticated: false });
        }
      } catch {
        localStorage.removeItem('pos_user');
        set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      }
    },
  };
});
