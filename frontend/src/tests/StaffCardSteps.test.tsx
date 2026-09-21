import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import enAuth from '../locales/en/auth.json';
import enStaff from '../locales/en/staff.json';

/**
 * Two-step staff card + sign-in warnings + login "Forgot Password?" hint.
 *
 * The staff card opens as Identity first, Credentials last, so editing a
 * phone number never renders the PIN or password fields. When a change would
 * leave someone unable to sign in — an app role (WAITER/COOKER/BARISTA/
 * MANAGER) with no mobile PIN, or a site role (CASHIER/MANAGER) with no
 * website password — the card warns before saving. The login screen surfaces
 * a forgot-password hint once the same username fails three times; the count
 * is per-username and resets on success.
 */

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../store/toastStore', () => ({ useToastStore: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: vi.fn() }));
// LoginPage imports applyUserLanguage -> i18nUserPrefs -> i18n.ts, which
// initializes i18next at import time. Stub the prefs module so the real
// i18n (LanguageDetector etc.) never loads inside jsdom.
vi.mock('../i18nUserPrefs', () => ({
  applyUserLanguage: vi.fn().mockResolvedValue(undefined),
  resetToNeutralLanguage: vi.fn(),
}));
vi.mock('react-i18next', () => {
  // Resolve keys against the REAL English locales (per namespace), so pages
  // render their actual copy — the login hint from auth.json, the staff-card
  // steps/warnings from staff.json — instead of raw keys. Handles {{vars}}.
  const dicts: Record<string, any> = { auth: enAuth, staff: enStaff };
  const resolve = (obj: unknown, path: string): unknown =>
    path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
  return {
    useTranslation: (ns?: string) => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        const dict = dicts[String(ns || 'common')] ?? enAuth;
        const value = resolve(dict, key);
        if (typeof value === 'string') {
          return value.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? ''));
        }
        return opts?.defaultValue || key;
      },
      i18n: { language: 'en' },
    }),
  };
});

import { OwnerStaff } from '../pages/owner/OwnerStaff';
import { LoginPage } from '../pages/login/LoginPage';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';

/**
 * Role model mirrors the component: WAITER/COOKER/BARISTA/MANAGER sign in on
 * the mobile app with a PIN; CASHIER/MANAGER sign in on the website with a
 * password. So Abebe (WAITER, hasPin: false) is the "app role missing its
 * PIN" case and Sara (CASHIER, hasPassword: false) the "site role missing
 * its password" one.
 */
const USERS = [
  {
    id: 'u1',
    name: 'Abebe Kebede',
    role: 'WAITER',
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
    role: 'CASHIER',
    username: 'sara',
    phone: '+251922222222',
    salaryAmount: 6000,
    isActive: true,
    hasPin: true,
    hasPassword: false,
  },
];

const renderPage = (page: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );

let addToast: ReturnType<typeof vi.fn>;
let setAuth: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  addToast = vi.fn();
  setAuth = vi.fn();
  (useToastStore as any).mockReturnValue({ addToast });
  (useAuthStore as any).mockReturnValue({ user: { id: 'owner-1', role: 'OWNER' }, isAuthenticated: false, setAuth });
  (axiosClient.get as any).mockResolvedValue({ data: USERS });
  (axiosClient.patch as any).mockImplementation((url: string, body: any) => {
    // Echo back the edited user's own record (merging the body) — otherwise
    // the optimistic cache update would plant a duplicate id in the table.
    const id = url.split('/').pop();
    const existing = USERS.find((u) => u.id === id) ?? USERS[0];
    return Promise.resolve({ data: { ...existing, ...body } });
  });
});

const openEdit = async (name: string) => {
  await screen.findByText(name);
  fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
};

describe('two-step staff card (OwnerStaff)', () => {
  it('opens on Identity — editing a phone number never shows the PIN or password fields', async () => {
    renderPage(<OwnerStaff />);
    await openEdit('Abebe Kebede');

    // Step 1 shows identity and nothing credential-shaped.
    expect(screen.getByText('Step 1 of 2 — Identity')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^PIN/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

    // Change the phone and advance — the credential fields were never shown.
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: '+251911999888' } });
    fireEvent.click(screen.getByRole('button', { name: /review & save/i }));

    // Step 2 is the credentials review (Abebe is a waiter — PIN field, no
    // password field); saving commits the phone change.
    expect(screen.getByText('Step 2 of 2 — Credentials')).toBeInTheDocument();
    expect(screen.getByLabelText(/^PIN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect((axiosClient.patch as any).mock.calls.some(([, body]: any[]) => body?.phone === '+251911999888')).toBe(true),
    );
    // The phone-only save must NOT touch credentials.
    const patchBody = (axiosClient.patch as any).mock.calls.find(
      ([, body]: any[]) => body?.phone === '+251911999888',
    )?.[1];
    expect(patchBody.password).toBeUndefined();
    expect(patchBody.pinCode).toBeUndefined();
  });

  it('warns when the change would leave an app role without a PIN', async () => {
    renderPage(<OwnerStaff />);
    await openEdit('Abebe Kebede'); // waiter, no PIN on file

    fireEvent.click(screen.getByRole('button', { name: /review & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no mobile PIN/i);

    // Filling the PIN clears the warning.
    fireEvent.change(screen.getByLabelText(/^PIN/), { target: { value: '1234' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when the change would leave a site role without a password', async () => {
    renderPage(<OwnerStaff />);
    await openEdit('Sara Tesfaye'); // cashier, no website password on file

    fireEvent.click(screen.getByRole('button', { name: /review & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no website password/i);
  });

  it('keeps credentials when left blank — no PIN or password is sent on an ordinary edit', async () => {
    renderPage(<OwnerStaff />);
    await openEdit('Sara Tesfaye'); // cashier, password missing but PIN stored; blanks keep what exists

    fireEvent.click(screen.getByRole('button', { name: /review & save/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(axiosClient.patch).toHaveBeenCalled());
    const patchBody = (axiosClient.patch as any).mock.calls[0][1];
    expect(patchBody.pinCode).toBeUndefined();
    expect(patchBody.password).toBeUndefined();
  });

  it('opens straight on Credentials from the "Set mobile PIN" shortcut', async () => {
    renderPage(<OwnerStaff />);
    await screen.findByText('Abebe Kebede');
    // Abebe is a waiter with no PIN yet — the key shortcut shows on his row.
    fireEvent.click(screen.getByRole('button', { name: 'Set mobile PIN for Abebe Kebede' }));

    expect(screen.getByText('Step 2 of 2 — Credentials')).toBeInTheDocument();
    // The card moves focus into the PIN field once the slide-over settles.
    await waitFor(() => expect(screen.getByLabelText(/^PIN/)).toHaveFocus(), { timeout: 1500 });
  });
});

describe('login forgot-password hint', () => {
  const typeAndSubmit = async (username: string, password = 'wrong-pass') => {
    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: username } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  };

  it('appears after 3 failed attempts for the same username', async () => {
    (axiosClient.post as any).mockRejectedValue({ response: { data: { error: 'Invalid username or password.' } } });
    renderPage(<LoginPage />);

    await typeAndSubmit('abebe');
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();

    await typeAndSubmit('abebe');
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();

    await typeAndSubmit('abebe');
    expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
  });

  it('does not appear for a different username — the count starts fresh', async () => {
    (axiosClient.post as any).mockRejectedValue({ response: { data: { error: 'Invalid username or password.' } } });
    renderPage(<LoginPage />);

    await typeAndSubmit('abebe');
    await typeAndSubmit('abebe');
    await typeAndSubmit('abebe');
    expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();

    // A different person typing their own name starts the count from one.
    await typeAndSubmit('sara');
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();

    // …and their third miss shows it again.
    await typeAndSubmit('sara');
    await typeAndSubmit('sara');
    expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
  });

  it('clears after a successful sign-in', async () => {
    const authError = { response: { data: { error: 'Invalid username or password.' } } };
    (axiosClient.post as any)
      .mockRejectedValueOnce(authError)
      .mockRejectedValueOnce(authError)
      .mockRejectedValueOnce(authError)
      .mockResolvedValue({
        data: {
          accessToken: 'tok',
          user: { id: 'u1', name: 'Abebe Kebede', role: 'CASHIER', preferredLanguage: 'en' },
        },
      });
    renderPage(<LoginPage />);

    await typeAndSubmit('abebe');
    await typeAndSubmit('abebe');
    await typeAndSubmit('abebe');
    expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();

    // Successful login lands on the role dashboard — no stale alert or hint.
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'right-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText(/forgot your password/i)).not.toBeInTheDocument();
  });
});
