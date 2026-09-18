import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn() },
}));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));

import { GlobalSearch } from '../components/common/GlobalSearch';
import { axiosClient } from '../api/axiosClient';
import { useAuthStore } from '../store/authStore';

/** Mirrors the shape GET /api/search returns. */
const results = {
  staff: [{ id: 's1', name: 'Tigist Barista', role: 'CASHIER', phone: '+251911' }],
  menuItems: [{ id: 'm1', name: 'Latte', price: 60, isAvailable: true }],
  orders: [
    {
      id: 'o1',
      clientOrderId: 'abcdef1234',
      tableNumber: '3',
      totalAmount: 120,
      status: 'PAID',
      items: [],
    },
  ],
  expenses: [
    {
      id: 'e1',
      amount: 1200,
      category: 'UTILITIES',
      description: 'Monthly electricity bill',
      date: '2026-08-05T10:00:00.000Z',
      recordedBy: { name: 'Selam' },
    },
  ],
  payroll: [
    {
      id: 'pay1',
      periodMonth: 8,
      periodYear: 2026,
      paidAmount: 4200,
      note: 'Bonus for extra shifts',
      user: { name: 'Tigist Barista', role: 'CASHIER' },
    },
  ],
  settlements: [
    {
      id: 'st1',
      orderId: 'o1',
      amountMinor: 340,
      method: 'CASH',
      reference: 'RC-9911',
      createdAt: '2026-08-06T12:00:00.000Z',
      order: { tableNumber: '7', clientOrderId: 'abcdef1234', status: 'PAID' },
    },
  ],
  printers: [
    { id: 'p1', station: 'kitchen', transport: 'NETWORK', ip: '192.168.1.50', macAddress: null },
  ],
};

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </span>
  );
};

const renderSearch = (role: 'OWNER' | 'CASHIER') => {
  (useAuthStore as any).mockReturnValue({
    user: { id: 'u1', name: 'Selam', role },
    isAuthenticated: true,
    isLoading: false,
  });
  return render(
    <MemoryRouter>
      <GlobalSearch />
      <LocationProbe />
    </MemoryRouter>,
  );
};

const type = (value: string) => {
  fireEvent.focus(screen.getByLabelText('Search'));
  fireEvent.change(screen.getByLabelText('Search'), { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockResolvedValue({ data: results });
});

describe('GlobalSearch', () => {
  it('searches staff, menu, orders and the money records for an owner', async () => {
    renderSearch('OWNER');
    type('ti');

    await waitFor(() => expect(screen.getByText('Expenses')).toBeInTheDocument());

    expect((axiosClient.get as any).mock.calls[0][0]).toBe('/search?q=ti');
    for (const heading of ['Staff', 'Menu items', 'Orders', 'Expenses', 'Payroll', 'Settlements', 'Printers']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }

    // Each group renders the record it matched, with its own detail line.
    expect(screen.getByText('Monthly electricity bill')).toBeInTheDocument();
    expect(screen.getByText('Tigist Barista — Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('Table 7 · 340 ETB')).toBeInTheDocument();
    expect(screen.getByText('Ticket printer')).toBeInTheDocument();
  });

  it('never shows money or printer records to a cashier', async () => {
    renderSearch('CASHIER');
    type('ti');

    await waitFor(() => expect(screen.getByText('Menu items')).toBeInTheDocument());

    for (const heading of ['Staff', 'Expenses', 'Payroll', 'Settlements', 'Printers']) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
  });

  it('opens the settlements page filtered to the ticket that matched', async () => {
    renderSearch('OWNER');
    type('ti');

    await waitFor(() => expect(screen.getByText('Settlements')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option', { name: /Table 7 · 340 ETB/ }));

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toContain('/owner/settlements'),
    );
    expect(screen.getByTestId('location').textContent).toContain('o1');
  });
});
