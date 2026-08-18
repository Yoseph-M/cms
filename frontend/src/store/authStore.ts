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

// Guard against concurrent bootstrap calls (e.g. React StrictMode or multiple tabs)
let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  // Listen for cross-tab auth events
  if (authChannel) {
    authChannel.onmessage = (event) => {
      if (event.data.type === 'SESSION_LOGGED_OUT') {
        clearLocalAuth(set);
      } else if (event.data.type === 'SESSION_REFRESHED') {
        const { user, accessToken } = event.data;
        if (user && accessToken) {
          localStorage.setItem('pos_user', JSON.stringify(user));
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } else if (accessToken) {
          set({ accessToken, isAuthenticated: true });
        }
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
      if (bootstrapPromise) return bootstrapPromise;
      if (get().accessToken && get().isAuthenticated) return;

      bootstrapPromise = (async () => {
        try {
          set({ isLoading: true });

          const performRequest = async () => {
            // Check again inside the lock if another tab already finished
            if (get().accessToken && get().isAuthenticated) {
              return null;
            }

            const response = await axiosClient.post('/auth/refresh', {}, { 
              withCredentials: true 
            });
            return response.data;
          };

          let data;
          if (typeof navigator !== 'undefined' && navigator.locks) {
            data = await navigator.locks.request('auth_bootstrap_lock', performRequest);
          } else {
            data = await performRequest();
          }
          
          if (!data) {
            set({ isLoading: false });
            return;
          }

          const { accessToken, user: serverUser } = data;
          
          if (accessToken && serverUser) {
            localStorage.setItem('pos_user', JSON.stringify(serverUser));
            set({ 
              user: serverUser, 
              accessToken, 
              isAuthenticated: true, 
              isLoading: false 
            });
            
            // Notify other tabs that we refreshed successfully
            if (authChannel) {
              authChannel.postMessage({ type: 'SESSION_REFRESHED', accessToken, user: serverUser });
            }
          } else {
            set({ isLoading: false, isAuthenticated: false });
          }
        } catch (error) {
          localStorage.removeItem('pos_user');
          set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
          // Don't rethrow, just handle the state
        } finally {
          bootstrapPromise = null;
        }
      })();

      return bootstrapPromise;
    },
  };
});
