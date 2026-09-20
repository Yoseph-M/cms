import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));

import { OwnerAuditLogs } from '../pages/owner/OwnerAuditLogs';
import { resolveAdminTab } from '../pages/owner/adminTabs';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';

const FEED = {
  rows: [
    {
      id: 'a1',
      kind: 'LOGIN',
      timestamp: '2026-09-17T22:34:42.000Z',
      action: 'LOGIN',
      entity: 'User',
      description: 'User logged in as OWNER',
      actor: { id: 'u1', name: 'System Admin', role: 'OWNER', subtitle: 'owner' },
      targetId: 'u1',
      ip: '10.0.0.4',
      userAgent: 'Mozilla/5.0 Chrome/130',
      outcome: 'SUCCESS',
    },
    {
      id: 'a2',
      kind: 'ACTIVITY',
      timestamp: '2026-09-17T20:10:00.000Z',
      action: 'ORDER_CANCELLED',
      entity: 'Order',
      description: 'Order cancelled: customer left',
      actor: { id: 'u2', name: 'Yosef', role: 'WAITER', subtitle: 'WAITER' },
      targetId: '665f1c2b3d4e5f6a7b8c9d0e',
      payload: { reason: 'customer left' },
    },
  ],
  nextCursor: null,
  total: 68,
  facets: { actions: ['LOGIN', 'ORDER_CANCELLED'], entities: ['Order', 'User'] },
};

/** URLs the page asked the API for, in order. */
const requestedUrls = (): string[] =>
  ((axiosClient.get as any).mock.calls as Array<[string]>).map(([url]) => String(url));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OwnerAuditLogs />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (useToastStore as any).mockReturnValue({ addToast: vi.fn() });
  (axiosClient.get as any).mockResolvedValue({ data: FEED });
});

describe('audit logs', () => {
  it('shows activity and logins in one table with a total count', async () => {
    renderPage();

    // The subtitle counts the merged stream, not just one source.
    expect(await screen.findByText('68')).toBeInTheDocument();
    expect(screen.getByText(/system activities recorded/)).toBeInTheDocument();

    // A login row and an activity row from different collections, side by side.
    expect(await screen.findByText('User logged in as OWNER')).toBeInTheDocument();
    expect(screen.getByText('Order cancelled: customer left')).toBeInTheDocument();
    expect(screen.getByText('System Admin')).toBeInTheDocument();
    expect(screen.getByText('Yosef')).toBeInTheDocument();
    // Order ID too: the action also appears as a filter option (not shown) and
    // as the row's badge.
    expect(screen.getAllByText('ORDER_CANCELLED').length).toBeGreaterThan(0);
  });

  it('opens the event details with the stored context', async () => {
    renderPage();
    await screen.findByText('Order cancelled: customer left');

    const viewButtons = screen.getAllByRole('button', { name: /View details for/ });
    fireEvent.click(viewButtons[1]);

    const dialog = await screen.findByRole('dialog', { name: /Audit event details/i });
    expect(dialog).toBeInTheDocument();
    // The raw audit payload is shown verbatim for deeper digging, alongside the
    // record the event targeted.
    expect(within(dialog).getByText(/"reason": "customer left"/)).toBeInTheDocument();
    expect(within(dialog).getByText('Record ID')).toBeInTheDocument();
    expect(within(dialog).getByText('665f1c2b3d4e5f6a7b8c9d0e')).toBeInTheDocument();
  });

  it('sends the search term to the server when Search is pressed', async () => {
    renderPage();
    await screen.findByText('User logged in as OWNER');

    fireEvent.change(screen.getByLabelText(/Search logs by action or description/i), {
      target: { value: 'cancelled' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(requestedUrls().some((url) => url.includes('search=cancelled'))).toBe(true));
  });

  /**
   * The filters are dropdown menus (the house filter style, matching the menu
   * library), not native <select>s — so a test choice is a click to open and a
   * click on the option.
   */
  const chooseOption = async (triggerLabel: RegExp, optionName: string) => {
    fireEvent.keyDown(screen.getByLabelText(triggerLabel), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: optionName }));
  };

  it('filters by action and entity from the dropdowns', async () => {
    renderPage();
    await screen.findByText('User logged in as OWNER');

    await chooseOption(/Filter by action/i, 'ORDER_CANCELLED');
    await waitFor(() => expect(requestedUrls().some((url) => url.includes('action=ORDER_CANCELLED'))).toBe(true));

    // The dropdown must keep its options while the previous request is still in
    // flight, otherwise this change silently does nothing.
    await chooseOption(/Filter by entity/i, 'Order');
    await waitFor(() => expect(requestedUrls().some((url) => url.includes('entity=Order'))).toBe(true));
  });

  it('switches to oldest first', async () => {
    renderPage();
    await screen.findByText('User logged in as OWNER');

    await chooseOption(/Sort order/i, 'Oldest First');
    await waitFor(() => expect(requestedUrls().some((url) => url.includes('order=oldest'))).toBe(true));
  });

  it('invites a broader search when filters match nothing', async () => {
    (axiosClient.get as any).mockResolvedValue({
      data: { rows: [], nextCursor: null, total: 0, facets: FEED.facets },
    });
    renderPage();

    expect(await screen.findByText('Nothing to report yet')).toBeInTheDocument();
    expect(screen.getByText(/It's quiet for now/)).toBeInTheDocument();
  });
});

describe('admin tab resolution', () => {
  it('keeps the legacy login-history tab and unknown values sensible', () => {
    // Bookmarks from before the merge still land on the merged screen.
    expect(resolveAdminTab('logins')).toBe('audit');
    expect(resolveAdminTab('backup')).toBe('backup');
    expect(resolveAdminTab('audit')).toBe('audit');
    expect(resolveAdminTab('nonsense')).toBe('staff');
    expect(resolveAdminTab(null)).toBe('staff');
  });
});
