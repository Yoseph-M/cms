/**
 * Manager dashboard shell.
 *
 * The "Needs your attention" section (End of Day / Alerts / Attendance today)
 * was removed at the owner's request, together with its copy in the locale
 * catalogues. This renders the real page against empty endpoints, so a
 * re-introduced card, or a crash left behind by the surgery, fails here rather
 * than on the manager's screen.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => String(opts?.defaultValue ?? key),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
// The real store hands back a fresh object every render, which loops the
// page-title effect — every page test in this suite stubs it the same way.
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({
    setPageTitle: vi.fn(),
    setShowDateRange: vi.fn(),
    setHeaderDateRange: vi.fn(),
    dateRange: { from: '2026-09-01', to: '2026-09-24' },
    showDateRange: true,
  }),
}));

import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { axiosClient } from '../api/axiosClient';

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ManagerDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  // Every endpoint answers empty — the shape a freshly reset system returns.
  (axiosClient.get as any).mockResolvedValue({ data: [] });
});

describe('Manager dashboard', () => {
  it('still renders its sections after the attention block was removed', async () => {
    renderPage();

    expect(await screen.findByText('Sales rhythm')).toBeInTheDocument();
    expect(screen.getByText('Team on the floor')).toBeInTheDocument();
  });

  it('no longer carries the End of Day / Alerts / Attendance trio', async () => {
    renderPage();
    await screen.findByText('Sales rhythm');

    const body = document.body.textContent ?? '';
    for (const removed of [
      'Needs your attention',
      'Action required',
      'No request yet',
      'Review alerts',
      'Attendance today',
      'Open attendance',
    ]) {
      expect(body).not.toContain(removed);
    }
  });
});
