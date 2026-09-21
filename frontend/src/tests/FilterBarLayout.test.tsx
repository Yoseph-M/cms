import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Layout regression guard for the app's filter bars.
 *
 * Two failure modes keep recurring across the app and both are silent until a
 * user hits them:
 *
 *  1. The empty state replacing the whole card — taking the search box and
 *     filter dropdowns with it — so a mistyped search can only be undone by
 *     reloading the page.
 *  2. A refactor dropping the responsive classes (`flex-wrap`, the
 *     max-[767px] grid overrides) so the bar stacks or overflows on the small
 *     terminals the POS actually runs on.
 *
 * These tests pin both: the controls stay mounted when a search matches
 * nothing, and the wrapping/stacking classes stay on the wrapping elements.
 * jsdom cannot lay out pixels, but the classNames ARE the responsive layout —
 * if someone removes `flex-wrap` or the mobile grid override, these fail.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('../store/socketStore', () => ({ useSocketStore: vi.fn() }));
vi.mock('../store/headerStore', () => ({
  useHeaderStore: () => ({ setPageTitle: vi.fn(), setShowDateRange: vi.fn(), title: 'Overview', subtitle: '' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: any) => options?.defaultValue || key, i18n: { language: 'en' } }),
}));

import { OwnerStaff } from '../pages/owner/OwnerStaff';
import { ManagerStaff } from '../pages/manager/ManagerStaff';
import { MenuCatalog } from '../components/common/MenuCatalog';
import { SettingsShell, type SettingsShellCategory } from '../components/settings/SettingsShell';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';

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
  {
    id: 'u2',
    name: 'Sara Tesfaye',
    role: 'WAITER',
    username: 'sara',
    phone: '+251922222222',
    salaryAmount: 6000,
    isActive: true,
    hasPin: true,
    hasPassword: false,
  },
];

const MENU_ITEMS = [
  { id: 'm1', name: 'Macchiato', nameAmharic: null, category: 'DRINK', price: 2500, isAvailable: true, imageUrl: undefined },
  { id: 'm2', name: 'Doro Wat', nameAmharic: null, category: 'FOOD', price: 45000, isAvailable: true, imageUrl: undefined },
];

const renderPage = (page: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  (useToastStore as any).mockReturnValue({ addToast: vi.fn() });
  (useAuthStore as any).mockReturnValue({ user: { id: 'owner-1', role: 'OWNER' } });
  (useSocketStore as any).mockReturnValue({ socket: null });
  (axiosClient.get as any).mockImplementation((url: string) => {
    if (url === '/menu') return Promise.resolve({ data: MENU_ITEMS });
    if (url === '/users') return Promise.resolve({ data: USERS });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A search that matches nobody must not take the search box and filters with it. */
describe.each([
  ['Owner staff', () => <OwnerStaff />],
  ['Manager staff', () => <ManagerStaff />],
] as const)('%s filter bar', (_label, page) => {
  it('keeps the search box and role/status filters on screen when nothing matches', async () => {
    renderPage(page());

    expect(await screen.findByText('Abebe Kebede')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search staff...'), {
      target: { value: 'nobody by that name' },
    });

    // The empty state explains the miss…
    expect(await screen.findByText('No staff match your search')).toBeInTheDocument();

    // …while every control used to widen or undo the search stays mounted.
    expect(screen.getByPlaceholderText('Search staff...')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter staff by role')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter staff by status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    await waitFor(() => expect(screen.getByText('Abebe Kebede')).toBeInTheDocument());
  });

  it('keeps the responsive toolbar wrap and mobile search width classes', async () => {
    renderPage(page());
    await screen.findByText('Abebe Kebede');

    // The toolbar wrapping the search + filter dropdowns must keep flex-wrap
    // so it never overflows the card on a narrow terminal.
    const toolbar = screen.getByPlaceholderText('Search staff...').closest('div.flex-wrap');
    expect(toolbar).not.toBeNull();

    // The mobile width classes live on the Input's shell div (Input merges
    // className there, not on the native <input>).
    const searchShell = screen.getByPlaceholderText('Search staff...').closest('div.relative');
    expect(searchShell?.className).toContain('max-[767px]:w-44');
    expect(searchShell?.className).toContain('w-52');
  });
});

describe('Menu catalog filter bar', () => {
  it('keeps the search and filters mounted when a search matches nothing', async () => {
    // The catalog debounces keystrokes (300 ms) — advance timers so the
    // filtered list (and its empty state) settles inside the act() window.
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderPage(<MenuCatalog />);

    expect(await screen.findByText('Macchiato')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search menu items'), {
      target: { value: 'no such dish' },
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() =>
      expect(screen.getByText('No matching items found')).toBeInTheDocument(),
    );

    // The controls that widen or clear the search survive the empty state.
    expect(screen.getByLabelText('Search menu items')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    expect(screen.getByLabelText('View mode')).toBeInTheDocument();
  });

  it('stacks the catalog grid two-up on small terminals and keeps four-up on desktop', async () => {
    renderPage(<MenuCatalog />);
    await screen.findByText('Macchiato');

    const grid = screen.getByText('Macchiato').closest('div.grid');
    expect(grid?.className).toContain('grid-cols-4');
    expect(grid?.className).toContain('max-[767px]:grid-cols-2');
  });
});

describe('Settings search', () => {
  const categories: SettingsShellCategory[] = [
    {
      id: 'general',
      label: 'General',
      items: [
        {
          id: 'tables',
          title: 'Table count',
          description: 'How many tables the floor has',
          content: <p>Table content</p>,
        },
      ],
    },
  ];

  it('keeps the settings filter box on screen when nothing matches', () => {
    render(<SettingsShell title="Settings" categories={categories} />);

    const filter = screen.getByPlaceholderText('Filter settings...');
    fireEvent.change(filter, { target: { value: 'quantum' } });

    expect(screen.getByText('No settings found')).toBeInTheDocument();
    // The filter box and its reset stay usable — a dead-end search is undoable.
    expect(screen.getByPlaceholderText('Filter settings...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reset filter/i }));
    expect(screen.getByText('Table count')).toBeInTheDocument();
  });

  it('keeps the category sidebar grid on the results view boundary', () => {
    render(<SettingsShell title="Settings" categories={categories} />);

    const workspace = screen.getByText('Table content').closest('div.grid');
    expect(workspace?.className).toContain('lg:grid-cols-[280px_1fr]');
  });
});
