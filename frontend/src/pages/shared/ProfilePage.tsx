import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { useMeQuery } from '../../hooks/useCachedQueries';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { LanguagePreferenceSection } from '../../components/settings/LanguagePreferenceSection';
import {
  User as UserIcon,
  Lock,
  LogOut,
  Shield,
  Mail,
  Phone,
  CalendarDays,
  Crown,
  Briefcase,
  Calculator,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  BadgeCheck,
  KeyRound,
  Languages,
  Activity,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
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
    tagline: 'Full access to your business — finance, people, settings.',
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

const TONE_BADGE: Record<RoleMeta['tone'], string> = {
  violet: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  blue:   'bg-primary/10 text-primary border-primary/30',
  cyan:   'bg-cyan-500/10 text-cyan-600 border-cyan-500/30',
};

/* ─── Helpers ─── */
const initialsOf = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

const formatMemberSince = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
};

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
  const { user, logout } = useAuthStore();
  const { addToast } = useToastStore();
  const meQuery = useMeQuery();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const role = user?.role as Role | undefined;
  const meta = role ? ROLE_META[role] : undefined;
  const RoleIcon = meta?.icon ?? UserIcon;

  const me = meQuery.data;
  const strength = useMemo(() => passwordStrength(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const passwordFormValid =
    currentPassword.length > 0 && newPassword.length >= 6 && passwordsMatch;

  if (!user || !meta) return null;

  const initials = initialsOf(user.name);

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
        message: err.response?.data?.error || 'Could not update password.',
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
        className="relative rounded-2xl border border-border bg-card overflow-hidden shadow-[0_4px_24px_-12px_rgba(59,130,246,0.25)]"
      >
        {/* Gradient header */}
        <div className={cn('relative h-32 bg-gradient-to-br', meta.gradient)}>
          {/* Subtle pattern overlay */}
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
          {/* Decorative orbs */}
          <span aria-hidden className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <span aria-hidden className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-cyan-300/20 blur-2xl" />
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 pb-6 -mt-14">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-5 min-w-0">
              <div className="relative shrink-0">
                <div className={cn(
                  'w-28 h-28 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center',
                  'font-display text-4xl font-bold shadow-2xl ring-4 ring-card',
                  meta.gradient,
                )}>
                  {initials}
                </div>
                <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border-2 border-card flex items-center justify-center shadow-md">
                  <span className="w-full h-full rounded-full bg-emerald-500 flex items-center justify-center">
                    <BadgeCheck className="w-3.5 h-3.5 text-white" />
                  </span>
                </span>
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight truncate">
                    {user.name}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">{meta.tagline}</p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border',
                    TONE_BADGE[meta.tone],
                  )}>
                    <RoleIcon className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary/60 text-muted-foreground border border-border/60">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Since {formatMemberSince(me?.createdAt || user.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={() => navigate(meta.ctaTo)}
                className="shadow-brand h-10"
              >
                <RoleIcon className="w-4 h-4 mr-1.5" />
                {meta.cta}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
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
                  subtitle="Your contact info is managed by your Owner or Manager."
                />
                <div className="space-y-2.5">
                  <FieldRow icon={<UserIcon className="w-4 h-4" />} label="Full name" value={me?.name ?? user.name} />
                  <FieldRow icon={<Mail className="w-4 h-4" />}    label="Email"    value={me?.email ?? user.email} copyable />
                  <FieldRow icon={<Phone className="w-4 h-4" />}    label="Phone"    value={me?.phone ?? user.phone} copyable />
                  <FieldRow
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="Account status"
                    value={me?.isActive === false ? 'Suspended' : 'Active'}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-4 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Need to update your contact details? Ask your Owner or Manager to update your staff record.
                  </span>
                </p>
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
                    {/* Strength meter */}
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

          {/* ─── Preferences row ─── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <LanguagePreferenceSection />
          </motion.div>

          {/* ─── Session / Activity card (role-flavoured) ─── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card className="p-6">
              <SectionTitle
                icon={<Activity className="w-5 h-5" />}
                title="Session"
                subtitle="Quick overview of your current sign-in."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <Activity className="w-3 h-3" />
                    Status
                  </div>
                  <p className="mt-2 font-display text-lg font-bold text-emerald-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <Shield className="w-3 h-3" />
                    Access level
                  </div>
                  <p className="mt-2 font-display text-lg font-bold text-foreground flex items-center gap-2">
                    <RoleIcon className="w-4 h-4 text-primary" />
                    {meta.label}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <Languages className="w-3 h-3" />
                    Language
                  </div>
                  <p className="mt-2 font-display text-lg font-bold text-foreground">
                    {(typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('am')) ? 'አማርኛ' : 'English'}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* ─── Danger zone (sign out) ─── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Card className="p-6 border-destructive/20 bg-gradient-to-br from-destructive/[0.04] to-transparent">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-destructive" />
                    Sign out
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    End your session on this device. You'll need to log in again to use the console.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={logout}
                  className="shrink-0 shadow-sm"
                >
                  <LogOut className="w-4 h-4 mr-1.5" />
                  Sign out
                </Button>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
};
