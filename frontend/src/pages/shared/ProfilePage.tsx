import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { axiosClient } from '../../api/axiosClient';
import { useMeQuery } from '../../hooks/useCachedQueries';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { extractErrorMessage } from '../../utils/errorHandler';
import { fileToCompressedDataUrl } from '../../utils/imageResize';
import type { Role } from '../../types';

/* ─── Role presentation metadata ─── */
const ROLE_META: Record<
  Role,
  { label: string; description: string; className: string; gradient: string }
> = {
  OWNER: {
    label: 'Owner',
    description: 'Full administrative, financial & operational privileges across all venues.',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
  },
  MANAGER: {
    label: 'Manager',
    description: 'Store operations, staff scheduling & menu catalog management.',
    className: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30',
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
  },
  CASHIER: {
    label: 'Cashier',
    description: 'Front-of-house order management & POS terminal checkout access.',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  WAITER: {
    label: 'Waiter',
    description: 'Table order placement & dining floor guest service.',
    className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30',
    gradient: 'from-sky-500 via-blue-500 to-indigo-500',
  },
  COOKER: {
    label: 'Cook',
    description: 'Kitchen order fulfillment & food preparation status tracking.',
    className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30',
    gradient: 'from-rose-500 via-red-500 to-orange-500',
  },
  BARISTA: {
    label: 'Barista',
    description: 'Beverage bar orders & drink preparation fulfillment.',
    className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/30',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
  },
};

/* Ethiopian phone: +251 prefix, 9 digits */
const ET_PHONE_PREFIX = '+251';
const ET_PHONE_DIGITS = 9;

const firstNameOf = (name: string) => name.trim().split(' ')[0] || '?';
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : dateFmt.format(d);
};

/* ─── Password strength meter helper ─── */
const evaluatePassword = (pw: string) => {
  const hasMinLength = pw.length >= 6;
  const hasLongLength = pw.length >= 10;
  const hasMixedCase = /[A-Z]/.test(pw) && /[a-z]/.test(pw);
  const hasSpecialOrDigit = /\d/.test(pw) || /[^A-Za-z0-9]/.test(pw);

  let score = 0;
  if (hasMinLength) score++;
  if (hasLongLength) score++;
  if (hasMixedCase) score++;
  if (hasSpecialOrDigit) score++;

  let label = 'Weak';
  let color = 'bg-destructive';
  if (score === 2) {
    label = 'Fair';
    color = 'bg-warning';
  } else if (score === 3) {
    label = 'Good';
    color = 'bg-primary';
  } else if (score >= 4) {
    label = 'Strong';
    color = 'bg-[hsl(var(--success))]';
  }

  return {
    score,
    label,
    color,
    criteria: [
      { met: hasMinLength, label: 'At least 6 characters' },
      { met: hasMixedCase, label: 'Uppercase & lowercase letters' },
      { met: hasSpecialOrDigit, label: 'Includes number or symbol' },
    ],
  };
};

export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Account Profile', subtitle: 'Manage your credentials, personal identity, and security' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const me = meQuery.data;

  /* ─── Profile form state ─── */
  const [draftName, setDraftName] = useState(user?.name ?? '');
  const [draftUsername, setDraftUsername] = useState(user?.username ?? '');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null | undefined>(undefined);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!me || hydratedRef.current) return;
    hydratedRef.current = true;
    setDraftName(me.name ?? user?.name ?? '');
    setDraftUsername(me.username ?? user?.username ?? '');
    setDraftPhone((me.phone ?? user?.phone ?? '').toString().replace(/\D/g, '').slice(-ET_PHONE_DIGITS));
  }, [me, user]);

  /* ─── Password form state ─── */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  if (!user) return null;

  const role = user.role as Role;
  const meta = ROLE_META[role] ?? {
    label: role,
    description: 'System user profile.',
    className: 'bg-secondary text-foreground ring-border',
    gradient: 'from-brand-600 via-brand-500 to-cyan-400',
  };

  const avatarSrc = draftAvatar !== undefined ? draftAvatar : (me?.avatarUrl ?? user.avatarUrl ?? null);
  const firstName = firstNameOf(draftName || user.name);
  const initials = initialsOf(draftName || user.name);
  const joined = fmtDate(user.createdAt ?? (me?.createdAt as string | undefined));
  const profileFormValid = draftName.trim().length >= 2 && draftPhone.length === ET_PHONE_DIGITS;
  const passwordFormValid = currentPassword.length > 0 && newPassword.length >= 6;
  const pwEvaluation = evaluatePassword(newPassword);

  /* Dirty field tracking */
  const isNameDirty = draftName.trim() !== (me?.name ?? user.name ?? '');
  const isUsernameDirty = draftUsername.trim() !== (me?.username ?? user.username ?? '');
  const isPhoneDirty =
    draftPhone !== (me?.phone ?? user?.phone ?? '').toString().replace(/\D/g, '').slice(-ET_PHONE_DIGITS);
  const isAvatarDirty = draftAvatar !== undefined;
  const hasDirtyFields = isNameDirty || isUsernameDirty || isPhoneDirty || isAvatarDirty;

  const handleAvatarFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', title: 'Invalid file', message: 'Please choose an image file.' });
      return;
    }
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setDraftAvatar(dataUrl);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Could not read image',
        message: extractErrorMessage(err, 'Please try a different image.'),
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draftName.trim();
    const phone = draftPhone ? `${ET_PHONE_PREFIX}${draftPhone}` : '';
    if (name.length < 2) {
      addToast({ type: 'error', title: 'Invalid name', message: 'Full name must be at least 2 characters.' });
      return;
    }
    if (draftPhone.length !== ET_PHONE_DIGITS) {
      addToast({ type: 'error', title: 'Invalid phone', message: `Phone number must be ${ET_PHONE_DIGITS} digits.` });
      return;
    }
    setIsSavingProfile(true);
    try {
      const res = await axiosClient.patch('/users/me', {
        name,
        username: draftUsername.trim() || null,
        phone,
        avatarUrl: avatarSrc ?? null,
      });
      const updated = res.data;
      queryClient.setQueryData(['me'], updated);
      useAuthStore.getState().setUser({ ...user, ...updated });
      addToast({ type: 'success', title: 'Profile updated', message: 'Your personal changes have been saved.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update failed', message: extractErrorMessage(err) });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      addToast({ type: 'error', title: 'Too short', message: 'Password must be at least 6 characters.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      await axiosClient.patch('/users/me/password', { currentPassword, newPassword });
      addToast({ type: 'success', title: 'Password updated', message: 'Your password has been changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: extractErrorMessage(err) || 'Could not update password.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-fade-in">
      {/* ═══════════ Executive Bento Cover & Identity Station ═══════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        {/* Ambient Glow Aura */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/4 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* Avatar Station — display only; photo changes live in Personal Details */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  'flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-xl ring-4 ring-background overflow-hidden',
                  'font-display text-3xl font-bold',
                  meta.gradient,
                )}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt={firstName} className="h-full w-full object-cover" />
                ) : (
                  <span className="leading-none">{initials}</span>
                )}
              </div>
            </div>

            {/* Profile Info Details */}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {draftName || user.name}
                </h1>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold ring-1 ring-inset', meta.className)}>
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
              </div>

              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                {draftPhone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    +251 {draftPhone}
                  </span>
                )}
                {joined && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Member since {joined}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right Status Badges & Quick Indicator */}
          <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
            {hasDirtyFields && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-bold text-warning ring-1 ring-inset ring-warning/30 animate-pulse">
                <Sparkles className="h-3 w-3" />
                Unsaved modifications
              </span>
            )}
          </div>
        </div>
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleAvatarFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* ═══════════ Two-Column Executive Studio Layout ═══════════ */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* Left Column: Account Snapshot & Security Health */}
        <aside className="space-y-6">
          {/* Role & Privileges Card */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Shield className="h-4 w-4 text-primary" />
              <span>Role & Privileges</span>
            </div>

            <div className="rounded-xl bg-secondary/40 p-4 border border-border/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{meta.label} Access</span>
                <span className="text-[11px] font-bold text-primary">Level 1</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Identity status</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                  Verified
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Country format</span>
                <span className="font-semibold text-foreground">Ethiopia (+251)</span>
              </div>
            </div>
          </div>

          {/* Security Recommendations Card */}
          <div className="rounded-2xl border border-border/60 bg-secondary/30 p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
              <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
              <span>Security Standards</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your password protects critical restaurant operations, orders, and financial data. Always use a strong, unique passkey.
            </p>
          </div>
        </aside>

        {/* Right Column: Personal Details & Password Forms */}
        <main className="space-y-6">
          {/* Card 1: Personal Details Studio */}
          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:shadow-md sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 shadow-sm">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    Personal Details
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Update your public display name, username, and Ethiopian mobile number.
                  </p>
                </div>
              </div>

              {isSavingProfile && (
                <span className="text-xs font-medium text-primary animate-pulse">Saving changes...</span>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Photo Change Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-secondary/30 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl text-white font-bold shadow-sm overflow-hidden shrink-0',
                      meta.gradient,
                    )}
                  >
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={firstName} className="h-full w-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Profile Picture</p>
                    <p className="text-xs text-muted-foreground">
                      Visible to team members across orders and shifts.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                    leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  >
                    Upload photo
                  </Button>
                  {avatarSrc && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDraftAvatar(null)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>

              {/* Form Input Fields */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5 text-primary" />
                      Full Name
                    </span>
                    {isNameDirty && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.2 text-[10px] font-bold uppercase tracking-wide text-warning">
                        Edited
                      </span>
                    )}
                  </label>
                  <Input
                    type="text"
                    id="full-name"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="e.g. Abebe Bikila"
                    minLength={2}
                    required
                    leftIcon={<UserRound className="h-4 w-4 text-muted-foreground" />}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <AtSign className="h-3.5 w-3.5 text-primary" />
                      Username Handle
                    </span>
                    {isUsernameDirty && (
                      <span className="rounded-full bg-warning/15 px-2 py-0.2 text-[10px] font-bold uppercase tracking-wide text-warning">
                        Edited
                      </span>
                    )}
                  </label>
                  <Input
                    type="text"
                    id="username"
                    value={draftUsername}
                    onChange={(e) => setDraftUsername(e.target.value)}
                    placeholder="e.g. abebe@cafeflow.com"
                    leftIcon={<AtSign className="h-4 w-4 text-muted-foreground" />}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Used for workspace mentions.</p>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      Phone Number (+251)
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {draftPhone.length}/{ET_PHONE_DIGITS}
                    </span>
                  </label>
                  <div className="relative">
                    <Input
                      type="tel"
                      inputMode="numeric"
                      id="phone"
                      value={draftPhone}
                      onChange={(e) =>
                        setDraftPhone(e.target.value.replace(/\D/g, '').slice(0, ET_PHONE_DIGITS))
                      }
                      placeholder="9X XXX XXXX"
                      maxLength={ET_PHONE_DIGITS}
                      required
                      leftIcon={<Phone className="h-4 w-4 text-muted-foreground" />}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">9 digits following the Ethiopian +251 country code.</p>
                </div>
              </div>

              {/* Save Bar */}
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button
                  type="submit"
                  disabled={!profileFormValid || isSavingProfile || !hasDirtyFields}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  {isSavingProfile ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </section>

          {/* Card 2: Security & Password Station */}
          <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:shadow-md sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-inset ring-violet-500/20 shadow-sm">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    Password & Security
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Change your sign-in password and view password strength metrics.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Current Password
                  </label>
                  <Input
                    type={showCurrentPw ? 'text' : 'password'}
                    id="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    leftIcon={<Lock className="h-4 w-4 text-muted-foreground" />}
                    rightAdornment={
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw((v) => !v)}
                        aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    New Password
                  </label>
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    id="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    leftIcon={<KeyRound className="h-4 w-4 text-muted-foreground" />}
                    rightAdornment={
                      <button
                        type="button"
                        onClick={() => setShowNewPw((v) => !v)}
                        aria-label={showNewPw ? 'Hide password' : 'Show password'}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Interactive Strength Meter */}
              {newPassword.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-foreground">Password strength</span>
                    <span
                      className={cn(
                        'font-bold',
                        pwEvaluation.score <= 1 && 'text-destructive',
                        pwEvaluation.score === 2 && 'text-warning',
                        pwEvaluation.score === 3 && 'text-primary',
                        pwEvaluation.score >= 4 && 'text-[hsl(var(--success))]',
                      )}
                    >
                      {pwEvaluation.label}
                    </span>
                  </div>

                  {/* 4-segment progress bar */}
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1.5 flex-1 rounded-full transition-all duration-300',
                          i < pwEvaluation.score ? pwEvaluation.color : 'bg-border/60',
                        )}
                      />
                    ))}
                  </div>

                  {/* Criteria Checklist */}
                  <div className="grid gap-1.5 sm:grid-cols-3 pt-1">
                    {pwEvaluation.criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <span
                          className={cn(
                            'flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold',
                            c.met
                              ? 'bg-[hsl(var(--success))] text-white'
                              : 'bg-muted-foreground/30 text-muted-foreground',
                          )}
                        >
                          {c.met ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : '•'}
                        </span>
                        <span className={c.met ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                          {c.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Password Action Bar */}
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!passwordFormValid || isSavingPassword}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                >
                  {isSavingPassword ? 'Updating…' : 'Update password'}
                </Button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
};
