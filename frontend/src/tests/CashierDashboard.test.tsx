import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
}));

// Phase 14, §1.3 — the dashboard now reads `cashierOrderingEnabled` via
// useSystemSettingQuery and uses useQueryClient for the live socket update.
// Tests need a QueryClientProvider or those hooks throw.
const renderWithQueryClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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

  it('renders active orders and hides Mark Paid for PAID orders', async () => {
    renderWithQueryClient(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('orderDetail.markPaid')).toBeInTheDocument();
    });

    // Active ticket is in the queue; PAID Table 2 is filtered out
    expect(screen.getAllByText('Table 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('Table 2')).not.toBeInTheDocument();
  });

  it('handles mark paid flow correctly', async () => {
    (axiosClient.patch as any).mockResolvedValueOnce({
      data: {
        id: 'order-1',
        clientOrderId: 'ref-1',
        tableNumber: '1',
        status: 'PAID',
        totalAmount: 50,
        createdAt: new Date().toISOString(),
        items: [{ name: 'Espresso', quantity: 1, unitPrice: 50 }],
      },
    });

    renderWithQueryClient(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('orderDetail.markPaid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cash'));
    fireEvent.click(screen.getByText('orderDetail.markPaid'));

    await waitFor(() => {
      expect(axiosClient.post).toHaveBeenCalledWith('/orders/order-1/settlements', {
        amountMinor: expect.any(Number),
        method: 'CASH',
        reference: '',
        note: 'Settlement recorded via Cashier Dashboard',
      });
    });
  });

  it('displays printer failure banner and allows dismiss', async () => {
    renderWithQueryClient(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('orderDetail.markPaid')).toBeInTheDocument();
    });

    const onPrinterFailed = mockSocket.on.mock.calls.find((call: any) => call[0] === 'printer:failed')?.[1];
    expect(onPrinterFailed).toBeDefined();

    onPrinterFailed({ id: 'order-1', tableNumber: '1', message: 'Out of paper' });

    await waitFor(() => {
      expect(screen.getByText(/Printer failure detected/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));

    await waitFor(() => {
      expect(screen.queryByText(/Printer failure detected/i)).not.toBeInTheDocument();
    });
  });
});
