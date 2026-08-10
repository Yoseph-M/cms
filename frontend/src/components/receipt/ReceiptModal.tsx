import React from 'react';
import { Order } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { Printer, X, CheckCircle, Clock } from 'lucide-react';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';

interface ReceiptModalProps {
  order: Order | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ order, onClose }) => {
  const footerQuery = useSystemSettingQuery('receiptFooter');
  const logoQuery = useSystemSettingQuery('receiptLogo');
  if (!order) return null;

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in print:p-0 print:bg-white print:static"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card text-card-foreground border border-border w-full max-w-md rounded-2xl shadow-2xl relative overflow-hidden font-mono text-sm print:shadow-none print:w-full print:max-w-none print:rounded-none print:border-0 animate-scale-in"
      >
        {/* Modal chrome — only visible on screen, hidden on print */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/40 print:hidden">
          <div>
            <h3 className="font-sans text-sm font-semibold text-foreground">Customer Receipt</h3>
            <p className="font-sans text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBrowserPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-sans text-xs font-semibold transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable receipt body */}
        <div className="p-6 print:p-4">
          <div className="text-center space-y-1 mb-4">
            {logoQuery.data?.value && logoQuery.data.value.trim() && (
              <img src={logoQuery.data.value} alt="Business logo" className="mx-auto mb-2 max-h-16 max-w-36 object-contain" />
            )}
            <h2 className="text-lg font-extrabold tracking-tight uppercase text-foreground">
              Enterprise POS Restaurant
            </h2>
            <p className="text-xs text-muted-foreground">123 Culinary Boulevard, Suite 100</p>
            <p className="text-xs text-muted-foreground">Tel: +1 (555) 019-2831</p>
            <div
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 mt-2 rounded-full text-xs font-bold font-sans ${
                order.isPaid
                  ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                  : 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {order.isPaid ? 'PAID IN FULL' : 'UNPAID ORDER'}
            </div>
          </div>

          <div className="border-t border-b border-dashed border-border py-3 my-3 text-xs space-y-1.5">
            <Row label="Order ID" value={`#${order.clientOrderId.slice(0, 8)}`} mono />
            <Row label="Table" value={`#${order.tableNumber}`} mono />
            <Row label="Waiter" value={order.waiter?.name || '—'} />
            <Row label="Cashier" value={order.cashier?.name || '—'} />
            <Row label="Date/Time" value={new Date(order.createdAt).toLocaleString()} />
            <Row label="Payment" value={order.paymentMethod} mono />
          </div>

          <div className="my-4">
            <div className="flex justify-between text-xs font-bold border-b border-border pb-1 mb-2 uppercase tracking-wider">
              <span>Qty · Item</span>
              <span>Amount</span>
            </div>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <div className="pr-2">
                    <span className="font-bold mr-2">{item.quantity}x</span>
                    <span>{item.name}</span>
                    {item.notes && (
                      <p className="text-[10px] text-muted-foreground italic">Note: {item.notes}</p>
                    )}
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-4">
            <div className="flex justify-between font-extrabold text-base pt-1">
              <span className="uppercase tracking-wider">Total</span>
              <span className="text-[hsl(var(--success))] tabular-nums">
                {formatCurrency(order.totalAmount)}
              </span>
            </div>
          </div>

          <div className="mt-6 text-center text-[11px] text-muted-foreground space-y-0.5">
            <p className="font-semibold text-foreground">{footerQuery.data?.value?.trim() || 'Thank you for dining with us!'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={mono ? 'font-bold tabular-nums' : ''}>{value}</span>
  </div>
);
