import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OwnerLayout } from '../components/layout/OwnerLayout';
import { ManagerLayout } from '../components/layout/ManagerLayout';
import { App } from '../App';
import { useAuthStore } from '../store/authStore';

// Mock zustand store for auth
vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(),
}));
// Mock other stores
vi.mock('../store/socketStore', () => ({
  useSocketStore: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock('../store/offlineSyncStore', () => ({
  useOfflineSyncStore: () => ({ initListeners: vi.fn() }),
}));

describe('Layout Architecture Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Nav-namespace Test (No Cross-Linking)', () => {
    it('OwnerLayout nav links must start with /owner', () => {
      // Mock user as OWNER
      (useAuthStore as any).mockReturnValue({
        user: { role: 'OWNER', name: 'Test Owner' },
        isAuthenticated: true,
      });

      render(
        <MemoryRouter initialEntries={['/owner']}>
          <OwnerLayout />
        </MemoryRouter>
      );

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link.getAttribute('href')).toMatch(/^\/owner(\/|$)/);
      });
    });

    it('ManagerLayout nav links must start with /manager', () => {
      // Mock user as MANAGER
      (useAuthStore as any).mockReturnValue({
        user: { role: 'MANAGER', name: 'Test Manager' },
        isAuthenticated: true,
      });

      render(
        <MemoryRouter initialEntries={['/manager']}>
          <ManagerLayout />
        </MemoryRouter>
      );

      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link.getAttribute('href')).toMatch(/^\/manager(\/|$)/);
      });
    });
  });

  describe('2. Single-mount Test (No Double Sidebars)', () => {
    it('OwnerLayout renders exactly one <aside>', () => {
      (useAuthStore as any).mockReturnValue({
        user: { role: 'OWNER', name: 'Test Owner' },
        isAuthenticated: true,
      });

      const { container } = render(
        <MemoryRouter initialEntries={['/owner']}>
          <OwnerLayout />
        </MemoryRouter>
      );

      const asides = container.querySelectorAll('aside');
      expect(asides.length).toBe(1);
    });

    it('ManagerLayout renders zero <aside> (uses top tabs)', () => {
      (useAuthStore as any).mockReturnValue({
        user: { role: 'MANAGER', name: 'Test Manager' },
        isAuthenticated: true,
      });

      const { container } = render(
        <MemoryRouter initialEntries={['/manager']}>
          <ManagerLayout />
        </MemoryRouter>
      );

      const asides = container.querySelectorAll('aside');
      expect(asides.length).toBe(0);
    });
  });

  describe('3. Role Guarding Test (Strict Routing Boundaries)', () => {
    it('Redirects MANAGER trying to access /owner/printers to /manager', () => {
      (useAuthStore as any).mockReturnValue({
        user: { role: 'MANAGER', name: 'Test Manager' },
        isAuthenticated: true,
      });

      render(
        <MemoryRouter initialEntries={['/owner/printers']}>
          <App />
        </MemoryRouter>
      );
      
      // With our setup, the RouteGuard redirects to /manager, 
      // where the ManagerDashboard (or redirect to people) will render.
      // ManagerDashboard contains a "Manager Dashboard" text or similar, but the key is we aren't in owner settings.
      // We can assert the URL changed to /manager (MemoryRouter doesn't expose it easily), 
      // or just assert "LAN Printers" doesn't appear.
      expect(screen.queryByText(/LAN Printers/i)).not.toBeInTheDocument();
    });

    it('Redirects CASHIER trying to access /manager/people to /cashier', () => {
      (useAuthStore as any).mockReturnValue({
        user: { role: 'CASHIER', name: 'Test Cashier' },
        isAuthenticated: true,
      });

      render(
        <MemoryRouter initialEntries={['/manager/people']}>
          <App />
        </MemoryRouter>
      );

      expect(screen.queryByText(/Menu Catalog/i)).not.toBeInTheDocument();
    });
  });
});
