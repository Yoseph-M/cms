import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { axiosClient } from '../api/axiosClient';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { post: vi.fn() },
}));

const mockedPost = axiosClient.post as unknown as ReturnType<typeof vi.fn>;

// Minimal user shape — the store only persists/reads it for UI display.
const OWNER = {
  id: 'u1',
  name: 'Owner',
  role: 'OWNER' as const,
  username: 'owner',
  phone: '+15550001',
  salaryAmount: 45000,
  isActive: true,
};

beforeEach(() => {
  localStorage.clear();
  mockedPost.mockReset();
  // Reset singleton store state between tests
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    isRefreshing: false,
  });
});

describe('session bootstrap & refresh (authStore)', () => {
  it('restores the session on bootstrap when /auth/refresh returns 200', async () => {
    mockedPost.mockResolvedValueOnce({ data: { accessToken: 'fresh-at', user: OWNER } });
    useAuthStore.setState({ isLoading: true });

    await useAuthStore.getState().bootstrapSession();

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('fresh-at');
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.name).toBe('Owner');
    expect(s.isLoading).toBe(false);
    // The user is only cached for display, never the access token
    expect(localStorage.getItem('pos_user')).toContain('Owner');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(mockedPost).toHaveBeenCalledWith('/auth/refresh', {}, { withCredentials: true });
  });

  it('clears the session when refresh definitively returns 401 (revoked/expired cookie)', async () => {
    localStorage.setItem('pos_user', JSON.stringify(OWNER));
    useAuthStore.setState({ user: OWNER, isLoading: true });
    mockedPost.mockRejectedValue({ response: { status: 401 } });

    await useAuthStore.getState().bootstrapSession();

    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.user).toBeNull();
    expect(localStorage.getItem('pos_user')).toBeNull();
  });

  it('keeps the cached identity when refresh fails transiently (network error)', async () => {
    localStorage.setItem('pos_user', JSON.stringify(OWNER));
    useAuthStore.setState({ user: OWNER, isLoading: true });
    mockedPost.mockRejectedValue({ message: 'Network Error' }); // every retry

    await useAuthStore.getState().bootstrapSession();

    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(false);
    // Cached UI identity survives a transient outage (not force-logged out)
    expect(s.user).not.toBeNull();
    expect(localStorage.getItem('pos_user')).not.toBeNull();
  }, 15000);

  it('dedupes concurrent refresh calls into a single /auth/refresh request', async () => {
    mockedPost.mockResolvedValue({ data: { accessToken: 'at', user: OWNER } });

    const [r1, r2] = await Promise.all([
      useAuthStore.getState().refreshSession(),
      useAuthStore.getState().refreshSession(),
    ]);

    expect(r1).toBe('at');
    expect(r2).toBe('at');
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('logout calls the server (family revocation) and clears the local session', async () => {
    localStorage.setItem('pos_user', JSON.stringify(OWNER));
    useAuthStore.setState({ user: OWNER, accessToken: 'at', isAuthenticated: true });
    mockedPost.mockResolvedValue({ data: { message: 'ok' } });

    await useAuthStore.getState().logout();

    expect(mockedPost).toHaveBeenCalledWith('/auth/logout', {}, { withCredentials: true });
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });

  it('clearSession is local-only: does not call /auth/logout and keeps other-tab sessions intact', async () => {
    useAuthStore.setState({ user: OWNER, accessToken: 'at', isAuthenticated: true });
    useAuthStore.getState().clearSession();

    expect(mockedPost).not.toHaveBeenCalled();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.accessToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(false);
  });
});
