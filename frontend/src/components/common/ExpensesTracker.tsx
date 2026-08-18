import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Sheet } from '../ui/Sheet';
import { AlertDialog } from '../ui/AlertDialog';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';

type ExpenseCategory =
  | 'RENT'
  | 'UTILITIES'
  | 'SUPPLIES'
  | 'MAINTENANCE'
  | 'PAYROLL'
  | 'OTHER';

interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  date: string;
  recordedBy: { id: string; name: string };
  createdAt: string;
}

const CATEGORIES: ExpenseCategory[] = [
  'RENT',
  'UTILITIES',
  'SUPPLIES',
  'MAINTENANCE',
  'PAYROLL',
  'OTHER',
];

const CATEGORY_BADGE: Record<
  ExpenseCategory,
  'default' | 'success' | 'warning' | 'neutral' | 'secondary' | 'outline'
> = {
  RENT: 'default',
  UTILITIES: 'secondary',
  SUPPLIES: 'success',
  MAINTENANCE: 'warning',
  PAYROLL: 'neutral',
  OTHER: 'outline',
};

const EMPTY_FORM = {
  category: 'SUPPLIES' as ExpenseCategory,
  amount: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
};

function toDateInputValue(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const ExpensesTracker: React.FC = () => {
  const { t } = useTranslation('manager');
  const { addToast } = useToastStore();

  const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
    RENT: t('expenses.categories.rent', { defaultValue: 'Rent' }),
    UTILITIES: t('expenses.categories.utilities', { defaultValue: 'Utilities' }),
    SUPPLIES: t('expenses.categories.supplies', { defaultValue: 'Supplies' }),
    MAINTENANCE: t('expenses.categories.maintenance', { defaultValue: 'Maintenance' }),
    PAYROLL: t('expenses.categories.payroll', { defaultValue: 'Payroll' }),
    OTHER: t('expenses.categories.other', { defaultValue: 'Other' }),
  };

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (categoryFilter) params.category = categoryFilter;
      const res = await axiosClient.get('/expenses', { params });
      setExpenses(res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, t('expenses.toasts.loadFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [from, to, categoryFilter, t]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setSheetOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({
      category: expense.category,
      amount: String(expense.amount / 100), // Convert cents to dollars for display
      description: expense.description,
      date: toDateInputValue(expense.date),
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount || !form.date) {
      addToast({ type: 'error', title: t('expenses.toasts.validationError', { defaultValue: 'Category, amount, description, and date are required.' }) });
      return;
    }
    const amountDollars = parseFloat(form.amount);
    if (!Number.isFinite(amountDollars) || amountDollars < 0) {
      addToast({ type: 'error', title: t('expenses.toasts.amountError', { defaultValue: 'Amount must be a non-negative number.' }) });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        category: form.category,
        amount: Math.round(amountDollars * 100), // Convert dollars to cents
        description: form.description.trim(),
        date: form.date,
      };
      if (editing) {
        await axiosClient.patch(`/expenses/${editing.id}`, payload);
        addToast({ type: 'success', title: t('expenses.toasts.updated', { defaultValue: 'Expense updated' }) });
      } else {
        await axiosClient.post('/expenses', payload);
        addToast({ type: 'success', title: t('expenses.toasts.recorded', { defaultValue: 'Expense recorded' }) });
      }
      setSheetOpen(false);
      setEditing(null);
      fetchExpenses();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: editing 
          ? t('expenses.toasts.updateFailed', { defaultValue: 'Update failed' }) 
          : t('expenses.toasts.recordFailed', { defaultValue: 'Could not record expense' }),
        message: extractErrorMessage(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await axiosClient.delete(`/expenses/${deleteTarget.id}`);
      addToast({ type: 'success', title: t('expenses.toasts.deleted', { defaultValue: 'Expense deleted' }) });
      setDeleteTarget(null);
      fetchExpenses();
    } catch (err: any) {
      addToast({ 
        type: 'error', 
        title: t('expenses.toasts.deleteFailed', { defaultValue: 'Delete failed' }), 
        message: extractErrorMessage(err) 
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              {t('expenses.title', { defaultValue: 'Expenses' })}
            </CardTitle>
            <Button id="add-expense-btn" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />{t('expenses.addExpense', { defaultValue: 'Add Expense' })}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="sm:w-44">
              <label htmlFor="expense-category-filter" className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t('expenses.filters.category', { defaultValue: 'Category' })}
              </label>
              <Select
                id="expense-category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">{t('expenses.filters.allCategories', { defaultValue: 'All categories' })}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <label htmlFor="expense-from" className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t('expenses.filters.from', { defaultValue: 'From' })}
              </label>
              <Input
                id="expense-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="expense-to" className="text-xs font-medium text-muted-foreground block mb-1.5">
                {t('expenses.filters.to', { defaultValue: 'To' })}
              </label>
              <Input
                id="expense-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchExpenses}>
                {t('expenses.retry', { defaultValue: 'Retry' })}
              </Button>
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{t('expenses.emptyTitle', { defaultValue: 'No expenses recorded yet.' })}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold">
                    <th className="px-4 py-3 text-left font-semibold">{t('expenses.table.date', { defaultValue: 'Date' })}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('expenses.table.category', { defaultValue: 'Category' })}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('expenses.table.description', { defaultValue: 'Description' })}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t('expenses.table.amount', { defaultValue: 'Amount' })}</th>
                    <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">{t('expenses.table.recordedBy', { defaultValue: 'Recorded By' })}</th>
                    <th className="px-4 py-3 text-right font-semibold w-24"> </th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(expense.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={CATEGORY_BADGE[expense.category]}>
                          {CATEGORY_LABELS[expense.category]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[16rem] truncate">
                        {expense.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                        {expense.recordedBy?.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Edit expense"
                            onClick={() => openEdit(expense)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete expense"
                            onClick={() => setDeleteTarget(expense)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? t('expenses.editExpense', { defaultValue: 'Edit Expense' }) : t('expenses.addExpense', { defaultValue: 'Add Expense' })}
        description={editing ? t('expenses.editDescription', { defaultValue: 'Update this expense record.' }) : t('expenses.addDescription', { defaultValue: 'Record a new business expense.' })}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSheetOpen(false)} className="flex-1">
              {t('expenses.form.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.description.trim() || !form.amount || !form.date}
              className="flex-1"
            >
              {isSaving ? t('expenses.form.saving', { defaultValue: 'Saving...' }) : editing ? t('expenses.form.saveChanges', { defaultValue: 'Save Changes' }) : t('expenses.form.addExpense', { defaultValue: 'Add Expense' })}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="expense-category" className="text-sm font-medium text-foreground block mb-1.5">
              {t('expenses.form.category', { defaultValue: 'Category' })} <span className="text-destructive">*</span>
            </label>
            <Select
              id="expense-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="expense-amount" className="text-sm font-medium text-foreground block mb-1.5">
              {t('expenses.form.amount', { defaultValue: 'Amount (ETB)' })} <span className="text-destructive">*</span>
            </label>
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder={t('expenses.form.amountPlaceholder', { defaultValue: '0.00' })}
              className="font-mono"
            />
          </div>

          <div>
            <label htmlFor="expense-description" className="text-sm font-medium text-foreground block mb-1.5">
              {t('expenses.form.description', { defaultValue: 'Description' })} <span className="text-destructive">*</span>
            </label>
            <Input
              id="expense-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('expenses.form.descriptionPlaceholder', { defaultValue: 'e.g. Monthly electricity bill' })}
            />
          </div>

          <div>
            <label htmlFor="expense-date" className="text-sm font-medium text-foreground block mb-1.5">
              {t('expenses.form.date', { defaultValue: 'Date' })} <span className="text-destructive">*</span>
            </label>
            <Input
              id="expense-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? t('expenses.delete.title', { defaultValue: `Delete “${deleteTarget.description}”?`, description: deleteTarget.description }) : ''}
        description={t('expenses.delete.description', { defaultValue: "This can't be undone." })}
        confirmText={t('expenses.delete.confirm', { defaultValue: 'Delete Expense' })}
        tone="destructive"
        loading={isDeleting}
      />
    </div>
  );
};
