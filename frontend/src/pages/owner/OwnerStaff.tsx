import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { axiosClient } from '../../api/axiosClient';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Avatar, AvatarFallback } from '../../components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Search, Pencil, ShieldOff, ShieldCheck,
  KeyRound, Copy, X, Eye, EyeOff, AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { EmptyState } from '../../components/common/EmptyState';
import { Tooltip } from '../../components/ui/Tooltip';
import { formatEthiopianPhone, isValidEthiopianPhone, ETHIOPIAN_COUNTRY_CODE } from '../../utils/phone';
import { extractErrorMessage } from '../../utils/errorHandler';

interface User {
  id: string;
  name: string;
  role: string;
  username?: string;
  phone: string;
  salaryAmount: number;
  isActive: boolean;
}

const ROLE_COLORS: Record<string, any> = {
  OWNER: 'secondary',
  MANAGER: 'default',
  CASHIER: 'success',
  WAITER: 'outline',
  COOKER: 'warning',
  BARISTA: 'neutral',
};

const STAFF_ROLES = ['MANAGER', 'CASHIER', 'WAITER', 'COOKER', 'BARISTA'];

const EMPTY_FORM = { name: '', role: 'CASHIER', username: '', phone: '', salaryAmount: '', credential: '' };

export const OwnerStaff: React.FC = () => {
  const { addToast } = useToastStore();
  const { user: currentUser } = useAuthStore();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('active');

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCredential, setShowCredential] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const pendingStatusTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [resetResult, setResetResult] = useState<{ name: string; credential: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/users');
      setUsers(res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load staff.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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

  const openAdd = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowCredential(false);
    setSlideOverOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ name: user.name, role: user.role, username: user.username || '', phone: user.phone, salaryAmount: String(user.salaryAmount / 100), credential: '' }); // Convert cents to dollars for display
    setShowCredential(false);
    setSlideOverOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      addToast({ type: 'error', title: 'Name and phone are required.' });
      return;
    }
    if (!isValidEthiopianPhone(form.phone)) {
      addToast({ type: 'error', title: 'Invalid phone', message: `Ethiopian numbers need ${ETHIOPIAN_COUNTRY_CODE} plus ${9} digits.` });
      return;
    }
    setIsSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        role: form.role,
        username: form.username || undefined,
        phone: form.phone.trim(),
        salaryAmount: Math.round(parseFloat(form.salaryAmount) * 100) || 0, // Convert dollars to cents
      };
      if (!editingUser && form.credential) {
        payload.password = form.credential;
      }
      if (editingUser) {
        const res = await axiosClient.patch(`/users/${editingUser.id}`, payload);
        setUsers(prev => prev.map(u => u.id === editingUser.id ? res.data : u));
        addToast({ type: 'success', title: 'Staff member updated' });
      } else {
        const res = await axiosClient.post('/users', payload);
        setUsers(prev => [res.data, ...prev]);
        addToast({ type: 'success', title: `${form.name} added` });
      }
      setSlideOverOpen(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save failed', message: extractErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActiveStatus = useCallback(async (user: User, nextActive: boolean) => {
    const existingTimeout = pendingStatusTimeouts.current.get(user.id);
    if (existingTimeout) clearTimeout(existingTimeout);

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: nextActive } : u));

    const executeApi = async () => {
      try {
        if (nextActive) {
          await axiosClient.patch(`/users/${user.id}`, { isActive: true });
        } else {
          await axiosClient.patch(`/users/${user.id}/deactivate`);
        }
        pendingStatusTimeouts.current.delete(user.id);
      } catch (err: any) {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !nextActive } : u));
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
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !nextActive } : u));
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

  const handleReset = async (user: User) => {
    setIsResetting(true);
    try {
      const res = await axiosClient.patch(`/users/${user.id}/reset-password`);
      const newCred = res.data?.password || '(see response)';
      setResetResult({ name: user.name, credential: newCred });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Reset failed', message: extractErrorMessage(err) });
    } finally {
      setIsResetting(false);
    }
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchUsers}>Retry</Button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title={users.length === 0 ? 'No staff yet' : 'No staff match your filters'}
          message={users.length === 0 ? 'Add your first team member — managers, cashiers, waiters, and kitchen staff.' : 'Try clearing filters or searching for a different name.'}
          icon={<Users className="w-7 h-7" />}
          action={users.length === 0 ? {
            label: 'Add Staff',
            onClick: openAdd,
            icon: <Plus className="w-4 h-4 mr-1.5" />,
          } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Card top bar — Add Staff on the left, filters on the right */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/30 px-4 py-3">
            <Button id="add-staff-btn" onClick={openAdd} size="sm" className="shadow-sm">
              <Plus className="w-4 h-4 mr-2" />Add Staff
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="staff-search"
                  placeholder="Search staff..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-44 sm:w-52 h-9"
                />
              </div>
              <Select
                id="role-filter"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="w-32 h-9"
              >
                <option value="All">All Roles</option>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Select
                id="status-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-32 h-9"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </Select>
            </div>
          </div>
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
                          {initials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium truncate max-w-[120px]">{user.name}</span>
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
                        <button onClick={() => openEdit(user)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                      {user.id !== currentUser?.id && (
                        <Tooltip label="Reset Password">
                          <button onClick={() => handleReset(user)} disabled={isResetting} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                      {user.isActive ? (
                        <Tooltip label="Deactivate">
                          <button onClick={() => toggleActiveStatus(user, false)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <ShieldOff className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      ) : (
                        <Tooltip label="Reactivate">
                          <button onClick={() => toggleActiveStatus(user, true)} className="p-1.5 rounded-md text-muted-foreground hover:text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10 transition-colors">
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

      {/* Add/Edit Slide-over */}
      <AnimatePresence>
        {slideOverOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={() => setSlideOverOpen(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-lg font-bold">{editingUser ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
                <Tooltip label="Close">
                  <button onClick={() => setSlideOverOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {[
                  { id: 'sf-name', label: 'Full Name', key: 'name', placeholder: 'e.g. Alice Johnson', required: true },
                  { id: 'sf-phone', label: 'Phone', key: 'phone', placeholder: '+251 9XX XXX XXX', required: true, phone: true },
                  { id: 'sf-username', label: 'Username', key: 'username', placeholder: 'staff_username' },
                  { id: 'sf-salary', label: 'Monthly Salary (ETB)', key: 'salaryAmount', placeholder: '2500' },
                ].map(field => (
                  <div key={field.key}>
                    <label htmlFor={field.id} className="text-sm font-medium text-foreground block mb-1.5">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      id={field.id}
                      value={(form as any)[field.key]}
                      type={'phone' in field && field.phone ? 'tel' : undefined}
                      maxLength={'phone' in field && field.phone ? ETHIOPIAN_COUNTRY_CODE.length + 9 : undefined}
                      onChange={e => setForm(f => ({ ...f, [field.key]: 'phone' in field && field.phone ? formatEthiopianPhone(e.target.value) : e.target.value }))}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
                <div>
                  <label htmlFor="sf-role" className="text-sm font-medium text-foreground block mb-1.5">Role <span className="text-destructive">*</span></label>
                  <Select id="sf-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">OWNER cannot be created via this form.</p>
                </div>
                {!editingUser && (
                  <div>
                    <label htmlFor="sf-cred" className="text-sm font-medium text-foreground block mb-1.5">
                      Initial Password
                    </label>
                    <div className="relative">
                      <Input
                        id="sf-cred"
                        type={showCredential ? 'text' : 'password'}
                        value={form.credential}
                        onChange={e => setForm(f => ({ ...f, credential: e.target.value }))}
                        placeholder="Temporary password"
                        className="pr-10"
                      />
                      <button type="button" onClick={() => setShowCredential(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showCredential ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-border flex gap-3">
                <Button variant="outline" onClick={() => setSlideOverOpen(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? 'Saving...' : editingUser ? 'Save Changes' : 'Add Staff'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reset credential one-time display */}
      <AnimatePresence>
        {resetResult && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full pointer-events-auto">
                <h3 className="font-bold mb-1">New Credential for {resetResult.name}</h3>
                <p className="text-xs text-[hsl(var(--warning))] font-medium mb-4 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  This won't be shown again — record it now.
                </p>
                <div className="flex items-center gap-2 bg-secondary rounded-lg p-3 mb-5">
                  <code className="font-mono text-lg font-bold tracking-widest flex-1 text-foreground">
                    {resetResult.credential}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(resetResult.credential); addToast({ type: 'success', title: 'Copied!' }); }}
                    className="p-2 rounded-md hover:bg-border transition-colors text-muted-foreground hover:text-foreground"
                    title="Copy"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <Button onClick={() => setResetResult(null)} className="w-full">I've Saved It — Close</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
