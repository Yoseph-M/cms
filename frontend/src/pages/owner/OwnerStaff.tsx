import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

interface User {
  id: string;
  name: string;
  role: string;
  email?: string;
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

const EMPTY_FORM = { name: '', role: 'CASHIER', email: '', phone: '', salaryAmount: '', credential: '' };

export const OwnerStaff: React.FC = () => {
  const { addToast } = useToastStore();

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

  const [confirmTarget, setConfirmTarget] = useState<{ user: User; action: 'deactivate' | 'reactivate' } | null>(null);
  const [isActioning, setIsActioning] = useState(false);

  const [resetResult, setResetResult] = useState<{ name: string; credential: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosClient.get('/users');
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load staff.');
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
          (u.email || '').toLowerCase().includes(search.toLowerCase());
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
    setForm({ name: user.name, role: user.role, email: user.email || '', phone: user.phone, salaryAmount: String(user.salaryAmount), credential: '' });
    setShowCredential(false);
    setSlideOverOpen(true);
  };

  const isWaiter = (role: string) => role === 'WAITER';

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      addToast({ type: 'error', title: 'Name and phone are required.' });
      return;
    }
    setIsSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        role: form.role,
        email: form.email || undefined,
        phone: form.phone.trim(),
        salaryAmount: parseFloat(form.salaryAmount) || 0,
      };
      if (!editingUser && form.credential) {
        if (isWaiter(form.role)) payload.pin = form.credential;
        else payload.password = form.credential;
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
      addToast({ type: 'error', title: 'Save failed', message: err.response?.data?.error });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmTarget) return;
    setIsActioning(true);
    try {
      const { user, action } = confirmTarget;
      if (action === 'deactivate') {
        await axiosClient.patch(`/users/${user.id}/deactivate`);
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u));
        addToast({ type: 'success', title: `${user.name} deactivated` });
      } else {
        await axiosClient.patch(`/users/${user.id}`, { isActive: true });
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: true } : u));
        addToast({ type: 'success', title: `${user.name} reactivated` });
      }
      setConfirmTarget(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Action failed', message: err.response?.data?.error });
    } finally {
      setIsActioning(false);
    }
  };

  const handleReset = async (user: User) => {
    setIsResetting(true);
    try {
      const endpoint = isWaiter(user.role) ? `/users/${user.id}/reset-pin` : `/users/${user.id}/reset-password`;
      const res = await axiosClient.patch(endpoint);
      const newCred = res.data?.pin || res.data?.password || '(see response)';
      setResetResult({ name: user.name, credential: newCred });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Reset failed', message: err.response?.data?.error });
    } finally {
      setIsResetting(false);
    }
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input id="staff-search" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-48" />
          </div>
          <Select id="role-filter" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="w-32">
            <option value="All">All Roles</option>
            {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-32">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </div>
        <Button id="add-staff-btn" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />Add Staff
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-secondary/40 animate-pulse" />)}</div>
      ) : error ? (
        <div className="py-16 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchUsers}>Retry</Button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No staff match your filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
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
                    <div>{user.email || '—'}</div>
                    <div>{user.phone}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-right font-mono text-sm">
                    {formatCurrency(user.salaryAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${user.isActive ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40' : 'bg-secondary text-muted-foreground border-border'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(user)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleReset(user)} disabled={isResetting} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title={isWaiter(user.role) ? 'Reset PIN' : 'Reset Password'}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      {user.isActive ? (
                        <button onClick={() => setConfirmTarget({ user, action: 'deactivate' })} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Deactivate">
                          <ShieldOff className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setConfirmTarget({ user, action: 'reactivate' })} className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors" title="Reactivate">
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>
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
                <button onClick={() => setSlideOverOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {[
                  { id: 'sf-name', label: 'Full Name', key: 'name', placeholder: 'e.g. Alice Johnson', required: true },
                  { id: 'sf-phone', label: 'Phone', key: 'phone', placeholder: '+1 555 0001', required: true },
                  { id: 'sf-email', label: 'Email', key: 'email', placeholder: 'staff@cafe.com' },
                  { id: 'sf-salary', label: 'Monthly Salary (ETB)', key: 'salaryAmount', placeholder: '2500' },
                ].map(field => (
                  <div key={field.key}>
                    <label htmlFor={field.id} className="text-sm font-medium text-foreground block mb-1.5">
                      {field.label} {field.required && <span className="text-destructive">*</span>}
                    </label>
                    <Input
                      id={field.id}
                      value={(form as any)[field.key]}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
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
                      {isWaiter(form.role) ? 'Initial PIN (4-digit)' : 'Initial Password'}
                    </label>
                    <div className="relative">
                      <Input
                        id="sf-cred"
                        type={showCredential ? 'text' : 'password'}
                        value={form.credential}
                        onChange={e => setForm(f => ({ ...f, credential: e.target.value }))}
                        placeholder={isWaiter(form.role) ? '4-digit PIN' : 'Temporary password'}
                        maxLength={isWaiter(form.role) ? 4 : 100}
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

      {/* Deactivate confirm */}
      <AnimatePresence>
        {confirmTarget && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setConfirmTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full pointer-events-auto">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="font-bold">{confirmTarget.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} {confirmTarget.user.name}?</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  {confirmTarget.action === 'deactivate'
                    ? 'They will no longer be able to log in until reactivated.'
                    : 'Their account will be restored and they can log in again.'}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setConfirmTarget(null)} className="flex-1">Cancel</Button>
                  <Button onClick={handleDeactivate} disabled={isActioning}
                    className={`flex-1 ${confirmTarget.action === 'deactivate' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}>
                    {isActioning ? 'Processing...' : (confirmTarget.action === 'deactivate' ? 'Deactivate' : 'Reactivate')}
                  </Button>
                </div>
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
                <p className="text-xs text-amber-500 font-medium mb-4 flex items-center gap-1.5">
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
