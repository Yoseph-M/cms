/**
 * The login field must start empty, always.
 *
 * It used to be pre-filled with whoever signed in last on this device, which is
 * wrong on a shared till: logging out left the previous cashier's username
 * sitting in the box, so the next person saw someone else's name. These tests
 * pin the empty start, the cleanup of the key older builds wrote, and that a
 * person's own typing is not remembered for the next session.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

import { LoginPage } from '../pages/login/LoginPage';

const LEGACY_KEY = 'pos.lastUsername';

const renderLogin = () =>
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );

const usernameField = () => document.getElementById('username') as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
});

describe('login username field', () => {
  it('starts empty even when the previous session left a username behind', () => {
    localStorage.setItem(LEGACY_KEY, 'kebe');

    renderLogin();

    expect(usernameField().value).toBe('');
    expect(screen.queryByDisplayValue('kebe')).not.toBeInTheDocument();
  });

  it('deletes the leftover key older builds wrote', () => {
    localStorage.setItem(LEGACY_KEY, 'kebe');

    renderLogin();

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('does not remember who signed in last across a sign-out', () => {
    const first = renderLogin();
    fireEvent.change(usernameField(), { target: { value: 'kebe' } });
    expect(usernameField().value).toBe('kebe');
    first.unmount();

    renderLogin();

    expect(usernameField().value).toBe('');
  });
});
