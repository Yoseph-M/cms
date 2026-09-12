import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './authStore';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  /** Drop the live socket and reconnect with the current access token. */
  reconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: () => {
    if (get().socket) return;

    const baseUrl = import.meta.env.VITE_API_URL || '';

    const socketInstance = io(`${baseUrl}/live`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      // `auth` is a function on purpose: socket.io re-runs it on every
      // reconnect attempt, so each re-handshake always carries the CURRENT
      // access token from the auth store (never a token captured at
      // connection time).
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    });

    socketInstance.on('connect', () => {
      set({ isConnected: true });
    });

    socketInstance.on('disconnect', () => {
      set({ isConnected: false });
    });

    set({ socket: socketInstance });
  },

  disconnect: () => {
    const s = get().socket;
    if (s) {
      s.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  reconnect: () => {
    const s = get().socket;
    if (!s) return;
    s.disconnect();
    s.connect();
  },
}));

// After a proactive access-token rotation the live socket is still
// handshaked with the old token; once that token expires, the next
// re-handshake is rejected with 401 and live events (e.g.
// menu:availabilityChanged) silently stop flowing. Re-handshake right after
// any token change so the socket always carries a valid token.
let prevToken: string | null = useAuthStore.getState().accessToken;
useAuthStore.subscribe((state) => {
  const token = state.accessToken;
  if (token && prevToken && token !== prevToken) {
    useSocketStore.getState().reconnect();
  }
  prevToken = token;
});
