import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { axiosClient } from '../../api/axiosClient';
import { useUsersQuery } from '../../hooks/useCachedQueries';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DropdownSelect } from '../../components/ui/DropdownSelect';
import { Avatar, AvatarFallback } from '../../components/ui/Avatar';
import { Sheet } from '../../components/ui/Sheet';
import { AlertDialog } from '../../components/ui/AlertDialog';
import {
  Users, Plus, Search, Pencil, ShieldOff, ShieldCheck,
  X, Eye, EyeOff, Trash2, KeyRound, AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';
import { Tooltip } from '../../components/ui/Tooltip';
import { formatEthiopianPhone, isValidEthiopianPhone, ETHIOPIAN_COUNTRY_CODE } from '../../utils/phone';
import { extractErrorMessage } from '../../utils/errorHandler';
import { formatPersonName, nameInitials } from '../../utils/name';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  name: string;
  role: string;
  username?: string;
  phone: string;
  salaryAmount: number;
  isActive: boolean;
  /** Whether a mobile-app PIN is on file (the hash itself never leaves the server). */
  hasPin?: boolean;
  /** Whether a website password is on file (cashier/manager sign in with one). */
  hasPassword?: boolean;
}

/**
 * Credentials are role-aware. The mobile app asks for a PIN; the website asks
 * for a password. Waiters and kitchen staff only use the app, cashiers only the
 * site, and managers use both — but the card offers a PIN to EVERY role,
 * including the cashier and the owner, so either can unlock a handheld
 * terminal with a 4-digit code as well as their website password.
 *
 * Only the app-first roles *need* a PIN to sign in, which is what the amber
 * warning and the "no PIN yet" nudge key off.
 */
const PIN_CAPABLE_ROLES = ['WAITER', 'COOKER', 'BARISTA', 'MANAGER', 'CASHIER', 'OWNER'];
const PIN_SIGNIN_ROLES = ['WAITER', 'COOKER', 'BARISTA', 'MANAGER'];
const PASSWORD_ROLES = ['CASHIER', 'MANAGER'];

const ROLE_COLORS: Record<string, any> = {
  OWNER: 'secondary',
  MANAGER: 'default',
  CASHIER: 'success',
  WAITER: 'outline',
  COOKER: 'warning',
  BARISTA: 'neutral',
};

const STAFF_ROLES = ['MANAGER', 'CASHIER', 'WAITER', 'COOKER', 'BARISTA'];

// `credentialsDone` drives the two-step card: Identity first, Credentials
// last, so editing a phone number never shows the PIN/password fields.
const EMPTY_FORM = { name: '', role: 'CASHIER', username: '', phone: '', salaryAmount: '', credential: '', pin: '', credentialsDone: false };

export const OwnerStaff: React.FC = () => {
  const { addToast } = useToastStore();
  const { user: currentUser } = useAuthStore();
  const { t } = useTranslation('staff');

  const queryClient = useQueryClient();

  // Optimistic active/inactive overrides applied on top of the cached list while
  // the debounced (undo-able) API call is pending.
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});

  // Shared cached user list — OwnerStaff, ManagerDashboard, and payroll pages all
  // read the same cache, so switching tabs never fetches staff from scratch.
  const { data: serverUsers = [], isLoading, error: queryError, refetch: refetchUsers } = useUsersQuery();
  const error = queryError ? extractErrorMessage(queryError, 'Failed to load staff.') : null;

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('active');

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCredential, setShowCredential] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinFocus, setPinFocus] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [removingUser, setRemovingUser] = useState<User | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const pendingStatusTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const users: User[] = useMemo(() => {
    const list = (serverUsers as User[]) || [];
    return list.map((u) =>
      activeOverrides[u.id] !== undefined ? { ...u, isActive: activeOverrides[u.id] } : u
    );
  }, [serverUsers, activeOverrides]);

  // Drop optimistic overrides once a background refetch confirms the server state.
  useEffect(() => {
    setActiveOverrides((prev) => {
      const next: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(prev)) {
        const server = (serverUsers as User[]).find((u) => u.id === id);
        if (server && server.isActive === value) continue;
        next[id] = value;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [serverUsers]);

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        const matchRole = roleFilter === 'All' || u.role === roleFilter;
        const matchStatus =
          statusFilter === 'all' || (statusFilter === 'active' ? u.isActive : !u.isActive);
        const matchSearch =
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          (u.username || '').toLowerCase().includes(search.toLowerCase());
        return matchRole && matchStatus && matchSearch;
      }),
    [users, roleFilter, statusFilter, search]
  );

  // The owner's roster contains every account — theirs included — so the count
  // is simply the roster size.
  const totalStaff = users.length;

  const openAdd = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowCredential(false);
    setShowPin(false);
    setSlideOverOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    // `credential`/`pin` are the optional replacement credentials when editing —
    // blank means "leave what is already stored alone".
    setForm({ name: formatPersonName(user.name), role: user.role, username: user.username || '', phone: user.phone, salaryAmount: String(user.salaryAmount), credential: '', pin: '', credentialsDone: false });
    setShowCredential(false);
    setShowPin(false);
    setSlideOverOpen(true);
  };

  // The field is offered to every role; only app-first roles are required to
  // have one, so the two questions are kept apart.
  const needsPin = PIN_CAPABLE_ROLES.includes(form.role);
  const pinRequired = PIN_SIGNIN_ROLES.includes(form.role);
  const needsPassword = PASSWORD_ROLES.includes(form.role);

  /**
   * Warn on the card when this change would leave the person unable to sign
   * in: an app role with no mobile PIN, or a site role with no website
   * password. On edit, blank means "keep what is stored" — the server's
   * hasPin/hasPassword flags say whether something IS stored. On create
   * nothing is stored yet, so the warning doubles as the required-field
   * callout on the Credentials step.
   */
  const hasPinNow = editingUser ? Boolean(editingUser.hasPin) : false;
  const hasPasswordNow = editingUser ? editingUser.hasPassword !== false : false;
  const credentialWarning =
    pinRequired && !hasPinNow && !form.pin
      ? ('app' as const)
      : needsPassword && !hasPasswordNow && !form.credential
        ? ('site' as const)
        : null;

  /** App-facing roles — the ones that need a PIN to sign in on the phone. */
  const needsPinFor = (role: string) => PIN_SIGNIN_ROLES.includes(role);
  const missingPin = users.filter((u) => needsPinFor(u.role) && !u.hasPin);

  /** One-tap "set this person's PIN": open straight on the Credentials step. */
  const openPinSet = (user: User) => {
    openEdit(user);
    setForm((f) => ({ ...f, credentialsDone: true }));
    setPinFocus(true);
  };

  React.useEffect(() => {
    if (!slideOverOpen) {
      setPinFocus(false);
      return;
    }
    if (!pinFocus) return;
    // Let the slide-over finish animating before focus is moved into it.
    const timer = setTimeout(() => document.getElementById('sf-pin')?.focus(), 260);
    return () => clearTimeout(timer);
  }, [slideOverOpen, pinFocus]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      addToast({ type: 'error', title: 'Name and phone are required.' });
      return;
    }
    if (!isValidEthiopianPhone(form.phone)) {
      addToast({ type: 'error', title: 'Invalid phone', message: `Ethiopian numbers need ${ETHIOPIAN_COUNTRY_CODE} plus ${9} digits.` });
      return;
    }
    if (form.pin && !/^\d{4}$/.test(form.pin)) {
      addToast({ type: 'error', title: 'Invalid PIN', message: 'A PIN is exactly 4 digits.' });
      return;
    }
    // Two-step card: the first Save is "review" — it validates the identity
    // above, shows the Credentials step, and only the second Save commits.
    if (!form.credentialsDone) {
      setForm((f) => ({ ...f, credentialsDone: true }));
      return;
    }
    // A PIN is only demanded when the account is created; when editing, leaving
    // it blank keeps the PIN that is already stored. The role may change on the
    // card, so the EDITED role decides whether a PIN/password must exist.
    if (pinRequired && !form.pin && !editingUser) {
      addToast({ type: 'error', title: 'PIN required', message: 'This role signs in with a PIN in the mobile app.' });
      return;
    }
    // A site role with no stored password cannot sign in — the amber warning
    // above already pushed the user to set one; the save itself stays allowed
    // (warn, don't block) since fixing identity details must never be blocked
    // by an unrelated credential gap.
    setIsSaving(true);
    try {
      const payload: any = {
        name: formatPersonName(form.name),
        role: form.role,
        username: form.username || undefined,
        phone: form.phone.trim(),
      };
      // Salary is intentionally not set here — it is recorded on the Payroll
      // page when the staff member is actually paid. Credentials are optional.
      if (needsPin && form.pin) payload.pinCode = form.pin;
      if (needsPassword && form.credential) payload.password = form.credential;
      if (editingUser) {
        const res = await axiosClient.patch(`/users/${editingUser.id}`, payload);
        queryClient.setQueryData<User[]>(['users'], (old) =>
          (old ?? []).map((u) => (u.id === editingUser.id ? res.data : u))
        );
        addToast({ type: 'success', title: 'Staff member updated' });
      } else {
        const res = await axiosClient.post('/users', payload);
        queryClient.setQueryData<User[]>(['users'], (old) => [res.data, ...(old ?? [])]);
        addToast({ type: 'success', title: `${form.name} added` });
      }
      setSlideOverOpen(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: extractErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  /** Permanently delete a staff account (server refuses when history exists). */
  const handleRemove = async () => {
    if (!removingUser) return;
    setIsRemoving(true);
    try {
      await axiosClient.delete(`/users/${removingUser.id}`);
      queryClient.setQueryData<User[]>(['users'], (old) =>
        (old ?? []).filter((u) => u.id !== removingUser.id)
      );
      addToast({ type: 'success', title: `${removingUser.name} removed` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Remove failed', message: extractErrorMessage(err) });
    } finally {
      setIsRemoving(false);
      setRemovingUser(null);
    }
  };

  const toggleActiveStatus = useCallback(async (user: User, nextActive: boolean) => {
    const existingTimeout = pendingStatusTimeouts.current.get(user.id);
    if (existingTimeout) clearTimeout(existingTimeout);

    setActiveOverrides((prev) => ({ ...prev, [user.id]: nextActive }));

    const executeApi = async () => {
      try {
        if (nextActive) {
          await axiosClient.patch(`/users/${user.id}`, { isActive: true });
        } else {
          await axiosClient.patch(`/users/${user.id}/deactivate`);
        }
        pendingStatusTimeouts.current.delete(user.id);
        void queryClient.invalidateQueries({ queryKey: ['users'] });
      } catch (err: any) {
        setActiveOverrides((prev) => {
          const next = { ...prev };
          delete next[user.id];
          return next;
        });
        addToast({ type: 'error', title: 'Action failed', message: extractErrorMessage(err) });
        pendingStatusTimeouts.current.delete(user.id);
      }
    };

    const timeoutId = setTimeout(executeApi, 6000);
    pendingStatusTimeouts.current.set(user.id, timeoutId);

    const undo = () => {
      const t = pendingStatusTimeouts.current.get(user.id);
      if (t) clearTimeout(t);
      pendingStatusTimeouts.current.delete(user.id);
      setActiveOverrides((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      addToast({
        type: 'info',
        title: nextActive ? `Reactivation undone — ${user.name} stays inactive` : `Deactivation undone — ${user.name} stays active`,
      });
    };

    addToast({
      type: 'success',
      title: nextActive ? `${user.name} reactivated` : `${user.name} deactivated`,
      message: nextActive
        ? 'They can now log in again.'
        : 'They will no longer be able to log in.',
      undo: { label: 'Undo', onClick: undo },
    });
  }, [addToast]);

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('All');
    setStatusFilter('active');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 max-[767px]:space-y-5">
      {/* Who still cannot sign in on the mobile app — one line, dismissible by
          fixing it (the key on each affected row opens the card on the PIN). */}
      {missingPin.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span>
            {missingPin.length === 1
              ? t('banner.single', { name: missingPin[0].name })
              : t('banner.many', { total: missingPin.length })}{' '}
            {t('banner.hint')}
          </span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetchUsers()}>Retry</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Card top bar — search and filters on the left, roster count and
                  Add Staff pinned to the right end */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/30 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="staff-search"
                  placeholder="Search staff..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-52 max-[767px]:w-44 h-9"
                />
              </div>
              <DropdownSelect
                ariaLabel="Filter staff by role"
                size="sm"
                icon={Users}
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: 'All', label: 'All Roles' },
                  ...STAFF_ROLES.map(r => ({ value: r, label: r })),
                ]}
                contentClassName="w-40"
              />
              <DropdownSelect
                ariaLabel="Filter staff by status"
                size="sm"
                icon={ShieldCheck}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All' },
                ]}
                contentClassName="w-36"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                data-testid="staff-count"
                aria-label={t('count.total', { count: totalStaff })}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 shadow-sm"
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex items-baseline gap-1.5 leading-none">
                  <span className="text-sm font-bold tabular-nums text-foreground">{totalStaff}</span>
                  <span className="text-xs text-muted-foreground">{t('count.label')}</span>
                </span>
              </div>
              <Button id="add-staff-btn" onClick={openAdd} size="sm" className="shadow-sm">
                <Plus className="w-4 h-4 mr-2" />Add Staff
              </Button>
            </div>
          </div>
          {/* The result list is what the search narrows — the toolbar above is
              never part of the "nothing found" branch, so a search that misses
              can still be edited or cleared. */}
          {filteredUsers.length === 0 ? (
            <EmptyState
              className="py-14"
              title={users.length === 0 ? 'No staff yet' : 'No staff match your search'}
              message={
                users.length === 0
                  ? 'Add your first team member — managers, cashiers, waiters, and kitchen staff.'
                  : 'Nothing here matches the search or filters above.'
              }
              icon={<Users className="w-7 h-7" />}
              action={
                users.length === 0
                  ? { label: 'Add Staff', onClick: openAdd, icon: <Plus className="w-4 h-4 mr-1.5" /> }
                  : { label: 'Clear filters', onClick: clearFilters, variant: 'outline' }
              }
            />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Staff</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Contact</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Salary</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, idx) => (
                  <tr key={user.id} className={`border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors ${!user.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {nameInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate max-w-[120px]">{user.name}</span>
                        {needsPinFor(user.role) && !user.hasPin && (
                          <Tooltip label="No mobile PIN yet — they cannot sign in on the app">
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              <KeyRound className="h-3 w-3" />
                              No PIN
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant={ROLE_COLORS[user.role]}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      <div>{user.username || '—'}</div>
                      <div>{user.phone}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-right font-mono text-sm">
                      {formatCurrency(user.salaryAmount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${user.isActive ? 'bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] border-[hsl(var(--success))]/40' : 'bg-secondary text-muted-foreground border-border'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="Edit">
                          <button onClick={() => openEdit(user)} aria-label={`Edit ${user.name}`} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                        {needsPinFor(user.role) && !user.hasPin && (
                          <Tooltip label={t('tooltip.setPin')}>
                            <button onClick={() => openPinSet(user)} aria-label={t('tooltip.setPinFor', { name: user.name })} className="p-1.5 rounded-md text-amber-600 hover:bg-amber-500/10 dark:text-amber-400 transition-colors">
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        )}
                        {user.id !== currentUser?.id && (
                          <Tooltip label="Remove">
                            <button onClick={() => setRemovingUser(user)} aria-label={`Remove ${user.name}`} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        )}
                        {user.isActive ? (
                          <Tooltip label="Deactivate">
                            <button onClick={() => toggleActiveStatus(user, false)} aria-label={`Deactivate ${user.name}`} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <ShieldOff className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        ) : (
                          <Tooltip label="Reactivate">
                            <button onClick={() => toggleActiveStatus(user, true)} aria-label={`Reactivate ${user.name}`} className="p-1.5 rounded-md text-muted-foreground hover:text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10 transition-colors">
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Add/Edit slide-over — the shared Sheet portals to <body>, so it covers
          the full viewport height instead of stopping short at the top. */}
      <Sheet
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={editingUser ? 'Edit Staff Member' : 'Add Staff Member'}
        footer={
          <div className="flex gap-3">
            {form.credentialsDone ? (
              <Button variant="outline" onClick={() => setForm(f => ({ ...f, credentialsDone: false }))} className="flex-1">Back</Button>
            ) : (
              <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
            )}
            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving
                ? 'Saving...'
                : !form.credentialsDone
                  ? editingUser
                    ? t('actions.review')
                    : t('actions.next')
                  : editingUser
                    ? t('actions.save')
                    : 'Add Staff'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Two steps — Identity first, Credentials last — so a phone-number
              edit never renders the PIN/password fields. */}
          <div className="flex items-center gap-2" aria-hidden="true">
            {[1, 2].map((step) => (
              <span
                key={step}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  (form.credentialsDone ? 2 : 1) >= step ? 'bg-primary' : 'bg-secondary'
                )}
              />
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
            {form.credentialsDone ? t('steps.credentials') : t('steps.identity')}
          </p>
          {!form.credentialsDone ? (
          <section className="space-y-4">
            {/* Identity — short fields share a row so the form stays scannable. */}
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Identity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sf-name" className="text-sm font-medium text-foreground block mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="sf-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Alice Johnson"
                />
              </div>
              <div>
                <label htmlFor="sf-username" className="text-sm font-medium text-foreground block mb-1.5">
                  Username
                </label>
                <Input
                  id="sf-username"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="staff_username"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="sf-phone" className="text-sm font-medium text-foreground block mb-1.5">
                  Phone <span className="text-destructive">*</span>
                </label>
                <Input
                  id="sf-phone"
                  type="tel"
                  value={form.phone}
                  maxLength={ETHIOPIAN_COUNTRY_CODE.length + 9}
                  onChange={e => setForm(f => ({ ...f, phone: formatEthiopianPhone(e.target.value) }))}
                  placeholder="+251 9XX XXX XXX"
                />
              </div>
              <div className="sm:col-span-2 bg-secondary/30 rounded-lg p-4 border border-border/50">
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
                  Role <span className="text-destructive">*</span>
                </label>
                <DropdownSelect
                  ariaLabel="Role"
                  className="w-full justify-between"
                  contentClassName="max-w-[calc(100vw-3rem)] max-h-72 overflow-y-auto"
                  value={form.role}
                  onChange={(next) => setForm((f) => ({ ...f, role: next }))}
                  // The owner's own account keeps its OWNER option, otherwise
                  // the field would show the first role in the list instead of
                  // the account's real role.
                  options={(form.role === 'OWNER' ? ['OWNER', ...STAFF_ROLES] : STAFF_ROLES).map((r) => ({
                    value: r,
                    label: r,
                  }))}
                />
              </div>
            </div>
          </section>
          ) : (
          <section className="space-y-4 border-t border-border pt-5">
            {/* Credentials — what the role signs in with: a PIN for the app, a
                password for the website, and both for a manager. */}
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Credentials</h3>
            {credentialWarning && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {credentialWarning === 'app'
                    ? t('warning.app')
                    : t('warning.site')}
                </span>
              </div>
            )}
            <div className={cn('grid gap-4', needsPin && needsPassword && 'sm:grid-cols-2')}>
                  {needsPin && (
                    <div>
                      <label htmlFor="sf-pin" className="text-sm font-medium text-foreground block mb-1.5">
                        {t('pin.label')} <span className="text-muted-foreground font-normal">{t('pin.mobileTag')}</span>
                        {pinRequired && !editingUser && <span className="text-destructive"> *</span>}
                      </label>
                      <div className="relative">
                        <Input
                          id="sf-pin"
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={4}
                          value={form.pin}
                          onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                          placeholder={t('pin.placeholder')}
                          // No ring when the shortcut focuses this field — the
                          // caret is the only focus cue, as elsewhere in the app.
                          className={cn('pr-10', form.pin && 'tracking-[0.4em]')}
                        />
                        <button type="button" onClick={() => setShowPin(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {editingUser
                          ? (editingUser.hasPin ? t('pin.helper.editKeep') : t('pin.helper.editNoPin'))
                          : t('pin.helper.create')}
                      </p>
                    </div>
                  )}
                  {needsPassword && (
                    <div>
                      <label htmlFor="sf-cred" className="text-sm font-medium text-foreground block mb-1.5">
                        {t('password.label')} <span className="text-muted-foreground font-normal">{t('password.siteTag')}</span>
                        {(!editingUser || !hasPasswordNow) && <span className="text-destructive"> *</span>}
                      </label>
                      <div className="relative">
                        <Input
                          id="sf-cred"
                          type={showCredential ? 'text' : 'password'}
                          value={form.credential}
                          onChange={e => setForm(f => ({ ...f, credential: e.target.value }))}
                          placeholder={editingUser ? 'Set a new password' : 'Temporary password'}
                          className="pr-10"
                          autoComplete="new-password"
                        />
                        <button type="button" onClick={() => setShowCredential(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showCredential ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {editingUser
                          ? (hasPasswordNow
                            ? t('password.helper.editKeep')
                            : t('password.helper.editMissing'))
                          : t('password.helper.create')}
                      </p>
                    </div>
                  )}
            </div>
          </section>
          )}
        </div>
      </Sheet>

      <AlertDialog
        open={Boolean(removingUser)}
        onClose={() => {
          if (!isRemoving) setRemovingUser(null);
        }}
        onConfirm={handleRemove}
        title={`Remove ${removingUser?.name ?? 'this staff member'}?`}
        description={
          <>
            This permanently deletes the account. It only works for staff with no
            orders, settlements, payroll or attendance on record — if they have
            history, deactivate them instead so the records stay attributed.
          </>
        }
        confirmText="Remove"
        tone="destructive"
        loading={isRemoving}
      />

    </div>
  );
};
