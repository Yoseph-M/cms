import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Finance page — the Revenue Trend header and the cards beside it.
 *
 * Revenue Trend used to carry two controls in its header row: a Line/Bar toggle
 * and a "Compare against: No overlay / WoW / MoM / YoY" dropdown. The second one
 * was wired to state nothing ever read, so it silently did nothing — it is gone.
 * The Line/Bar switch belongs to the chart, so it now sits in its own bar under
 * the header, and the right end of the header carries the one control that is
 * about the whole card: the day-by-day takings the manager closed at End of Day.
 *
 * The Top Items card was removed — the owner reads best sellers on the dashboard
 * — and the two questions this page could not answer now have cards of their
 * own: did this window cover its costs (Break-even Coverage) and which days
 * carry the week (Busiest Days).
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn() }),
}));

import { OwnerFinance } from '../pages/owner/OwnerFinance';
import { axiosClient } from '../api/axiosClient';

const TREND = [
  { date: '2026-09-01', revenue: 12000, orderCount: 4 },
  { date: '2026-09-02', revenue: 9000, orderCount: 3 },
];

/** `YYYY-MM-DD` for a day `offset` days back, anchored at local noon so the
 *  conversion to UTC cannot slide the day. */
const dayKey = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

const YESTERDAY = dayKey(1);
const THREE_DAYS_AGO = dayKey(3);
const TODAY = dayKey(0);
const LONG_AGO = dayKey(60);

/**
 * The reconciliation report the page reads: one entry per business day a
 * manager approved (days still waiting for a decision are not in it), each with
 * the total that was signed off and the same day's paid revenue read from the
 * ledger now. TODAY drifts — 900 birr landed on it after it was closed.
 */
const RECON = {
  days: [
    {
      businessDate: TODAY,
      closedSalesMinor: 6000,
      paidRevenueMinor: 6900,
      deltaMinor: -900,
      deltaPercent: -13,
      flagged: true,
      closedByName: 'Marta',
    },
    { businessDate: YESTERDAY, closedSalesMinor: 12000, paidRevenueMinor: 12000, deltaMinor: 0, deltaPercent: 0, flagged: false, closedByName: 'Marta' },
    { businessDate: THREE_DAYS_AGO, closedSalesMinor: 4000, paidRevenueMinor: 4000, deltaMinor: 0, deltaPercent: 0, flagged: false, closedByName: 'Yonas' },
    // Closed and matching, but outside the selected window.
    { businessDate: LONG_AGO, closedSalesMinor: 77777, paidRevenueMinor: 77777, deltaMinor: 0, deltaPercent: 0, flagged: false, closedByName: 'Marta' },
  ],
  closedDayCount: 4,
  flaggedCount: 1,
};

/** The same report with every closed day in agreement. */
const RECON_ALL_MATCH = {
  days: RECON.days.map((d) => ({ ...d, paidRevenueMinor: d.closedSalesMinor, deltaMinor: 0, deltaPercent: 0, flagged: false })),
  closedDayCount: 4,
  flaggedCount: 0,
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OwnerFinance />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockImplementation((url: string) => {
    if (url.startsWith('/analytics/sales/trend')) return Promise.resolve({ data: TREND });
    if (url.startsWith('/analytics/sales/total'))
      return Promise.resolve({ data: { totalRevenue: 21000, orderCount: 7 } });
    if (url.startsWith('/analytics/profit-loss'))
      return Promise.resolve({ data: { revenue: 21000, expenses: 8000, netProfit: 13000 } });
    if (url.startsWith('/daily-close/reconciliation')) return Promise.resolve({ data: RECON });
    return Promise.resolve({ data: [] });
  });
});

describe('Finance — Revenue Trend header', () => {
  it('puts the line/bar toggle in a bar under the header, not in the title row', async () => {
    renderPage();

    expect(await screen.findByText('Revenue Trend')).toBeInTheDocument();

    const group = screen.getByLabelText('Chart style');
    const line = screen.getByRole('tab', { name: 'Line' });
    const bar = screen.getByRole('tab', { name: 'Bar' });

    // Both options are visible at once — that is the point of a toggle.
    expect(group).toContainElement(line);
    expect(group).toContainElement(bar);
    expect(line).toHaveAttribute('aria-selected', 'true');

    // …and the toggle sits on its own bar, whose previous sibling is the header
    // grid — i.e. below the title, above the chart.
    const toolbar = group.parentElement as HTMLElement;
    expect(toolbar.previousElementSibling?.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(group.closest('h3')).toBeNull();

    // And picking one really moves the active tab.
    fireEvent.click(bar);
    expect(bar).toHaveAttribute('aria-selected', 'true');
    expect(line).toHaveAttribute('aria-selected', 'false');

    // The overlay dropdown that changed nothing stays gone.
    expect(screen.queryByLabelText('Compare against')).toBeNull();
    expect(screen.queryByText('WoW')).toBeNull();
  });

  it('keeps the Daily takings button on the right end of the card header', async () => {
    renderPage();
    await screen.findByText('Revenue Trend');

    const trigger = screen.getByLabelText('Daily takings');
    // The trigger's wrapper is the right-hand column of the header grid, and
    // that column right-aligns its contents at every width.
    const column = trigger.parentElement?.parentElement as HTMLElement;
    expect(column.className).toContain('justify-end');
    expect(column.parentElement?.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    // Never inside the title cluster.
    expect(trigger.closest('h3')).toBeNull();
  });

  it('lists the days the manager closed at End of Day, with that day’s money', async () => {
    renderPage();
    await screen.findByText('Revenue Trend');

    fireEvent.click(screen.getByLabelText('Daily takings'));

    const card = await screen.findByRole('dialog', { name: 'Daily takings' });
    // Three closed days inside the window…
    expect(card.textContent).toContain('12,000 ETB');
    expect(card.textContent).toContain('6,000 ETB');
    expect(card.textContent).toContain('4,000 ETB');
    // …and the total of what was signed off across them.
    expect(card.textContent).toContain('22,000 ETB');
    // Who signed each day off.
    expect(card.textContent).toContain('closed by Marta');
    expect(card.textContent).toContain('closed by Yonas');

    // A closed day outside the window is not in the window.
    expect(card.textContent).not.toContain('77,777 ETB');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Daily takings' })).toBeNull();
  });

  it('flags the closed day whose takings no longer agree with the ledger', async () => {
    renderPage();
    await screen.findByText('Revenue Trend');

    const trigger = screen.getByLabelText('Daily takings');
    fireEvent.click(trigger);
    const card = await screen.findByRole('dialog', { name: 'Daily takings' });

    // The trigger carries the count, so the drift is visible without opening it.
    expect(trigger.textContent).toContain('1');
    expect(trigger.querySelector('span[title]')?.getAttribute('title')).toBe('1 of 3 days diverge');

    // Which days diverge, and by how much — the signed-off figure beside the
    // ledger's own figure for the same business day.
    expect(card.textContent).toContain('1 of 3 days diverge');
    expect(card.textContent).toContain('900 ETB landed after the close');
    expect(card.textContent).toContain('ledger 6,900 ETB');
    expect(card.textContent).toContain('Off the ledger');
    expect(card.textContent).toContain('-900 ETB');
  });

  it('says so when every closed day still matches the ledger', async () => {
    (axiosClient.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/analytics/sales/trend')) return Promise.resolve({ data: TREND });
      if (url.startsWith('/analytics/sales/total'))
        return Promise.resolve({ data: { totalRevenue: 21000, orderCount: 7 } });
      if (url.startsWith('/analytics/profit-loss'))
        return Promise.resolve({ data: { revenue: 21000, expenses: 8000, netProfit: 13000 } });
      if (url.startsWith('/daily-close/reconciliation'))
        return Promise.resolve({ data: RECON_ALL_MATCH });
      return Promise.resolve({ data: [] });
    });

    renderPage();
    await screen.findByText('Revenue Trend');

    const trigger = screen.getByLabelText('Daily takings');
    fireEvent.click(trigger);
    const card = await screen.findByRole('dialog', { name: 'Daily takings' });
    expect(card.textContent).toContain('Every closed day matches the ledger');
    expect(card.textContent).not.toContain('Off the ledger');

    // And the trigger stays quiet — no count, no warning.
    expect(trigger.querySelector('span[title]')).toBeNull();
    expect(trigger.textContent).toBe('Daily takings');
  });
});

describe('Finance — the cards beside Revenue Trend', () => {
  it('drops the Top Items card the dashboard already carries', async () => {
    renderPage();
    await screen.findByText('Revenue Trend');

    expect(screen.queryByText('Top Items')).toBeNull();
    expect(screen.queryByLabelText('Showing')).toBeNull();
    expect(screen.queryByLabelText('Items shown')).toBeNull();
  });

  it('reads the window’s margin on a dial — a style no other card uses', async () => {
    renderPage();

    expect(await screen.findByText('Margin Dial')).toBeInTheDocument();

    // 21,000 ETB collected against 8,000 ETB of costs = 62% of revenue kept.
    expect(await screen.findByText('62%')).toBeInTheDocument();
    expect(await screen.findByText(/13,000 ETB kept out of 21,000 ETB collected/)).toBeInTheDocument();
    expect(screen.getByText('Healthy margin')).toBeInTheDocument();
    expect(screen.getByText('Loss zone')).toBeInTheDocument();
    expect(screen.getByText('Profit zone')).toBeInTheDocument();

    // The dial itself is an SVG gauge addressed by name, with the break-even
    // mark and the two zones named under it — not a progress bar or a pair of
    // tiles, which the rest of the page already has.
    const dial = screen.getByRole('img', { name: /Profit margin dial: 62 percent/ });
    expect(dial.tagName.toLowerCase()).toBe('svg');
    expect(dial.textContent).toContain('break-even');

    // The card it replaced is gone, along with its own wording.
    expect(screen.queryByText('Break-even Coverage')).toBeNull();
    expect(screen.queryByText(/of this period's costs/)).toBeNull();
  });

  it('swings the needle into the loss half when the window spent more than it took', async () => {
    (axiosClient.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/analytics/sales/trend')) return Promise.resolve({ data: TREND });
      if (url.startsWith('/analytics/sales/total'))
        return Promise.resolve({ data: { totalRevenue: 21000, orderCount: 7 } });
      if (url.startsWith('/analytics/profit-loss'))
        return Promise.resolve({ data: { revenue: 21000, expenses: 30000, netProfit: -9000 } });
      if (url.startsWith('/daily-close/reconciliation')) return Promise.resolve({ data: RECON });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText('Margin Dial')).toBeInTheDocument();
    // 8,000 ETB of costs against 21,000 ETB collected = −43% margin, and the
    // needle is rotated into the loss half (negative degrees on the dial).
    expect(await screen.findByText('-43%')).toBeInTheDocument();
    expect(await screen.findByText(/9,000 ETB more spent than collected/)).toBeInTheDocument();
    expect(screen.getByText('Loss')).toBeInTheDocument();

    const dial = screen.getByRole('img', { name: /Profit margin dial: -43 percent/ });
    const needle = dial.querySelector('g[style]') as HTMLElement;
    const rotation = /rotate\((-?[\d.]+)deg\)/.exec(needle.style.transform)?.[1];
    expect(Number(rotation)).toBeLessThan(0);
  });

  it('answers "which days carry the week?" with the busiest days', async () => {
    renderPage();

    expect(await screen.findByText('Busiest Days')).toBeInTheDocument();
    // The best day of the window is named in the header: 2026-09-01, a Tuesday,
    // carried the most money in the fixture.
    const best = await screen.findByText(/Best day:/);
    expect(best.textContent).toMatch(/Tue/);
  });
});
