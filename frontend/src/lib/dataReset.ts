import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { clearOfflineOrders } from '../db/offlineDb';

/**
 * Wipe every cached server fact and re-read what is on screen.
 *
 * React Query keeps responses for `gcTime` (30 minutes app-wide) and only
 * refetches once `staleTime` has passed — dashboards set that to 90 seconds.
 * That is what makes navigation instant, and it is also why a destructive
 * action looked broken: the operator resets the books, walks to the dashboard
 * (2 seconds later) and the Best sellers / Revenue trend cards still render the
 * deleted tickets straight out of the cache, with no request in flight.
 *
 * Order matters here:
 *   1. Unmounted caches are removed outright, so the next visit fetches fresh.
 *   2. Mounted ones are invalidated, which refetches them immediately — the
 *      screen the operator is looking at repaints with the new (empty) truth.
 *
 * The offline order queue is cleared too: those tickets were typed against
 * books that no longer exist, and re-uploading them would silently restore the
 * data the operator just deleted.
 */
export async function purgeCachedServerData(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ type: 'inactive' });
  await queryClient.invalidateQueries();

  try {
    await clearOfflineOrders();
  } catch {
    // No IndexedDB (private mode, jsdom, a browser that blocks it) — the
    // in-memory caches above are already gone, and there is no queue to wipe.
  }
}

/**
 * Re-run the purge when any other signed-in screen reports that the books were
 * replaced, so a manager's tablet shows the reset within a second instead of
 * within its 90-second stale window.
 *
 * Returns an unsubscribe function; a null socket (signed out) is a no-op.
 */
export function subscribeToDataReset(
  socket: Socket | null | undefined,
  onReset: () => void | Promise<void>,
): () => void {
  if (!socket) return () => {};

  const handler = () => {
    void onReset();
  };

  socket.on('data:reset', handler);
  return () => {
    socket.off('data:reset', handler);
  };
}
