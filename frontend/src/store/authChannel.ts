import type { User } from '../types';

/**
 * Cross-tab auth events.
 *
 * There is exactly ONE BroadcastChannel instance in the app and ONE module that
 * owns it — this file. Both `authStore` (the single source of truth that
 * APPLIES state changes) and `axiosClient` (which only needs to know when to
 * stop waiting) subscribe through it, so `SESSION_REFRESHED` / `SESSION_LOGGED_OUT`
 * handling is never duplicated.
 */
export type AuthChannelMessage =
  | { type: 'SESSION_REFRESHED'; accessToken: string; user: User | null }
  | { type: 'SESSION_LOGGED_OUT' };

type AuthChannelListener = (message: AuthChannelMessage) => void;

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('auth_channel') : null;

const listeners = new Set<AuthChannelListener>();

if (channel) {
  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as AuthChannelMessage;
    if (!message || typeof message !== 'object' || !message.type) return;
    // Snapshot so a listener unsubscribing during dispatch can't skip others.
    [...listeners].forEach((listener) => listener(message));
  };
}

/** Post an auth event to every OTHER tab (never delivered back to this one). */
export function postAuthChannelMessage(message: AuthChannelMessage) {
  channel?.postMessage(message);
}

/** Subscribe to auth events from other tabs. Returns an unsubscribe fn. */
export function subscribeToAuthChannel(listener: AuthChannelListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
