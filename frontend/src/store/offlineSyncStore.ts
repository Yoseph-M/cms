import { create } from 'zustand';
import { getPendingOfflineOrders, removeOfflineOrder } from '../db/offlineDb';
import { axiosClient } from '../api/axiosClient';
import { useToastStore } from './toastStore';

interface OfflineSyncState {
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  refreshPendingCount: () => Promise<void>;
  processSyncQueue: () => Promise<void>;
  initListeners: () => void;
}

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  pendingCount: 0,
  isSyncing: false,
  isOnline: navigator.onLine,

  refreshPendingCount: async () => {
    try {
      const orders = await getPendingOfflineOrders();
      set({ pendingCount: orders.length });
    } catch (err) {
      // IndexedDB fallback
    }
  },

  processSyncQueue: async () => {
    if (get().isSyncing || !navigator.onLine) return;
    set({ isSyncing: true });

    try {
      const pendingOrders = await getPendingOfflineOrders();
      if (pendingOrders.length === 0) {
        set({ isSyncing: false, pendingCount: 0 });
        return;
      }

      let syncedCount = 0;

      for (const order of pendingOrders) {
        try {
          // Idempotent POST call echoing clientOrderId (UUID v4)
          await axiosClient.post('/api/orders', {
            clientOrderId: order.clientOrderId,
            tableNumber: order.tableNumber,
            items: order.items,
          });

          // Remove from local IndexedDB queue once backend confirms receipt
          await removeOfflineOrder(order.clientOrderId);
          syncedCount++;
        } catch (err) {
          console.error('Offline order sync error for clientOrderId:', order.clientOrderId, err);
        }
      }

      await get().refreshPendingCount();

      if (syncedCount > 0) {
        useToastStore.getState().addToast({
          type: 'success',
          title: 'Offline Sync Confirmed',
          message: `Successfully synchronized ${syncedCount} offline order(s) to server.`,
        });
      }
    } finally {
      set({ isSyncing: false });
    }
  },

  initListeners: () => {
    window.addEventListener('online', () => {
      set({ isOnline: true });
      useToastStore.getState().addToast({
        type: 'info',
        title: 'Network Restored',
        message: 'Connection re-established. Syncing offline orders...',
      });
      get().processSyncQueue();
    });

    window.addEventListener('offline', () => {
      set({ isOnline: false });
      useToastStore.getState().addToast({
        type: 'warning',
        title: 'Offline Mode Active',
        message: 'Network disconnected. New orders will be stored locally in IndexedDB.',
      });
    });

    // Listen for Service Worker background sync message
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PROCESS_OFFLINE_SYNC_QUEUE') {
          get().processSyncQueue();
        }
      });
    }

    // Initial count fetch
    get().refreshPendingCount();
  },
}));
