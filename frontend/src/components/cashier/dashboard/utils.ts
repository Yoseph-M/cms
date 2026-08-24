import type { Order, OrderStatus, PaymentMethod } from '../../../types';

export type OrderDisplayStatus = 'ready' | 'cooking' | 'paid' | 'cancelled';

export function getOrderStatus(order: Order): OrderDisplayStatus {
  if (order.status === 'PAID') return 'paid';
  if (order.status === 'CANCELLED') return 'cancelled';
  if (order.status === 'SERVED') return 'ready';
  return 'cooking';
}

export const STATUS_LABEL: Record<OrderDisplayStatus, string> = {
  ready: 'Ready to pay',
  cooking: 'In kitchen',
  paid: 'Settled',
  cancelled: 'Cancelled',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE: 'Mobile',
  NONE: 'Other',
};

export const METHOD_HOTKEY: Record<PaymentMethod, string> = {
  CASH: '1',
  CARD: '2',
  MOBILE: '3',
  NONE: '',
};

export const METHOD_ORDER: PaymentMethod[] = ['CASH', 'CARD', 'MOBILE'];

export function statusAccent(status: OrderDisplayStatus) {
  // Tailwind class bundle helpers — kept centralised so all panels stay in sync
  switch (status) {
    case 'ready':
      return {
        ring: 'ring-emerald-500/30',
        bar: 'bg-emerald-500',
        text: 'text-emerald-600',
        bg: 'from-emerald-500/10 to-emerald-500/0',
        badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
      };
    case 'cooking':
      return {
        ring: 'ring-sky-500/25',
        bar: 'bg-sky-500',
        text: 'text-sky-600',
        bg: 'from-sky-500/8 to-sky-500/0',
        badge: 'bg-sky-500/12 text-sky-700 border-sky-500/30',
      };
    case 'paid':
      return {
        ring: 'ring-slate-300',
        bar: 'bg-slate-400',
        text: 'text-slate-500',
        bg: 'from-slate-200/40 to-slate-200/0',
        badge: 'bg-slate-200 text-slate-600 border-slate-300',
      };
    case 'cancelled':
      return {
        ring: 'ring-rose-300',
        bar: 'bg-rose-500',
        text: 'text-rose-600',
        bg: 'from-rose-500/8 to-rose-500/0',
        badge: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
      };
  }
}
