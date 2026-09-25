import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Settlement history filters.
 *
 * These filters have been reshaped more than once. First they sat in the page
 * header where the custom range inputs were clipped, then the native date
 * pickers were nested inside a dropdown menu where they could not be opened at
 * all — so the filters looked missing. For a while the card held four typed
 * fields (two dates, a min and a max). The working shape is now three dropdowns
 * in the house filter style: when, how much, and how it was paid. Nothing on
 * this card is typed any more, and the date/money questions are answered by
 * named windows.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn() },
}));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn() }),
}));

import { GlobalSettlementHistory } from '../pages/shared/GlobalSettlementHistory';
import { axiosClient } from '../api/axiosClient';

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <GlobalSettlementHistory />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockResolvedValue({
    data: {
      data: [
        {
          id: 'st1',
          amountMinor: 340,
          method: 'CASH',
          reference: 'RC-9911',
          note: '',
          createdAt: '2026-08-06T12:00:00.000Z',
          order: {
            id: 'o1',
            clientOrderId: 'abcdef1234',
            tableNumber: '7',
            totalAmount: 340,
            status: 'PAID',
            items: [],
          },
          recordedBy: null,
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    },
  });
});

/** Config objects of every `/settlements` request the page has made. */
const settlementRequests = () =>
  (axiosClient.get as any).mock.calls
    .filter(([url]: any[]) => url === '/settlements')
    .map(([, config]: any[]) => config?.params ?? {});

/** The house dropdowns are real menus: open with a key press, then click the option. */
const chooseOption = async (triggerLabel: string, optionName: string) => {
  fireEvent.keyDown(screen.getByLabelText(triggerLabel), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: optionName }));
};

describe('Settlement history filter bar', () => {
  it('shows the date, amount and method filters as dropdowns in one card', async () => {
    renderPage();

    const date = await screen.findByLabelText('Filter by date');
    const amount = screen.getByLabelText('Filter by amount');
    const method = screen.getByLabelText('Filter by method');

    for (const control of [date, amount, method]) {
      expect(control.tagName).toBe('BUTTON');
      expect(control.closest('[class*="rounded-2xl"]')).not.toBeNull();
    }

    // The selected window is what the trigger reads.
    expect(date.textContent).toContain('All dates');
    expect(amount.textContent).toContain('Any amount');
  });

  it('uses the menu library’s filter bar, with the three pills on one row', async () => {
    renderPage();

    const date = await screen.findByLabelText('Filter by date');
    const amount = screen.getByLabelText('Filter by amount');
    const method = screen.getByLabelText('Filter by method');

    // The same bar the menu items page uses, class for class: the pills live in
    // the right-aligned cluster of a `justify-between` row (the count line takes
    // the left end), and each pill is the same `shrink-0 h-11` trigger.
    const cluster = date.parentElement as HTMLElement;
    expect(cluster.className).toBe('flex items-center gap-2 flex-wrap ml-auto justify-end');
    expect(cluster.children).toHaveLength(3);
    expect(amount.parentElement).toBe(cluster);
    expect(method.parentElement).toBe(cluster);

    const row = cluster.parentElement as HTMLElement;
    expect(row.className).toBe('flex items-center gap-2 flex-wrap justify-between');
    // No responsive prefix anywhere in the bar: this project's Tailwind config
    // replaces `theme.screens`, so `sm:`/`md:`/`lg:` emit no CSS at all — a
    // prefixed layout class would silently never apply.
    for (const node of [row, cluster, date, amount, method]) {
      expect(node.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
    }

    for (const pill of [date, amount, method]) {
      expect(pill.className).toContain('shrink-0');
      expect(pill.className).toContain('h-11');
      // Icon + the name of the active window, exactly like the menu page's pills.
      expect(pill.querySelector('svg')).not.toBeNull();
      expect(pill.textContent?.trim().length).toBeGreaterThan(0);
    }

    // The row also carries the result line the menu page's bar leads with.
    expect(await screen.findByText('Showing 1 of 1 payments')).toBeInTheDocument();
  });

  it('no longer asks for dates or amounts to be typed in', async () => {
    renderPage();
    await screen.findByLabelText('Filter by date');

    // No date inputs and no min/max money boxes anywhere on the card.
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0);
    expect(document.querySelectorAll('input[type="number"]')).toHaveLength(0);
    expect(screen.queryByPlaceholderText('Min')).toBeNull();
    expect(screen.queryByPlaceholderText('Max')).toBeNull();
  });

  it('sends the chosen date window, anchored to the local day', async () => {
    renderPage();
    await screen.findByLabelText('Filter by date');

    await chooseOption('Filter by date', 'Last 7 days');

    // Same conversion the page uses: local start-of-day six days back, through
    // the end of today.
    const expectedFrom = new Date();
    expectedFrom.setHours(0, 0, 0, 0);
    expectedFrom.setDate(expectedFrom.getDate() - 6);
    const expectedTo = new Date();
    expectedTo.setHours(23, 59, 59, 999);

    await waitFor(() => {
      const filtered = settlementRequests().filter(
        (params: Record<string, unknown>) =>
          params.from === expectedFrom.toISOString() && params.to === expectedTo.toISOString(),
      );
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  it('sends the chosen money window as min/max bounds', async () => {
    renderPage();
    await screen.findByLabelText('Filter by amount');

    await chooseOption('Filter by amount', '50 – 200');

    await waitFor(() => {
      const filtered = settlementRequests().filter(
        (params: Record<string, unknown>) =>
          params.minAmount === '50' && params.maxAmount === '200',
      );
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  it('sends no date or money bounds while both filters are on their defaults', async () => {
    renderPage();
    await screen.findByLabelText('Filter by date');

    await waitFor(() => {
      const params = settlementRequests()[0];
      expect(params.from).toBeUndefined();
      expect(params.to).toBeUndefined();
      expect(params.minAmount).toBeUndefined();
      expect(params.maxAmount).toBeUndefined();
    });
  });
});
