import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { CalendarDays, FilterX, Pencil, Plus, ReceiptText, Tag, Trash2, Wallet } from 'lucide-react';
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

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div className="rounded-2xl border border-border/50 bg-card px-4 py-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.25)] sm:px-5">
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-secondary ${accent}`}>{icon}</span>
      {label}
    </div>
    <p className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{value}</p>
  </div>
);

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

  const totalSpent = useMemo(
    () => expenses.reduce((total, expense) => total + expense.amount, 0),
    [expenses],
  );
  const categoryCount = useMemo(
    () => new Set(expenses.map((expense) => expense.category)).size,
    [expenses],
  );
  const hasFilters = Boolean(categoryFilter || from || to);

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

  const clearFilters = () => {
    setCategoryFilter('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('expenses.title', { defaultValue: 'Expenses' })}</h1>
        <Button id="add-expense-btn" onClick={openCreate}>
          <Plus className="w-4 h-4" />{t('expenses.addExpense', { defaultValue: 'Add Expense' })}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label="Total in view" value={formatCurrency(totalSpent)} accent="text-primary" />
        <SummaryCard icon={<ReceiptText className="h-4 w-4" />} label="Expense records" value={String(expenses.length)} accent="text-sky-600" />
        <SummaryCard icon={<Tag className="h-4 w-4" />} label="Categories used" value={String(categoryCount)} accent="text-violet-600" />
      </div>

      <Card className="overflow-hidden hover:translate-y-0">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-bold">Find expense records</CardTitle>
            <p className="text-sm text-muted-foreground">Filter by category or date range. Results update automatically.</p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
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
            <div>
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
            <div>
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
            <div className="flex gap-2">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <FilterX className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden hover:translate-y-0">
        <CardHeader className="flex-row items-center justify-between border-b border-border/50 py-4">
          <div>
            <CardTitle className="text-base">Expense activity</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{isLoading ? 'Loading records…' : `${expenses.length} record${expenses.length === 1 ? '' : 's'} shown`}</p>
          </div>
          {hasFilters && <Badge variant="secondary">Filtered view</Badge>}
        </CardHeader>
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
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                <Wallet className="w-6 h-6 opacity-60" />
              </div>
              <p className="font-medium text-foreground">{hasFilters ? 'No records match these filters.' : t('expenses.emptyTitle', { defaultValue: 'No expenses recorded yet.' })}</p>
              <p className="mt-1 text-sm">{hasFilters ? 'Clear or adjust the filters to see more records.' : 'Add the first one to begin tracking business spending.'}</p>
              {hasFilters ? <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Clear filters</Button> : <Button size="sm" className="mt-4" onClick={openCreate}><Plus className="h-3.5 w-3.5" />Add expense</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-muted-foreground text-xs font-semibold">
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
                      className="border-b border-border/50 last:border-0 hover:bg-primary/[0.035] transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(expense.date).toLocaleDateString()}
                        </div>
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
