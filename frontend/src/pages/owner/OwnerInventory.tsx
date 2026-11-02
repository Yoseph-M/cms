import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, History } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useHeaderStore } from '../../store/headerStore';
import { useToastStore } from '../../store/toastStore';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Sheet } from '../../components/ui/Sheet';
import { formatCurrency } from '../../utils/currency';

type InventoryItem = {
  id: string;
  name: string;
  nameAmharic?: string | null;
  sku?: string | null;
  barcode?: string | null;
  cost?: number | null;
  stockQuantity?: number | null;
  lowStockThreshold?: number | null;
};

type StockMovement = {
  id: string;
  menuItemId: string;
  delta: number;
  reason: string;
  reference?: string | null;
  createdAt: string;
  menuItem: { name: string; nameAmharic?: string | null };
};

export const OwnerInventory: React.FC = () => {
  const { t } = useTranslation();
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [reason, setReason] = useState<'RECEIVING' | 'ADJUSTMENT' | 'RETURN'>('RECEIVING');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    setPageTitle({ title: t('inventory.title'), subtitle: t('inventory.subtitle') });
    setShowDateRange(false);
    return () => { setPageTitle({ title: 'Overview', subtitle: '' }); setShowDateRange(false); };
  }, [setPageTitle, setShowDateRange, t]);

  const itemsQuery = useQuery({
    queryKey: ['inventory', 'items'],
    queryFn: async () => (await axiosClient.get<InventoryItem[]>('/inventory')).data,
  });
  const movementQuery = useQuery({
    queryKey: ['inventory', 'movements'],
    queryFn: async () => (await axiosClient.get<StockMovement[]>('/inventory/movements')).data,
  });
  const items = itemsQuery.data ?? [];
  const lowItems = useMemo(() => items.filter((item) => (item.stockQuantity ?? 0) <= (item.lowStockThreshold ?? 5)), [items]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select an item first.');
      const entered = Number(quantity);
      if (!Number.isInteger(entered) || entered === 0) throw new Error(t('inventory.validQuantity'));
      if (reason !== 'ADJUSTMENT' && entered < 0) throw new Error(t('inventory.positiveQuantity'));
      return axiosClient.post(`/inventory/${selected.id}/adjustments`, {
        delta: entered,
        reason,
        reference: reference.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['menu'] }),
      ]);
      setSelected(null); setQuantity(''); setReference('');
      addToast({ type: 'success', title: t('inventory.saved') });
    },
    onError: (error: unknown) => addToast({ type: 'error', title: t('inventory.saveFailed'), message: error instanceof Error ? error.message : t('inventory.saveFailed') }),
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 tablet-portrait:grid-cols-2">
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Boxes className="h-5 w-5" /></span>
          <div><p className="text-2xl font-bold">{items.length}</p><p className="text-sm text-muted-foreground">{t('inventory.trackedItems')}</p></div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning/10 text-warning"><AlertTriangle className="h-5 w-5" /></span>
          <div><p className="text-2xl font-bold">{lowItems.length}</p><p className="text-sm text-muted-foreground">{t('inventory.lowStock')}</p></div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="font-semibold">{t('inventory.stockLevels')}</h2>
        </div>
        {itemsQuery.isLoading ? <p className="p-5 text-sm text-muted-foreground">{t('loading')}</p> : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('inventory.empty')}</p>
        ) : <div className="divide-y divide-border/60">
          {items.map((item) => {
            const qty = item.stockQuantity ?? 0;
            const low = qty <= (item.lowStockThreshold ?? 5);
            return <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.sku || item.barcode || t('inventory.noSku')}</p>
              </div>
              <Badge variant={low ? 'warning' : 'success'}>{t('inventory.units', { count: qty })}</Badge>
              {item.cost != null && <span className="hidden text-xs text-muted-foreground sm:block">{t('inventory.unitCost', { amount: formatCurrency(item.cost) })}</span>}
              <Button size="sm" variant="outline" onClick={() => { setSelected(item); setReason('RECEIVING'); setQuantity(''); setReference(''); }}>
                <ArrowDownToLine className="mr-1.5 h-4 w-4" />{t('inventory.receive')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(item); setReason('ADJUSTMENT'); setQuantity(''); setReference(''); }} aria-label={t('inventory.adjust')}>
                <ArrowUpFromLine className="h-4 w-4" />
              </Button>
            </div>;
          })}
        </div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
          <History className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">{t('inventory.recentMovements')}</h2>
        </div>
        {movementQuery.data?.length ? <div className="divide-y divide-border/60">
          {movementQuery.data.map((movement) => <div key={movement.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{movement.menuItem.name}</span>
            <Badge variant={movement.delta > 0 ? 'success' : 'neutral'}>{movement.delta > 0 ? '+' : ''}{movement.delta}</Badge>
            <span className="text-muted-foreground">{t(`inventory.reasons.${movement.reason}`, { defaultValue: movement.reason })}</span>
            <time className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString()}</time>
          </div>)}
        </div> : <p className="p-5 text-sm text-muted-foreground">{t('inventory.noMovements')}</p>}
      </Card>

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title={t('inventory.adjustTitle')} description={selected?.name} footer={
        <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>{t('buttons.cancel')}</Button><Button className="flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? t('buttons.working') : t('buttons.save')}</Button></div>
      }>
        <div className="space-y-4">
          <label className="block text-sm font-medium">{t('inventory.movementType')}
            <Select className="mt-1.5" value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
              <option value="RECEIVING">{t('inventory.reasons.RECEIVING')}</option><option value="RETURN">{t('inventory.reasons.RETURN')}</option><option value="ADJUSTMENT">{t('inventory.reasons.ADJUSTMENT')}</option>
            </Select>
          </label>
          <label className="block text-sm font-medium">{t('inventory.quantityChange')}
            <Input className="mt-1.5" type="number" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={reason === 'ADJUSTMENT' ? '-2 or 3' : '3'} />
          </label>
          <label className="block text-sm font-medium">{t('inventory.referenceOptional')}
            <Input className="mt-1.5" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t('inventory.referencePlaceholder')} />
          </label>
        </div>
      </Sheet>
    </div>
  );
};

export default OwnerInventory;
