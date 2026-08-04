import { openDB } from 'idb';

const DB_NAME = 'mern_pos_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_orders';

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'clientOrderId' });
      }
    },
  });
}

export async function saveOfflineOrder(orderPayload: {
  clientOrderId: string;
  tableNumber: string;
  items: Array<{ menuItemId: string; name: string; unitPrice: number; quantity: number; notes?: string }>;
  createdAt?: string;
}) {
  const db = await getDb();
  await db.put(STORE_NAME, {
    ...orderPayload,
    status: 'SUBMITTED',
    isPendingSync: true,
    createdAt: orderPayload.createdAt || new Date().toISOString(),
  });
}

export async function getPendingOfflineOrders() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function removeOfflineOrder(clientOrderId: string) {
  const db = await getDb();
  await db.delete(STORE_NAME, clientOrderId);
}

export async function clearOfflineOrders() {
  const db = await getDb();
  await db.clear(STORE_NAME);
}
