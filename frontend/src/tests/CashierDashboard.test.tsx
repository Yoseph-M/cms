import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

    (axiosClient.get as any).mockResolvedValue({
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
    });
  });

  it('renders active orders and hides Mark Paid for PAID orders', async () => {
    render(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mark Paid')).toBeInTheDocument();
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

    render(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mark Paid')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CASH'));
    fireEvent.click(screen.getByText('Mark Paid'));

    await waitFor(() => {
      expect(axiosClient.patch).toHaveBeenCalledWith('/orders/order-1/pay', { paymentMethod: 'CASH' });
    });
  });

  it('displays printer failure banner and allows dismiss', async () => {
    render(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Mark Paid')).toBeInTheDocument();
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
