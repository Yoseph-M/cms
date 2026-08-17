import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, StickyNote } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatCurrency } from '../../../utils/currency';
import type { OrderItem } from '../../../types';

export interface OrderItemsListProps {
  items: OrderItem[];
  className?: string;
  /** Cap at N items; show "+X more" for the rest. Default: no cap. */
  maxVisible?: number;
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({ items, className, maxVisible }) => {
  const safeItems = items || [];
  const visible = maxVisible ? safeItems.slice(0, maxVisible) : safeItems;
  const hiddenCount = safeItems.length - visible.length;

  return (
    <ul className={cn('space-y-1', className)} aria-label="Order items">
      {visible.map((item, idx) => (
        <motion.li
          key={`${item.menuItemId}-${idx}`}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.02 }}
          className="flex justify-between items-start gap-3 py-2 border-b border-border/40 last:border-0"
        >
          <div className="flex gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-display font-bold text-xs shrink-0 tabular-nums">
              {item.quantity}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground text-sm leading-snug truncate">
                {item.name}
              </p>
              {item.notes && (
                <p className="text-muted-foreground italic text-[11px] mt-0.5 leading-snug flex items-start gap-1">
                  <MessageSquare className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{item.notes}</span>
                </p>
              )}
            </div>
          </div>
          <span className="font-mono font-semibold text-foreground tabular-nums text-sm shrink-0">
            {formatCurrency(item.unitPrice * item.quantity)}
          </span>
        </motion.li>
      ))}
      {hiddenCount > 0 && (
        <li className="text-[11px] text-muted-foreground text-center py-1.5 flex items-center justify-center gap-1.5">
          <StickyNote className="w-3 h-3" />
          +{hiddenCount} more item{hiddenCount === 1 ? '' : 's'} — scroll to see all
        </li>
      )}
    </ul>
  );
};
