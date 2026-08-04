import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CashierDashboard } from '../../pages/cashier/CashierDashboard';
import { axiosClient } from '../../api/axiosClient';
import { useSocketStore } from '../../store/socketStore';
import { useToastStore } from '../../store/toastStore';

// Mock dependencies
vi.mock('../../api/axiosClient', () => ({
  axiosClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../store/socketStore', () => ({
  useSocketStore: vi.fn(),
}));

vi.mock('../../store/toastStore', () => ({
  useToastStore: vi.fn(),
}));

vi.mock('../../components/receipt/ReceiptModal', () => ({
  ReceiptModal: () => <div data-testid="receipt-modal">Receipt Modal</div>,
}));

describe('CashierDashboard', () => {
  let mockSocket: any;
  let mockAddToast: any;

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
          items: [],
        },
        {
          id: 'order-2',
          clientOrderId: 'ref-2',
          tableNumber: '2',
          status: 'PAID',
          totalAmount: 100,
          items: [],
        },
      ],
    });
  });

  it('renders active orders and hides the settle button for PAID orders', async () => {
    render(<CashierDashboard />);

    // Wait for fetchOrders
    await waitFor(() => {
      expect(screen.getByText('Table #1')).toBeInTheDocument();
      expect(screen.getByText('Table #2')).toBeInTheDocument();
    });

    // Check that "Settle Payment" button is only rendered for the SERVED order
    const settleButtons = screen.getAllByText('Settle Payment');
    expect(settleButtons).toHaveLength(1); // Only for order-1
  });

  it('handles mark paid flow correctly', async () => {
    (axiosClient.patch as any).mockResolvedValueOnce({
      data: {
        id: 'order-1',
        clientOrderId: 'ref-1',
        tableNumber: '1',
        status: 'PAID', // updated
        totalAmount: 50,
        items: [],
      },
    });

    render(<CashierDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Table #1')).toBeInTheDocument();
    });

    // Click settle payment for Table #1
    const settleBtn = screen.getByText('Settle Payment');
    fireEvent.click(settleBtn);

    // Modal opens
    expect(screen.getByText('Process Table #1 Payment')).toBeInTheDocument();

    // Select CASH (which is default, but let's click it)
    const cashBtn = screen.getByText('CASH');
    fireEvent.click(cashBtn);

    // Confirm
    const confirmBtn = screen.getByText('Confirm Payment PAID');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(axiosClient.patch).toHaveBeenCalledWith('/orders/order-1/pay', { paymentMethod: 'CASH' });
      // Toast should be called
      expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    });

    // Modal should close (or wait for it to be removed if it unmounts)
    expect(screen.queryByText('Process Table #1 Payment')).not.toBeInTheDocument();
  });

  it('displays printer failure banner and triggers reprint', async () => {
    render(<CashierDashboard />);

    // Simulate socket event for printer failure
    const onPrinterFailed = mockSocket.on.mock.calls.find((call: any) => call[0] === 'printer:failed')?.[1];
    expect(onPrinterFailed).toBeDefined();

    // Trigger failure
    onPrinterFailed({ id: 'order-1', tableNumber: '1', message: 'Out of paper' });

    // Banner should appear
    await waitFor(() => {
      expect(screen.getByText(/Printer Failure: Table #1/)).toBeInTheDocument();
    });

    (axiosClient.post as any).mockResolvedValueOnce({});

    // Click Re-print
    const reprintBtn = screen.getByText(/Re-print Ticket/);
    fireEvent.click(reprintBtn);

    await waitFor(() => {
      expect(axiosClient.post).toHaveBeenCalledWith('/orders/order-1/reprint');
      // Banner should disappear after successful reprint
      expect(screen.queryByText(/Printer Failure: Table #1/)).not.toBeInTheDocument();
    });
  });
});
