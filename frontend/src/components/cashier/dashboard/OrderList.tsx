import React from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Inbox, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Order } from '../../../types';
import { OrderCard } from './OrderCard';
import { EmptyState } from '../../common/EmptyState';
import { LoadingState } from '../../common/LoadingState';
import { ErrorState } from '../../common/ErrorState';
import { getOrderStatus } from './utils';

export interface OrderListProps { orders: Order[]; selectedId: string | null; isLoading: boolean; error: string | null; hasAnyOrders: boolean; cardRef: (id: string, node: HTMLDivElement | null) => void; onSelect: (id: string) => void; onRetry: () => void; searchActive: boolean; selectMode?: boolean; bulkSelectedIds?: Set<string>; onToggleSelect?: (id: string) => void; }

export const OrderList: React.FC<OrderListProps> = (props) => {
  const { orders, selectedId, isLoading, error, hasAnyOrders, cardRef, onSelect, onRetry, searchActive, selectMode, bulkSelectedIds, onToggleSelect } = props;
  const { t } = useTranslation('cashier');
  const ready = orders.filter((order) => getOrderStatus(order) === 'ready');
  const working = orders.filter((order) => getOrderStatus(order) === 'cooking');
  if (isLoading) return <div className="flex-1"><LoadingState message={t('queue.loadingQueue')} /></div>;
  if (error) return <div className="flex-1"><ErrorState message={error} onRetry={onRetry} /></div>;
  if (!orders.length) return <div className="flex-1"><EmptyState icon={hasAnyOrders ? <Search className="w-7 h-7" /> : <Inbox className="w-7 h-7" />} title={hasAnyOrders ? 'No tickets found' : 'The queue is clear'} message={hasAnyOrders ? 'Try another search.' : 'New tickets will arrive here automatically.'} /></div>;
  const sectionProps = { selectedId, cardRef, onSelect, selectMode, bulkSelectedIds, onToggleSelect };
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 pb-28">
      <LayoutGroup>
        <QueueSection title="Ready to collect" caption="Payment can be taken now" count={ready.length} tone="ready" orders={ready} {...sectionProps} />
        <QueueSection title="In progress" caption="Still being prepared" count={working.length} tone="working" orders={working} {...sectionProps} />
      </LayoutGroup>
    </div>
  );
};

const QueueSection: React.FC<{ title: string; caption: string; count: number; tone: 'ready' | 'working'; orders: Order[]; selectedId: string | null; cardRef: OrderListProps['cardRef']; onSelect: OrderListProps['onSelect']; selectMode?: boolean; bulkSelectedIds?: Set<string>; onToggleSelect?: (id: string) => void }> = ({ title, caption, count, tone, orders, selectedId, cardRef, onSelect, selectMode, bulkSelectedIds, onToggleSelect }) => (
  <section className={cn('mb-7 last:mb-0', !orders.length && 'hidden')}>
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5"><span className={cn('h-2.5 w-2.5 rounded-full', tone === 'ready' ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]' : 'bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.10)]')} /><div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="text-[11px] text-slate-500">{caption}</p></div></div>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">{count}</span>
    </div>
    <motion.ul layout className="grid gap-3 md:grid-cols-2" aria-label={title}>
      <AnimatePresence initial={false} mode="popLayout">
        {orders.map((order, index) => <motion.li layout key={order.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: Math.min(index * 0.035, 0.18) }} className="list-none"><OrderCard order={order} isSelected={order.id === selectedId} onClick={() => (selectMode && onToggleSelect ? onToggleSelect(order.id) : onSelect(order.id))} selectMode={selectMode} bulkSelected={bulkSelectedIds?.has(order.id)} cardRef={(node) => cardRef(order.id, node)} /></motion.li>)}
      </AnimatePresence>
    </motion.ul>
  </section>
);

function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(' '); }
