import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CashierDashboard } from '../pages/cashier/CashierDashboard';
import { axiosClient } from '../api/axiosClient';
import { useSocketStore } from '../store/socketStore';
import { useToastStore } from '../store/toastStore';

vi.mock('../api/axiosClient', () => ({
  axiosClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../store/socketStore', () => ({
  useSocketStore: vi.fn(),
}));

vi.mock('../store/toastStore', () => ({
  useToastStore: vi.fn(),
}));

vi.mock('../components/receipt/ReceiptModal', () => ({
  ReceiptModal: () => <div data-testid="receipt-modal">Receipt Modal</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => options?.defaultValue || key,
  }),
  // The dashboard reaches the i18n bootstrap through the auth store, so the
  // mock has to satisfy the plugin contract i18n.ts registers at import time.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { MemoryRouter } from 'react-router-dom';

// Phase 14, §1.3 — the dashboard now reads `cashierOrderingEnabled` via
// useSystemSettingQuery and uses useQueryClient for the live socket update.
// Tests need a QueryClientProvider or those hooks throw.
const renderWithQueryClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('CashierDashboard', () => {
  let mockSocket: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> };
  let mockAddToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    (useSocketStore as any).mockReturnValue({ socket: mockSocket });

    mockAddToast = vi.fn();
    (useToastStore as any).mockReturnValue({ addToast: mockAddToast });

    (axiosClient.get as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.startsWith('/settings/system/')) {
        // 404 — no system setting seeded in this test environment. The
        // dashboard treats "no data" as "disabled", which is the default.
        return Promise.reject({ response: { status: 404 } });
      }
      return Promise.resolve({
        data: {
          data: [
            {
              id: 'order-1',
              clientOrderId: 'ref-1',
              tableNumber: '1',
              status: 'SERVED',
              totalAmount: 50,
              createdAt: new Date().toISOString(),
              items: [{ name: 'Espresso', quantity: 1, unitPrice: 50 }],
            },
            {
              id: 'order-2',
              clientOrderId: 'ref-2',
              tableNumber: '2',
              status: 'PAID',
              totalAmount: 100,
              createdAt: new Date().toISOString(),
              items: [],
            },
          ],
          pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
        },
      });
    });
  });

  it('shows served tickets in the ready queue and keeps paid ones out of it', async () => {
    renderWithQueryClient(<CashierDashboard />);

    // The active queue lists the SERVED ticket as ready to collect.
    const readySection = await waitFor(() => {
      const heading = screen.getByRole('heading', { name: 'Ready to collect' });
      const section = heading.closest('section');
      expect(section).not.toBeNull();
      return section as HTMLElement;
    });

    await waitFor(() => {
      expect(within(readySection).getByText('Table 1')).toBeInTheDocument();
    });

    // The PAID ticket is never part of the collection queue.
    expect(within(readySection).queryByText('Table 2')).not.toBeInTheDocument();
  });

});
