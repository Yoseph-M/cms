import { create } from 'zustand';
import { User } from '../types';
import { axiosClient } from '../api/axiosClient';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  bootstrapSession: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
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

// Guard against concurrent refresh/bootstrap calls (in-tab)
let activeRefreshPromise: Promise<string | null> | null = null;

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
          set({ user, accessToken, isAuthenticated: true, isLoading: false, isRefreshing: false });
        } else if (accessToken) {
          set({ accessToken, isAuthenticated: true, isRefreshing: false });
        }
      }
    };
  }

  return {
    user: CACHED_USER ? JSON.parse(CACHED_USER) : null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
    isRefreshing: false,

    setAuth: (user, accessToken) => {
      localStorage.setItem('pos_user', JSON.stringify(user));
      set({ user, accessToken, isAuthenticated: true, isLoading: false, isRefreshing: false });
    },

    setAccessToken: (accessToken) => {
      set({ accessToken, isAuthenticated: true, isRefreshing: false });
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
      // If already authenticated, nothing to do
      if (get().accessToken && get().isAuthenticated) {
        set({ isLoading: false });
        return;
      }

      try {
        set({ isLoading: true });
        await get().refreshSession();
      } catch (error) {
        // refreshSession already handles clearing state
      } finally {
        set({ isLoading: false });
      }
    },

    refreshSession: async () => {
      // 1. If there's an active refresh in this tab, return it
      if (activeRefreshPromise) {
        return activeRefreshPromise;
      }

      // 2. Define the refresh operation
      const performRefresh = async () => {
        try {
          // 3. Double-check auth inside the lock to handle cross-tab or concurrent calls
          if (get().accessToken && get().isAuthenticated) {
            return get().accessToken;
          }

          set({ isRefreshing: true });
          
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
              isRefreshing: false,
              isLoading: false
            });
            
            if (authChannel) {
              authChannel.postMessage({ type: 'SESSION_REFRESHED', accessToken, user: serverUser });
            }

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: { accessToken } }));
            }

            return accessToken;
          }
          
          throw new Error('Invalid refresh response');
        } catch (error) {
          clearLocalAuth(set);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:login_failed', { detail: { error } }));
          }
          throw error;
        } finally {
          set({ isRefreshing: false });
          activeRefreshPromise = null;
        }
      };

      // 4. Wrap with Web Lock for cross-tab safety
      activeRefreshPromise = (async () => {
        if (typeof navigator !== 'undefined' && navigator.locks) {
          // navigator.locks.request returns a promise that resolves to the return value of the callback
          // If the callback is async, it returns a promise, so we get a nested promise.
          // Awaiting it here flattens it.
          return await navigator.locks.request('auth_sync_lock', performRefresh);
        } else {
          return await performRefresh();
        }
      })();

      return activeRefreshPromise;
    },
  };
});
