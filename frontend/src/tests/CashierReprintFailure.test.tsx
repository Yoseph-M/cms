import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import enCashier from '../locales/en/cashier.json';

/**
 * A kitchen reprint is fire-and-forget: `POST /print-jobs/reprint/:orderId`
 * queues the job and answers 201, so a printer that rejects it can only be
 * learned from the socket. The cashier is standing at the desk with a customer
 * in front of them — a silent failure means food never starts. These tests pin
 * that a reprint failure is announced (and stays on screen until fixed),
 * whether the backend reports it as `printJob:failed` or lets the printing
 * agent acknowledge it through `printJob:updated`.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn(), title: '', subtitle: '' }),
}));
vi.mock('../store/socketStore', () => ({ useSocketStore: vi.fn() }));
vi.mock('react-i18next', () => {
  const resolve = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
  return {
    useTranslation: (ns?: string) => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        const value = String(ns ?? 'cashier') === 'cashier' ? resolve(enCashier, key) : undefined;
        if (typeof value === 'string') {
          return value.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? ''));
        }
        return opts?.defaultValue || key;
      },
      i18n: { language: 'en' },
    }),
  };
});

import { CashierTicketsPage } from '../pages/cashier/CashierTicketsPage';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';

/** Minimal socket stand-in that records listeners so the test can emit events. */
const makeSocket = () => {
  const handlers = new Map<string, Set<(payload?: any) => void>>();
  return {
    on: (event: string, fn: (payload?: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    },
    off: (event: string, fn: (payload?: any) => void) => {
      handlers.get(event)?.delete(fn);
    },
    emit: (event: string, payload?: any) => {
      handlers.get(event)?.forEach((fn) => fn(payload));
    },
  };
};

const ORDER = {
  id: 'o1',
  clientOrderId: 'ord-abc123',
  tableNumber: '3',
  waiterId: 'w1',
  waiter: { id: 'w1', name: 'Abebe' },
  items: [{ menuItemId: 'm1', name: 'Coffee', unitPrice: 500, quantity: 1, notes: '' }],
  totalAmount: 500,
  status: 'SUBMITTED',
  settlementStatus: 'UNSETTLED',
  isPaid: false,
  paymentMethod: 'NONE',
  createdAt: new Date().toISOString(),
  // The failed kitchen job — this is what a reprint is trying to replace.
  latestPrintJob: {
    id: 'job-1',
    station: 'kitchen',
    status: 'FAILED',
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
  },
};

let addToast: ReturnType<typeof vi.fn>;
let socket: ReturnType<typeof makeSocket>;

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CashierTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Reprint the visible ticket, then report whatever the printer did. */
const reprintAndFail = async (event: 'printJob:failed' | 'printJob:updated') => {
  renderPage();
  expect(await screen.findByText('Table 3')).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText('Reprint kitchen ticket'));
  await waitFor(() =>
    expect(axiosClient.post).toHaveBeenCalledWith('/print-jobs/reprint/o1', {}),
  );

  await act(async () => {
    // `printJob:failed` carries the order; an agent's ack carries only the job.
    socket.emit(
      event,
      event === 'printJob:failed'
        ? { jobId: 'job-1', orderId: 'o1', station: 'kitchen', error: 'Out of paper' }
        : { jobId: 'job-1', status: 'FAILED', error: 'Out of paper' },
    );
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  addToast = vi.fn();
  socket = makeSocket();
  (useToastStore as any).mockReturnValue({ addToast });
  (useAuthStore as any).mockReturnValue({ user: { id: 'c1', role: 'CASHIER' } });
  (useSocketStore as any).mockReturnValue({ socket, isConnected: true });
  (axiosClient.get as any).mockImplementation((url: string) =>
    url === '/orders' ? Promise.resolve({ data: [ORDER] }) : Promise.resolve({ data: { value: '12' } }),
  );
  (axiosClient.post as any).mockResolvedValue({ data: { id: 'job-2' } });
});

describe('cashier reprint failures', () => {
  it('tells the cashier when a reprint fails again and keeps it on screen', async () => {
    await reprintAndFail('printJob:failed');

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Reprint failed again' }),
    );
    // The toast is transient; the strip stays until the ticket prints.
    expect(await screen.findByText('Kitchen print failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reprint Table 3/i })).toBeInTheDocument();
  });

  it('reports a failure acknowledged through printJob:updated, which has no order id', async () => {
    await reprintAndFail('printJob:updated');

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Reprint failed again' }),
    );
    expect(await screen.findByText('Kitchen print failed')).toBeInTheDocument();
  });

  it('clears the failure once the ticket actually prints', async () => {
    await reprintAndFail('printJob:failed');
    expect(await screen.findByText('Kitchen print failed')).toBeInTheDocument();

    await act(async () => {
      socket.emit('printJob:updated', { jobId: 'job-1', orderId: 'o1', status: 'PRINTED' });
    });

    await waitFor(() => expect(screen.queryByText('Kitchen print failed')).not.toBeInTheDocument());
  });
});
