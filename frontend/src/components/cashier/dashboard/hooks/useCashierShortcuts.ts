import { useEffect } from 'react';
import type { Order, PaymentMethod } from '../../../../types';

export interface CashierShortcutsOptions {
  enabled: boolean;
  orders: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSettle: (id: string) => void;
  onCancel: () => void;
  onMethodChange: (method: PaymentMethod) => void;
  onClearSelection: () => void;
  cardFocus: (id: string) => void;
  method: PaymentMethod;
  isSettling: boolean;
}

/**
 * Global keyboard handler for the cashier workspace.
 * Centralised so the orchestrator stays clean.
 *
 * Bindings (only when not typing in a form field):
 *  - ↑ / k        Move selection up
 *  - ↓ / j        Move selection down
 *  - 1 / 2 / 3    Cash / Card / Mobile
 *  - ↵            Settle selected order
 *  - Esc          Clear selection / close panel
 */
export function useCashierShortcuts({
  enabled,
  orders,
  selectedId,
  onSelect,
  onSettle,
  onCancel,
  onMethodChange,
  onClearSelection,
  cardFocus,
  isSettling,
}: CashierShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inForm =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (inForm) return; // let inputs handle their own escape
        e.preventDefault();
        onClearSelection();
        return;
      }

      if (inForm) return;

      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        moveSelection(orders, selectedId, 1, onSelect, cardFocus);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        moveSelection(orders, selectedId, -1, onSelect, cardFocus);
        return;
      }

      const selected = orders.find((o) => o.id === selectedId);
      if (!selected || selected.status === 'PAID' || selected.status === 'CANCELLED') return;

      if (e.key === '1') {
        e.preventDefault();
        onMethodChange('CASH');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        onMethodChange('CARD');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        onMethodChange('MOBILE');
        return;
      }
      if (e.key === 'Enter') {
        if (isSettling) return;
        e.preventDefault();
        onSettle(selectedId as string);
        return;
      }
      // Shift+Backspace as a "void this ticket" accelerator (subtle, not discoverable)
      if ((e.key === 'Backspace' || e.key === 'Delete') && e.shiftKey) {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, orders, selectedId, onSelect, onSettle, onCancel, onMethodChange, onClearSelection, cardFocus, isSettling]);
}

function moveSelection(
  orders: Order[],
  selectedId: string | null,
  delta: 1 | -1,
  onSelect: (id: string) => void,
  cardFocus: (id: string) => void,
) {
  if (orders.length === 0) return;
  const currentIdx = selectedId
    ? orders.findIndex((o) => o.id === selectedId)
    : -1;
  const nextIdx =
    currentIdx < 0
      ? 0
      : (currentIdx + delta + orders.length) % orders.length;
  const next = orders[nextIdx];
  if (!next) return;
  onSelect(next.id);
  // focus happens after render — request a frame
  requestAnimationFrame(() => cardFocus(next.id));
}
