import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));

import { OwnerStaff } from '../pages/owner/OwnerStaff';
import { ManagerStaff } from '../pages/manager/ManagerStaff';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';

const USERS = [
  {
    id: 'u1',
    name: 'Abebe Kebede',
    role: 'CASHIER',
    username: 'abebe',
    phone: '+251911111111',
    salaryAmount: 8000,
    isActive: true,
    hasPin: false,
  },
  {
    id: 'u2',
    name: 'Sara Tesfaye',
    role: 'WAITER',
    username: 'sara',
    phone: '+251922222222',
    salaryAmount: 6000,
    isActive: true,
    hasPin: true,
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
  (axiosClient.get as any).mockResolvedValue({ data: USERS });
});

/**
 * A search that matches nobody must not take the search box with it: the
 * toolbar is what the user needs to widen or undo the search.
 */
describe.each([
  ['Owner staff', <OwnerStaff />],
  ['Manager staff', <ManagerStaff />],
] as const)('%s roster', (_label, page) => {
  it('keeps the search and filters on screen when nothing matches', async () => {
    renderPage(page);

    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Search staff...');
    fireEvent.change(search, { target: { value: 'nobody by that name' } });

    // The empty state explains the miss…
    expect(await screen.findByText('No staff match your search')).toBeInTheDocument();

    // …while the controls used to search stay put.
    expect(screen.getByPlaceholderText('Search staff...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => expect(screen.getByText('Abebe Kebede')).toBeInTheDocument());
    expect((screen.getByPlaceholderText('Search staff...') as HTMLInputElement).value).toBe('');
  });
});
