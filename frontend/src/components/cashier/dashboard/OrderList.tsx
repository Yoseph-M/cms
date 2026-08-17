import React from 'react';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { Inbox, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Order } from '../../../types';
import { OrderCard } from './OrderCard';
import { EmptyState } from '../../common/EmptyState';
import { LoadingState } from '../../common/LoadingState';
import { ErrorState } from '../../common/ErrorState';

export interface OrderListProps {
  orders: Order[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  hasAnyOrders: boolean;
  cardRef: (id: string, node: HTMLDivElement | null) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  searchActive: boolean;
}

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  selectedId,
  isLoading,
  error,
  hasAnyOrders,
  cardRef,
  onSelect,
  onRetry,
  searchActive,
}) => {
  const { t } = useTranslation('cashier');
  return (
    <div className="flex-1 overflow-y-auto px-6 pb-6">
      {isLoading ? (
        <LoadingState message={t('queue.loadingQueue')} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <LayoutGroup>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isSelected={order.id === selectedId}
                  onClick={() => onSelect(order.id)}
                  cardRef={(node) => cardRef(order.id, node)}
                />
              ))}
            </AnimatePresence>
          </div>
          {orders.length === 0 && (
            <EmptyState
              icon={hasAnyOrders ? <Search className="w-7 h-7" /> : <Inbox className="w-7 h-7" />}
              title={hasAnyOrders ? 'No matches' : t('queue.noActiveOrders', { defaultValue: 'No active orders' })}
              message={hasAnyOrders
                ? 'Try a different filter or search term.'
                : t('queue.noActiveOrdersMsg', { defaultValue: 'New tickets will show up here automatically.' })}
            />
          )}
        </LayoutGroup>
      )}
    </div>
  );
};
