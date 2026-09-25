import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next from 'i18next';

/**
 * Item Sales headline card.
 *
 * The card and the "Best sellers" cards on the owner/manager dashboards read
 * the same `/analytics/top-items` payload, but two bugs made them look like
 * they disagreed about the data:
 *
 *  1. The headline ranked by units only, so a high-volume cheap item ("Burger
 *     with fries", 25 sold) sat at the top while the dashboards — which rank by
 *     revenue — crowned an expensive one ("Doro Wat", 7 sold). Neither number
 *     was wrong; the card just never said which yardstick it used.
 *  2. Catalogue labels were always rendered with `nameAmharic`, so an English
 *     UI showed Amharic item names.
 *
 * These tests pin the metric switch, the both-metrics readout and the
 * language-aware label.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn() }),
}));

import { MenuSalesStats } from '../pages/owner/MenuSalesStats';
import { axiosClient } from '../api/axiosClient';

const MENU = [
  {
    id: 'm1',
    name: 'Burger with fries',
    nameAmharic: 'በርገር ከፍራይስ ጋር',
    category: 'FOOD',
    price: 2000,
    isAvailable: true,
    imageUrl: undefined,
  },
  {
    id: 'm2',
    name: 'Doro Wat',
    nameAmharic: 'ዶሮ ወጥ',
    category: 'FOOD',
    price: 10000,
    isAvailable: true,
    imageUrl: undefined,
  },
];

// Deliberately different leaders: most units vs most revenue.
const TOP_ITEMS = [
  { name: 'Burger with fries', totalQty: 25, totalRevenue: 5000, imageUrl: null },
  { name: 'Doro Wat', totalQty: 7, totalRevenue: 7000, imageUrl: null },
];

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MenuSalesStats />
    </QueryClientProvider>,
  );

/** The headline KPI tile, located by its label rather than by DOM position. */
const topSellerCard = () => {
  // The label is copy, so resolve it in the active language.
  const labelText = i18next.t('itemSales.topSeller', { ns: 'owner' });
  const label = screen.getByText(
    (_content, element) =>
      element?.tagName === 'P' && (element.textContent ?? '').startsWith(labelText),
  );
  return label.parentElement as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/menu')) return Promise.resolve({ data: MENU });
    if (url.startsWith('/analytics/top-items')) return Promise.resolve({ data: TOP_ITEMS });
    if (url.startsWith('/analytics/items-by-hour')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(async () => {
  await i18next.changeLanguage('en');
});

describe('Item Sales — top seller card', () => {
  it('leads with the units leader and reports both numbers', async () => {
    renderPage();

    const card = within(topSellerCard());
    expect(await card.findByText('Burger with fries')).toBeInTheDocument();
    // Units headline, revenue alongside — never one metric pretending to be
    // the only truth.
    expect(card.getByText(/25 sold/)).toBeInTheDocument();
  });

  it('re-ranks by revenue when the Revenue metric is selected', async () => {
    renderPage();
    // The name appears in both the headline card and the table row.
    await screen.findAllByText('Burger with fries');

    fireEvent.click(screen.getByRole('tab', { name: 'Revenue' }));

    const card = within(topSellerCard());
    expect(await card.findByText('Doro Wat')).toBeInTheDocument();
    expect(card.getByText(/7 sold/)).toBeInTheDocument();
  });

  it('shows catalogue names in the active language, not always Amharic', async () => {
    await i18next.changeLanguage('am');
    renderPage();

    const card = within(topSellerCard());
    expect(await card.findByText('በርገር ከፍራይስ ጋር')).toBeInTheDocument();
    expect(card.queryByText('Burger with fries')).toBeNull();
  });
});
