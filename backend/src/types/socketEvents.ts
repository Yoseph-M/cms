/**
 * Socket Events Type Contract
 * 
 * Shared type definitions for Socket.IO events.
 * Frontend and backend must agree on these event shapes.
 */

import { OrderStatus, SettlementStatus, CancellationRequestStatus } from '@prisma/client';

// Base event types
export interface BaseEvent {
  timestamp: string;
}

// Order events
export interface OrderEvent extends BaseEvent {
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
    status: OrderStatus;
    settlementStatus: SettlementStatus;
  };
  actor?: {
    id: string;
    name: string;
  };
}

export interface NewOrderEvent extends OrderEvent {
  type: 'new';
  items: Array<{
    menuItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
  }>;
}

export interface UpdatedOrderEvent extends OrderEvent {
  type: 'updated';
  previousStatus?: OrderStatus;
}

export interface CancelledOrderEvent extends OrderEvent {
  type: 'cancelled';
  cancellationReason: string;
}

// Cancellation events
export interface CancellationRequestedEvent extends BaseEvent {
  request: {
    id: string;
    orderId: string;
    requestedBy: {
      id: string;
      name: string;
      role: string;
    };
    reason: string;
    status: CancellationRequestStatus;
    createdAt: string;
  };
  order: {
    id: string;
    clientOrderId: string;
    tableNumber: string;
    totalAmount: number;
  };
}

export interface CancellationApprovedEvent extends BaseEvent {
  request: {
    id: string;
    orderId: string;
    requestedBy: {
      id: string;
      name: string;
      role: string;
    };
    approvedBy: {
      id: string;
      name: string;
      role: string;
    };
    reason: string;
    status: CancellationRequestStatus;
    approvedAt: string;
  };
}

export interface CancellationRejectedEvent extends BaseEvent {
  request: {
    id: string;
    orderId: string;
    requestedBy: {
      id: string;
      name: string;
      role: string;
    };
    approvedBy: {
      id: string;
      name: string;
      role: string;
    };
    reason: string;
    rejectedReason: string;
    status: CancellationRequestStatus;
    approvedAt: string;
  };
}

// Settlement events
export interface SettlementEvent extends BaseEvent {
  settlement: {
    id: string;
    orderId: string;
    amountMinor: number;
    method: string;
    reference: string;
  };
  order: {
    id: string;
    totalAmount: number;
    settlementStatus: SettlementStatus;
  };
  recordedBy: {
    id: string;
    name: string;
  };
}

// Menu events
export interface MenuItemEvent extends BaseEvent {
  item: {
    id: string;
    name: string;
    category: string;
    price: number;
    isAvailable: boolean;
  };
  actor?: {
    id: string;
    name: string;
  };
}

// Notification events
export interface NotificationEvent extends BaseEvent {
  notification: {
    id: string;
    type: string;
    message: string;
    severity: string;
    relatedId?: string;
  };
  recipientRole?: string;
}

// Complete event union type
export type SocketEvent = 
  | NewOrderEvent
  | UpdatedOrderEvent
  | CancelledOrderEvent
  | CancellationRequestedEvent
  | CancellationApprovedEvent
  | CancellationRejectedEvent
  | SettlementEvent
  | MenuItemEvent
  | NotificationEvent;

// Event names
export type SocketEventName = 
  | 'order:new'
  | 'order:updated'
  | 'order:cancelled'
  | 'cancellation:requested'
  | 'cancellation:approved'
  | 'cancellation:rejected'
  | 'settlement:recorded'
  | 'menu:updated'
  | 'menu:availabilityChanged'
  | 'settings:cashierOrderingChanged'
  | 'printer:recovered'
  | 'printer:failed'
  | 'notification:new';

// Room names
export type SocketRoom = 
  | 'live-orders'
  | 'managers'
  | 'owners'
  | `order:${string}`
  | `user:${string}`;

// Helper type for event payloads
export interface EventPayload<T> {
  event: T;
  requestId?: string;
}