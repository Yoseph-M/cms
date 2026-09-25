import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../i18n';

/**
 * Staff page copy.
 *
 * This page once shipped showing raw keys — the table headers read
 * "table.staff", "table.status", "table.actions", the search box read
 * "search.placeholder" and every row action read "row.edit" — because its
 * entire `staff` bundle was missing from the build. The fix is a locale file,
 * which no type-checker or component test would shout about, so pin the visible
 * copy here: if the bundle goes missing again (or the page is pointed at the
 * wrong namespace), these assertions fail instead of a screenshot.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: () => ({ addToast: vi.fn() }) }));
vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { id: 'owner-1', role: 'OWNER' } }),
}));
vi.mock('../store/socketStore', () => ({ useSocketStore: () => ({ socket: null }) }));

import { OwnerStaff } from '../pages/owner/OwnerStaff';
import { axiosClient } from '../api/axiosClient';

const USERS = [
  {
    id: 'u1',
    name: 'Abebe Kebede',
    role: 'CASHIER',
    username: 'abebe',
    phone: '+251911111111',
    salaryAmount: 8000,
    isActive: true,
    hasPin: false,
    hasPassword: true,
  },
];

/** Anything shaped like a dotted i18n key ("table.status") is untranslated copy. */
const RAW_KEY = /\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+\b/;

const renderStaffPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OwnerStaff />
    </QueryClientProvider>,
  );

const headers = () => Array.from(document.querySelectorAll('th')).map((th) => th.textContent);

const visibleRawKeys = () =>
  Array.from(document.querySelectorAll('body *'))
    .filter((el) => el.children.length === 0)
    .flatMap((el) => (el.textContent ?? '').match(RAW_KEY) ?? []);

beforeEach(() => {
  vi.clearAllMocks();
  (axiosClient.get as any).mockResolvedValue({ data: USERS });
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('Owner staff page copy', () => {
  it('renders English table headers and the search placeholder', async () => {
    renderStaffPage();
    await screen.findByText('Abebe Kebede');

    expect(headers()).toEqual(['Staff', 'Role', 'Contact', 'Salary', 'Status', 'Actions']);
    expect(screen.getByPlaceholderText('Search staff...')).toBeInTheDocument();
  });

  it('renders the same page in Amharic when that is the active language', async () => {
    await i18n.changeLanguage('am');
    renderStaffPage();
    await screen.findByText('Abebe Kebede');

    expect(headers()).toEqual(['ሠራተኛ', 'ሚና', 'የመገኛ', 'ደመወዝ', 'ሁኔታ', 'ተግባራት']);
  });

  it('shows no raw translation keys anywhere on the page', async () => {
    renderStaffPage();
    await screen.findByText('Abebe Kebede');

    expect(visibleRawKeys()).toEqual([]);
  });
});
