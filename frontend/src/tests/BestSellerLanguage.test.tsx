import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';

/**
 * Owner dashboard — Best sellers labels.
 *
 * `/analytics/top-items` groups sales by the order-line snapshot name, and a
 * snapshot is written in whatever language the item was saved in. The card used
 * to print those snapshots verbatim, so an English reader saw a list that mixed
 * Amharic into it ("ዶሮ ወጥ" beside "Beef Tibs") — and the same dish could appear
 * twice, once per snapshot language, with its sales split across the two rows.
 *
 * These tests pin the fix: every row is resolved back to its catalogue item, so
 * the labels follow the active UI language and the duplicate snapshots fold into
 * one entry. The ranking metric is a dropdown now, not a tab toggle.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { OwnerDashboard } from '../pages/owner/OwnerDashboard';
import { axiosClient } from '../api/axiosClient';
import { purgeCachedServerData } from '../lib/dataReset';

const MENU = [
  { id: 'm1', name: 'Doro Wat', nameAmharic: 'ዶሮ ወጥ', category: 'FOOD', price: 10000 },
  { id: 'm2', name: 'Beef Tibs', nameAmharic: 'የበሬ ጥብስ', category: 'FOOD', price: 5000 },
];

/**
 * Three rows for two dishes: the Amharic snapshot of Doro Wat (7 sold, a legacy
 * order) and its bilingual snapshot (3 sold) belong to the same item.
 */
const TOP_ITEMS = [
  { name: 'ዶሮ ወጥ', totalQty: 7, totalRevenue: 7000, imageUrl: null },
  { name: 'ዶሮ ወጥ (Doro Wat)', totalQty: 3, totalRevenue: 3000, imageUrl: null },
  { name: 'Beef Tibs', totalQty: 25, totalRevenue: 5000, imageUrl: null },
];

const DAILY = {
  totalRevenue: 0,
  mtdRevenue: 0,
  orderCount: 0,
  avgTicket: 0,
  activeOrdersCount: 0,
  deltas: {
    revenueVsPriorDay: null,
    mtdVsPriorMonth: null,
    ordersVsPriorDay: null,
    aovVsPriorDay: null,
  },
};

/** The client is returned too, so a test can act on it (a purge, as a reset does). */
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <OwnerDashboard />
    </QueryClientProvider>,
  );
  return { ...view, client };
};

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/menu')) return Promise.resolve({ data: MENU });
    if (url.startsWith('/analytics/top-items')) return Promise.resolve({ data: TOP_ITEMS });
    if (url.startsWith('/analytics/category-split')) return Promise.resolve({ data: [] });
    if (url.startsWith('/analytics/sales/daily')) return Promise.resolve({ data: DAILY });
    if (url.startsWith('/analytics/sales/monthly')) return Promise.resolve({ data: [] });
    if (url.startsWith('/analytics/sales/total'))
      return Promise.resolve({ data: { totalRevenue: 0, orderCount: 0 } });
    if (url.startsWith('/analytics/profit-loss'))
      return Promise.resolve({ data: { revenue: 0, expenses: 0, netProfit: 0 } });
    return Promise.resolve({ data: [] });
  });
});

afterEach(async () => {
  await i18next.changeLanguage('en');
});

describe('Owner dashboard — best sellers', () => {
  it('shows English labels for an English reader, never a mixture', async () => {
    renderPage();

    expect(await screen.findByText('Doro Wat')).toBeInTheDocument();
    expect(screen.getByText('Beef Tibs')).toBeInTheDocument();
    // Not one Ethiopic character anywhere on the page.
    expect(document.body.textContent ?? '').not.toMatch(/[\u1200-\u137F]/);
  });

  it('folds duplicate snapshots of the same dish into one row', async () => {
    renderPage();

    expect(await screen.findByText('Doro Wat')).toBeInTheDocument();
    // Appears once, not twice: the ranking is by revenue, so Doro Wat (10,000
    // across both snapshots) leads Beef Tibs (5,000) with 67% of the visible list.
    expect(screen.getAllByText('Doro Wat')).toHaveLength(1);
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText(/10 sold/)).toBeInTheDocument();
  });

  it('offers the ranking metric as a dropdown, not a tab toggle', async () => {
    renderPage();

    // The trigger is a button carrying the filter's accessible name…
    const metric = await screen.findByLabelText('Rank by');
    expect(metric.tagName).toBe('BUTTON');
    // …and it shares ONE non-wrapping bar with the depth filter, so neither can
    // be pushed past the card's clipped edge.
    const bar = metric.parentElement as HTMLElement;
    expect(bar.className).not.toContain('flex-wrap');
    expect(within(bar).getByText('Top 5')).toBeInTheDocument();
    // No tab-rendered switch anywhere on the page.
    expect(screen.queryByRole('tab', { name: 'Revenue' })).toBeNull();
  });

  it('reads the Amharic labels for an Amharic reader', async () => {
    await i18next.changeLanguage('am');
    renderPage();

    expect(await screen.findByText('ዶሮ ወጥ')).toBeInTheDocument();
    expect(screen.queryByText('Doro Wat')).toBeNull();
  });

  it('empties itself the moment the books are wiped', async () => {
    const { client } = renderPage();
    expect(await screen.findByText('Doro Wat')).toBeInTheDocument();

    // The operator resets the system: the same endpoint now answers with
    // nothing, and the reset purges the client cache. The card must not keep
    // rendering the tickets that were just deleted.
    (axiosClient.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/menu')) return Promise.resolve({ data: MENU });
      if (url.startsWith('/analytics/sales/daily')) return Promise.resolve({ data: DAILY });
      if (url.startsWith('/analytics/sales/total'))
        return Promise.resolve({ data: { totalRevenue: 0, orderCount: 0 } });
      if (url.startsWith('/analytics/profit-loss'))
        return Promise.resolve({ data: { revenue: 0, expenses: 0, netProfit: 0 } });
      // Every sales endpoint — top items included — is now empty.
      return Promise.resolve({ data: [] });
    });
    await act(async () => {
      await purgeCachedServerData(client);
    });

    expect(await screen.findByText('No sales in this period.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Doro Wat')).toBeNull());
    expect(screen.queryByText('Beef Tibs')).toBeNull();
  });
});
