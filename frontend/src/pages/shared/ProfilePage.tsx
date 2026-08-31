import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { useHeaderStore } from '../../store/headerStore';
import { axiosClient } from '../../api/axiosClient';
import { useMeQuery } from '../../hooks/useCachedQueries';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingState } from '../../components/common/LoadingState';
import {
  User as UserIcon,
  Lock,
  Mail,
  Phone,
  Crown,
  Briefcase,
  Calculator,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  BadgeCheck,
  KeyRound,
  AlertCircle,
  Pencil,
  X,
  Camera,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { extractErrorMessage } from '../../utils/errorHandler';
import { fileToCompressedDataUrl } from '../../utils/imageResize';
import type { Role } from '../../types';

/* ─── Role-themed config ─── */
type RoleMeta = {
  icon: React.FC<{ className?: string }>;
  label: string;
  tagline: string;
  cta: string;
  ctaTo: string;
  tone: 'violet' | 'blue' | 'cyan';
  gradient: string;
};

const ROLE_META: Record<Role, RoleMeta> = {
  OWNER: {
    icon: Crown,
    label: 'Owner',
    tagline: 'You run the whole business: money, people, and settings.',
    cta: 'Open owner console',
    ctaTo: '/owner',
    tone: 'violet',
    gradient: 'from-brand-700 via-brand-500 to-cyan-500',
  },
  MANAGER: {
    icon: Briefcase,
    label: 'Manager',
    tagline: 'Run the floor, menu catalog, staff and shifts.',
    cta: 'Open workbench',
    ctaTo: '/manager',
    tone: 'blue',
    gradient: 'from-brand-600 via-brand-500 to-cyan-400',
  },
  CASHIER: {
    icon: Calculator,
    label: 'Cashier',
    tagline: 'Take payments and clear the live order queue.',
    cta: 'Open live queue',
    ctaTo: '/cashier',
    tone: 'cyan',
    gradient: 'from-cyan-500 via-brand-500 to-brand-700',
  },
  // Safe fallbacks for other roles that may share this route
  WAITER:  { icon: UserIcon,  label: 'Waiter',  tagline: 'Service-side access.', cta: 'Back to floor',  ctaTo: '/waiter',  tone: 'blue',  gradient: 'from-brand-600 via-brand-500 to-cyan-400' },
  COOKER:  { icon: UserIcon,  label: 'Cooker',  tagline: 'Kitchen-side access.', cta: 'Open kitchen',  ctaTo: '/kitchen', tone: 'blue',  gradient: 'from-brand-600 via-brand-500 to-cyan-400' },
  BARISTA: { icon: UserIcon,  label: 'Barista', tagline: 'Bar-side access.',    cta: 'Open bar',      ctaTo: '/bar',     tone: 'blue',  gradient: 'from-brand-600 via-brand-500 to-cyan-400' },
};

/* ─── Helpers ─── */
const firstNameOf = (name: string) => name.trim().split(' ')[0] || '?';

const passwordStrength = (pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } => {
  if (!pwd) return { score: 0, label: 'Empty', color: 'bg-border' };
  let s = 0;
  if (pwd.length >= 6) s++;
  if (pwd.length >= 10) s++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) s++;
  if (s <= 1) return { score: 1, label: 'Weak',   color: 'bg-destructive' };
  if (s === 2) return { score: 2, label: 'Fair',   color: 'bg-[hsl(var(--warning))]' };
  return { score: 3, label: 'Strong', color: 'bg-emerald-500' };
};

/* ─── Small reusable bits ─── */
const FieldRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  copyable?: boolean;
}> = ({ icon, label, value, copyable }) => {
  const [copied, setCopied] = useState(false);
  const text = value || '—';
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/40 border border-border/60 hover:border-primary/30 hover:bg-secondary/60 transition-all">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{text}</p>
      </div>
      {copyable && value && (
        <button
          onClick={handleCopy}
          className={cn(
            'p-1.5 rounded-md border border-transparent text-muted-foreground transition-all',
            'hover:border-primary/30 hover:text-primary hover:bg-primary/5',
            copied && 'border-emerald-500/30 text-emerald-600 bg-emerald-500/5',
          )}
          aria-label={`Copy ${label}`}
          title={copied ? 'Copied!' : 'Copy'}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}> = ({ value, onChange, placeholder, autoComplete, minLength, required }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        leftIcon={<KeyRound className="w-4 h-4" />}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

/* Ethiopian phone input: locked +251 prefix, 9 digit payload */
const ET_PHONE_PREFIX = '+251';
const ET_PHONE_DIGITS = 9;

const EthiopiaPhoneInput: React.FC<{
  /** Just the 9 digits (no prefix). */
  digits: string;
  onDigitsChange: (digits: string) => void;
  required?: boolean;
  autoComplete?: string;
}> = ({ digits, onDigitsChange, required, autoComplete }) => {
  return (
    <div
      className={cn(
        'group flex items-center rounded-xl',
        'bg-secondary/50 border border-input transition-all',
        'hover:border-primary/40 focus-within:border-primary focus-within:bg-background',
        'focus-within:shadow-[0_0_0_4px_hsl(217_91%_60%/0.14)]',
      )}
    >
      <span className="pl-3 pr-1 flex items-center gap-1.5 text-sm select-none">
        <Phone className="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <span className="font-semibold text-foreground tabular-nums">{ET_PHONE_PREFIX}</span>
      </span>
      <span aria-hidden className="h-6 w-px bg-border/70" />
      <input
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        value={digits}
        onChange={(e) => onDigitsChange(e.target.value.replace(/\D/g, '').slice(0, ET_PHONE_DIGITS))}
        placeholder="9X XXX XXXX"
        required={required}
        maxLength={ET_PHONE_DIGITS}
        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/70 text-sm h-11 px-3 outline-none border-0 disabled:opacity-50 tabular-nums"
      />
    </div>
  );
};

const SectionTitle: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}> = ({ icon, title, subtitle, badge }) => (
  <div className="flex items-start justify-between gap-3 mb-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {badge}
  </div>
);

/* ─── Page ─── */
export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  // Reflect the current section in the global header.
  useEffect(() => {
    setPageTitle({ title: 'Profile', subtitle: 'Your account, security, and personal details' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftUsername, setDraftUsername] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const role = user?.role as Role | undefined;
  const meta = role ? ROLE_META[role] : undefined;

  const me = meQuery.data;
  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const passwordFormValid =
    currentPassword.length > 0 && newPassword.length >= 6 && passwordsMatch;

  if (!user || !meta) return null;

  const displayName = isEditing ? draftName || user.name : user.name;
  const displayUsername = isEditing ? draftUsername || '' : (me?.username ?? user.username ?? '');
  const displayPhone = isEditing
    ? (draftPhone ? `${ET_PHONE_PREFIX} ${draftPhone}` : '')
    : (me?.phone ?? user.phone ?? '');
  const avatarSrc = isEditing ? draftAvatar : (me?.avatarUrl ?? user.avatarUrl ?? null);
  /* Avatar fallback: the first word of the user's name (e.g. "Girm" for "Girm Tsegaye"). */
  const firstName = firstNameOf(displayName);

  const startEditing = () => {
    setDraftName(me?.name ?? user.name);
    setDraftUsername(me?.username ?? user.username ?? '');
    // Pull the last 9 digits so a stored value like "+251 91 234 5678" or "0911234567" works.
    const storedPhone = (me?.phone ?? user.phone ?? '').toString();
    const phoneDigits = storedPhone.replace(/\D/g, '').slice(-ET_PHONE_DIGITS);
    setDraftPhone(phoneDigits);
    setDraftAvatar(me?.avatarUrl ?? user.avatarUrl ?? null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

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
      addToast({ type: 'error', title: 'Could not read image', message: extractErrorMessage(err, 'Please try a different image.') });
    }
  };

  const openAvatarPicker = () => {
    if (!isEditing) setIsEditing(true);
    // Wait a tick so the file picker can open after the re-render.
    requestAnimationFrame(() => avatarInputRef.current?.click());
  };

  const removeAvatarPhoto = () => {
    if (!isEditing) setIsEditing(true);
    setDraftAvatar(null);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = draftName.trim();
    // Re-assemble the full Ethiopia phone number from the 9 digit payload.
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
        avatarUrl: draftAvatar,
      });
      const updated = res.data;
      queryClient.setQueryData(['me'], updated);
      useAuthStore.getState().setUser({ ...user, ...updated });
      addToast({ type: 'success', title: 'Profile updated', message: 'Your profile changes have been saved.' });
      setIsEditing(false);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update failed', message: extractErrorMessage(err) });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch) {
      addToast({ type: 'error', title: 'Password mismatch', message: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      addToast({ type: 'error', title: 'Too short', message: 'Password must be at least 6 characters.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      await axiosClient.patch('/users/me/password', { currentPassword, newPassword });
      addToast({ type: 'success', title: 'Password updated', message: 'Your password has been changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">
      {/* ─── Hero card ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative rounded-2xl border border-border/40 bg-card overflow-hidden shadow-[0_4px_24px_-12px_rgba(59,130,246,0.25),0_1px_2px_rgba(15,23,42,0.04)]"
      >
        {/* Gradient header */}
        <div className={cn('relative h-32 bg-gradient-to-br', meta.gradient)}>
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 mix-blend-soft-light"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
              backgroundSize: '16px 16px',
            }}
          />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/20" />
          <span aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <span aria-hidden className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-cyan-300/20 blur-2xl" />
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 pb-6 -mt-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 min-w-0">
              <div
                role="button"
                tabIndex={0}
                onClick={openAvatarPicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openAvatarPicker();
                  }
                }}
                aria-label={avatarSrc ? 'Change photo' : 'Add photo'}
                title={avatarSrc ? 'Change photo' : 'Add photo'}
                className="group relative shrink-0 rounded-2xl cursor-pointer focus:outline-none"
              >
                <div className={cn(
                  'w-28 h-28 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center',
                  'font-display text-4xl font-bold shadow-2xl overflow-hidden',
                  meta.gradient,
                )}>
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={firstName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="leading-none">{firstName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {/* Camera icon — sits on top of the avatar box (overlapping the top edge), fades in on hover */}
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/90 text-white shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity ring-2 ring-card"
                >
                  <Camera className="w-4 h-4" />
                </span>
                {role !== 'OWNER' && (
                  <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border-2 border-card flex items-center justify-center shadow-md pointer-events-none">
                    <span className="w-full h-full rounded-full bg-emerald-500 flex items-center justify-center">
                      <BadgeCheck className="w-3.5 h-3.5 text-white" />
                    </span>
                  </span>
                )}
                {avatarSrc && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAvatarPhoto();
                    }}
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-destructive/90 text-white shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity hover:bg-destructive"
                    aria-label="Remove photo"
                    title="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight truncate">
                    {firstName}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">{meta.tagline}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {meQuery.isLoading ? (
        <LoadingState message="Loading profile..." />
      ) : (
        <>
          {/* ─── Account details + Security side-by-side ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Account details */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="lg:col-span-3"
            >
              <Card className="p-6 h-full">
                <SectionTitle
                  icon={<UserIcon className="w-5 h-5" />}
                  title="Account details"
                  subtitle={isEditing ? 'Update your details, then save.' : 'Your contact info, at a glance.'}
                  badge={
                    isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={isSavingProfile}
                          className="w-9 h-9 rounded-full bg-secondary text-foreground hover:bg-secondary/80 border border-border shadow-sm flex items-center justify-center transition-colors disabled:opacity-50"
                          aria-label="Cancel editing"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveProfile()}
                          disabled={isSavingProfile}
                          className="w-9 h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center transition-colors disabled:opacity-60"
                          aria-label="Apply changes"
                          title="Apply changes"
                        >
                          {isSavingProfile ? (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startEditing}
                        className="w-9 h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center transition-colors"
                        aria-label="Edit profile"
                        title="Edit profile"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )
                  }
                />
                {isEditing ? (
                  <form onSubmit={handleSaveProfile} className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                        Full name
                      </label>
                      <Input
                        leftIcon={<UserIcon className="w-4 h-4" />}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                        Username
                      </label>
                      <Input
                        type="text"
                        leftIcon={<Mail className="w-4 h-4" />}
                        value={draftUsername}
                        onChange={(e) => setDraftUsername(e.target.value)}
                        placeholder="you@restaurant.com"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                        Phone
                      </label>
                      <EthiopiaPhoneInput
                        digits={draftPhone}
                        onDigitsChange={setDraftPhone}
                        autoComplete="tel"
                      />
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="space-y-2.5">
                      <FieldRow icon={<UserIcon className="w-4 h-4" />} label="Full name" value={displayName} />
                      <FieldRow icon={<Mail className="w-4 h-4" />}    label="Username"    value={displayUsername} copyable={!!displayUsername} />
                      <FieldRow icon={<Phone className="w-4 h-4" />}    label="Phone"    value={displayPhone} copyable={!!displayPhone} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Use the edit icon above to update your name, contact details, or profile photo.
                      </span>
                    </p>
                  </>
                )}
              </Card>
            </motion.div>

            {/* Security */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="lg:col-span-2"
            >
              <Card className="p-6 h-full">
                <SectionTitle
                  icon={<Lock className="w-5 h-5" />}
                  title="Security"
                  subtitle="Change your password regularly."
                />
                <form onSubmit={handlePasswordChange} className="space-y-3.5">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Current password
                    </label>
                    <PasswordInput
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      New password
                    </label>
                    <PasswordInput
                      value={newPassword}
                      onChange={setNewPassword}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full', strength.color)}
                          initial={false}
                          animate={{ width: `${(strength.score / 3) * 100}%` }}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                        />
                      </div>
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider tabular-nums w-12 text-right',
                        strength.score === 1 && 'text-destructive',
                        strength.score === 2 && 'text-[hsl(var(--warning))]',
                        strength.score === 3 && 'text-emerald-600',
                      )}>
                        {strength.label}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                      Confirm new password
                    </label>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    {confirmPassword.length > 0 && (
                      <p className={cn(
                        'mt-1.5 text-[11px] font-medium flex items-center gap-1',
                        passwordsMatch ? 'text-emerald-600' : 'text-destructive',
                      )}>
                        {passwordsMatch
                          ? <><Check className="w-3 h-3" /> Passwords match</>
                          : <><AlertCircle className="w-3 h-3" /> Passwords do not match</>}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full shadow-brand"
                    disabled={!passwordFormValid || isSavingPassword}
                  >
                    {isSavingPassword ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Updating…
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        Update password
                      </span>
                    )}
                  </Button>
                </form>
              </Card>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};