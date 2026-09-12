import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttendanceHistory } from '../components/common/AttendanceHistory';
import { axiosClient } from '../api/axiosClient';

vi.mock('../api/axiosClient', () => ({
  axiosClient: { get: vi.fn() },
}));

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

/** Tremor renders one block per day; all three responsive trackers are in the DOM. */
const blocks = (container: HTMLElement) =>
  container.querySelectorAll('[class*="tremor-Tracker-trackingBlock"]');

describe('AttendanceHistory', () => {
  it('renders a tracker per staff member over the selected window', async () => {
    const { container } = render(<AttendanceHistory />);

    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());

    // 90-day window: full strip, a 60-day tail for sm, a 30-day tail for mobile.
    expect(blocks(container)).toHaveLength((90 + 60 + 30) * 2);
    expect(screen.getAllByText('90 days ago')).toHaveLength(2);
    expect(screen.getAllByText('60 days ago')).toHaveLength(2);
    expect(screen.getAllByText('30 days ago')).toHaveLength(2);
    expect(screen.getAllByText('Today')).toHaveLength(2);
    // Overall chip plus one row per staff member.
    expect(screen.getAllByText(/^\d+% present$/)).toHaveLength(3);
  });

  it('re-fetches and re-scales the tracker when the range filter changes', async () => {
    const { container } = render(<AttendanceHistory />);
    await waitFor(() => expect(screen.getByText('Abebe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '7d' }));

    await waitFor(() => expect(blocks(container)).toHaveLength(7 * 3 * 2));
    // Below 30 days every breakpoint shows the same window.
    expect(screen.getAllByText('7 days ago')).toHaveLength(6);
    const start = new Date();
    start.setDate(start.getDate() - 6);
    expect(getMock.mock.calls.at(-1)?.[0]).toBe(
      `/attendance?startDate=${start.toISOString().split('T')[0]}&endDate=${today}`,
    );
  });

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
