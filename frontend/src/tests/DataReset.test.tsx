/**
 * Reset / restore cache purge.
 *
 * The bug these guard: React Query keeps every response for 30 minutes and only
 * refetches past its `staleTime` (90 seconds for analytics), so after a reset
 * the dashboards kept rendering deleted tickets — Best sellers, Revenue trend,
 * and the unread-alert counts — with no request in flight to correct them.
 * A purge has to (a) refetch whatever is on screen and (b) throw away the rest
 * so the next visit cannot paint rows that no longer exist.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';

vi.mock('../db/offlineDb', () => ({
  clearOfflineOrders: vi.fn(async () => undefined),
}));

import { clearOfflineOrders } from '../db/offlineDb';
import { purgeCachedServerData, subscribeToDataReset } from '../lib/dataReset';

const clearMock = clearOfflineOrders as unknown as ReturnType<typeof vi.fn>;

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapperFor = (client: QueryClient) => ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  clearMock.mockClear();
});

describe('purgeCachedServerData', () => {
  it('refetches what is currently on screen', async () => {
    const client = newClient();
    const fetcher = vi.fn(async () => ({ call: fetcher.mock.calls.length }));

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['analytics', '/analytics/top-items', {}],
          queryFn: fetcher,
          // The production dashboards are 90 seconds stale — the purge has to
          // beat that, not wait for it.
          staleTime: 90_000,
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.data).toEqual({ call: 1 }));

    await purgeCachedServerData(client);

    await waitFor(() => expect(result.current.data).toEqual({ call: 2 }));
  });

  it('drops unmounted caches so the next visit cannot paint deleted rows', async () => {
    const client = newClient();
    client.setQueryData(['analytics', '/analytics/top-items', {}], [
      { name: 'Beef Steak', totalQty: 13, totalRevenue: 624000 },
    ]);

    await purgeCachedServerData(client);

    expect(client.getQueryData(['analytics', '/analytics/top-items', {}])).toBeUndefined();
  });

  it('empties the offline order queue — those tickets belong to the wiped books', async () => {
    const client = newClient();
    await purgeCachedServerData(client);
    expect(clearMock).toHaveBeenCalledTimes(1);
  });

  it('still clears the caches when there is no IndexedDB to clear', async () => {
    const client = newClient();
    client.setQueryData(['notifications', 'manager-dashboard'], [{ id: 'n1' }]);
    clearMock.mockRejectedValueOnce(new Error('indexedDB is not available'));

    await expect(purgeCachedServerData(client)).resolves.toBeUndefined();
    expect(client.getQueryData(['notifications', 'manager-dashboard'])).toBeUndefined();
  });
});

describe('subscribeToDataReset', () => {
  /** Minimal emitter — enough to prove the wiring without a live server. */
  const fakeSocket = () => {
    const handlers = new Map<string, () => void>();
    return {
      socket: {
        on: (event: string, handler: () => void) => handlers.set(event, handler),
        off: (event: string) => handlers.delete(event),
      } as unknown as Socket,
      fire: (event: string) => handlers.get(event)?.(),
      listening: (event: string) => handlers.has(event),
    };
  };

  it('purges when the server announces the books were replaced', () => {
    const { socket, fire, listening } = fakeSocket();
    const onReset = vi.fn();
    subscribeToDataReset(socket, onReset);

    expect(listening('data:reset')).toBe(true);
    fire('data:reset');

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on cleanup and tolerates a signed-out socket', () => {
    const { socket, listening } = fakeSocket();
    const off = subscribeToDataReset(socket, vi.fn());
    off();
    expect(listening('data:reset')).toBe(false);

    expect(() => subscribeToDataReset(null, vi.fn())()).not.toThrow();
  });
});
