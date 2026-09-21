import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import enStaff from '../locales/en/staff.json';

/**
 * Roster count on the staff page.
 *
 * The number is the size of *everyone in the account*, not of the filtered
 * table: the owner's roster arrives with their own account already in it, while
 * a manager's roster never contains the owner (or other managers) and so has to
 * count the manager back in. Getting this wrong is invisible until someone
 * compares the header against the list.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn(), title: 'Overview', subtitle: '' }),
}));
vi.mock('../store/socketStore', () => ({ useSocketStore: vi.fn() }));
vi.mock('react-i18next', () => {
  const resolve = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
  return {
    useTranslation: (ns?: string) => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        const value = String(ns) === 'staff' ? resolve(enStaff, key) : undefined;
        if (typeof value === 'string') {
          return value.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? ''));
        }
        return opts?.defaultValue || key;
      },
      i18n: { language: 'en' },
    }),
  };
});

import { OwnerStaff } from '../pages/owner/OwnerStaff';
import { ManagerStaff } from '../pages/manager/ManagerStaff';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';

const USERS = [
  {
    id: 'u1', name: 'Abebe Kebede', role: 'WAITER', username: 'abebe', phone: '+251911111111',
    salaryAmount: 8000, isActive: true, hasPin: true, hasPassword: false,
  },
  {
    id: 'u2', name: 'Sara Tesfaye', role: 'CASHIER', username: 'sara', phone: '+251922222222',
    salaryAmount: 6000, isActive: true, hasPin: false, hasPassword: true,
  },
];

const renderPage = (page: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (useToastStore as any).mockReturnValue({ addToast: vi.fn() });
  (useSocketStore as any).mockReturnValue({ socket: null });
  (axiosClient.get as any).mockResolvedValue({ data: USERS });
});

describe('staff roster count', () => {
  it("counts every account for the owner — the owner's own included", async () => {
    // The owner's unfiltered roster already contains the owner's account plus
    // every member of staff, so the count is the roster size.
    const owner = { id: 'owner-1', role: 'OWNER' };
    (useAuthStore as any).mockReturnValue({ user: owner });
    (axiosClient.get as any).mockResolvedValue({
      data: [{ ...owner, name: 'Alice Owner', username: 'owner', phone: '+251900000000', salaryAmount: 0, isActive: true }, ...USERS],
    });

    renderPage(<OwnerStaff />);
    expect(await screen.findByTestId('staff-count')).toHaveAttribute('aria-label', '3 staff, including you');
  });

  it('counts the staff below them plus the manager themself', async () => {
    // The server never returns the owner (or peer managers) to a manager, so
    // the manager's own account has to be added back to the count.
    (useAuthStore as any).mockReturnValue({ user: { id: 'mgr-1', role: 'MANAGER' } });

    renderPage(<ManagerStaff />);
    expect(await screen.findByTestId('staff-count')).toHaveAttribute('aria-label', '3 staff, including you');
  });

  it('keeps the roster total when the table is filtered down', async () => {
    (useAuthStore as any).mockReturnValue({ user: { id: 'mgr-1', role: 'MANAGER' } });

    renderPage(<ManagerStaff />);
    await screen.findByTestId('staff-count');

    fireEvent.change(screen.getByPlaceholderText('Search staff...'), {
      target: { value: 'Abebe' },
    });

    // Only Abebe remains listed, but the header still describes the roster.
    expect(screen.getByText('Abebe Kebede')).toBeInTheDocument();
    expect(screen.queryByText('Sara Tesfaye')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-count')).toHaveAttribute('aria-label', '3 staff, including you');
  });
});
