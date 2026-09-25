import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AttendanceHistory } from '../components/common/AttendanceHistory';
import { axiosClient } from '../api/axiosClient';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn() },
}));

vi.mock('react-i18next', () => {
  // Resolve keys against the real catalogues so assertions keep reading the
  // UI text users see, not translation keys.
  const en = {
    ...require('../locales/en/common.json'),
    ...require('../locales/en/attendance.json'),
  };
  const lookup = (key: string): string =>
    key
      .split('.')
      .reduce<any>((node, part) => (node == null ? undefined : node[part]), en);
  const t = (key: string, options?: any) => {
    const value = typeof lookup(key) === 'string' ? lookup(key) : options?.defaultValue || key;
    if (typeof value === 'string' && options && typeof options === 'object') {
      return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options[name] ?? ''));
    }
    return value;
  };
  return {
    useTranslation: () => ({ t, i18n: { language: 'en' } }),
    withTranslation: () => (Component: any) => Component,
    initReactI18next: { type: '3rdParty', init: () => {} },
  };
});

const staff = [
  { id: 'u1', name: 'Abebe', role: 'WAITER' },
  { id: 'u2', name: 'Sara', role: 'CASHIER' },
];

const today = new Date().toISOString().split('T')[0];

const attendance = [
  { id: 'a1', userId: 'u1', date: today, status: 'PRESENT', source: 'MANUAL', note: '' },
  { id: 'a2', userId: 'u2', date: today, status: 'ABSENT', source: 'MANUAL', note: '' },
];

const getMock = axiosClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/users' ? staff : attendance }),
  );
});

/**
 * Tremor renders one block per day. Every row draws the WHOLE month at every
 * width (the strip scales by CSS rather than being trimmed), so a staff row is
 * exactly one tracker. Scoped to the staff list so the legend/key swatches —
 * which are also Tremor blocks — don't inflate the count.
 */
const blocks = (container: HTMLElement) =>
  container.querySelectorAll('ul [class*="tremor-Tracker-trackingBlock"]');

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** One full-month strip per staff member. */
const blocksPerStaff = (days: number) => days;

/** Matches the month labels the card's dropdown shows ("Sep 2026"). */
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** The month dropdown is the house filter menu — open it, then click an option. */
const chooseMonth = async (label: string) => {
  fireEvent.keyDown(screen.getByLabelText('Filter attendance by month'), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
};

describe('AttendanceHistory', () => {
  it('renders a tracker per staff member for the selected month', async () => {
    const { container } = render(<AttendanceHistory />);

    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());

    const now = new Date();
    const days = daysInMonth(now.getFullYear(), now.getMonth());
    expect(blocks(container)).toHaveLength(blocksPerStaff(days) * 2);

    // The month filter defaults to the current month.
    const currentLabel = `${SHORT_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    expect(screen.getByLabelText('Filter attendance by month')).toHaveTextContent(currentLabel);

    // Overall chip plus one row per staff member, each counted in days.
    expect(screen.getAllByText(/^\d+ days present$/)).toHaveLength(3);
  });

  // The tracker strips are heavy to render and the suite runs in parallel, so
  // these two get more headroom than the 5s default.
  it('opens a staff sheet with the counts and the logged days', async () => {
    render(<AttendanceHistory />);
    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Abebe attendance details'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const sheet = within(screen.getByRole('dialog'));
    // Counts per status, including the days nobody marked.
    expect(sheet.getByText('Days logged')).toBeInTheDocument();
    expect(sheet.getByText('No record')).toBeInTheDocument();
    expect(sheet.getByText('1 logged')).toBeInTheDocument();
    // The one logged day for Abebe, with how it was recorded.
    expect(sheet.getByText('Manual')).toBeInTheDocument();
    // Present shows twice: the status tile and the day's own badge.
    expect(sheet.getAllByText('Present')).toHaveLength(2);

    // Sara's sheet is separate: she is the ABSENT record.
    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.click(screen.getByLabelText('Sara attendance details'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(within(screen.getByRole('dialog')).getAllByText('Absent')).toHaveLength(2);
  }, 20_000);

  it('re-fetches and re-scales the tracker when the month filter changes', async () => {
    const { container } = render(<AttendanceHistory />);
    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());

    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousDays = daysInMonth(previous.getFullYear(), previous.getMonth());

    await chooseMonth(`${SHORT_MONTHS[previous.getMonth()]} ${previous.getFullYear()}`);

    await waitFor(() => expect(blocks(container)).toHaveLength(blocksPerStaff(previousDays) * 2));

    const start = toIsoDate(new Date(previous.getFullYear(), previous.getMonth(), 1));
    const end = toIsoDate(new Date(previous.getFullYear(), previous.getMonth() + 1, 0));
    expect(getMock.mock.calls.at(-1)?.[0]).toBe(`/attendance?startDate=${start}&endDate=${end}`);
  }, 20_000);

  it('drops the owner from the list but keeps managers for owners', async () => {
    getMock.mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === '/users'
            ? [...staff, { id: 'u3', name: 'Boss', role: 'OWNER' }, { id: 'u4', name: 'Mgr', role: 'MANAGER' }]
            : attendance,
      }),
    );
    const { unmount } = render(<AttendanceHistory isOwner />);
    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());
    expect(screen.queryByText('Boss')).not.toBeInTheDocument();
    expect(screen.getByText('Mgr')).toBeInTheDocument();
    unmount();

    render(<AttendanceHistory />);
    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());
    expect(screen.queryByText('Mgr')).not.toBeInTheDocument();
  });
});
