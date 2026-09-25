/**
 * Cashier End of Day layout.
 *
 * Two regressions are pinned here, both of which made this page behave
 * differently from every other page in the shell:
 *
 *   1. The card sat in its own `mx-auto max-w-3xl` column. The sidebar animates
 *      its width (80px ↔ 260px) and the canvas is `flex-1`, so collapsing the
 *      sidebar slid this card sideways while every other page simply grew.
 *   2. The summary strip asked for `sm:grid-cols-4`, and `sm:`/`md:`/`lg:`
 *      generate no CSS at all in this project — `tailwind.config.js` replaces
 *      `theme.screens` with `tablet-portrait` (768px), `tablet-landscape`
 *      (1024px) and `desktop` (1280px). The tiles stayed at two columns on a
 *      desktop.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => String(opts?.defaultValue ?? key),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const preview = {
  businessDate: '2026-09-24',
  totalSalesMinor: 0,
  totalSettledMinor: 0,
  cashSettledMinor: 0,
  cardSettledMinor: 0,
  mobileSettledMinor: 0,
  unsettledOrderCount: 0,
  cancelledOrderCount: 0,
};

vi.mock('../api/phase9Api', () => ({
  dailyCloseApi: {
    getCurrentStatus: vi.fn(async () => null),
    previewDailyClose: vi.fn(async () => preview),
  },
}));

import { CashierEndOfDay } from '../pages/cashier/CashierEndOfDay';

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CashierEndOfDay />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Cashier End of Day page', () => {
  it('renders the close card', async () => {
    renderPage();
    expect(await screen.findByText('Ready to close the day')).toBeInTheDocument();
  });

  it('flows like the other pages instead of sitting in a centred column', async () => {
    const { container } = renderPage();
    await screen.findByText('Ready to close the day');

    // No `mx-auto` anywhere: nothing on this page re-centres (and therefore
    // jumps) when the sidebar animates its width.
    expect(container.querySelector('.mx-auto')).toBeNull();
    expect(container.innerHTML).not.toMatch(/max-w-3xl/);
  });

  it('uses only breakpoints that exist in this project', async () => {
    const { container } = renderPage();
    await screen.findByText('Ready to close the day');

    // `sm:` / `md:` / `lg:` / `xl:` compile to nothing here, so any of them is
    // a silently dead rule rather than a responsive layout.
    expect(container.innerHTML).not.toMatch(/\b(sm|md|lg|xl|2xl):/);
  });

  it('lays the money tiles out four across on a desktop canvas', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Total sales')).toBeInTheDocument());

    const strip = container.querySelector('.tablet-landscape\\:grid-cols-4');
    expect(strip).not.toBeNull();
    expect(strip?.className).toContain('grid-cols-2');
  });
});
