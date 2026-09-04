import { create } from 'zustand';
import { User } from '../types';
import { axiosClient } from '../api/axiosClient';
import { postAuthChannelMessage, subscribeToAuthChannel, type AuthChannelMessage } from './authChannel';

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
  /** Local-only sign-out: clears this tab's session without revoking the server-side token family. */
  clearSession: () => void;
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

/** True when the refresh endpoint definitively rejected us (missing/revoked/expired cookie). */
function isDefinitiveAuthError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

// Debug logging — visible in dev console only, never logs tokens.
function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.debug('[auth]', ...args);
  }
}

// Guard against concurrent refresh/bootstrap calls (in-tab)
let activeRefreshPromise: Promise<string | null> | null = null;

// The store is the SINGLE source of truth that APPLIES cross-tab auth events.
// (axiosClient only subscribes to know when to stop waiting — it never applies state.)
let channelSubscribed = false;

export const useAuthStore = create<AuthState>((set, get) => {
  if (!channelSubscribed) {
    channelSubscribed = true;
    subscribeToAuthChannel((message: AuthChannelMessage) => {
      if (message.type === 'SESSION_LOGGED_OUT') {
        debugLog('received SESSION_LOGGED_OUT from another tab');
        clearLocalAuth(set);
        set({ isLoading: false, isRefreshing: false });
      } else if (message.type === 'SESSION_REFRESHED') {
        const { user, accessToken } = message;
        debugLog('received SESSION_REFRESHED from another tab');
        if (user && accessToken) {
          localStorage.setItem('pos_user', JSON.stringify(user));
          set({ user, accessToken, isAuthenticated: true, isLoading: false, isRefreshing: false });
        } else if (accessToken) {
          set({ accessToken, isAuthenticated: true, isRefreshing: false });
        }
      }
    });
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
      postAuthChannelMessage({ type: 'SESSION_REFRESHED', accessToken, user });
    },

    setAccessToken: (accessToken) => {
      set({ accessToken, isAuthenticated: true, isRefreshing: false });
      postAuthChannelMessage({ type: 'SESSION_REFRESHED', accessToken, user: get().user });
    },

    setUser: (user) => {
      localStorage.setItem('pos_user', JSON.stringify(user));
      set({ user });
    },

    logout: async () => {
      debugLog('logout requested');
      // Broadcast logout to other tabs BEFORE clearing local
      postAuthChannelMessage({ type: 'SESSION_LOGGED_OUT' });

      try {
        await axiosClient.post('/auth/logout', {}, { withCredentials: true });
      } catch (err) {
        // even if it fails, we still want to clear local auth below
        console.warn('Logout API call failed', err);
      }
      clearLocalAuth(set);
      set({ isLoading: false, isRefreshing: false });
    },

    clearSession: () => {
      debugLog('clearing local session only (no server-side revocation)');
      // Used when token refresh fails (e.g. expired refresh cookie or a transient
      // network blip). We only clear THIS tab's session — we do NOT call the
      // logout API (which revokes the user's entire token family on the server)
      // and do NOT broadcast to other tabs, so one device's failed refresh never
      // signs out the same user everywhere else.
      clearLocalAuth(set);
      set({ isLoading: false, isRefreshing: false });
    },

    bootstrapSession: async () => {
      debugLog('bootstrap started');
      // If already authenticated, nothing to do
      if (get().accessToken && get().isAuthenticated) {
        set({ isLoading: false });
        return;
      }

      try {
        set({ isLoading: true });
        await get().refreshSession();
      } catch (error) {
        // refreshSession already handled clearing/keeping state
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
      const performRefresh = async (): Promise<string | null> => {
        try {
          // 3. Double-check auth inside the lock to handle cross-tab or concurrent calls
          if (get().accessToken && get().isAuthenticated) {
            return get().accessToken;
          }

          set({ isRefreshing: true });

          // Transient failures (network blip, backend restarting during a page
          // reload) should NOT log the user out — retry a few times before giving
          // up. Definitive rejections (401 bad/revoked/expired cookie) fail fast
          // and DO clear the session.
          const maxAttempts = 3;
          let lastError: unknown;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            debugLog(`refresh request started (attempt ${attempt}/${maxAttempts})`);
            try {
              const response = await axiosClient.post('/auth/refresh', {}, {
                withCredentials: true,
              });
              debugLog('refresh response received', { status: response.status });

              const { accessToken, user: serverUser } = response.data;

              if (accessToken && serverUser) {
                debugLog('refresh succeeded');
                localStorage.setItem('pos_user', JSON.stringify(serverUser));
                set({
                  user: serverUser,
                  accessToken,
                  isAuthenticated: true,
                  isRefreshing: false,
                  isLoading: false,
                });
                postAuthChannelMessage({ type: 'SESSION_REFRESHED', accessToken, user: serverUser });
                return accessToken;
              }

              throw new Error('Invalid refresh response');
            } catch (err: any) {
              lastError = err;
              const status = err?.response?.status;
              // Definitive rejection — cookie missing/revoked/expired. No retry.
              if (status && status >= 400 && status < 500) {
                debugLog('refresh failed (definitive)', { status });
                throw err;
              }
              // No response (network error) or server-side failure (5xx, gateway
              // timeout) — backend may be restarting. Back off and try again.
              debugLog('refresh failed (transient, retrying)', {
                status,
                attempt,
                maxAttempts,
                hasResponse: !!err?.response,
              });
              if (attempt < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 750));
              }
            }
          }

          throw lastError;
        } catch (error) {
          if (isDefinitiveAuthError(error)) {
            // Server definitively rejected the refresh token — end the session.
            debugLog('authentication cleared (definitive refresh rejection)');
            clearLocalAuth(set);
          } else {
            // Network/server still unreachable after retries: keep the cached user
            // identity so the next page load (when the backend is back) restores the
            // session instead of forcing a full re-login.
            debugLog('refresh failed after retries (transient) — keeping cached identity');
            set({ accessToken: null, isAuthenticated: false, isLoading: false });
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
          // navigator.locks.request returns a promise that resolves to the return value of the callback.
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
