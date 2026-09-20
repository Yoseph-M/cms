import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { DropdownSelect } from '../ui/DropdownSelect';
import { Sheet } from '../ui/Sheet';
import { AlertDialog } from '../ui/AlertDialog';
import { CalendarDays, FilterX, Pencil, Plus, ReceiptText, Tag, Trash2, Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { extractErrorMessage } from '../../utils/errorHandler';
import { usePayrollQuery } from '../../hooks/useCachedQueries';
import { groupPayrollByMonth, type PayrollLedgerRecord } from './PayrollHistoryCard';

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
  recordedBy: { id: string; name: string } | null;
  createdAt?: string;
  /** Derived, read-only row (a payroll summary) rather than a stored record. */
  isAggregated?: boolean;
  /** Full payroll total behind the payroll row's average, shown on hover. */
  payrollTotal?: number;
  payrollMonths?: number;
  /** Label for the row badge — "Monthly average" when omitted. */
  payrollLabel?: string;
}

const CATEGORIES: ExpenseCategory[] = [
  'RENT',
  'UTILITIES',
  'SUPPLIES',
  'MAINTENANCE',
  'PAYROLL',
  'OTHER',
];

/**
 * Payroll is written straight from the payroll ledger, so it is filtered for on
 * but never entered (or edited) by hand — that keeps payroll out of the books
 * exactly once.
 */
const MANUAL_CATEGORIES = CATEGORIES.filter((c) => c !== 'PAYROLL');

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

  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const queryClient = useQueryClient();

  // Cached per-filter query: switching tabs/pages and coming back renders the
  // cached records instantly instead of re-fetching the whole list.
  const { data: expenses = [], isLoading, error: queryError, refetch } = useQuery<Expense[]>({
    queryKey: ['expenses', categoryFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (categoryFilter) params.category = categoryFilter;
      const res = await axiosClient.get('/expenses', { params });
      return res.data;
    },
    staleTime: 60_000,
  });
  const error = queryError
    ? extractErrorMessage(queryError, t('expenses.toasts.loadFailed', { defaultValue: 'Failed to load expenses.' }))
    : null;

  // After create/update/delete, invalidate so the list refreshes from the server.
  const refreshExpenses = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
  }, [queryClient]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Full payroll ledger (all months, with corrections) for the payroll table row.
  const payrollQuery = usePayrollQuery();
  const payrollLedger: PayrollLedgerRecord[] = useMemo(
    () => (Array.isArray(payrollQuery.data) ? (payrollQuery.data as PayrollLedgerRecord[]) : []),
    [payrollQuery.data],
  );

  /**
   * Payroll is derived from the payroll ledger, never hand-entered.
   *
   *  - With no filter (All categories), payroll shows as one average row so the
   *    headline totals include it without burying the list in per-staff lines.
   *  - Filtering by a specific category (including PAYROLL) also shows the
   *    average row for consistency — the same view as All categories.
   */
  const payrollExpenseRows = useMemo<Expense[]>(() => {
    const months = groupPayrollByMonth(payrollLedger);
    if (months.length === 0) return [];

    // Another category is selected — payroll has no row to contribute.
    if (categoryFilter && categoryFilter !== 'PAYROLL') return [];

    // Show the same average row for both "All categories" and "PAYROLL" filter
    // so the view is consistent regardless of which filter is active.
    const total = months.reduce((sum, month) => sum + month.total, 0);
    const paymentDates = months.flatMap((month) => month.payments.map((p) => p.createdAt));
    const latestPaidAt = paymentDates.length
      ? paymentDates.reduce((newest, iso) => (new Date(iso) > new Date(newest) ? iso : newest))
      : `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01T00:00:00.000Z`;

    return [
      {
        id: 'payroll-average',
        category: 'PAYROLL',
        amount: Math.round(total / months.length),
        description: `Average monthly payroll — ${months.length} ${
          months.length === 1 ? 'month' : 'months'
        }`,
        date: latestPaidAt,
        recordedBy: null,
        isAggregated: true,
        payrollTotal: total,
        payrollMonths: months.length,
      },
    ];
  }, [payrollLedger, categoryFilter]);

  /**
   * What the table lists: the stored expense records plus the payroll rows,
   * newest first. The headline numbers come from these rows, so what is on
   * screen always adds up.
   */
  const tableExpenses = useMemo(() => {
    const rows = [
      ...expenses.filter((expense) => !expense.isAggregated),
      ...payrollExpenseRows,
    ];
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, payrollExpenseRows]);

  const totalSpent = useMemo(
    () => tableExpenses.reduce((total, expense) => total + expense.amount, 0),
    [tableExpenses],
  );
  const recordCount = tableExpenses.length;
  const categoryCount = useMemo(
    () => new Set(tableExpenses.map((expense) => expense.category)).size,
    [tableExpenses],
  );
  const hasFilters = Boolean(categoryFilter);



  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setSheetOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({
      category: expense.category,
      amount: String(expense.amount),
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
        amount: amountDollars,
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
      refreshExpenses();
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
      refreshExpenses();
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
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      <div className="flex items-center justify-between max-[767px]:flex-col max-[767px]:items-start max-[767px]:gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('expenses.title', { defaultValue: 'Expenses' })}</h1>
        <Button id="add-expense-btn" onClick={openCreate}>
          <Plus className="w-4 h-4" />{t('expenses.addExpense', { defaultValue: 'Add Expense' })}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <SummaryCard icon={<Wallet className="h-4 w-4" />} label={t('expenses.totalInView', { defaultValue: 'Total in view' })} value={formatCurrency(totalSpent)} accent="text-primary" />
        <SummaryCard icon={<ReceiptText className="h-4 w-4" />} label={t('expenses.recordCount', { defaultValue: 'Expense records' })} value={String(recordCount)} accent="text-sky-600" />
        <SummaryCard icon={<Tag className="h-4 w-4" />} label={t('expenses.categoriesUsed', { defaultValue: 'Categories used' })} value={String(categoryCount)} accent="text-violet-600" />
      </div>

      <Card className="overflow-hidden hover:translate-y-0">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border/50 py-4">
          <div className="min-w-0">
            <CardTitle className="text-base">{t('expenses.activityTitle')}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading
                ? 'Loading records…'
                : `${tableExpenses.length} record${tableExpenses.length === 1 ? '' : 's'} shown`}
              {categoryFilter
                ? ' · filtered by category'
                : ' · payroll appears as one average row'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && <Badge variant="secondary">{t('expenses.filteredView')}</Badge>}
            <DropdownSelect
              ariaLabel={t('expenses.filters.category', { defaultValue: 'Category' })}
              icon={Tag}
              size="sm"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                {
                  value: '',
                  label: t('expenses.filters.allCategories', { defaultValue: 'All categories' }),
                },
                ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
              ]}
              contentClassName="w-48"
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} aria-label={t('expenses.clearFilters')}>
                <FilterX className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
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
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                {t('expenses.retry', { defaultValue: 'Retry' })}
              </Button>
            </div>
          ) : tableExpenses.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                <Wallet className="w-6 h-6 opacity-60" />
              </div>
              {categoryFilter === 'PAYROLL' ? (
                <>
                  <p className="font-medium text-foreground">{t('expenses.noPayrollYet')}</p>
                  <p className="mt-1 text-sm">{t('expenses.payrollAutoHint')}</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">{hasFilters ? 'No records match these filters.' : t('expenses.emptyTitle', { defaultValue: 'No expenses recorded yet.' })}</p>
                  <p className="mt-1 text-sm">{hasFilters ? 'Clear or adjust the filters to see more records.' : 'Add the first one to begin tracking business spending.'}</p>
                  {hasFilters ? <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Clear filters</Button> : <Button size="sm" className="mt-4" onClick={openCreate}><Plus className="h-3.5 w-3.5" />Add expense</Button>}
                </>
              )}
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
                  {tableExpenses.map((expense) => (
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
                      <td className="px-4 py-3 font-medium max-w-[16rem] truncate" title={expense.description}>
                        <span className="truncate">{expense.description}</span>
                        {expense.isAggregated && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground align-middle"
                            title={
                              expense.payrollTotal !== undefined
                                ? expense.payrollLabel
                                  ? `${formatCurrency(expense.payrollTotal)} recorded for this payroll month`
                                  : `Average of ${expense.payrollMonths} payroll ${
                                      expense.payrollMonths === 1 ? 'month' : 'months'
                                    } · ${formatCurrency(expense.payrollTotal)} recorded in total`
                                : undefined
                            }
                          >
                            {expense.payrollLabel ?? 'Monthly average'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-primary whitespace-nowrap">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                        {expense.isAggregated ? '—' : expense.recordedBy?.name}
                      </td>
                      <td className="px-4 py-3">
                        {!expense.isAggregated && (
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
                        )}
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
              {(editing?.category === 'PAYROLL'
                ? [...MANUAL_CATEGORIES, 'PAYROLL' as ExpenseCategory]
                : MANUAL_CATEGORIES
              ).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('expenses.payrollAutoNote')}
            </p>
          </div>

          <div>
            <label htmlFor="expense-amount" className="text-sm font-medium text-foreground block mb-1.5">
              {t('expenses.form.amount', { defaultValue: 'Amount (ETB)' })} <span className="text-destructive">*</span>
            </label>
            <Input
              id="expense-amount"
              type="number"
              step="1"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d]/g, '') }))}
              placeholder={t('expenses.form.amountPlaceholder', { defaultValue: '0' })}
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
