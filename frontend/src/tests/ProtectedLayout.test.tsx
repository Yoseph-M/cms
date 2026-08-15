import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppRoutes } from '../App';
import { useAuthStore } from '../store/authStore';

vi.mock('../store/socketStore', () => ({
  useSocketStore: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: false,
  }),
}));

vi.mock('../store/offlineSyncStore', () => ({
  useOfflineSyncStore: () => ({
    initListeners: vi.fn(),
    isOnline: true,
    pendingCount: 0,
  }),
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../pages/login/LoginPage', () => ({ LoginPage: () => <div>Login Page Mock</div> }));
vi.mock('../pages/owner/OwnerDashboard', () => ({ OwnerDashboard: () => <div>Owner Dashboard Mock</div> }));
vi.mock('../pages/manager/ManagerDashboard', () => ({ ManagerDashboard: () => <div>Manager Dashboard Mock</div> }));
vi.mock('../pages/cashier/CashierDashboard', () => ({ CashierDashboard: () => <div>Cashier Dashboard Mock</div> }));

describe('ProtectedLayout / App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when not authenticated', async () => {
    (useAuthStore as any).mockReturnValue({ 
      isAuthenticated: false, 
      user: null,
      isLoading: false,
      bootstrapSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/owner']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Login Page Mock')).toBeInTheDocument();
  });

  it('allows OWNER to access /owner', async () => {
    (useAuthStore as any).mockReturnValue({
      isAuthenticated: true,
      user: { role: 'OWNER', id: '1', name: 'Owner' },
      isLoading: false,
      bootstrapSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/owner']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Owner Dashboard Mock')).toBeInTheDocument();
  });

  it('redirects unknown roles (e.g. WAITER) away from /owner to /login', async () => {
    (useAuthStore as any).mockReturnValue({
      isAuthenticated: true,
      user: { role: 'WAITER', id: '2', name: 'Waiter' },
      isLoading: false,
      bootstrapSession: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/owner']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(await screen.findByText('Login Page Mock')).toBeInTheDocument();
  });
});
