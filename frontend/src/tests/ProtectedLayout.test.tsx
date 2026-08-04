import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from '../App';
import { useAuthStore } from '../store/authStore';

// Mock zustand stores
vi.mock('../store/socketStore', () => ({
  useSocketStore: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));

vi.mock('../store/offlineSyncStore', () => ({
  useOfflineSyncStore: () => ({ initListeners: vi.fn() }),
}));

// We'll partially mock authStore so we can override state in tests
vi.mock('../store/authStore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useAuthStore: Object.assign(vi.fn(), actual.useAuthStore),
  };
});

// Minimal mock components so we just test routing
vi.mock('../pages/login/LoginPage', () => ({ LoginPage: () => <div>Login Page Mock</div> }));
vi.mock('../pages/owner/OwnerDashboard', () => ({ OwnerDashboard: () => <div>Owner Dashboard Mock</div> }));
vi.mock('../pages/manager/ManagerDashboard', () => ({ ManagerDashboard: () => <div>Manager Dashboard Mock</div> }));
vi.mock('../pages/cashier/CashierDashboard', () => ({ CashierDashboard: () => <div>Cashier Dashboard Mock</div> }));
vi.mock('../pages/waiter/WaiterDashboard', () => ({ WaiterDashboard: () => <div>Waiter Dashboard Mock</div> }));

describe('ProtectedLayout / App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when not authenticated', () => {
    (useAuthStore as any).mockReturnValue({ isAuthenticated: false, user: null });
    
    render(
      <MemoryRouter initialEntries={['/owner']}>
        <App />
      </MemoryRouter>
    );
    
    // It should end up at login page
    expect(screen.getByText('Login Page Mock')).toBeInTheDocument();
  });

  it('allows OWNER to access /owner', () => {
    (useAuthStore as any).mockReturnValue({ 
      isAuthenticated: true, 
      user: { role: 'OWNER', id: '1', name: 'Owner' } 
    });

    render(
      <MemoryRouter initialEntries={['/owner']}>
        <App />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Owner Dashboard Mock')).toBeInTheDocument();
  });

  it('redirects WAITER away from /owner to /waiter', () => {
    (useAuthStore as any).mockReturnValue({ 
      isAuthenticated: true, 
      user: { role: 'WAITER', id: '2', name: 'Waiter' } 
    });

    render(
      <MemoryRouter initialEntries={['/owner']}>
        <App />
      </MemoryRouter>
    );
    
    // WAITER attempting to access OWNER route gets redirected to their fallback (/waiter)
    expect(screen.getByText('Waiter Dashboard Mock')).toBeInTheDocument();
  });
});
